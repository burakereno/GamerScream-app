import crypto from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { app, getAccessToken } from './api-test-harness'

describe('Server API authentication and errors', () => {
    describe('GET /api/health', () => {
        it('returns ok status', async () => {
            const res = await request(app).get('/api/health')
            expect(res.status).toBe(200)
            expect(res.body.status).toBe('ok')
            expect(res.body.timestamp).toBeDefined()
        })

        it('reports dependency readiness without exposing LiveKit errors', async () => {
            const ready = await request(app).get('/api/ready')
            expect(ready.status).toBe(200)
            expect(ready.body).toEqual({ status: 'ready' })
        })

        it('returns sanitized JSON for malformed request bodies and CORS failures', async () => {
            const malformed = await request(app)
                .post('/api/verify-app-pin')
                .set('Content-Type', 'application/json')
                .send('{"pin":')
            expect(malformed.status).toBe(400)
            expect(malformed.body).toEqual({ error: 'Invalid JSON body' })
            expect(malformed.text).not.toContain('/Users/')

            const corsFailure = await request(app)
                .get('/api/health')
                .set('Origin', 'https://attacker.invalid')
            expect(corsFailure.status).toBe(403)
            expect(corsFailure.body).toEqual({ error: 'Origin not allowed' })
            expect(corsFailure.text).not.toContain('/Users/')

            const packagedApp = await request(app)
                .get('/api/health')
                .set('Origin', 'app://gamerscream')
            expect(packagedApp.status).toBe(200)
            expect(packagedApp.headers['access-control-allow-origin']).toBe('app://gamerscream')

            for (const blockedOrigin of ['null', 'file://']) {
                const blocked = await request(app).get('/api/health').set('Origin', blockedOrigin)
                expect(blocked.status).toBe(403)
                expect(blocked.body).toEqual({ error: 'Origin not allowed' })
            }
        })

        it('returns stable JSON errors for oversized bodies and unknown routes', async () => {
            const oversized = await request(app)
                .post('/api/verify-app-pin')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify({ pin: '8642', padding: 'x'.repeat(11_000) }))
            expect(oversized.status).toBe(413)
            expect(oversized.body).toEqual({ error: 'Request body too large' })

            const unsupported = await request(app)
                .post('/api/verify-app-pin')
                .set('Content-Type', 'text/plain')
                .send('pin=8642')
            expect(unsupported.status).toBe(415)
            expect(unsupported.body).toEqual({ error: 'Content-Type must be application/json' })

            const missing = await request(app).get('/api/does-not-exist')
            expect(missing.status).toBe(404)
            expect(missing.body).toEqual({ error: 'Not found' })
        })
    })

    describe('POST /api/verify-app-pin', () => {
        it('accepts correct PIN and returns access token', async () => {
            const res = await request(app)
                .post('/api/verify-app-pin')
                .send({ pin: '8642' })
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
            for (let index = 0; index < 5; index++) {
                await request(app)
                    .post('/api/verify-app-pin')
                    .send({ pin: 'wrong' })
            }
            const res = await request(app)
                .post('/api/verify-app-pin')
                .send({ pin: '8642' })
            expect(res.status).toBe(429)
        })

        it('uses forwarded client IP when running behind a proxy', async () => {
            for (let index = 0; index < 5; index++) {
                await request(app)
                    .post('/api/verify-app-pin')
                    .set('X-Forwarded-For', '203.0.113.10')
                    .send({ pin: 'wrong' })
            }
            const otherClient = await request(app)
                .post('/api/verify-app-pin')
                .set('X-Forwarded-For', '203.0.113.11')
                .send({ pin: '8642' })

            expect(otherClient.status).toBe(200)
            expect(otherClient.body.accessToken).toBeDefined()
        })

        it('bounds successful session issuance before doing more PIN hashing', async () => {
            const scrypt = vi.spyOn(crypto, 'scrypt')
            try {
                for (let attempt = 0; attempt < 10; attempt++) {
                    const issued = await request(app)
                        .post('/api/verify-app-pin')
                        .send({ pin: '8642' })
                    expect(issued.status).toBe(200)
                }
                const callsBeforeLimit = scrypt.mock.calls.length
                expect(callsBeforeLimit).toBe(10)
                const blocked = await request(app)
                    .post('/api/verify-app-pin')
                    .send({ pin: '8642' })
                expect(blocked.status).toBe(429)
                expect(scrypt.mock.calls.length).toBe(callsBeforeLimit)
            } finally {
                scrypt.mockRestore()
            }
        })
    })

    describe('POST /api/verify-access-token', () => {
        it('validates a correct access token', async () => {
            const res = await request(app)
                .post('/api/verify-access-token')
                .send({ accessToken: getAccessToken() })
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

        it('treats a wrong-length signature as invalid instead of throwing', async () => {
            const res = await request(app)
                .post('/api/verify-access-token')
                .send({ accessToken: `${Date.now() + 60_000}.x` })
            expect(res.status).toBe(200)
            expect(res.body).toEqual({ valid: false })
        })

        it('does not consume app PIN attempts while checking stored tokens', async () => {
            for (let index = 0; index < 5; index++) {
                const res = await request(app)
                    .post('/api/verify-access-token')
                    .send({ accessToken: 'invalid-token' })
                expect(res.status).toBe(200)
            }
            const pinRes = await request(app)
                .post('/api/verify-app-pin')
                .send({ pin: '8642' })
            expect(pinRes.status).toBe(200)
            expect(pinRes.body.accessToken).toBeDefined()
        })
    })
})
