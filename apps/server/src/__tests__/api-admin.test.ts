import { describe, expect, it } from 'vitest'
import request from 'supertest'
import {
    app,
    getAccessToken,
    isValidAccessToken,
    liveKitState,
    setAdminStateStoreForTests
} from './api-test-harness'

const adminSecret = 'test-admin-secret'

describe('Server API admin security controls', () => {
    it('does not count successful admin actions as failed secret attempts', async () => {
        for (let call = 0; call < 5; call++) {
            const response = await request(app)
                .post('/api/admin/verify')
                .send({ secret: adminSecret })
            expect(response.status).toBe(200)
        }
    })

    it('invalidates existing access tokens and unconsumed SSE tickets', async () => {
        const accessToken = getAccessToken()
        const ticket = await request(app)
            .post('/api/events-ticket')
            .set('x-access-token', accessToken)

        const invalidated = await request(app)
            .post('/api/admin/invalidate-tokens')
            .send({ secret: adminSecret })
        expect(invalidated.status).toBe(200)

        const tokenCheck = await request(app)
            .post('/api/verify-access-token')
            .send({ accessToken })
        expect(tokenCheck.body).toEqual({ valid: false })
        const ticketCheck = await request(app)
            .get(`/api/events?ticket=${encodeURIComponent(ticket.body.ticket)}`)
        expect(ticketCheck.status).toBe(401)
    })

    it('revokes API sessions before kicking LiveKit participants', async () => {
        const accessToken = getAccessToken()
        let tokenWasValidDuringRemoval = true
        liveKitState.onRemove = () => { tokenWasValidDuringRemoval = isValidAccessToken(accessToken) }
        liveKitState.rooms = [{ name: 'ch-1', numParticipants: 1 }]
        liveKitState.participants.set('ch-1', [{ identity: 'participant-one', name: 'One' }])

        const kicked = await request(app)
            .post('/api/admin/kick-all')
            .send({ secret: adminSecret })
        expect(kicked.status).toBe(200)
        expect(liveKitState.removed).toEqual([{ room: 'ch-1', identity: 'participant-one' }])
        expect(tokenWasValidDuringRemoval).toBe(false)

        const tokenCheck = await request(app)
            .post('/api/verify-access-token')
            .send({ accessToken })
        expect(tokenCheck.body).toEqual({ valid: false })

        const newJoinDuringRevocationWindow = await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ username: 'NewUser', room: 'ch-1', deviceId: 'new-device' })
        expect(newJoinDuringRevocationWindow.status).toBe(503)
        expect(newJoinDuringRevocationWindow.body.retryAfter).toBeGreaterThan(0)

        liveKitState.removed.length = 0
        liveKitState.rooms = [{ name: 'ch-1', numParticipants: 1 }]
        liveKitState.participants.set('ch-1', [{ identity: 'jwt-replay', name: 'Replay' }])
        await new Promise(resolve => setTimeout(resolve, 2_100))
        expect(liveKitState.removed).toContainEqual({ room: 'ch-1', identity: 'jwt-replay' })
    })

    it('continues kicking other participants and reports partial failures', async () => {
        liveKitState.rooms = [{ name: 'ch-1', numParticipants: 2 }]
        liveKitState.participants.set('ch-1', [
            { identity: 'participant-fails', name: 'Fails' },
            { identity: 'participant-removed', name: 'Removed' }
        ])
        liveKitState.removeErrors.add('participant-fails')

        const response = await request(app)
            .post('/api/admin/kick-all')
            .send({ secret: adminSecret })
        expect(response.status).toBe(207)
        expect(response.body).toMatchObject({ success: false, kicked: 1, failed: 1 })
        expect(liveKitState.removed).toEqual([{ room: 'ch-1', identity: 'participant-removed' }])
    })

    it('rejects app PIN values that official clients cannot enter', async () => {
        const response = await request(app)
            .post('/api/admin/change-pin')
            .send({ secret: adminSecret, newPin: '123456789' })
        expect(response.status).toBe(400)
        expect(response.body.error).toBe('PIN must be 4-8 digits')
    })

    it('returns an error and keeps sessions valid when revocation cannot be persisted', async () => {
        const accessToken = getAccessToken()
        setAdminStateStoreForTests({
            load: () => null,
            save: () => { throw new Error('disk unavailable') }
        })

        const response = await request(app)
            .post('/api/admin/invalidate-tokens')
            .send({ secret: adminSecret })
        expect(response.status).toBe(500)

        const tokenCheck = await request(app)
            .post('/api/verify-access-token')
            .send({ accessToken })
        expect(tokenCheck.body).toEqual({ valid: true })
    })
})
