import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppSettings } from '../types'

const STORAGE_KEY = 'gamerscream-settings'

const defaultSettings: AppSettings = {
    username: '',
    microphoneId: '',
    speakerId: '',
    micLevel: 100,
    channel: 1,
    noiseSuppression: 100,
    inputMode: 'voice',
    pttKey: 'CapsLock',
    muteToggleEnabled: false,
    muteToggleKey: 'KeyM',
    vadThreshold: 10,
    joinSoundId: 'hero'
}

export function useSettings() {
    // SYNC init from localStorage — guarantees settings.username is available
    // on the very first render (prevents hasEnteredName flash bug)
    const [settings, setSettings] = useState<AppSettings>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
                return { ...defaultSettings, ...JSON.parse(stored) }
            }
        } catch {
            // ignore parse errors
        }
        return defaultSettings
    })

    const recovered = useRef(false)

    // ASYNC recovery: if localStorage was empty (macOS translocation),
    // try to recover from file-based storage and backfill localStorage
    useEffect(() => {
        if (settings.username) return // Already have settings, no recovery needed
        ;(async () => {
            try {
                const fileStored = await window.electronAPI?.getStoredSettings?.()
                if (fileStored && (fileStored as Partial<AppSettings>).username) {
                    const merged = { ...defaultSettings, ...(fileStored as Partial<AppSettings>) }
                    setSettings(merged)
                    // Backfill localStorage so next launch is instant
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
                    recovered.current = true
                }
            } catch {
                // ignore
            }
        })()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced write to BOTH localStorage (fast) and file (reliable)
    useEffect(() => {
        if (recovered.current) {
            recovered.current = false
            return // Skip the write triggered by recovery itself
        }
        const timer = setTimeout(() => {
            const json = JSON.stringify(settings)
            localStorage.setItem(STORAGE_KEY, json)
            window.electronAPI?.setStoredSettings?.(json)
        }, 300)
        return () => clearTimeout(timer)
    }, [settings])

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }, [])

    return { settings, updateSetting }
}
