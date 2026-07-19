import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppSettings } from '../types'
import { defaultSettings, mergeStoredSettings } from './settingsState'

const STORAGE_KEY = 'gamerscream-settings'

function loadCachedSettings(): AppSettings | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return stored ? mergeStoredSettings(JSON.parse(stored)) : null
    } catch {
        return null
    }
}

function cacheSettings(settings: AppSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (error) {
        console.warn('Failed to cache settings:', error)
    }
}

async function persistSettings(settings: AppSettings): Promise<void> {
    cacheSettings(settings)
    try {
        const persisted = await window.electronAPI?.setStoredSettings?.(JSON.stringify(settings))
        if (persisted === false) console.warn('Failed to persist settings')
    } catch (error) {
        console.warn('Failed to persist settings:', error)
    }
}

export function useSettings() {
    // SYNC init from localStorage — guarantees settings.username is available
    // on the very first render (prevents hasEnteredName flash bug)
    const initialSettings = useRef(loadCachedSettings())
    const [settings, setSettings] = useState<AppSettings>(initialSettings.current ?? defaultSettings)
    const [hydrated, setHydrated] = useState(false)
    const hydratedRef = useRef(false)
    const pendingSettings = useRef<Partial<AppSettings>>({})
    const skipNextPersist = useRef(false)

    // The file is canonical. localStorage is only a synchronous launch cache,
    // so never write defaults or cached values before file hydration finishes.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            let fileSettings: AppSettings | null = null
            try {
                const fileStored = await window.electronAPI?.getStoredSettings?.()
                fileSettings = mergeStoredSettings(fileStored)
            } catch (error) {
                console.warn('Failed to hydrate settings:', error)
            }

            if (cancelled) return
            const nextSettings = {
                ...(fileSettings ?? initialSettings.current ?? defaultSettings),
                ...pendingSettings.current
            }
            pendingSettings.current = {}
            skipNextPersist.current = true
            hydratedRef.current = true
            setSettings(nextSettings)
            setHydrated(true)
            cacheSettings(nextSettings)

            if (!fileSettings) await persistSettings(nextSettings)
        })()
        return () => { cancelled = true }
    }, [])

    // Persist user changes only after the canonical file has been hydrated.
    useEffect(() => {
        if (!hydrated) return
        if (skipNextPersist.current) {
            skipNextPersist.current = false
            return
        }
        const timer = setTimeout(() => {
            void persistSettings(settings)
        }, 300)
        return () => clearTimeout(timer)
    }, [settings, hydrated])

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        if (!hydratedRef.current) pendingSettings.current[key] = value
        setSettings((prev) => ({ ...prev, [key]: value }))
    }, [])

    return { settings, updateSetting }
}
