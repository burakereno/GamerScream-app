import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3002

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey'
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret'
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880'
const LIVEKIT_HTTP_URL = process.env.LIVEKIT_HTTP_URL || 'http://localhost:7880'
const LIVEKIT_CLIENT_URL = process.env.LIVEKIT_CLIENT_URL || LIVEKIT_URL

// App-level PIN (server-side only — never sent to client)
let APP_PIN = process.env.APP_PIN || '1520'
let TOKEN_SECRET = process.env.TOKEN_SECRET || LIVEKIT_API_SECRET + '-gamerscream'

// Admin secret — MUST be set in environment, no unsafe fallback
const ADMIN_SECRET = process.env.ADMIN_SECRET
if (!ADMIN_SECRET) {
    console.warn('⚠️  ADMIN_SECRET not set — admin panel will be disabled')
}

// Persist admin state changes to survive server restarts
const ADMIN_STATE_PATH = path.join(__dirname, '..', 'admin-state.json')
try {
    const state = JSON.parse(fs.readFileSync(ADMIN_STATE_PATH, 'utf-8'))
    if (state.APP_PIN) APP_PIN = state.APP_PIN
    if (state.TOKEN_SECRET) TOKEN_SECRET = state.TOKEN_SECRET
    console.log('📁 Loaded admin state from file')
} catch {
    // No state file yet — use env defaults
}

function saveAdminState() {
    try {
        fs.writeFileSync(ADMIN_STATE_PATH, JSON.stringify({ APP_PIN, TOKEN_SECRET }, null, 2))
    } catch (err) {
        console.error('Failed to save admin state:', err)
    }
}

// [P1-#4] Signed access tokens — survive server restarts
const ACCESS_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

function generateAccessToken(): string {
    const expiresAt = Date.now() + ACCESS_TOKEN_TTL
    const payload = `${expiresAt}`
    const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
    return `${payload}.${sig}`
}

function isValidAccessToken(token: string): boolean {
    const parts = token.split('.')
    if (parts.length !== 2) return false
    const [payload, sig] = parts
    const expiresAt = parseInt(payload, 10)
    if (isNaN(expiresAt) || Date.now() > expiresAt) return false
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
}

// [P1-#2] Rate limiting for PIN verification
const pinAttempts = new Map<string, { count: number; lastAttempt: number }>()
const PIN_RATE_LIMIT = 5 // max attempts
const PIN_RATE_WINDOW = 60 * 1000 // per minute

function checkPinRateLimit(ip: string): boolean {
    const now = Date.now()
    const entry = pinAttempts.get(ip)
    if (!entry || now - entry.lastAttempt > PIN_RATE_WINDOW) {
        pinAttempts.set(ip, { count: 1, lastAttempt: now })
        return true
    }
    if (entry.count >= PIN_RATE_LIMIT) return false
    entry.count++
    entry.lastAttempt = now
    return true
}

// [P1-#3] Timing-safe PIN comparison
function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        // Still do a comparison to avoid short-circuit timing leak
        crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a))
        return false
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const roomService = new RoomServiceClient(LIVEKIT_HTTP_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

// [P1-#1] Restrictive CORS — allow Electron dev server + packaged app (no origin)
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3002']
app.use(cors({
    origin: (origin, callback) => {
        // Packaged Electron app sends no origin — allow
        if (!origin) return callback(null, true)
        // Dev mode: allow specific ports only
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
        // Block everything else
        callback(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-access-token']
}))
// [P1-#5] Request body size limit
app.use(express.json({ limit: '10kb' }))

// ============================================
// App PIN verification
// ============================================

// Verify app PIN → returns access token
app.post('/api/verify-app-pin', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'

    // [P1-#2] Rate limit check
    if (!checkPinRateLimit(ip)) {
        res.status(429).json({ error: 'Too many attempts. Try again later.' })
        return
    }

    const { pin } = req.body
    if (!pin || typeof pin !== 'string') {
        res.status(403).json({ error: 'Invalid PIN' })
        return
    }

    // [P1-#3] Timing-safe comparison
    if (!safeCompare(pin, APP_PIN)) {
        res.status(403).json({ error: 'Invalid PIN' })
        return
    }

    // [P1-1] Persist admin state on first successful PIN
    saveAdminState()
    res.json({ accessToken: generateAccessToken() })
})

// Verify stored access token (for returning users)
// [P1-4] Rate limited to prevent brute-force
app.post('/api/verify-access-token', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (!checkPinRateLimit(ip)) {
        res.status(429).json({ error: 'Too many attempts' })
        return
    }
    const { accessToken } = req.body
    res.json({ valid: isValidAccessToken(accessToken || '') })
})

// Middleware: protect API routes (except health, app-pin, access-token)
function requireAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = req.headers['x-access-token'] as string
    if (!token || !isValidAccessToken(token)) {
        res.status(401).json({ error: 'Unauthorized — app PIN required' })
        return
    }
    next()
}


