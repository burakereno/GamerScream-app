import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { RemoteParticipant } from 'livekit-client'
import { useParticipantAudio } from '../hooks/useParticipantAudio'

beforeEach(() => {
    localStorage.clear()
    window.electronAPI.getPlayerVolumes = vi.fn(async () => null)
    window.electronAPI.setPlayerVolumes = vi.fn(async () => true)
})

describe('participant audio preferences', () => {
    it('hydrates file-backed volumes as the canonical preference source', async () => {
        localStorage.setItem('gamerscream-player-volumes', JSON.stringify({ 'device-1': 80 }))
        window.electronAPI.getPlayerVolumes = vi.fn(async () => ({ 'device-1': 35 }))

        const { result } = renderHook(() => useParticipantAudio())

        await waitFor(() => {
            expect(window.electronAPI.getPlayerVolumes).toHaveBeenCalled()
            expect(result.current.participantConnectedVolume({
                metadata: JSON.stringify({ deviceId: 'device-1' })
            } as RemoteParticipant)).toBe(35)
        })
        expect(JSON.parse(localStorage.getItem('gamerscream-player-volumes')!)).toEqual({
            'device-1': 35
        })
    })
})
