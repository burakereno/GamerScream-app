export interface ElectronAPI {
    onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
    installUpdate: () => Promise<InstallUpdateResult>
    getUpdateStatus: () => Promise<UpdateStatus>
    getAppVersion: () => Promise<string>
    showNotification: (title: string, body: string) => void
    // Push-to-Talk
    onPttKeyDown: (callback: () => void) => void
    onPttKeyUp: (callback: () => void) => void
    offPttEvents: () => void
    registerPttKey: (key: string) => void
    unregisterPttKey: () => void
    cancelPttTimer: () => void
    pttRelease: () => void
    onPttRegisterFailed: (callback: (key: string) => void) => void
    // Persistent token storage (file-based)
    getStoredToken: () => Promise<string | null>
    setStoredToken: (token: string) => Promise<boolean>
    removeStoredToken: () => Promise<boolean>
    getStoredSettings: () => Promise<Record<string, unknown> | null>
    setStoredSettings: (data: string) => Promise<boolean>
    getPlayerVolumes: () => Promise<Record<string, number> | null>
    setPlayerVolumes: (data: string) => Promise<boolean>
    getDeviceId: () => Promise<string | null>
    setDeviceId: (id: string) => Promise<boolean>
}

export interface UpdateStatus {
    phase: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'
    version?: string
    percent?: number
    error?: string
}

export interface InstallUpdateResult {
    ok: boolean
    error?: string
}

declare global {
    interface Window {
        electronAPI: ElectronAPI
    }
}

export interface AudioDeviceInfo {
    deviceId: string
    label: string
    kind: 'audioinput' | 'audiooutput'
}

export interface ConnectedPlayer {
    identity: string
    displayName: string
    isMuted: boolean
    isSpeaking: boolean
    isLocal: boolean
    volume: number // 0-100, per-player volume
}

export interface ChannelInfo {
    channel?: number
    name: string
    roomName?: string // actual LiveKit room name for custom channels
    playerCount: number
    hasPin?: boolean
    isCustom?: boolean
    createdBy?: string
}

export interface AppSettings {
    username: string
    microphoneId: string
    speakerId: string
    micLevel: number
    channel: number
    noiseSuppression: number // 0-100, noise suppression strength (wet/dry mix)
    inputMode: 'voice' | 'ptt' | 'vad' // Voice (always on) / Push-to-Talk / Voice Activity Detection
    pttKey: string // Electron accelerator key for PTT (e.g. 'CapsLock')
    muteToggleEnabled: boolean // Whether global mute toggle key is active (voice mode only)
    muteToggleKey: string // e.code value for mute toggle (e.g. 'KeyM')
    vadThreshold: number // 0-100, sensitivity for VAD noise gate
    joinSoundId: string // Selected join sound ID (default: 'hero')
}