// ============================================
// Custom channels storage (in-memory)
// ============================================
interface CustomChannel {
    name: string        // display name
    roomName: string    // LiveKit room name (slugified)
    pin?: string        // optional 4-digit PIN
    createdBy: string   // username of creator
    createdAt: number
}

const customChannels = new Map<string, CustomChannel>()

// ============================================
// SSE (Server-Sent Events) for real-time channel updates
// ============================================
const sseClients = new Set<express.Response>()
const MAX_SSE_CLIENTS = 50 // Prevent DoS from too many SSE connections
let lastBroadcastJSON = '' // Track last sent data for diff detection

function sseWrite(res: express.Response, event: string, data: unknown): boolean {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        return true
    } catch {
        // Client disconnected — remove from set
        sseClients.delete(res)
        return false
    }
}

async function broadcastRooms() {
    if (sseClients.size === 0) return
    try {
        const rooms = await buildRoomList()
        const json = JSON.stringify(rooms)
        // Only push if data actually changed
        if (json === lastBroadcastJSON) return
        lastBroadcastJSON = json
        for (const client of sseClients) {
            sseWrite(client, 'rooms', { rooms })
        }
    } catch (err) {
        console.error('SSE broadcast error:', err)
    }
}

// Debounce broadcasts — when multiple events fire close together (e.g. join triggers)
// only send one push. Server-side interval handles periodic diff checks for leaves.
let broadcastTimer: ReturnType<typeof setTimeout> | null = null
function scheduleBroadcast() {
    if (broadcastTimer) return
    broadcastTimer = setTimeout(() => {
        broadcastTimer = null
        broadcastRooms()
    }, 500) // 500ms debounce
}

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Generate LiveKit token
app.post('/api/token', requireAccess, async (req, res) => {
    try {
        const { username, room, deviceId, pin } = req.body

        if (!username || !room) {
            res.status(400).json({ error: 'username and room are required' })
            return
        }

        // [P3-#18] Server-side username validation
        const cleanUsername = String(username).trim().slice(0, 20)
        if (!cleanUsername || !/^[\w\s\-]+$/u.test(cleanUsername)) {
            res.status(400).json({ error: 'Invalid username (max 20 chars, letters/numbers/spaces)' })
            return
        }

        // Server-side PIN enforcement for custom channels
        const customChannel = customChannels.get(room)
        if (customChannel && customChannel.pin) {
            if (!pin || !safeCompare(String(pin), customChannel.pin)) {
                res.status(403).json({ error: 'Invalid PIN' })
                return
            }
        }

        const safeDeviceId = String(deviceId || '').slice(0, 64)
        const metadata = JSON.stringify({ deviceId: safeDeviceId })

        // [P2-#10] Unique identity using deviceId suffix to prevent collisions
        const shortDeviceId = safeDeviceId.slice(0, 6) || crypto.randomBytes(3).toString('hex')
        const identity = `${cleanUsername}-${shortDeviceId}`

        const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity,
            name: cleanUsername, // display name stays clean
            metadata,
            ttl: '24h'
        })

        // [P1-#7] Restricted grants — no roomCreate
        token.addGrant({
            room: room,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            roomCreate: false
        })

        const jwt = await token.toJwt()

        res.json({
            token: jwt,
            livekitUrl: LIVEKIT_CLIENT_URL
        })

        // Push updated room list to all SSE clients (someone just joined)
        scheduleBroadcast()

    } catch (err) {
        console.error('Token generation error:', err)
        res.status(500).json({ error: 'Failed to generate token' })
    }
})

