import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMicrophoneLevelMonitor } from '../hooks/useMicrophoneLevelMonitor'

describe('useMicrophoneLevelMonitor', () => {
    const stop = vi.fn()
    const close = vi.fn(async () => undefined)
    const resume = vi.fn(async () => undefined)
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }))

    beforeEach(() => {
        vi.clearAllMocks()
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia }
        })
        vi.stubGlobal('AudioContext', class {
            state = 'suspended'
            resume = resume

            createMediaStreamSource() {
                return { connect: vi.fn() }
            }

            createAnalyser() {
                return {
                    fftSize: 0,
                    smoothingTimeConstant: 0,
                    frequencyBinCount: 4,
                    getByteFrequencyData: (data: Uint8Array<ArrayBuffer>) => data.fill(128)
                }
            }

            close = close
        })
    })

    afterEach(() => vi.unstubAllGlobals())

    it('keeps a getter-only channel monitor out of React render state', async () => {
        const { result, unmount } = renderHook(() =>
            useMicrophoneLevelMonitor('mic-1', true, false)
        )

        await waitFor(() => expect(result.current.getLevel()).toBe(1))
        expect(resume).toHaveBeenCalledOnce()
        expect(result.current.displayLevel).toBe(0)
        unmount()
        expect(stop).toHaveBeenCalledOnce()
        expect(close).toHaveBeenCalledOnce()
    })

    it('publishes the same normalized level for the Settings meter', async () => {
        const { result, unmount } = renderHook(() =>
            useMicrophoneLevelMonitor('mic-1', true, true)
        )

        await waitFor(() => expect(result.current.displayLevel).toBe(100))
        unmount()
    })
})
