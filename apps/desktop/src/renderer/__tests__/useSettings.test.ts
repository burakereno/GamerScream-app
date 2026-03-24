import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSettings } from '../hooks/useSettings'

// Clear localStorage before each test
beforeEach(() => {
    localStorage.clear()
})

describe('useSettings', () => {
    it('returns default settings when localStorage is empty', () => {
        const { result } = renderHook(() => useSettings())

        expect(result.current.settings.username).toBe('')
        expect(result.current.settings.channel).toBe(1)
        expect(result.current.settings.inputMode).toBe('voice')
        expect(result.current.settings.micLevel).toBe(100)
        expect(result.current.settings.noiseSuppression).toBe(100)
        expect(result.current.settings.pttKey).toBe('CapsLock')
        expect(result.current.settings.muteToggleEnabled).toBe(false)
        expect(result.current.settings.vadThreshold).toBe(10)
        expect(result.current.settings.joinSoundId).toBe('hero')
    })

    it('loads settings from localStorage', () => {
        localStorage.setItem('gamerscream-settings', JSON.stringify({
            username: 'SavedUser',
            channel: 3,
            inputMode: 'ptt'
        }))

        const { result } = renderHook(() => useSettings())

        expect(result.current.settings.username).toBe('SavedUser')
        expect(result.current.settings.channel).toBe(3)
        expect(result.current.settings.inputMode).toBe('ptt')
        // Defaults should still be merged
        expect(result.current.settings.micLevel).toBe(100)
    })

    it('updates a single setting via updateSetting', () => {
        const { result } = renderHook(() => useSettings())

        act(() => {
            result.current.updateSetting('username', 'NewUser')
        })

        expect(result.current.settings.username).toBe('NewUser')
    })

    it('preserves other settings when updating one', () => {
        localStorage.setItem('gamerscream-settings', JSON.stringify({
            username: 'ExistingUser',
            channel: 2
        }))

        const { result } = renderHook(() => useSettings())

        act(() => {
            result.current.updateSetting('inputMode', 'vad')
        })

        expect(result.current.settings.username).toBe('ExistingUser')
        expect(result.current.settings.channel).toBe(2)
        expect(result.current.settings.inputMode).toBe('vad')
    })

    it('falls back to defaults when localStorage has invalid JSON', () => {
        localStorage.setItem('gamerscream-settings', 'not-valid-json{{{')

        const { result } = renderHook(() => useSettings())

        expect(result.current.settings.username).toBe('')
        expect(result.current.settings.channel).toBe(1)
    })

    it('writes to localStorage after debounce', async () => {
        const { result } = renderHook(() => useSettings())

        act(() => {
            result.current.updateSetting('username', 'WrittenUser')
        })

        // Wait for debounce (300ms)
        await act(async () => {
            await new Promise(r => setTimeout(r, 350))
        })

        const stored = JSON.parse(localStorage.getItem('gamerscream-settings')!)
        expect(stored.username).toBe('WrittenUser')
    })
})
