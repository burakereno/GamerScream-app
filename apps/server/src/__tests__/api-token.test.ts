import { describe, expect, it } from 'vitest'
import request from 'supertest'
import {
    app,
    getAccessToken,
    liveKitState,
    liveKitTokenRecords
} from './api-test-harness'

describe('Server API LiveKit token issuance', () => {
    it('returns LiveKit token with valid auth', async () => {
        const res = await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ username: 'TestUser', room: 'ch-1', deviceId: 'dev123' })
        expect(res.status).toBe(200)
        expect(res.body.token).toBe('mock-livekit-jwt')
        expect(res.body.livekitUrl).toBeDefined()
    })

    it('includes inputMode in token generation', async () => {
        const res = await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ username: 'TestUser', room: 'ch-1', deviceId: 'dev123', inputMode: 'ptt' })
        expect(res.status).toBe(200)
    })

    it('uses a server-bound identity instead of the client device ID', async () => {
        const accessToken = getAccessToken()
        const firstDeviceId = '11111111-1111-4111-8111-111111111111'
        for (let issuance = 0; issuance < 2; issuance++) {
            await request(app)
                .post('/api/token')
                .set('x-access-token', accessToken)
                .send({ username: 'TestUser', room: 'ch-1', deviceId: firstDeviceId })
        }

        expect(liveKitTokenRecords).toHaveLength(2)
        expect(liveKitTokenRecords[0].options.identity).toBe(liveKitTokenRecords[1].options.identity)
        expect(String(liveKitTokenRecords[0].options.identity)).not.toContain(firstDeviceId)

        const secondDeviceId = '33333333-3333-4333-8333-333333333333'
        await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ username: 'OtherUser', room: 'ch-1', deviceId: secondDeviceId })
        expect(liveKitTokenRecords[2].options.identity).not.toBe(liveKitTokenRecords[0].options.identity)
        expect(String(liveKitTokenRecords[2].options.identity)).not.toContain(secondDeviceId)
    })

    it('restricts participants to microphone publishing and immutable metadata', async () => {
        await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ username: 'TestUser', room: 'ch-1', deviceId: '11111111-1111-4111-8111-111111111111' })

        expect(liveKitTokenRecords[0].grant).toEqual({
            room: 'ch-1',
            roomJoin: true,
            roomCreate: false,
            canPublish: true,
            canPublishSources: ['microphone'],
            canPublishData: true,
            canSubscribe: true,
            canUpdateOwnMetadata: false
        })
        expect(liveKitTokenRecords[0].options.ttl).toBe('30s')
        expect(String(liveKitTokenRecords[0].options.metadata)).not.toContain('11111111-1111')
    })

    it('updates input mode through the authenticated server-side participant endpoint', async () => {
        const accessToken = getAccessToken()
        await request(app)
            .post('/api/token')
            .set('x-access-token', accessToken)
            .send({ username: 'TestUser', room: 'ch-1', deviceId: '11111111-1111-4111-8111-111111111111' })

        const response = await request(app)
            .post('/api/participant-mode')
            .set('x-access-token', accessToken)
            .send({ room: 'ch-1', inputMode: 'ptt' })

        expect(response.status).toBe(200)
        expect(response.body).toEqual({ ok: true })
        expect(liveKitState.updated).toHaveLength(1)
        expect(liveKitState.updated[0].identity).toBe(liveKitTokenRecords[0].options.identity)
        expect(JSON.parse(liveKitState.updated[0].options.metadata)).toMatchObject({ inputMode: 'ptt' })
    })

    it('rejects missing username', async () => {
        const res = await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ room: 'ch-1' })
        expect(res.status).toBe(400)
    })

    it('rejects missing room', async () => {
        const res = await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ username: 'TestUser' })
        expect(res.status).toBe(400)
    })

    it('rejects invalid username characters', async () => {
        const res = await request(app)
            .post('/api/token')
            .set('x-access-token', getAccessToken())
            .send({ username: '<script>', room: 'ch-1' })
        expect(res.status).toBe(400)
    })

    it('rejects unauthenticated requests', async () => {
        const res = await request(app)
            .post('/api/token')
            .send({ username: 'TestUser', room: 'ch-1' })
        expect(res.status).toBe(401)
    })

    it('rejects unknown rooms without binding a display name', async () => {
        const accessToken = getAccessToken()
        const res = await request(app)
            .post('/api/token')
            .set('x-access-token', accessToken)
            .send({ username: 'TestUser', room: 'private-shadow-room', deviceId: 'dev123' })

        expect(res.status).toBe(404)
        expect(res.body.error).toBe('Channel not found')

        const validAfterFailure = await request(app)
            .post('/api/token')
            .set('x-access-token', accessToken)
            .send({ username: 'DifferentName', room: 'ch-1', deviceId: 'dev123' })
        expect(validAfterFailure.status).toBe(200)
    })
})
