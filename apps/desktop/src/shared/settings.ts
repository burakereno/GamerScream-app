const JOIN_SOUND_IDS = new Set(['hero', 'laser', 'coin', 'thunder', 'whoosh', 'bubble', 'horn', 'glitch', 'bell', 'drum'])
const SETTING_KEYS = new Set([
    'username', 'microphoneId', 'speakerId', 'micLevel', 'channel', 'noiseSuppression',
    'inputMode', 'pttKey', 'muteToggleEnabled', 'muteToggleKey', 'vadThreshold', 'joinSoundId'
])
export const SETTINGS_VERSION = 1

export interface SettingsFileRecord {
    settingsVersion: typeof SETTINGS_VERSION
    settings: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = true): value is string {
    return typeof value === 'string' &&
        value.length <= maxLength &&
        (allowEmpty || value.length > 0) &&
        !/[\u0000-\u001F\u007F]/.test(value)
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isShortcut(value: unknown): boolean {
    return isBoundedString(value, 64, false) && !/\s/.test(value)
}

function isValidSetting(key: string, value: unknown): boolean {
    switch (key) {
        case 'username': return isBoundedString(value, 20)
        case 'microphoneId':
        case 'speakerId': return isBoundedString(value, 1024)
        case 'micLevel':
        case 'noiseSuppression': return isNumberInRange(value, 0, 100)
        case 'channel': return Number.isInteger(value) && isNumberInRange(value, 1, 5)
        case 'inputMode': return ['voice', 'ptt', 'vad'].includes(String(value))
        case 'pttKey':
        case 'muteToggleKey': return isShortcut(value)
        case 'muteToggleEnabled': return typeof value === 'boolean'
        case 'vadThreshold': return isNumberInRange(value, 1, 50)
        case 'joinSoundId': return typeof value === 'string' && JOIN_SOUND_IDS.has(value)
        default: return false
    }
}

export function parseSettingsRecord(value: unknown): Record<string, unknown> {
    if (!isRecord(value) || Object.keys(value).some((key) => !SETTING_KEYS.has(key))) {
        throw new TypeError('Invalid settings')
    }

    if (!Object.entries(value).every(([key, setting]) => isValidSetting(key, setting))) {
        throw new TypeError('Invalid settings')
    }
    return value
}

export function migrateSettingsRecord(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) throw new TypeError('Invalid settings')

    const migrated: Record<string, unknown> = {}
    for (const [key, setting] of Object.entries(value)) {
        if (SETTING_KEYS.has(key) && isValidSetting(key, setting)) migrated[key] = setting
    }
    if (Object.keys(migrated).length === 0) throw new TypeError('Invalid settings')
    return migrated
}

export function createSettingsFileRecord(value: unknown): SettingsFileRecord {
    return {
        settingsVersion: SETTINGS_VERSION,
        settings: parseSettingsRecord(value)
    }
}

export function parseSettingsFileRecord(value: unknown): {
    settings: Record<string, unknown>
    needsMigration: boolean
} {
    if (!isRecord(value)) throw new TypeError('Invalid settings')

    if ('settingsVersion' in value || 'settings' in value) {
        if (value.settingsVersion !== SETTINGS_VERSION) throw new TypeError('Invalid settings')
        return {
            settings: parseSettingsRecord(value.settings),
            needsMigration: false
        }
    }

    return {
        settings: migrateSettingsRecord(value),
        needsMigration: true
    }
}

export function parseSettingsPayload(value: unknown): Record<string, unknown> {
    if (typeof value !== 'string' || value.length > 16_384) {
        throw new TypeError('Invalid settings')
    }

    try {
        return parseSettingsRecord(JSON.parse(value))
    } catch {
        throw new TypeError('Invalid settings')
    }
}
