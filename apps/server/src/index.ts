import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

const app = express()
const PORT = process.env.PORT || 3002

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey'
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret'
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880'
const LIVEKIT_HTTP_URL = process.env.LIVEKIT_HTTP_URL || 'http://localhost:7880'
const LIVEKIT_CLIENT_URL = process.env.LIVEKIT_CLIENT_URL || LIVEKIT_URL

// App-level PIN (server-side only — never sent to client)
const APP_PIN = process.env.APP_PIN || '1520'
const TOKEN_SECRET = process.env.TOKEN_SECRET || LIVEKIT_API_SECRET + '-gamerscream'

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
app.use(cors({
    origin: (origin, callback) => {
        // Packaged Electron app sends no origin — allow
        if (!origin) return callback(null, true)
        // Dev mode: allow localhost
        if (origin.startsWith('http://localhost:')) return callback(null, true)
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

    res.json({ accessToken: generateAccessToken() })
})

// Verify stored access token (for returning users)
app.post('/api/verify-access-token', (req, res) => {
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
            createdBy: createdBy || 'unknown',
            createdAt: Date.now()
        }

        customChannels.set(roomName, channel)
        console.log(`📢 Custom channel created: "${channel.name}" (${roomName})${pin ? ' [PIN protected]' : ''}`)

        res.json({
            name: channel.name,
            roomName,
            hasPin: !!pin
        })
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

// List rooms with participant counts (default + custom)
app.get('/api/rooms', requireAccess, async (_req, res) => {
    try {
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

        // Try to get real room info from LiveKit
        let livekitRooms: any[] = []
        try {
            livekitRooms = await roomService.listRooms()
        } catch {
            // LiveKit not available
        }

        // Default channels
        for (const ch of defaultChannels) {
            const roomName = `ch-${ch}`
            const lkRoom = livekitRooms.find((r: any) => r.name === roomName)
            rooms.push({
                channel: ch,
                name: roomName,
                playerCount: lkRoom ? lkRoom.numParticipants : 0
            })
        }

        // Custom channels — auto-delete empty ones
        for (const [roomName, custom] of customChannels.entries()) {
            const lkRoom = livekitRooms.find((r: any) => r.name === roomName)
            const count = lkRoom ? lkRoom.numParticipants : 0

            // Auto-delete if empty and older than 10 seconds (grace period for creation)
            if (count === 0 && Date.now() - custom.createdAt > 10000) {
                customChannels.delete(roomName)
                console.log(`🗑️ Custom channel auto-deleted: "${custom.name}" (${roomName})`)
                continue
            }

            rooms.push({
                name: custom.name,
                roomName, // send actual roomName for client to connect
                playerCount: count,
                hasPin: !!custom.pin,
                isCustom: true,
                createdBy: custom.createdBy
            })
        }

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

// Cleanup: periodically remove old rate limit entries
setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of pinAttempts.entries()) {
        if (now - entry.lastAttempt > PIN_RATE_WINDOW) pinAttempts.delete(ip)
    }
}, 60 * 60 * 1000) // every hour

app.listen(PORT, () => {
    console.log(`🎮 GamerScream Server running on http://localhost:${PORT}`)
    console.log(`📡 LiveKit URL: ${LIVEKIT_URL}`)
})
