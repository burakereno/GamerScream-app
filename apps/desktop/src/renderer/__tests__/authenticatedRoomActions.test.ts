import { describe, expect, it, vi } from 'vitest'
import { updateParticipantMode } from '../hooks/authenticatedRoomActions'

describe('authenticated room actions', () => {
    it('updates participant mode through the access-authenticated server endpoint', async () => {
        const fetcher = vi.fn(async () => ({ ok: true, status: 200 }))

        await expect(updateParticipantMode({
            serverUrl: 'https://voice.example.test',
            accessToken: 'signed-access-token',
            room: 'ch-2',
            inputMode: 'ptt',
            fetcher
        })).resolves.toBe('updated')

        expect(fetcher).toHaveBeenCalledWith('https://voice.example.test/api/participant-mode', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': 'signed-access-token'
            },
            body: JSON.stringify({ room: 'ch-2', inputMode: 'ptt' })
        })
    })

    it('distinguishes authentication expiry from ordinary endpoint failures', async () => {
        const request = (status: number) => updateParticipantMode({
            serverUrl: 'https://voice.example.test',
            accessToken: 'signed-access-token',
            room: 'custom-room',
            inputMode: 'vad',
            fetcher: vi.fn(async () => ({ ok: false, status }))
        })

        await expect(request(401)).resolves.toBe('auth-expired')
        await expect(request(403)).resolves.toBe('auth-expired')
        await expect(request(404)).resolves.toBe('failed')
        await expect(request(503)).resolves.toBe('failed')
    })
})
