import { useState, useEffect, useCallback } from 'react'
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

    // Fix #9: Debounce localStorage writes to avoid excessive I/O during slider drags
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
        }, 300)
        return () => clearTimeout(timer)
    }, [settings])

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
    }, [])

    return { settings, updateSetting }
}
