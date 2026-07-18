import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { app, getAccessToken, liveKitState } from './api-test-harness'

describe('Server API channels', () => {
    describe('POST /api/channels', () => {
        it('creates a channel', async () => {
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', getAccessToken())
                .send({ name: 'Team Alpha', createdBy: 'TestUser' })
            expect(res.status).toBe(200)
            expect(res.body.name).toBe('Team Alpha')
            expect(res.body.roomName).toMatch(/^custom-/)
        })

        it('creates a PIN-protected channel', async () => {
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', getAccessToken())
                .send({ name: 'Secret Room', pin: '1234', createdBy: 'TestUser' })
            expect(res.status).toBe(200)
            expect(res.body.hasPin).toBe(true)
            expect(res.body.roomCapability).toEqual(expect.any(String))
        })

        it('rejects empty channel name', async () => {
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', getAccessToken())
                .send({ name: '' })
            expect(res.status).toBe(400)
        })

        it('rejects channel name over 20 characters', async () => {
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', getAccessToken())
                .send({ name: 'A'.repeat(21) })
            expect(res.status).toBe(400)
        })

        it('rejects invalid PIN format', async () => {
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', getAccessToken())
                .send({ name: 'Room', pin: 'abcd' })
            expect(res.status).toBe(400)
        })

        it('rejects non-string PIN values instead of creating an unusable channel', async () => {
            const res = await request(app)
                .post('/api/channels')
                .set('x-access-token', getAccessToken())
                .send({ name: 'Broken Room', pin: 1234, createdBy: 'TestUser' })
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('PIN must be exactly 4 digits')
        })

        it('rate limits channel creation for one authenticated session', async () => {
            const token = getAccessToken()
            for (let index = 0; index < 20; index++) {
                const created = await request(app)
                    .post('/api/channels')
                    .set('x-access-token', token)
                    .send({ name: `Room ${index}`, createdBy: 'TestUser' })
                expect(created.status).toBe(200)
            }
            const blocked = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'One Too Many', createdBy: 'TestUser' })
            expect(blocked.status).toBe(429)
        })
    })

    describe('POST /api/channels/verify-pin', () => {
        it('rate limits repeated guesses for the same protected channel', async () => {
            const token = getAccessToken()
            const channel = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'Protected', pin: '1234', createdBy: 'TestUser' })
            for (let attempt = 0; attempt < 5; attempt++) {
                await request(app)
                    .post('/api/channels/verify-pin')
                    .set('x-access-token', token)
                    .send({ roomName: channel.body.roomName, pin: '9999' })
            }
            const blocked = await request(app)
                .post('/api/channels/verify-pin')
                .set('x-access-token', token)
                .send({ roomName: channel.body.roomName, pin: '1234' })
            expect(blocked.status).toBe(429)
        })

        it('issues a one-use room capability bound to the verified access session', async () => {
            const ownerToken = getAccessToken()
            const channel = await request(app)
                .post('/api/channels')
                .set('x-access-token', ownerToken)
                .send({ name: 'Capability Room', pin: '1234', createdBy: 'TestUser' })
            const verified = await request(app)
                .post('/api/channels/verify-pin')
                .set('x-access-token', ownerToken)
                .send({ roomName: channel.body.roomName, pin: '1234' })
            expect(verified.status).toBe(200)
            expect(verified.body.roomCapability).toEqual(expect.any(String))

            const otherSession = await request(app)
                .post('/api/token')
                .set('x-access-token', getAccessToken())
                .send({ username: 'Other', room: channel.body.roomName, roomCapability: verified.body.roomCapability })
            expect(otherSession.status).toBe(403)
            const joined = await request(app)
                .post('/api/token')
                .set('x-access-token', ownerToken)
                .send({ username: 'TestUser', room: channel.body.roomName, roomCapability: verified.body.roomCapability })
            expect(joined.status).toBe(200)
            const reconnect = await request(app)
                .post('/api/token')
                .set('x-access-token', ownerToken)
                .send({ username: 'TestUser', room: channel.body.roomName, roomCapability: verified.body.roomCapability })
            expect(reconnect.status).toBe(200)
        })
    })

    describe('room queries and notifications', () => {
        it('returns the room list with auth', async () => {
            const res = await request(app)
                .get('/api/rooms')
                .set('x-access-token', getAccessToken())
            expect(res.status).toBe(200)
            expect(res.body.rooms).toBeInstanceOf(Array)
            expect(res.body.rooms.length).toBeGreaterThanOrEqual(5)
        })

        it('rejects an unauthenticated room list', async () => {
            expect((await request(app).get('/api/rooms')).status).toBe(401)
        })

        it('accepts a rate-limited presence refresh only for an authorized room', async () => {
            const token = getAccessToken()
            const joined = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ username: 'TestUser', room: 'ch-2' })
            expect(joined.status).toBe(200)

            const accepted = await request(app)
                .post('/api/presence-refresh')
                .set('x-access-token', token)
                .send({ room: 'ch-2' })
            expect(accepted.status).toBe(202)
            expect(accepted.body).toEqual({ ok: true })
        })

        it('returns fresh participant names after an authorized presence refresh', async () => {
            const token = getAccessToken()
            const joined = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ username: 'TestUser', room: 'ch-2' })
            expect(joined.status).toBe(200)

            liveKitState.participants.set('ch-2', [
                { identity: 'mac-id', name: 'mac' },
                { identity: 'burak-id', name: 'Burak' },
                { identity: 'alper-id', name: 'Alper' }
            ])
            const initial = await request(app)
                .get('/api/room-players/ch-2')
                .set('x-access-token', token)
            expect(initial.body.players).toEqual(['mac', 'Burak', 'Alper'])

            liveKitState.participants.set('ch-2', [
                { identity: 'mac-id', name: 'mac' },
                { identity: 'burak-id', name: 'Burak' }
            ])
            const refreshedPresence = await request(app)
                .post('/api/presence-refresh')
                .set('x-access-token', token)
                .send({ room: 'ch-2' })
            expect(refreshedPresence.status).toBe(202)

            const refreshedNames = await request(app)
                .get('/api/room-players/ch-2')
                .set('x-access-token', token)
            expect(refreshedNames.body.players).toEqual(['mac', 'Burak'])
        })

        it('reconciles participant names when the authoritative room count changes', async () => {
            const token = getAccessToken()
            liveKitState.rooms = [{ name: 'ch-2', numParticipants: 3 }]
            liveKitState.participants.set('ch-2', [
                { identity: 'mac-id', name: 'mac' },
                { identity: 'burak-id', name: 'Burak' },
                { identity: 'alper-id', name: 'Alper' }
            ])
            const initial = await request(app)
                .get('/api/room-players/ch-2')
                .set('x-access-token', token)
            expect(initial.body.players).toEqual(['mac', 'Burak', 'Alper'])

            liveKitState.rooms = [{ name: 'ch-2', numParticipants: 2 }]
            liveKitState.participants.set('ch-2', [
                { identity: 'mac-id', name: 'mac' },
                { identity: 'burak-id', name: 'Burak' }
            ])
            const rooms = await request(app)
                .get('/api/rooms')
                .set('x-access-token', token)
            expect(rooms.body.rooms.find((room: { name: string }) => room.name === 'ch-2').playerCount).toBe(2)

            const reconciledNames = await request(app)
                .get('/api/room-players/ch-2')
                .set('x-access-token', token)
            expect(reconciledNames.body.players).toEqual(['mac', 'Burak'])
        })

        it('rejects invalid, unknown, and unauthorized presence refresh requests', async () => {
            const token = getAccessToken()
            expect((await request(app)
                .post('/api/presence-refresh')
                .send({ room: 'ch-1' })).status).toBe(401)
            expect((await request(app)
                .post('/api/presence-refresh')
                .set('x-access-token', token)
                .send({ room: '../ch-1' })).status).toBe(400)
            expect((await request(app)
                .post('/api/presence-refresh')
                .set('x-access-token', token)
                .send({ room: 'unknown-room' })).status).toBe(404)
            const protectedChannel = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'Private Refresh', pin: '1234', createdBy: 'TestUser' })
            expect((await request(app)
                .post('/api/presence-refresh')
                .set('x-access-token', getAccessToken())
                .send({ room: protectedChannel.body.roomName })).status).toBe(403)
        })

        it('fails closed without deleting protected channel state when LiveKit is unavailable', async () => {
            const token = getAccessToken()
            const channel = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'Keep Protected', pin: '1234', createdBy: 'TestUser' })
            const realNow = Date.now()
            liveKitState.listRoomsError = new Error('LiveKit unavailable')
            const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 61_000)
            const unavailable = await request(app).get('/api/rooms').set('x-access-token', token)
            nowSpy.mockRestore()
            liveKitState.listRoomsError = null
            expect(unavailable.status).toBe(503)

            const pinStillRequired = await request(app)
                .post('/api/token')
                .set('x-access-token', token)
                .send({ username: 'TestUser', room: channel.body.roomName })
            expect(pinStillRequired.status).toBe(403)
        })

        it('issues SSE tickets without accepting the long-lived token in the query string', async () => {
            const accessToken = getAccessToken()
            const issued = await request(app)
                .post('/api/events-ticket')
                .set('x-access-token', accessToken)
            expect(issued.status).toBe(200)
            expect(issued.body).toEqual({ ticket: expect.any(String), expiresIn: 60 })
            const legacy = await request(app).get(`/api/events?token=${encodeURIComponent(accessToken)}`)
            expect(legacy.status).toBe(401)
        })

        it('bounds repeated notification traffic per authenticated session', async () => {
            const token = getAccessToken()
            for (let call = 0; call < 30; call++) {
                const response = await request(app).post('/api/notify-leave').set('x-access-token', token)
                expect(response.status).toBe(200)
            }
            const blocked = await request(app).post('/api/notify-leave').set('x-access-token', token)
            expect(blocked.status).toBe(429)
        })

        it('does not disclose participant names for PIN-protected channels', async () => {
            const token = getAccessToken()
            const channel = await request(app)
                .post('/api/channels')
                .set('x-access-token', token)
                .send({ name: 'Private Players', pin: '1234', createdBy: 'TestUser' })
            liveKitState.participants.set(channel.body.roomName, [{ identity: 'private-id', name: 'Private User' }])
            const response = await request(app)
                .get(`/api/room-players/${channel.body.roomName}`)
                .set('x-access-token', token)
            expect(response.status).toBe(403)
            expect(response.body).toEqual({ error: 'Channel PIN required' })
        })

        it('rejects player enumeration for unknown rooms', async () => {
            const response = await request(app)
                .get('/api/room-players/shadow-room')
                .set('x-access-token', getAccessToken())
            expect(response.status).toBe(404)
        })
    })
})
