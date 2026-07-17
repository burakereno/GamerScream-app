import type { RemoteParticipant } from 'livekit-client'
import { isValidDeviceId } from '../../shared/identifiers'

export interface LiveKitCallbacks {
    onParticipantJoin?: (name: string) => void
    onParticipantLeave?: (name: string) => void
    onParticipantMute?: (name: string) => void
    onParticipantUnmute?: (name: string) => void
    onAuthExpired?: () => void
    onReconnectFailed?: () => void
}

export interface ConnectParams {
    username: string
    channel: number
    micDeviceId: string
    micLevel: number
    customRoomName?: string
    roomCapability?: string
    noiseSuppression: number
    joinSoundId: string
    inputMode: string
}

export interface RefLike<T> {
    current: T
}

const DEVICE_ID_KEY = 'gamerscream-device-id'

async function initializeDeviceId(): Promise<string> {
    const api = (window as Window & { electronAPI?: Window['electronAPI'] }).electronAPI
    if (api?.getDeviceId) {
        const fileId = await api.getDeviceId()
        if (isValidDeviceId(fileId)) return fileId

        const localId = localStorage.getItem(DEVICE_ID_KEY)
        if (isValidDeviceId(localId)) {
            await api.setDeviceId(localId)
            return localId
        }
        if (localId) localStorage.removeItem(DEVICE_ID_KEY)
    }

    const deviceId = crypto.randomUUID()
    if (api?.setDeviceId) await api.setDeviceId(deviceId)
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
    return deviceId
}

export const deviceIdPromise = initializeDeviceId().catch(() => {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (isValidDeviceId(existing)) return existing
    if (existing) localStorage.removeItem(DEVICE_ID_KEY)
    const fallback = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, fallback)
    return fallback
})

export function getParticipantDeviceId(participant: { metadata?: string | null }): string {
    try {
        if (!participant.metadata) return ''
        const metadata = JSON.parse(participant.metadata) as { deviceId?: unknown }
        return typeof metadata.deviceId === 'string' ? metadata.deviceId : ''
    } catch {
        return ''
    }
}

export function getParticipantInputMode(participant: { metadata?: string | null }): string {
    try {
        if (!participant.metadata) return 'voice'
        const metadata = JSON.parse(participant.metadata) as { inputMode?: unknown }
        return typeof metadata.inputMode === 'string' ? metadata.inputMode : 'voice'
    } catch {
        return 'voice'
    }
}

export function getVolumeKey(participant: RemoteParticipant): string {
    return getParticipantDeviceId(participant) || participant.identity
}

export function removeRemoteAudioElements(): void {
    document.querySelectorAll<HTMLAudioElement>('audio[id^="audio-"]').forEach((element) => element.remove())
}
