import type { AppSettings } from '../../types'

export type AppTab = 'channels' | 'settings'

export type UpdateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
) => void

export type AddToast = (message: string, type: 'join' | 'leave') => void

declare global {
    interface Window {
        __gamerScreamAccessToken?: string
    }
}