// Create custom channel
app.post('/api/channels', requireAccess, (req, res) => {
    try {
        const { name, pin, createdBy } = req.body

        if (!name || !name.trim()) {
            res.status(400).json({ error: 'Channel name is required' })
            return
        }

        if (name.trim().length > 20) {
            res.status(400).json({ error: 'Channel name max 20 characters' })
            return
        }

        if (pin && (!/^\d{1,4}$/.test(pin))) {
            res.status(400).json({ error: 'PIN must be 1-4 digits' })
            return
        }

        // [P2-#9] Timestamp-based room names to prevent collision on restart
        const roomName = `custom-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`

        const channel: CustomChannel = {
            name: name.trim(),
            roomName,
            pin: pin || undefined,
            createdBy: String(createdBy || 'unknown').trim().slice(0, 20),
            createdAt: Date.now()
        }

        customChannels.set(roomName, channel)
        console.log(`📢 Custom channel created: "${channel.name}" (${roomName})${pin ? ' [PIN protected]' : ''}`)

        res.json({
            name: channel.name,
            roomName,
            hasPin: !!pin
        })

        // Push updated room list (new channel created)
        scheduleBroadcast()

    } catch (err) {
        console.error('Channel creation error:', err)
        res.status(500).json({ error: 'Failed to create channel' })
    }
})

// Verify channel PIN
// [P2-#11] Still kept for backwards compat but uses timing-safe compare
app.post('/api/channels/verify-pin', requireAccess, (req, res) => {
    const { roomName, pin } = req.body

    const channel = customChannels.get(roomName)
    if (!channel) {
        res.status(404).json({ error: 'Channel not found' })
        return
    }

    if (!channel.pin) {
        res.json({ valid: true })
        return
    }

    res.json({ valid: safeCompare(String(pin || ''), channel.pin) })
})

// Shared room list builder (used by REST API)
async function buildRoomList() {
    const defaultChannels = [1, 2, 3, 4, 5]
    const rooms: {
        channel?: number
        name: string
        roomName?: string
        playerCount: number
        hasPin?: boolean
        isCustom?: boolean
        createdBy?: string
    }[] = []

    let livekitRooms: any[] = []
    try {
        livekitRooms = await roomService.listRooms()
    } catch {
        // LiveKit not available
    }

    for (const ch of defaultChannels) {
        const roomName = `ch-${ch}`
        const lkRoom = livekitRooms.find((r: any) => r.name === roomName)
        rooms.push({
            channel: ch,
            name: roomName,
            playerCount: lkRoom ? lkRoom.numParticipants : 0
        })
    }

    const toDelete: string[] = []
    for (const [roomName, custom] of customChannels.entries()) {
        const lkRoom = livekitRooms.find((r: any) => r.name === roomName)
        const count = lkRoom ? lkRoom.numParticipants : 0

        if (count === 0 && Date.now() - custom.createdAt > 60000) {
            toDelete.push(roomName)
            continue
        }

        rooms.push({
            name: custom.name,
            roomName,
            playerCount: count,
            hasPin: !!custom.pin,
            isCustom: true,
            createdBy: custom.createdBy
        })
    }
    // Delete empty channels after iteration (Fix #6: avoid Map mutation during iteration)
    toDelete.forEach(rn => {
        const ch = customChannels.get(rn)
        customChannels.delete(rn)
        if (ch) console.log(`🗑️ Custom channel auto-deleted: "${ch.name}" (${rn})`)
    })

    return rooms
}

// List rooms with participant counts (default + custom)
app.get('/api/rooms', requireAccess, async (_req, res) => {
    try {
        const rooms = await buildRoomList()
        res.json({ rooms })
    } catch (err) {
        console.error('Room listing error:', err)
        res.json({
            rooms: [1, 2, 3, 4, 5].map((ch) => ({
                channel: ch,
                name: `ch-${ch}`,
                playerCount: 0
            }))
        })
    }
})

// SSE endpoint — real-time channel updates
// Auth via query param since EventSource doesn't support custom headers
app.get('/api/events', (req, res) => {
    const token = (req.query.token as string) || ''
    if (!isValidAccessToken(token)) {
        res.status(401).json({ error: 'Unauthorized' })
        return
    }

    // Limit concurrent SSE connections
    if (sseClients.size >= MAX_SSE_CLIENTS) {
        res.status(503).json({ error: 'Too many connections' })
        return
    }

    // SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
    })
    res.flushHeaders()

    // Send initial room state immediately (don't update lastBroadcastJSON —
    // that's only for detecting changes across broadcasts)
    buildRoomList().then(rooms => {
        sseWrite(res, 'rooms', { rooms })
    }).catch(() => {
        sseWrite(res, 'rooms', { rooms: [1,2,3,4,5].map(ch => ({ channel: ch, name: `ch-${ch}`, playerCount: 0 })) })
    })

    // Keep-alive ping every 30s to prevent proxy/firewall timeouts
    const keepAlive = setInterval(() => {
        try { res.write(': ping\n\n') } catch { /* disconnected */ }
    }, 30_000)

    sseClients.add(res)
    console.log(`📡 SSE client connected (${sseClients.size} total)`)

    req.on('close', () => {
        sseClients.delete(res)
        clearInterval(keepAlive)
        console.log(`📡 SSE client disconnected (${sseClients.size} total)`)
    })
})

