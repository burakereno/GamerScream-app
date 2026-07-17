import { useState, useEffect, useCallback, useRef } from 'react'
import type { AudioDeviceInfo } from '../types'

const SETTINGS_STORAGE_KEY = 'gamerscream-settings'

function getPersistedMicLevel(): number {
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
        if (!stored) return 100
        const value = JSON.parse(stored)?.micLevel
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
            ? value
            : 100
    } catch {
        return 100
    }
}

export function useAudioDevices(enabled = true) {
    const [microphones, setMicrophones] = useState<AudioDeviceInfo[]>([])
    const [speakers, setSpeakers] = useState<AudioDeviceInfo[]>([])
    const [selectedMic, setSelectedMic] = useState<string>('')
    const [selectedSpeaker, setSelectedSpeaker] = useState<string>('')
    const [micLevel, setMicLevel] = useState<number>(getPersistedMicLevel)
    const permissionGranted = useRef(false)

    // Lightweight enumerate — only calls enumerateDevices() (non-blocking)
    const enumerateDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()

            const mics = devices
                .filter((d) => d.kind === 'audioinput')
                .map((d) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`,
                    kind: 'audioinput' as const
                }))

            const spkrs = devices
                .filter((d) => d.kind === 'audiooutput')
                .map((d) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`,
                    kind: 'audiooutput' as const
                }))

            setMicrophones(mics)
            setSpeakers(spkrs)

            // Set defaults if not already set (use functional updates to avoid deps)
            setSelectedMic(prev => mics.some(mic => mic.deviceId === prev) ? prev : (mics[0]?.deviceId ?? ''))
            setSelectedSpeaker(prev => spkrs.some(speaker => speaker.deviceId === prev) ? prev : (spkrs[0]?.deviceId ?? ''))
        } catch (err) {
            console.error('Failed to enumerate audio devices:', err)
        }
    }, [])

    useEffect(() => {
        if (!enabled) return

        // Request mic permission once on mount to get labeled devices,
        // then enumerate. Subsequent calls skip getUserMedia.
        const init = async () => {
            if (!permissionGranted.current) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                    // Release the mic immediately — we only needed permission
                    stream.getTracks().forEach(t => t.stop())
                    permissionGranted.current = true
                } catch {
                    // Permission denied — enumerate will still work but labels may be empty
                }
            }
            enumerateDevices()
        }
        init()

        // Listen for device changes (plug/unplug)
        navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
        }
    }, [enabled, enumerateDevices])

    return {
        microphones,
        speakers,
        selectedMic,
        setSelectedMic,
        selectedSpeaker,
        setSelectedSpeaker,
        micLevel,
        setMicLevel,
        refreshDevices: enumerateDevices
    }
}
