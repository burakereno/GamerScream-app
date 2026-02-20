export interface ElectronAPI {
    getServerUrl: () => Promise<string>
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
    isMuted: boolean
    isSpeaking: boolean
    isLocal: boolean
    volume: number // 0-100, per-player volume
}

export interface ChannelInfo {
    channel: number
    name: string
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
    autoConnect: boolean
}
