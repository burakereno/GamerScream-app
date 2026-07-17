import type { AppSettings } from '../types'
import { parseSettingsRecord } from '../../shared/settings'

export const defaultSettings: AppSettings = {
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

export function mergeStoredSettings(value: unknown): AppSettings | null {
    try {
        const persisted = parseSettingsRecord(value) as Partial<AppSettings>
        return { ...defaultSettings, ...persisted }
    } catch {
        return null
    }
}
