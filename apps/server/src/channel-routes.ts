import type express from 'express'
import { AccessToken, TrackSource } from 'livekit-server-sdk'
import {
    LIVEKIT_JOIN_TOKEN_TTL_SECONDS,
    type AccessService,
    type AccessSession
} from './access-service.js'
import type { ChannelInfo, ChannelRegistry, LiveRoom } from './channel-registry.js'
import type { ServerConfig } from './config.js'
import { cleanDisplayName, RateLimiter, requestBody, withTimeout } from './security-utils.js'
import type { SseHub } from './sse-hub.js'

interface ParticipantInfo {
    identity: string
    name?: string
}

export interface LiveKitRoomService {
    listRooms(): Promise<LiveRoom[]>
    listParticipants(roomName: string): Promise<ParticipantInfo[]>
    removeParticipant(roomName: string, identity: string): Promise<void>
    updateParticipant(
        roomName: string,
        identity: string,
        options: { metadata: string }
    ): Promise<ParticipantInfo>
}

type Middleware = express.RequestHandler
type RouteLimit = (name: string, limit: number) => Middleware

export function createChannelApi(dependencies: {
    config: ServerConfig
    access: AccessService
    channels: ChannelRegistry
    roomService: LiveKitRoomService
}) {
    const { config, access, channels, roomService } = dependencies
    const pinClientLimiter = new RateLimiter(5, 60_000)
    const pinRoomLimiter = new RateLimiter(20, 60_000)
    const playerCache = new Map<string, { names: string[]; timestamp: number }>()
    let roomsBuildInFlight: Promise<ChannelInfo[]> | null = null
    let readinessCache: { ready: boolean; expiresAt: number } | null = null

    async function buildRooms(): Promise<ChannelInfo[]> {
        if (roomsBuildInFlight) return roomsBuildInFlight
        roomsBuildInFlight = (async () => {
            const liveRooms = await withTimeout(roomService.listRooms())
            const result = channels.buildRoomList(liveRooms)
            for (const roomName of result.deletedRoomNames) playerCache.delete(roomName)
            return result.rooms
        })()
        try {
            return await roomsBuildInFlight
        } finally {
            roomsBuildInFlight = null
        }
    }

    function register(app: express.Express, requireAccess: Middleware, limit: RouteLimit, sse: SseHub): void {
        app.get('/api/health', (_req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() })
        })
        app.get('/api/ready', async (_req, res) => {
            const now = Date.now()
            if (readinessCache && readinessCache.expiresAt > now) {
                return void res.status(readinessCache.ready ? 200 : 503).json({
                    status: readinessCache.ready ? 'ready' : 'unavailable'
                })
            }
            try {
                await buildRooms()
                readinessCache = { ready: true, expiresAt: now + 2_000 }
                res.json({ status: 'ready' })
            } catch {
                readinessCache = { ready: false, expiresAt: now + 2_000 }
                res.status(503).json({ status: 'unavailable' })
            }
        })

        app.post('/api/token', requireAccess, limit('token', 30), async (req, res) => {
            try {
                if (access.isVoiceIssuanceSuspended()) {
                    const retryAfter = access.voiceRetryAfterSeconds()
                    res.setHeader('Retry-After', String(retryAfter))
                    return void res.status(503).json({ error: 'Voice access is temporarily suspended', retryAfter })
                }
                const body = requestBody(req)
                const { username, room, deviceId, inputMode, roomCapability } = body
                if (!username || !room) return void res.status(400).json({ error: 'username and room are required' })
                if (typeof room !== 'string' || room.length > 96) {
                    return void res.status(400).json({ error: 'Invalid room' })
                }
                if (deviceId !== undefined &&
                    (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(deviceId))) {
                    return void res.status(400).json({ error: 'Invalid deviceId' })
                }
                if (inputMode !== undefined &&
                    (typeof inputMode !== 'string' || !['voice', 'ptt', 'vad'].includes(inputMode))) {
                    return void res.status(400).json({ error: 'Invalid inputMode' })
                }
                const session = res.locals.accessSession as AccessSession
                if (!channels.isKnown(room)) return void res.status(404).json({ error: 'Channel not found' })
                const profile = access.prepareProfile(
                    session,
                    username,
                    typeof deviceId === 'string' ? deviceId : undefined
                )
                if (!profile) {
                    return void res.status(400).json({ error: 'Invalid username or device profile' })
                }
                if (!channels.authorizeJoin(session.jti, room, roomCapability)) {
                    return void res.status(403).json({ error: 'Channel authorization required' })
                }

                const metadata = JSON.stringify({
                    deviceId: profile.deviceId || '',
                    inputMode: typeof inputMode === 'string' ? inputMode : 'voice'
                })
                const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
                    identity: access.participantIdentity(session, room),
                    name: profile.name,
                    metadata,
                    ttl: `${LIVEKIT_JOIN_TOKEN_TTL_SECONDS}s`
                })
                token.addGrant({
                    room,
                    roomJoin: true,
                    canPublish: true,
                    canPublishSources: [TrackSource.MICROPHONE],
                    canPublishData: true,
                    canSubscribe: true,
                    roomCreate: false,
                    canUpdateOwnMetadata: false
                })
                const jwt = await token.toJwt()
                access.commitProfile(session, profile)
                res.json({ token: jwt, livekitUrl: config.livekitClientUrl })
            } catch (error) {
                console.error('Token generation error:', error)
                res.status(500).json({ error: 'Failed to generate token' })
            }
        })

        app.post('/api/channels', requireAccess, limit('create-channel', 20), async (req, res) => {
            try {
                const { name, pin, createdBy } = requestBody(req)
                const cleanName = cleanDisplayName(name)
                if (!cleanName) return void res.status(400).json({ error: 'Invalid channel name' })
                if (pin !== undefined && (typeof pin !== 'string' || !/^\d{4}$/.test(pin))) {
                    return void res.status(400).json({ error: 'PIN must be exactly 4 digits' })
                }
                if (channels.size >= 50) return void res.status(503).json({ error: 'Channel capacity reached' })
                const session = res.locals.accessSession as AccessSession
                const profile = access.prepareProfile(session, createdBy)
                if (!profile) {
                    return void res.status(409).json({ error: 'Creator does not match authenticated session' })
                }
                const result = await channels.create(cleanName, pin as string | undefined, profile.name, session.jti)
                if (!result) return void res.status(503).json({ error: 'Channel capacity reached' })
                access.commitProfile(session, profile)
                res.json(result)
                sse.scheduleBroadcast()
            } catch (error) {
                console.error('Channel creation error:', error)
                res.status(500).json({ error: 'Failed to create channel' })
            }
        })

        app.post('/api/channels/verify-pin', requireAccess, limit('verify-channel-pin', 30), async (req, res) => {
            const { roomName, pin } = requestBody(req)
            if (typeof roomName !== 'string' || typeof pin !== 'string') {
                return void res.status(400).json({ error: 'roomName and PIN must be strings' })
            }
            const channel = channels.get(roomName)
            if (!channel) return void res.status(404).json({ error: 'Channel not found' })
            if (!channel.pinHash) return void res.json({ valid: true })
            const ip = req.ip || req.socket.remoteAddress || 'unknown'
            const clientKey = `${ip}:${roomName}`
            if (!pinClientLimiter.consume(clientKey)) {
                return void res.status(429).json({ error: 'Too many PIN attempts' })
            }
            if (!pinRoomLimiter.consume(roomName)) {
                pinClientLimiter.refund(clientKey)
                return void res.status(429).json({ error: 'Too many PIN attempts' })
            }
            if (!await channels.verifyPin(roomName, pin)) {
                return void res.json({ valid: false })
            }
            pinClientLimiter.refund(clientKey)
            pinRoomLimiter.refund(roomName)
            const session = res.locals.accessSession as AccessSession
            res.json({ valid: true, roomCapability: channels.issueCapability(session.jti, roomName) })
        })

        registerRoomQueries(app, requireAccess, limit, sse)
    }

    function registerRoomQueries(app: express.Express, requireAccess: Middleware, limit: RouteLimit, sse: SseHub) {
        app.post('/api/notify-leave', requireAccess, limit('notify-leave', 30), (_req, res) => {
            res.json({ ok: true })
            sse.schedulePresenceRefresh()
        })
        app.post('/api/presence-refresh', requireAccess, limit('presence-refresh', 30), (req, res) => {
            const { room } = requestBody(req)
            if (typeof room !== 'string' || room.length > 96 || !/^[A-Za-z0-9_-]+$/.test(room)) {
                return void res.status(400).json({ error: 'Invalid room' })
            }
            if (!channels.isKnown(room)) return void res.status(404).json({ error: 'Channel not found' })
            const session = res.locals.accessSession as AccessSession
            if (!channels.canViewPlayers(session.jti, room)) {
                return void res.status(403).json({ error: 'Channel authorization required' })
            }
            sse.schedulePresenceRefresh()
            res.status(202).json({ ok: true })
        })
        app.get('/api/rooms', requireAccess, limit('rooms', 60), async (_req, res) => {
            try { res.json({ rooms: await buildRooms() }) }
            catch (error) {
                console.error('Room listing error:', error)
                res.status(503).json({ error: 'Room service unavailable' })
            }
        })
        app.get('/api/room-players/:roomName', requireAccess, limit('room-players', 60), async (req, res) => {
            const roomName = String(req.params.roomName)
            if (roomName.length > 96 || !/^[A-Za-z0-9_-]+$/.test(roomName)) {
                return void res.status(400).json({ error: 'Invalid room' })
            }
            if (!channels.isKnown(roomName)) return void res.status(404).json({ error: 'Channel not found' })
            const session = res.locals.accessSession as AccessSession
            if (!channels.canViewPlayers(session.jti, roomName)) {
                return void res.status(403).json({ error: 'Channel PIN required' })
            }
            const now = Date.now()
            const cached = playerCache.get(roomName)
            if (cached && now - cached.timestamp < 10_000) return void res.json({ players: cached.names })
            try {
                const participants = await withTimeout(roomService.listParticipants(roomName))
                const names = participants.map(participant => participant.name || participant.identity)
                playerCache.set(roomName, { names, timestamp: now })
                res.json({ players: names })
            } catch {
                res.status(503).json({ error: 'Room service unavailable' })
            }
        })
        app.post('/api/participant-mode', requireAccess, limit('participant-mode', 30), async (req, res) => {
            const { room, inputMode } = requestBody(req)
            if (typeof room !== 'string' || room.length > 96 || !/^[A-Za-z0-9_-]+$/.test(room) ||
                typeof inputMode !== 'string' || !['voice', 'ptt', 'vad'].includes(inputMode)) {
                return void res.status(400).json({ error: 'Invalid room or input mode' })
            }
            if (!channels.isKnown(room)) return void res.status(404).json({ error: 'Channel not found' })
            const session = res.locals.accessSession as AccessSession
            if (!channels.canViewPlayers(session.jti, room)) {
                return void res.status(403).json({ error: 'Channel authorization required' })
            }
            const profile = access.getProfile(session)
            if (!profile) return void res.status(409).json({ error: 'Participant profile not initialized' })
            try {
                await withTimeout(roomService.updateParticipant(
                    room,
                    access.participantIdentity(session, room),
                    { metadata: JSON.stringify({ deviceId: profile.deviceId || '', inputMode }) }
                ))
                res.json({ ok: true })
            } catch {
                res.status(503).json({ error: 'Room service unavailable' })
            }
        })
    }

    function reset(): void {
        pinClientLimiter.reset()
        pinRoomLimiter.reset()
        playerCache.clear()
        roomsBuildInFlight = null
        readinessCache = null
    }

    return { buildRooms, register, reset }
}
