import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPresenceRefresh } from '../hooks/liveKitApi'

describe('requestPresenceRefresh', () => {
    beforeEach(() => {
        window.__gamerScreamAccessToken = 'access-token'
    })

    it('sends only the room identity and authenticated headers', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('fetch', fetchMock)

        await requestPresenceRefresh('ch-2')

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/presence-refresh$/),
            {
                method: 'POST',
                body: JSON.stringify({ room: 'ch-2' }),
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': 'access-token'
                }
            }
        )
    })
})
