export const PLAYER_VOLUMES_VERSION = 1
const MAX_VOLUME_ENTRIES = 500
const MAX_VOLUME_KEY_LENGTH = 256
const MAX_VOLUME_PAYLOAD_BYTES = 65_536

export type PlayerVolumesRecord = Record<string, number>

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidKey(value: string): boolean {
    return value.length > 0 &&
        value.length <= MAX_VOLUME_KEY_LENGTH &&
        !/[\u0000-\u001F\u007F]/.test(value)
}

export function parsePlayerVolumesRecord(value: unknown): PlayerVolumesRecord {
    if (!isRecord(value)) throw new TypeError('Invalid player volumes')
    const entries = Object.entries(value)
    if (entries.length > MAX_VOLUME_ENTRIES || entries.some(([key, volume]) =>
        !isValidKey(key) ||
        typeof volume !== 'number' ||
        !Number.isFinite(volume) ||
        volume < 0 ||
        volume > 100
    )) {
        throw new TypeError('Invalid player volumes')
    }
    return Object.fromEntries(entries) as PlayerVolumesRecord
}

export function parsePlayerVolumesPayload(value: unknown): PlayerVolumesRecord {
    if (typeof value !== 'string' || value.length > MAX_VOLUME_PAYLOAD_BYTES) {
        throw new TypeError('Invalid player volumes')
    }
    try {
        return parsePlayerVolumesRecord(JSON.parse(value))
    } catch {
        throw new TypeError('Invalid player volumes')
    }
}

export function createPlayerVolumesFileRecord(value: unknown): Record<string, unknown> {
    return {
        volumesVersion: PLAYER_VOLUMES_VERSION,
        volumes: parsePlayerVolumesRecord(value)
    }
}

export function parsePlayerVolumesFileRecord(value: unknown): PlayerVolumesRecord {
    if (!isRecord(value) || value.volumesVersion !== PLAYER_VOLUMES_VERSION) {
        throw new TypeError('Invalid player volumes')
    }
    return parsePlayerVolumesRecord(value.volumes)
}
