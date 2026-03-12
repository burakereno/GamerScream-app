import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppSettings } from '../types'

const STORAGE_KEY = 'gamerscream-settings'

const defaultSettings: AppSettings = {
    username: '',
    microphoneId: '',
    speakerId: '',
    micLevel: 100,
    channel: 1,
    autoConnect: false,
    noiseSuppression: 100,
    inputMode: 'voice',
    pttKey: 'CapsLock',
    vadThreshold: 10,
    joinSoundId: 'hero'
}

export function useSettings() {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings)
    const loaded = useRef(false)

    // Load settings from file-based IPC storage (falls back to localStorage for migration)
    useEffect(() => {
        (async () => {
            try {
                // Try file-based storage first (persistent on macOS)
                const fileStored = await window.electronAPI?.getStoredSettings?.()
                if (fileStored) {
                    setSettings({ ...defaultSettings, ...(fileStored as Partial<AppSettings>) })
                    loaded.current = true
                    return
                }
                // Fall back to localStorage (migration from older versions)
                const lsStored = localStorage.getItem(STORAGE_KEY)
                if (lsStored) {
                    const parsed = JSON.parse(lsStored)
                    setSettings({ ...defaultSettings, ...parsed })
                    // Migrate to file-based storage
                    window.electronAPI?.setStoredSettings?.(JSON.stringify({ ...defaultSettings, ...parsed }))
                    loaded.current = true
                    return
                }
            } catch {
                // ignore parse errors
            }
            loaded.current = true
        })()
    }, [])

    // Persist settings to file-based storage (debounced)
    useEffect(() => {
        if (!loaded.current) return // Don't write defaults before load completes
        const timer = setTimeout(() => {
            const json = JSON.stringify(settings)
            // Write to both: file-based (reliable) and localStorage (fast sync fallback)
            window.electronAPI?.setStoredSettings?.(json)
            localStorage.setItem(STORAGE_KEY, json)
        }, 300)
        return () => clearTimeout(timer)
    }, [settings])

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }, [])

    return { settings, updateSetting }
}
