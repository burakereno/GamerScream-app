import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioDevices } from '../hooks/useAudioDevices'

describe('useAudioDevices permission gate', () => {
    const stop = vi.fn()
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }))
    const enumerateDevices = vi.fn(async () => [])
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia, enumerateDevices, addEventListener, removeEventListener }
        })
    })

    it('does not request microphone access until the app PIN is verified', async () => {
        const { rerender } = renderHook(
            ({ enabled }) => useAudioDevices(enabled),
            { initialProps: { enabled: false } }
        )

        expect(getUserMedia).not.toHaveBeenCalled()
        expect(enumerateDevices).not.toHaveBeenCalled()

        rerender({ enabled: true })
        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1))
        expect(enumerateDevices).toHaveBeenCalledTimes(1)
        expect(stop).toHaveBeenCalledTimes(1)
    })
})
