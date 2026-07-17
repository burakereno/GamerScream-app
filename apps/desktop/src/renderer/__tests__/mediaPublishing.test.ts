import { describe, expect, it, vi } from 'vitest'
import { publishInitialMicrophoneTrack } from '../hooks/mediaPublishing'

describe('initial microphone publication', () => {
    it('publishes PTT audio disabled before exposing it to LiveKit', async () => {
        const order: string[] = []
        const track = { enabled: true }
        const participant = {
            publishTrack: vi.fn(async () => {
                order.push(`publish:${track.enabled}`)
            }),
            setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
                order.push(`microphone:${enabled}`)
            })
        }

        await publishInitialMicrophoneTrack(participant, track, false, 'microphone')

        expect(track.enabled).toBe(false)
        expect(order).toEqual(['publish:false', 'microphone:false'])
    })
})
