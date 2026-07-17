const JOIN_SOUND_IDS = new Set(['hero', 'laser', 'coin', 'thunder', 'whoosh', 'bubble', 'horn', 'glitch', 'bell', 'drum'])
const SETTING_KEYS = new Set([
    'username', 'microphoneId', 'speakerId', 'micLevel', 'channel', 'noiseSuppression',
    'inputMode', 'pttKey', 'muteToggleEnabled', 'muteToggleKey', 'vadThreshold', 'joinSoundId'
])

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

export function parseSettingsRecord(value: unknown): Record<string, unknown> {
    if (!isRecord(value) || Object.keys(value).some((key) => !SETTING_KEYS.has(key))) {
        throw new TypeError('Invalid settings')
    }

    const valid =
        (value.username === undefined || isBoundedString(value.username, 20)) &&
        (value.microphoneId === undefined || isBoundedString(value.microphoneId, 1024)) &&
        (value.speakerId === undefined || isBoundedString(value.speakerId, 1024)) &&
        (value.micLevel === undefined || isNumberInRange(value.micLevel, 0, 100)) &&
        (value.channel === undefined || Number.isInteger(value.channel) && isNumberInRange(value.channel, 1, 5)) &&
        (value.noiseSuppression === undefined || isNumberInRange(value.noiseSuppression, 0, 100)) &&
        (value.inputMode === undefined || ['voice', 'ptt', 'vad'].includes(String(value.inputMode))) &&
        (value.pttKey === undefined || isShortcut(value.pttKey)) &&
        (value.muteToggleEnabled === undefined || typeof value.muteToggleEnabled === 'boolean') &&
        (value.muteToggleKey === undefined || isShortcut(value.muteToggleKey)) &&
        (value.vadThreshold === undefined || isNumberInRange(value.vadThreshold, 1, 50)) &&
        (value.joinSoundId === undefined || typeof value.joinSoundId === 'string' && JOIN_SOUND_IDS.has(value.joinSoundId))

    if (!valid) throw new TypeError('Invalid settings')
    return value
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
