import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

const app = express()
const PORT = process.env.PORT || 3001

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey'
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret'
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880'
const LIVEKIT_HTTP_URL = process.env.LIVEKIT_HTTP_URL || 'http://localhost:7880'

// App-level PIN (server-side only — never sent to client)
const APP_PIN = process.env.APP_PIN || '1520'
const TOKEN_SECRET = process.env.TOKEN_SECRET || LIVEKIT_API_SECRET + '-gamerscream'

function generateAccessToken(): string {
    return crypto.createHmac('sha256', TOKEN_SECRET).update('gamerscream-verified').digest('hex')
}

function isValidAccessToken(token: string): boolean {
    return token === generateAccessToken()
}

const roomService = new RoomServiceClient(LIVEKIT_HTTP_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

app.use(cors())
app.use(express.json())

// ============================================
// App PIN verification
// ============================================

// Verify app PIN → returns access token
app.post('/api/verify-app-pin', (req, res) => {
    const { pin } = req.body
    if (!pin || pin !== APP_PIN) {
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
let customChannelCounter = 100 // start custom channels from 100

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

        // Server-side PIN enforcement for custom channels
        const customChannel = customChannels.get(room)
        if (customChannel && customChannel.pin) {
            if (!pin || customChannel.pin !== pin) {
                res.status(403).json({ error: 'Invalid PIN' })
                return
            }
        }

        const metadata = JSON.stringify({ deviceId: deviceId || '' })

        const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: username,
            metadata,
            ttl: '24h'
        })

        token.addGrant({
            room: room,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            roomCreate: true
        })

        const jwt = await token.toJwt()

        res.json({
            token: jwt,
            livekitUrl: LIVEKIT_URL
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

        customChannelCounter++
        const roomName = `custom-${customChannelCounter}`

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
            channel: customChannelCounter,
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

    res.json({ valid: channel.pin === pin })
})

// List rooms with participant counts (default + custom)
app.get('/api/rooms', requireAccess, async (_req, res) => {
    try {
        const defaultChannels = [1, 2, 3, 4, 5]
        const rooms: {
            channel: number
            name: string
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
                channel: parseInt(roomName.split('-')[1]) || 0,
                name: custom.name,
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

app.listen(PORT, () => {
    console.log(`🎮 GamerScream Server running on http://localhost:${PORT}`)
    console.log(`📡 LiveKit URL: ${LIVEKIT_URL}`)
})
