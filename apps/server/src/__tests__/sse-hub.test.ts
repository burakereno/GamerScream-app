import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessService, AccessSession } from '../access-service.js'
import { SseHub } from '../sse-hub.js'

describe('SseHub presence reconciliation', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('coalesces refresh requests into one fast check and one reconciliation check', async () => {
        const buildRooms = vi.fn().mockResolvedValue([
            { channel: 1, name: 'ch-1', playerCount: 1 }
        ])
        const hub = new SseHub({ isActive: () => true } as unknown as AccessService, buildRooms)
        const response = {
            writableEnded: false,
            destroyed: false,
            write: vi.fn(() => true),
            end: vi.fn()
        }
        const keepAlive = setInterval(() => undefined, 30_000)
        const clients = (hub as unknown as {
            clients: Map<unknown, { session: AccessSession; ip: string; keepAlive: ReturnType<typeof setInterval> }>
        }).clients
        clients.set(response, { session: {} as AccessSession, ip: '127.0.0.1', keepAlive })

        hub.schedulePresenceRefresh()
        hub.schedulePresenceRefresh()
        await vi.advanceTimersByTimeAsync(250)
        expect(buildRooms).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(1_000)
        expect(buildRooms).toHaveBeenCalledTimes(2)
        hub.reset()
    })
})
