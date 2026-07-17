import type express from 'express'
import type { AccessService } from './access-service.js'
import type { ServerConfig } from './config.js'
import type { LiveKitRoomService } from './channel-routes.js'
import { RateLimiter, requestBody, safeCompare, settleWithConcurrency, withTimeout } from './security-utils.js'
import { AdminStateCommittedError } from './state-store.js'

export function registerAdminRoutes(
    app: express.Express,
    config: ServerConfig,
    access: AccessService,
    roomService: LiveKitRoomService
): { reset(): void } {
    const clientFailures = new RateLimiter(3, 60_000)
    const globalFailures = new RateLimiter(30, 60_000)
    const actions = new RateLimiter(20, 60_000)
    let removalInFlight: Promise<{ kicked: number; failed: number }> | null = null
    let reaperTimer: ReturnType<typeof setInterval> | null = null

    async function removeAllParticipants(): Promise<{ kicked: number; failed: number }> {
        if (removalInFlight) return removalInFlight
        removalInFlight = performParticipantRemoval()
        try {
            return await removalInFlight
        } finally {
            removalInFlight = null
        }
    }

    async function performParticipantRemoval(): Promise<{ kicked: number; failed: number }> {
        let rooms
        try {
            rooms = await withTimeout(roomService.listRooms())
        } catch {
            return { kicked: 0, failed: 1 }
        }
        const participantResults = await settleWithConcurrency(rooms, 5, async room => ({
            roomName: room.name,
            participants: await withTimeout(roomService.listParticipants(room.name))
        }))
        let failed = participantResults.filter(result => result.status === 'rejected').length
        const targets = participantResults.flatMap(result => result.status === 'fulfilled'
            ? result.value.participants.map(participant => ({
                roomName: result.value.roomName,
                identity: participant.identity
            }))
            : [])
        const removalResults = await settleWithConcurrency(targets, 10, target =>
            withTimeout(roomService.removeParticipant(target.roomName, target.identity)))
        const kicked = removalResults.filter(result => result.status === 'fulfilled').length
        failed += removalResults.length - kicked
        return { kicked, failed }
    }

    function ensureRevocationReaper(): void {
        if (reaperTimer || !access.isVoiceIssuanceSuspended()) return
        const reap = () => {
            if (!access.isVoiceIssuanceSuspended()) {
                if (reaperTimer) clearInterval(reaperTimer)
                reaperTimer = null
                return
            }
            void removeAllParticipants().then(result => {
                if (result.failed > 0) {
                    console.warn(`Revocation reaper retry needed: ${result.failed} failed operations`)
                }
            })
        }
        void reap()
        reaperTimer = setInterval(reap, 2_000)
        reaperTimer.unref()
    }

    async function revokeAndRemove(
        res: express.Response,
        revoke: () => void | Promise<void>,
        successMessage: string
    ): Promise<void> {
        let committedError: AdminStateCommittedError | null = null
        try {
            await revoke()
        } catch (error) {
            if (!(error instanceof AdminStateCommittedError)) throw error
            committedError = error
        }
        const result = await removeAllParticipants()
        if (committedError) {
            console.error('Revocation state durability could not be confirmed:', committedError)
            res.status(500).json({
                error: 'Revocation applied, but state durability could not be confirmed',
                ...result
            })
            return
        }
        if (result.failed > 0) {
            console.warn(`Admin revocation completed partially: ${result.kicked} kicked, ${result.failed} failed operations`)
            res.status(207).json({
                success: false,
                ...result,
                message: `${successMessage} ${result.failed} LiveKit operations failed; retry the action.`
            })
            return
        }
        res.json({ success: true, ...result, message: successMessage })
    }

    const requireAdmin: express.RequestHandler = (req, res, next) => {
        if (!config.adminSecret) return void res.status(503).json({ error: 'Admin panel not configured' })
        const ip = req.ip || req.socket.remoteAddress || 'unknown'
        if (!clientFailures.allowsFailure(ip) || !globalFailures.allowsFailure('global')) {
            return void res.status(429).json({ error: 'Too many attempts. Try again later.' })
        }
        const { secret } = requestBody(req)
        if (typeof secret !== 'string' || !safeCompare(secret, config.adminSecret)) {
            clientFailures.recordFailure(ip)
            globalFailures.recordFailure('global')
            return void res.status(403).json({ error: 'Invalid admin secret' })
        }
        clientFailures.delete(ip)
        next()
    }

    const limitActions: express.RequestHandler = (req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown'
        if (!actions.consume(ip)) return void res.status(429).json({ error: 'Too many admin actions' })
        next()
    }

    app.post('/api/admin/verify', requireAdmin, (_req, res) => res.json({ valid: true }))

    app.post('/api/admin/change-pin', requireAdmin, limitActions, async (req, res) => {
        const { newPin } = requestBody(req)
        if (typeof newPin !== 'string' || !/^\d{4,8}$/.test(newPin)) {
            return void res.status(400).json({ error: 'PIN must be 4-8 digits' })
        }
        await revokeAndRemove(
            res,
            () => access.changePin(newPin),
            'PIN changed and active participants removed. All users must re-enter the new PIN.'
        )
    })

    app.post('/api/admin/kick-all', requireAdmin, limitActions, async (_req, res) => {
        try {
            await revokeAndRemove(res, () => access.invalidateAll(), 'All active participants removed.')
        } catch (error) {
            console.error('Kick all error:', error)
            res.status(500).json({ error: 'Failed to kick participants' })
        }
    })

    app.post('/api/admin/invalidate-tokens', requireAdmin, limitActions, async (_req, res) => {
        await revokeAndRemove(
            res,
            () => access.invalidateAll(),
            'All tokens invalidated and active participants removed. Users must re-enter PIN.'
        )
    })

    access.onInvalidated(ensureRevocationReaper)
    ensureRevocationReaper()

    return {
        reset() {
            clientFailures.reset()
            globalFailures.reset()
            actions.reset()
            removalInFlight = null
            if (reaperTimer) clearInterval(reaperTimer)
            reaperTimer = null
        }
    }
}
