import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMuteOverlay } from '../hooks/app/useMuteOverlay'
import type { AppSettings } from '../types'

describe('local mute overlay synchronization', () => {
    const setMuteOverlayVisible = vi.fn()
    const initialProps = {
        isConnected: true, isMuted: false, inputMode: 'voice' as AppSettings['inputMode']
    }

    beforeEach(() => {
        setMuteOverlayVisible.mockClear()
        window.electronAPI.setMuteOverlayVisible = setMuteOverlayVisible
    })

    it('follows confirmed mute state and stays visible across unrelated renders', () => {
        const { rerender } = renderHook(useMuteOverlay, { initialProps })
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(false)

        rerender({ ...initialProps, isMuted: true })
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(true)
        const calls = setMuteOverlayVisible.mock.calls.length
        rerender({ ...initialProps, isMuted: true })
        expect(setMuteOverlayVisible).toHaveBeenCalledTimes(calls)

        rerender(initialProps)
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(false)
    })

    it('clears the overlay on disconnect and restores it only for a muted connection', () => {
        const { rerender } = renderHook(useMuteOverlay, {
            initialProps: { ...initialProps, isMuted: true }
        })
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(true)
        rerender({ ...initialProps, isMuted: true, isConnected: false })
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(false)
        rerender(initialProps)
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(false)
    })

    it.each(['ptt', 'vad'] as const)('does not show manual mute status in %s mode', (inputMode) => {
        const { rerender } = renderHook(useMuteOverlay, {
            initialProps: { ...initialProps, isMuted: true }
        })
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(true)
        rerender({ ...initialProps, inputMode, isMuted: true })
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(false)
    })

    it('clears the overlay when the application component unmounts', () => {
        const { unmount } = renderHook(useMuteOverlay, {
            initialProps: { ...initialProps, isMuted: true }
        })
        unmount()
        expect(setMuteOverlayVisible).toHaveBeenLastCalledWith(false)
    })
})