// Server-side periodic check for participant changes (leaves, timeouts)
// Only runs when SSE clients are connected — pushes only if data changed
setInterval(() => {
    if (sseClients.size > 0) broadcastRooms()
}, 5000)

// Cleanup: periodically remove old rate limit entries
setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of pinAttempts.entries()) {
        if (now - entry.lastAttempt > PIN_RATE_WINDOW) pinAttempts.delete(ip)
    }
}, 60 * 60 * 1000) // every hour

// ============================================
// Admin routes (protected by ADMIN_SECRET)
// ============================================

// [AUDIT P1-1] Rate limiting for admin routes
const adminAttempts = new Map<string, { count: number; lastAttempt: number }>()
const ADMIN_RATE_LIMIT = 3 // max attempts
const ADMIN_RATE_WINDOW = 60 * 1000 // per minute

function checkAdminRateLimit(ip: string): boolean {
    const now = Date.now()
    const entry = adminAttempts.get(ip)
    if (!entry || now - entry.lastAttempt > ADMIN_RATE_WINDOW) {
        adminAttempts.set(ip, { count: 1, lastAttempt: now })
        return true
    }
    if (entry.count >= ADMIN_RATE_LIMIT) return false
    entry.count++
    entry.lastAttempt = now
    return true
}

// Admin middleware: checks secret + rate limit
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    // [AUDIT P1-3] Reject if ADMIN_SECRET not configured
    if (!ADMIN_SECRET) {
        res.status(503).json({ error: 'Admin panel not configured' })
        return
    }
    // [AUDIT P1-1] Rate limit
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (!checkAdminRateLimit(ip)) {
        res.status(429).json({ error: 'Too many attempts. Try again later.' })
        return
    }
    const { secret } = req.body
    if (!secret || !safeCompare(String(secret), ADMIN_SECRET)) {
        res.status(403).json({ error: 'Invalid admin secret' })
        return
    }
    next()
}

app.post('/api/admin/verify', requireAdmin, (_req, res) => {
    res.json({ valid: true })
})

app.post('/api/admin/change-pin', requireAdmin, (req, res) => {
    const { newPin } = req.body
    if (!newPin || String(newPin).length < 4) {
        res.status(400).json({ error: 'PIN must be at least 4 characters' })
        return
    }
    APP_PIN = String(newPin)
    TOKEN_SECRET = crypto.randomBytes(32).toString('hex')
    saveAdminState() // [AUDIT P2-4/P2-5] Persist to survive restart
    console.log('🔑 Admin changed PIN and invalidated all tokens')
    res.json({ success: true, message: 'PIN changed. All users will need to re-enter the new PIN.' })
})

app.post('/api/admin/kick-all', requireAdmin, async (_req, res) => {
    try {
        const rooms = await roomService.listRooms()
        let kicked = 0
        for (const room of rooms) {
            const participants = await roomService.listParticipants(room.name)
            for (const p of participants) {
                await roomService.removeParticipant(room.name, p.identity)
                kicked++
            }
        }
        console.log(`👢 Admin kicked ${kicked} participants from all rooms`)
        res.json({ success: true, kicked })
    } catch (err) {
        console.error('Kick all error:', err)
        res.status(500).json({ error: 'Failed to kick participants' })
    }
})

app.post('/api/admin/invalidate-tokens', requireAdmin, (_req, res) => {
    TOKEN_SECRET = crypto.randomBytes(32).toString('hex')
    saveAdminState() // [AUDIT P2-4/P2-5] Persist to survive restart
    console.log('🔒 Admin invalidated all access tokens')
    res.json({ success: true, message: 'All tokens invalidated. Users must re-enter PIN.' })
})

app.listen(PORT, () => {
    console.log(`🎮 GamerScream Server running on http://localhost:${PORT}`)
    console.log(`📡 LiveKit URL: ${LIVEKIT_URL}`)
})
