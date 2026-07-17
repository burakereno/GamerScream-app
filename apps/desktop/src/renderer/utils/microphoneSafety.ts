export type InputMode = 'voice' | 'ptt' | 'vad'

export interface InitialMicrophoneState {
    enabled: boolean
    gain: number
}

export function initialMicrophoneState(inputMode: string, micLevel: number): InitialMicrophoneState {
    const safeLevel = Number.isFinite(micLevel) ? Math.max(0, Math.min(100, micLevel)) : 100
    if (inputMode === 'ptt') return { enabled: false, gain: safeLevel / 100 }
    if (inputMode !== 'voice') return { enabled: false, gain: 0 }
    return { enabled: true, gain: safeLevel / 100 }
}

export function microphoneCaptureConstraints(micDeviceId: string): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: { ideal: 48000 } as any
    }
    if (micDeviceId) constraints.deviceId = { exact: micDeviceId }
    return constraints
}
