import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSettings } from '../hooks/useSettings'

// Clear localStorage before each test
beforeEach(() => {
    localStorage.clear()
    window.electronAPI.getStoredSettings = vi.fn(async () => null)
    window.electronAPI.setStoredSettings = vi.fn(async () => true)
})

async function renderHydratedSettings() {
    const rendered = renderHook(() => useSettings())
    await waitFor(() => expect(window.electronAPI.setStoredSettings).toHaveBeenCalled())
    return rendered
}

describe('useSettings', () => {
    it('waits for file hydration and prefers the file over a populated local cache', async () => {
        localStorage.setItem('gamerscream-settings', JSON.stringify({
            username: 'Cached Player',
            muteToggleEnabled: false,
            muteToggleKey: 'KeyM'
        }))
        let resolveFile!: (value: Record<string, unknown>) => void
        const fileSettings = new Promise<Record<string, unknown>>((resolve) => {
            resolveFile = resolve
        })
        window.electronAPI.getStoredSettings = vi.fn(() => fileSettings)
        const persist = vi.fn(async () => true)
        window.electronAPI.setStoredSettings = persist

        const { result } = renderHook(() => useSettings())

        expect(result.current.settings.username).toBe('Cached Player')
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 350))
        })
        expect(persist).not.toHaveBeenCalled()

        await act(async () => {
            resolveFile({
                username: 'File Player',
                muteToggleEnabled: true,
                muteToggleKey: 'KeyN'
            })
            await fileSettings
        })

        expect(result.current.settings.username).toBe('File Player')
        expect(result.current.settings.muteToggleEnabled).toBe(true)
        expect(result.current.settings.muteToggleKey).toBe('KeyN')
    })

    it('returns default settings when localStorage is empty', async () => {
        const { result } = await renderHydratedSettings()

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

    it('loads settings from localStorage', async () => {
        localStorage.setItem('gamerscream-settings', JSON.stringify({
            username: 'SavedUser',
            channel: 3,
            inputMode: 'ptt'
        }))

        const { result } = await renderHydratedSettings()

        expect(result.current.settings.username).toBe('SavedUser')
        expect(result.current.settings.channel).toBe(3)
        expect(result.current.settings.inputMode).toBe('ptt')
        // Defaults should still be merged
        expect(result.current.settings.micLevel).toBe(100)
    })

    it('updates a single setting via updateSetting', async () => {
        const { result } = await renderHydratedSettings()

        act(() => {
            result.current.updateSetting('username', 'NewUser')
        })

        expect(result.current.settings.username).toBe('NewUser')
    })

    it('preserves other settings when updating one', async () => {
        localStorage.setItem('gamerscream-settings', JSON.stringify({
            username: 'ExistingUser',
            channel: 2
        }))

        const { result } = await renderHydratedSettings()

        act(() => {
            result.current.updateSetting('inputMode', 'vad')
        })

        expect(result.current.settings.username).toBe('ExistingUser')
        expect(result.current.settings.channel).toBe(2)
        expect(result.current.settings.inputMode).toBe('vad')
    })

    it('falls back to defaults when localStorage has invalid JSON', async () => {
        localStorage.setItem('gamerscream-settings', 'not-valid-json{{{')

        const { result } = await renderHydratedSettings()

        expect(result.current.settings.username).toBe('')
        expect(result.current.settings.channel).toBe(1)
    })

    it('writes to localStorage after debounce', async () => {
        const { result } = await renderHydratedSettings()

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
