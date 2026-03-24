import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app, resetState, generateAccessToken } from '../index'

// Mock livekit-server-sdk to avoid real LiveKit calls
vi.mock('livekit-server-sdk', () => {
    class MockAccessToken {
        addGrant = vi.fn()
        toJwt = vi.fn().mockResolvedValue('mock-livekit-jwt')
    }
    class MockRoomServiceClient {
        listRooms = vi.fn().mockResolvedValue([])
        listParticipants = vi.fn().mockResolvedValue([])
    }
    return {
        AccessToken: MockAccessToken,
        RoomServiceClient: MockRoomServiceClient
    }
})

// Helper: get a valid access token for authenticated requests
function getAccessToken(): string {
    return generateAccessToken()
}

describe('Server API', () => {
    beforeEach(() => {
        resetState()
    })

    // ── Health Check ──
    describe('GET /api/health', () => {
        it('returns ok status', async () => {
            const res = await request(app).get('/api/health')
            expect(res.status).toBe(200)
            expect(res.body.status).toBe('ok')
            expect(res.body.timestamp).toBeDefined()
        })
    })

    // ── PIN Verification ──
    describe('POST /api/verify-app-pin', () => {
        it('accepts correct PIN and returns access token', async () => {
            const res = await request(app)
                .post('/api/verify-app-pin')
                .send({ pin: '1520' })
            expect(res.status).toBe(200)
            expect(res.body.accessToken).toBeDefined()
        })

        it('rejects incorrect PIN', async () => {
            const res = await request(app)
                .post('/api/verify-app-pin')
                .send({ pin: '9999' })
            expect(res.status).toBe(403)
        })

        it('rejects missing PIN', async () => {
            const res = await request(app)
                .post('/api/verify-app-pin')
                .send({})
            expect(res.status).toBe(403)
        })

        it('rate limits after too many attempts', async () => {
            // Exhaust rate limit (5 attempts)
            for (let i = 0; i < 5; i++) {
                await request(app)
                    .post('/api/verify-app-pin')
                    .send({ pin: 'wrong' })
            }
            const res = await request(app)
                .post('/api/verify-app-pin')
                .send({ pin: '1520' })
            expect(res.status).toBe(429)
        })
    })

    // ── Access Token Verification ──
    describe('POST /api/verify-access-token', () => {
        it('validates a correct access token', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/verify-access-token')
                .send({ accessToken: token })
            expect(res.status).toBe(200)
            expect(res.body.valid).toBe(true)
        })

        it('rejects an invalid access token', async () => {
            const res = await request(app)
                .post('/api/verify-access-token')
                .send({ accessToken: 'invalid-token' })
            expect(res.status).toBe(200)
            expect(res.body.valid).toBe(false)
        })
    })

    // ── Token Generation ──
    describe('POST /api/token', () => {
        it('returns LiveKit token with valid auth', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ username: 'TestUser', room: 'ch-1', deviceId: 'dev123' })
            expect(res.status).toBe(200)
            expect(res.body.token).toBe('mock-livekit-jwt')
            expect(res.body.livekitUrl).toBeDefined()
        })

        it('includes inputMode in token generation', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ username: 'TestUser', room: 'ch-1', deviceId: 'dev123', inputMode: 'ptt' })
            expect(res.status).toBe(200)
        })

        it('rejects missing username', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ room: 'ch-1' })
            expect(res.status).toBe(400)
        })

        it('rejects missing room', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ username: 'TestUser' })
            expect(res.status).toBe(400)
        })

        it('rejects invalid username characters', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ username: '<script>', room: 'ch-1' })
            expect(res.status).toBe(400)
        })

        it('rejects unauthenticated requests', async () => {
            const res = await request(app)
                .post('/api/token')
                .send({ username: 'TestUser', room: 'ch-1' })
            expect(res.status).toBe(401)
        })
    })

    // ── Custom Channels ──
    describe('POST /api/channels', () => {
        it('creates a channel', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'Team Alpha', createdBy: 'TestUser' })
            expect(res.status).toBe(200)
            expect(res.body.name).toBe('Team Alpha')
            expect(res.body.roomName).toMatch(/^custom-/)
        })

        it('creates a PIN-protected channel', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'Secret Room', pin: '1234', createdBy: 'TestUser' })
            expect(res.status).toBe(200)
            expect(res.body.hasPin).toBe(true)
        })

        it('rejects empty channel name', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: '' })
            expect(res.status).toBe(400)
        })

        it('rejects channel name over 20 characters', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'A'.repeat(21) })
            expect(res.status).toBe(400)
        })

        it('rejects invalid PIN format', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'Room', pin: 'abcd' })
            expect(res.status).toBe(400)
        })
    })

    // ── Room List ──
    describe('GET /api/rooms', () => {
        it('returns room list with auth', async () => {
            const token = getAccessToken()
            const res = await request(app)
                .get('/api/rooms')
                .set('x-access-token', token)
            expect(res.status).toBe(200)
            expect(res.body.rooms).toBeInstanceOf(Array)
            expect(res.body.rooms.length).toBeGreaterThanOrEqual(5) // 5 default channels
        })

        it('rejects unauthenticated room list', async () => {
            const res = await request(app).get('/api/rooms')
            expect(res.status).toBe(401)
        })
    })
})
