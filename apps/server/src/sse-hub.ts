import crypto from 'crypto'
import type express from 'express'
import type { AccessService, AccessSession } from './access-service.js'
import type { ChannelInfo } from './channel-registry.js'

interface SseConnection {
    session: AccessSession
    ip: string
    keepAlive: ReturnType<typeof setInterval>
}

export class SseHub {
    private readonly clients = new Map<express.Response, SseConnection>()
    private readonly tickets = new Map<string, { session: AccessSession; ip: string; expiresAt: number }>()
    private lastBroadcastJson = ''
    private broadcastInFlight = false
    private broadcastTimer: ReturnType<typeof setTimeout> | null = null
    private presenceReconcileTimer: ReturnType<typeof setTimeout> | null = null

    constructor(
        private readonly access: AccessService,
        private readonly buildRooms: () => Promise<ChannelInfo[]>
    ) {
        const interval = setInterval(() => {
            if (this.clients.size > 0) void this.broadcast()
        }, 5_000)
        interval.unref()
    }

    issueTicket(session: AccessSession, ip: string): string | null {
        this.pruneTickets()
        if (this.tickets.size >= 1_000) return null
        const ticket = crypto.randomBytes(32).toString('base64url')
        this.tickets.set(ticket, { session, ip, expiresAt: Date.now() + 60_000 })
        return ticket
    }

    handleConnection(req: express.Request, res: express.Response): void {
        const ip = req.ip || req.socket.remoteAddress || 'unknown'
        const session = this.consumeTicket(req.query.ticket, ip)
        if (!session) {
            res.status(401).json({ error: 'Unauthorized' })
            return
        }
        if (this.clients.size >= 50 || [...this.clients.values()].filter(client => client.ip === ip).length >= 5) {
            res.status(503).json({ error: 'Too many connections' })
            return
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        })
        res.flushHeaders()

        const keepAlive = setInterval(() => {
            if (res.writableEnded || res.destroyed) return this.cleanup(res)
            try {
                if (!res.write(': ping\n\n')) {
                    this.cleanup(res)
                    res.destroy()
                }
            } catch {
                this.cleanup(res)
                res.destroy()
            }
        }, 30_000)
        keepAlive.unref()
        this.clients.set(res, { session, ip, keepAlive })
        void this.buildRooms()
            .then(rooms => {
                if (this.clients.has(res)) this.write(res, 'rooms', { rooms })
            })
            .catch(() => {
                if (this.clients.has(res)) this.write(res, 'service-error', { error: 'Room service unavailable' })
            })

        req.once('close', () => this.cleanup(res))
        res.once('error', () => this.cleanup(res))
    }

    scheduleBroadcast(delayMs = 500): void {
        if (this.broadcastTimer) return
        this.broadcastTimer = setTimeout(() => {
            this.broadcastTimer = null
            void this.broadcast()
        }, delayMs)
    }

    schedulePresenceRefresh(): void {
        this.scheduleBroadcast(250)
        if (this.presenceReconcileTimer) return
        this.presenceReconcileTimer = setTimeout(() => {
            this.presenceReconcileTimer = null
            void this.broadcast()
        }, 1_250)
    }

    closeAll(): void {
        this.tickets.clear()
        for (const client of [...this.clients.keys()]) this.cleanup(client, true)
    }

    reset(): void {
        this.closeAll()
        this.lastBroadcastJson = ''
        this.broadcastInFlight = false
        if (this.broadcastTimer) {
            clearTimeout(this.broadcastTimer)
            this.broadcastTimer = null
        }
        if (this.presenceReconcileTimer) {
            clearTimeout(this.presenceReconcileTimer)
            this.presenceReconcileTimer = null
        }
    }

    private async broadcast(): Promise<void> {
        if (this.clients.size === 0 || this.broadcastInFlight) return
        this.broadcastInFlight = true
        try {
            const rooms = await this.buildRooms()
            const json = JSON.stringify(rooms)
            if (json === this.lastBroadcastJson) return
            this.lastBroadcastJson = json
            for (const [client, connection] of this.clients) {
                if (!this.access.isActive(connection.session)) {
                    this.cleanup(client, true)
                    continue
                }
                this.write(client, 'rooms', { rooms })
            }
        } catch (error) {
            console.error('SSE broadcast error:', error)
        } finally {
            this.broadcastInFlight = false
        }
    }

    private consumeTicket(value: unknown, ip: string): AccessSession | null {
        if (typeof value !== 'string') return null
        const ticket = this.tickets.get(value)
        if (!ticket || ticket.ip !== ip || ticket.expiresAt <= Date.now() || !this.access.isActive(ticket.session)) {
            return null
        }
        this.tickets.delete(value)
        return ticket.session
    }

    private pruneTickets(): void {
        const now = Date.now()
        for (const [token, ticket] of this.tickets) {
            if (ticket.expiresAt <= now || !this.access.isActive(ticket.session)) this.tickets.delete(token)
        }
    }

    private write(res: express.Response, event: string, data: unknown): boolean {
        if (res.writableEnded || res.destroyed || !this.clients.has(res)) {
            this.cleanup(res)
            return false
        }
        try {
            if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) {
                this.cleanup(res)
                res.destroy()
                return false
            }
            return true
        } catch {
            this.cleanup(res)
            res.destroy()
            return false
        }
    }

    private cleanup(res: express.Response, end = false): void {
        const connection = this.clients.get(res)
        if (connection) clearInterval(connection.keepAlive)
        this.clients.delete(res)
        if (end && !res.writableEnded && !res.destroyed) res.end()
    }
}
