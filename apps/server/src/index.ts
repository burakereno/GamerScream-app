import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { RoomServiceClient } from 'livekit-server-sdk'
import { AccessService, type AccessSession } from './access-service.js'
import { registerAdminRoutes } from './admin-routes.js'
import { ChannelRegistry } from './channel-registry.js'
import { createChannelApi } from './channel-routes.js'
import { loadConfig } from './config.js'
import { RateLimiter, requestBody, safeCompare } from './security-utils.js'
import { FileAdminStateStore, MemoryAdminStateStore, type AdminStateStore } from './state-store.js'
import { SseHub } from './sse-hub.js'

const config = loadConfig()
const app: ReturnType<typeof express> = express()
app.disable('x-powered-by')
app.set('trust proxy', 'loopback, linklocal, uniquelocal')

const legacyStatePath = path.join(process.cwd(), 'admin-state.json')
if (process.env.NODE_ENV !== 'test' && path.resolve(config.adminStatePath) !== path.resolve(legacyStatePath) &&
    !fs.existsSync(config.adminStatePath) && fs.existsSync(legacyStatePath)) {
    throw new Error('Legacy admin state detected; rotate credentials and migrate it to ADMIN_STATE_PATH before starting')
}
const defaultStateStore: AdminStateStore = process.env.NODE_ENV === 'test'
    ? new MemoryAdminStateStore()
    : new FileAdminStateStore(config.adminStatePath)
const access = new AccessService(config, defaultStateStore)
const channels = new ChannelRegistry()
const roomService = new RoomServiceClient(
    config.livekitHttpUrl,
    config.livekitApiKey,
    config.livekitApiSecret,
    { requestTimeout: 5 }
)

if (!config.adminSecret) console.warn('ADMIN_SECRET not set — admin panel is disabled')

const allowedOrigins = ['app://gamerscream', 'http://localhost:5173', 'http://localhost:3002']
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
        const error = new Error('Origin not allowed') as Error & { status: number }
        error.status = 403
        callback(error)
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-access-token']
}))
app.use((req, res, next) => {
    const contentLength = Number(req.headers['content-length'] || 0)
    const hasBody = contentLength > 0 || Boolean(req.headers['transfer-encoding'])
    if (req.method === 'POST' && hasBody && !req.is('application/json')) {
        return void res.status(415).json({ error: 'Content-Type must be application/json' })
    }
    next()
})
app.use(express.json({ limit: '10kb' }))
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    next()
})

const pinClientFailures = new RateLimiter(5, 60_000)
const pinGlobalFailures = new RateLimiter(30, 60_000)
const pinClientSuccesses = new RateLimiter(10, 60_000)
const pinGlobalSuccesses = new RateLimiter(100, 60_000)
const tokenChecks = new RateLimiter(60, 60_000)
const routeLimiters = new Map<string, { session: RateLimiter; ip: RateLimiter; server: RateLimiter }>()

function requireAccess(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const session = access.getSession(req.headers['x-access-token'])
    if (!session) {
        res.status(401).json({ error: 'Unauthorized — app PIN required' })
        return
    }
    res.locals.accessSession = session
    next()
}

function limitAccessRoute(name: string, limit: number): express.RequestHandler {
    let limiters = routeLimiters.get(name)
    if (!limiters) {
        limiters = {
            session: new RateLimiter(limit, 60_000),
            ip: new RateLimiter(limit * 2, 60_000),
            server: new RateLimiter(Math.max(limit * 10, 200), 60_000)
        }
        routeLimiters.set(name, limiters)
    }
    return (req, res, next) => {
        const session = res.locals.accessSession as AccessSession
        const ip = req.ip || req.socket.remoteAddress || 'unknown'
        const allowed = limiters!.session.consume(`${ip}:${session.jti}`) &&
            limiters!.ip.consume(ip) && limiters!.server.consume('server')
        if (!allowed) return void res.status(429).json({ error: 'Too many requests' })
        next()
    }
}

