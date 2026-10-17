import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceInputLifecycle } from '../hooks/app/useVoiceInputLifecycle'
import type { AppSettings } from '../types'

describe('mute toggle shortcut lifecycle', () => {
    let nativeToggle: (() => void) | undefined
    const unsubscribe = vi.fn()
    const toggleMute = vi.fn()
    const registerMuteToggleKey = vi.fn()
    const unregisterMuteToggleKey = vi.fn()
    const registerPttKey = vi.fn()
    const props = {
        isConnected: true, isMuted: false, inputMode: 'voice' as AppSettings['inputMode'],
        pttKey: 'CapsLock', muteToggleEnabled: true, muteToggleKey: 'KeyM',
        vadThreshold: 10, username: 'Tester', toggleMute, setMuted: vi.fn(),
        setVadGate: vi.fn(), setVadActive: vi.fn(), getRawMicLevel: () => 0,
        updateInputModeMetadata: vi.fn(), playMuteBeep: vi.fn(), addToast: vi.fn()
    }
    const originalApi = { ...window.electronAPI }

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-10-17T12:00:00Z'))
        vi.clearAllMocks()
        vi.spyOn(document, 'hasFocus').mockReturnValue(false)
        Object.assign(window.electronAPI, {
            onMuteToggle: (callback: () => void) => { nativeToggle = callback; return unsubscribe },
            registerMuteToggleKey, unregisterMuteToggleKey, registerPttKey,
            unregisterPttKey: vi.fn(), onPttKeyDown: vi.fn(), onPttKeyUp: vi.fn(), offPttEvents: vi.fn()
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
        for (const key of Object.keys(window.electronAPI)) {
            if (!(key in originalApi)) delete (window.electronAPI as unknown as Record<string, unknown>)[key]
        }
        Object.assign(window.electronAPI, originalApi)
    })

    it('uses a dedicated native mute event and accepts 500ms presses in both directions', () => {
        const { rerender } = renderHook(useVoiceInputLifecycle, { initialProps: props })
        expect(registerMuteToggleKey).toHaveBeenCalledWith('M')
        expect(registerPttKey).not.toHaveBeenCalled()
        act(() => nativeToggle!())
        expect(toggleMute).toHaveBeenCalledTimes(1)
        rerender({ ...props, isMuted: true })
        act(() => { vi.advanceTimersByTime(500); nativeToggle!() })
        expect(toggleMute).toHaveBeenCalledTimes(2)
        rerender(props)
        act(() => { vi.advanceTimersByTime(500); nativeToggle!() })
        expect(toggleMute).toHaveBeenCalledTimes(3)
    })

    it('keeps the short debounce and ignores shortcut presses while disconnected', () => {
        const { rerender } = renderHook(useVoiceInputLifecycle, { initialProps: props })
        act(() => nativeToggle!())
        act(() => { vi.advanceTimersByTime(100); nativeToggle!() })
        expect(toggleMute).toHaveBeenCalledTimes(1)
        rerender({ ...props, isConnected: false })
        act(() => { vi.advanceTimersByTime(500); nativeToggle!() })
        expect(toggleMute).toHaveBeenCalledTimes(1)
    })

    it('switches between foreground and background handlers and cleans up the mute subscription', () => {
        const { unmount } = renderHook(useVoiceInputLifecycle, { initialProps: props })
        act(() => window.dispatchEvent(new Event('focus')))
        expect(unregisterMuteToggleKey).toHaveBeenCalledOnce()
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })))
        expect(toggleMute).toHaveBeenCalledTimes(1)
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', repeat: true })))
        expect(toggleMute).toHaveBeenCalledTimes(1)
        act(() => window.dispatchEvent(new Event('blur')))
        expect(registerMuteToggleKey).toHaveBeenCalledTimes(2)
        act(() => { vi.advanceTimersByTime(500); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' })) })
        expect(toggleMute).toHaveBeenCalledTimes(1)
        unmount()
        expect(unsubscribe).toHaveBeenCalledOnce()
        expect(unregisterMuteToggleKey).toHaveBeenCalledTimes(2)
    })

    it('removes mute shortcut routing when changing to push-to-talk', () => {
        const { rerender } = renderHook(useVoiceInputLifecycle, { initialProps: props })
        rerender({ ...props, inputMode: 'ptt' })
        expect(unsubscribe).toHaveBeenCalledOnce()
        expect(unregisterMuteToggleKey).toHaveBeenCalledOnce()
        expect(registerPttKey).toHaveBeenCalledWith('CapsLock')
    })
})
