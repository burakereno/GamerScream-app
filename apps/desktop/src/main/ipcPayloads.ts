import { isValidDeviceId } from '../shared/identifiers'
export { parseSettingsPayload } from '../shared/settings'
export { parsePlayerVolumesPayload } from '../shared/playerVolumes'

// Current server access sessions are `<base64url payload>.<43-char HMAC-SHA256>`.
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,980}\.[A-Za-z0-9_-]{43}$/
// Keep the exact legacy `<expiresAt>.<hex HMAC-SHA256>` shape during rollout.
// Authenticity and expiry are still verified by the server on every request.
const LEGACY_TOKEN_PATTERN = /^\d{13}\.[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = true): value is string {
    return typeof value === 'string' &&
        value.length <= maxLength &&
        (allowEmpty || value.length > 0) &&
        !/[\u0000-\u001F\u007F]/.test(value)
}

export function parseToken(value: unknown): string {
    if (typeof value !== 'string' || value.length > 1024 ||
        (!SESSION_TOKEN_PATTERN.test(value) && !LEGACY_TOKEN_PATTERN.test(value))) {
        throw new TypeError('Invalid access token')
    }
    return value
}

export function parseDeviceId(value: unknown): string {
    if (!isValidDeviceId(value)) {
        throw new TypeError('Invalid device ID')
    }
    return value
}

export function parsePttKey(value: unknown): string {
    if (!isBoundedString(value, 64, false) || /\s/.test(value)) {
        throw new TypeError('Invalid shortcut key')
    }
    return value
}

export interface NotificationPayload {
    title: string
    body: string
}

export function parseNotificationPayload(value: unknown): NotificationPayload {
    if (!isRecord(value) ||
        !isBoundedString(value.title, 100, false) ||
        !isBoundedString(value.body, 300, false)) {
        throw new TypeError('Invalid notification')
    }
    return { title: value.title, body: value.body }
}