app.post('/api/verify-app-pin', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (!pinClientFailures.consume(ip)) {
        return void res.status(429).json({ error: 'Too many attempts. Try again later.' })
    }
    if (!pinGlobalFailures.consume('global')) {
        pinClientFailures.refund(ip)
        return void res.status(429).json({ error: 'Too many attempts. Try again later.' })
    }
    if (!pinClientSuccesses.consume(ip)) {
        pinClientFailures.refund(ip)
        pinGlobalFailures.refund('global')
        return void res.status(429).json({ error: 'Too many sessions issued' })
    }
    if (!pinGlobalSuccesses.consume('global')) {
        pinClientFailures.refund(ip)
        pinGlobalFailures.refund('global')
        pinClientSuccesses.refund(ip)
        return void res.status(429).json({ error: 'Too many sessions issued' })
    }
    const { pin } = requestBody(req)
    if (typeof pin !== 'string' || !await access.verifyAppPin(pin)) {
        pinClientSuccesses.refund(ip)
        pinGlobalSuccesses.refund('global')
        return void res.status(403).json({ error: 'Invalid PIN' })
    }
    pinClientFailures.refund(ip)
    pinGlobalFailures.refund('global')
    res.json({ accessToken: access.issueToken() })
})

app.post('/api/verify-access-token', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (!tokenChecks.consume(ip)) return void res.status(429).json({ error: 'Too many attempts' })
    res.json({ valid: access.isValid(requestBody(req).accessToken) })
})

const channelApi = createChannelApi({ config, access, channels, roomService })
const sse = new SseHub(access, channelApi.buildRooms)
access.onInvalidated(() => {
    channels.clearAuthorizations()
    sse.closeAll()
})
channelApi.register(app, requireAccess, limitAccessRoute, sse)

const ticketLimiter = new RateLimiter(10, 60_000)
app.post('/api/events-ticket', requireAccess, limitAccessRoute('events-ticket', 10), (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    if (!ticketLimiter.consume(ip)) return void res.status(429).json({ error: 'Too many ticket requests' })
    const ticket = sse.issueTicket(res.locals.accessSession as AccessSession, ip)
    if (!ticket) return void res.status(503).json({ error: 'Ticket capacity reached' })
    res.json({ ticket, expiresIn: 60 })
})
app.get('/api/events', (req, res) => sse.handleConnection(req, res))

const adminRoutes = registerAdminRoutes(app, config, access, roomService)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err: Error & { status?: number; type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err)
    if (err.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Invalid JSON body' })
    if (err.type === 'entity.too.large' || err.status === 413) {
        return void res.status(413).json({ error: 'Request body too large' })
    }
    if (err.status === 403) return void res.status(403).json({ error: 'Origin not allowed' })
    console.error('Unhandled request error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
})

const isDirectRun = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')
if (isDirectRun) {
    app.listen(config.port, config.host, () => {
        console.log(`GamerScream Server running on http://${config.host}:${config.port}`)
        console.log(`LiveKit URL: ${config.livekitUrl}`)
    })
    let cleanupInFlight = false
    const maintenance = setInterval(() => {
        if (cleanupInFlight) return
        cleanupInFlight = true
        void channelApi.buildRooms()
            .catch(error => console.error('Room maintenance error:', error))
            .finally(() => { cleanupInFlight = false })
    }, 10_000)
    maintenance.unref()
}

export function resetState(): void {
    channels.reset()
    channelApi.reset()
    sse.reset()
    access.resetForTests()
    pinClientFailures.reset()
    pinGlobalFailures.reset()
    pinClientSuccesses.reset()
    pinGlobalSuccesses.reset()
    tokenChecks.reset()
    ticketLimiter.reset()
    for (const limiters of routeLimiters.values()) {
        limiters.session.reset()
        limiters.ip.reset()
        limiters.server.reset()
    }
    adminRoutes.reset()
}

export function generateAccessToken(): string {
    return access.issueToken()
}

export function isValidAccessToken(token: unknown): boolean {
    return access.isValid(token)
}

export function setAdminStateStoreForTests(store: AdminStateStore): void {
    access.setStoreForTests(store)
}

export { app, safeCompare }
