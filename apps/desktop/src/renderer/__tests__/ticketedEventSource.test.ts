import { describe, expect, it, vi } from 'vitest'
import { createTicketedEventSource } from '../hooks/ticketedEventSource'

class FakeEventSource {
    onerror: (() => void) | null = null
    onopen: (() => void) | null = null
    close = vi.fn()
    addEventListener = vi.fn()
}

describe('ticket-authenticated room events', () => {
    it('uses the access token only for ticket issuance and reconnects with a fresh one-time ticket', async () => {
        const token = `${'e'.repeat(180)}.${'a'.repeat(43)}`
        const fetcher = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ticket: 'ticket-one', expiresIn: 60 }) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ticket: 'ticket-two', expiresIn: 60 }) })
        const sources: Array<{ url: string; source: FakeEventSource }> = []
        const scheduled: Array<() => void> = []
        const stream = createTicketedEventSource({
            serverUrl: 'https://voice.example.test',
            accessToken: token,
            fetcher,
            createEventSource: (url) => {
                const source = new FakeEventSource()
                sources.push({ url, source })
                return source
            },
            schedule: (callback) => { scheduled.push(callback); return scheduled.length },
            cancel: vi.fn(),
            onRooms: vi.fn(),
            onUnauthorized: vi.fn(),
            onUnavailable: vi.fn()
        })

        await stream.start()
        expect(fetcher).toHaveBeenCalledWith('https://voice.example.test/api/events-ticket', {
            method: 'POST',
            headers: { 'x-access-token': token }
        })
        expect(sources[0].url).toBe('https://voice.example.test/api/events?ticket=ticket-one')
        expect(sources[0].url).not.toContain(token)

        sources[0].source.onerror?.()
        expect(sources[0].source.close).toHaveBeenCalledOnce()
        await scheduled[0]()

        expect(sources[1].url).toBe('https://voice.example.test/api/events?ticket=ticket-two')
        expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('reports a revoked access token without retrying', async () => {
        const onUnauthorized = vi.fn()
        const scheduled: Array<() => void> = []
        const stream = createTicketedEventSource({
            serverUrl: 'https://voice.example.test',
            accessToken: 'expired',
            fetcher: vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
            createEventSource: vi.fn(),
            schedule: (callback) => { scheduled.push(callback); return scheduled.length },
            cancel: vi.fn(),
            onRooms: vi.fn(),
            onUnauthorized,
            onUnavailable: vi.fn()
        })

        await stream.start()

        expect(onUnauthorized).toHaveBeenCalledOnce()
        expect(scheduled).toHaveLength(0)
    })
})
