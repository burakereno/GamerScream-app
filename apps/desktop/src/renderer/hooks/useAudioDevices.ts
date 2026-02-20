import { useState, useEffect, useCallback } from 'react'
import type { AudioDeviceInfo } from '../types'

export function useAudioDevices() {
    const [microphones, setMicrophones] = useState<AudioDeviceInfo[]>([])
    const [speakers, setSpeakers] = useState<AudioDeviceInfo[]>([])
    const [selectedMic, setSelectedMic] = useState<string>('')
    const [selectedSpeaker, setSelectedSpeaker] = useState<string>('')
    const [micLevel, setMicLevel] = useState<number>(100)

    const enumerateDevices = useCallback(async () => {
        try {
            // Request permission first to get labeled devices
            await navigator.mediaDevices.getUserMedia({ audio: true })

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

            // Set defaults if not already set
            if (!selectedMic && mics.length > 0) {
                setSelectedMic(mics[0].deviceId)
            }
            if (!selectedSpeaker && spkrs.length > 0) {
                setSelectedSpeaker(spkrs[0].deviceId)
            }
        } catch (err) {
            console.error('Failed to enumerate audio devices:', err)
        }
    }, [selectedMic, selectedSpeaker])

    useEffect(() => {
        enumerateDevices()

        // Listen for device changes (plug/unplug)
        navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
        return () => {
            navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
        }
    }, [enumerateDevices])

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
