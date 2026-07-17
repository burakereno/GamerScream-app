import { chmod, mkdir, open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { parseDeviceId, parseSettingsPayload, parseToken } from './ipcPayloads'

export interface EncryptionAdapter {
    isAvailable(): boolean
    encrypt(value: string): Buffer
    decrypt(value: Buffer): string
}

interface PersistentStateStoreOptions {
    directory: string
    encryption: EncryptionAdapter
}

export interface PersistentStateStore {
    getToken(): Promise<string | null>
    setToken(token: string): Promise<boolean>
    removeToken(): Promise<boolean>
    getSettings(): Promise<Record<string, unknown> | null>
    setSettings(settings: Record<string, unknown>): Promise<boolean>
    getDeviceId(): Promise<string | null>
    setDeviceId(deviceId: string): Promise<boolean>
}

async function atomicPrivateWrite(path: string, value: string): Promise<void> {
    const directory = join(path, '..')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporaryPath = join(directory, `.${basename(path)}.${randomUUID()}.tmp`)

    try {
        const temporaryFile = await open(temporaryPath, 'wx', 0o600)
        try {
            await temporaryFile.writeFile(value, 'utf8')
            await temporaryFile.sync()
        } finally {
            await temporaryFile.close()
        }
        // rename replaces the destination atomically on supported local filesystems.
        // If replacement fails, keep the old file intact and report the write failure.
        await rename(temporaryPath, path)
        await chmod(path, 0o600)
    } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined)
    }
}

async function readJson(path: string, maxBytes: number): Promise<unknown> {
    try {
        const file = await open(path, 'r')
        try {
            const buffer = Buffer.allocUnsafe(maxBytes + 1)
            const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
            if (bytesRead > maxBytes) return null
            return JSON.parse(buffer.toString('utf8', 0, bytesRead))
        } finally {
            await file.close()
        }
    } catch {
        return null
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createPersistentStateStore({ directory, encryption }: PersistentStateStoreOptions): PersistentStateStore {
    const tokenPath = join(directory, 'auth-token.json')
    const settingsPath = join(directory, 'settings.json')
    const deviceIdPath = join(directory, 'device-id.json')

    const setToken = async (tokenValue: string): Promise<boolean> => {
        try {
            const token = parseToken(tokenValue)
            if (!encryption.isAvailable()) return false
            const encrypted = encryption.encrypt(token).toString('base64')
            await atomicPrivateWrite(tokenPath, JSON.stringify({ version: 1, encrypted }))
            return true
        } catch {
            return false
        }
    }

    return {
        getToken: async () => {
            const stored = await readJson(tokenPath, 4_096)
            if (!isRecord(stored)) return null

            if (typeof stored.encrypted === 'string' && encryption.isAvailable()) {
                try {
                    return parseToken(encryption.decrypt(Buffer.from(stored.encrypted, 'base64')))
                } catch {
                    return null
                }
            }

            // One-time migration from the previous plaintext format. If secure
            // storage is unavailable, remove the legacy secret rather than
            // silently leaving reusable credentials on disk.
            if (typeof stored.accessToken === 'string') {
                try {
                    const token = parseToken(stored.accessToken)
                    if (encryption.isAvailable() && await setToken(token)) return token
                } catch {
                    // Invalid legacy state is removed below.
                }
                await rm(tokenPath, { force: true }).catch(() => undefined)
            }
            return null
        },
        setToken,
        removeToken: async () => {
            try {
                await rm(tokenPath, { force: true })
                return true
            } catch {
                return false
            }
        },
        getSettings: async () => {
            const stored = await readJson(settingsPath, 16_384)
            if (!isRecord(stored)) return null
            try {
                return parseSettingsPayload(JSON.stringify(stored))
            } catch {
                return null
            }
        },
        setSettings: async (settings) => {
            try {
                const validated = parseSettingsPayload(JSON.stringify(settings))
                await atomicPrivateWrite(settingsPath, JSON.stringify(validated))
                return true
            } catch {
                return false
            }
        },
        getDeviceId: async () => {
            const stored = await readJson(deviceIdPath, 1_024)
            if (!isRecord(stored)) return null
            try {
                return parseDeviceId(stored.deviceId)
            } catch {
                return null
            }
        },
        setDeviceId: async (deviceIdValue) => {
            try {
                const deviceId = parseDeviceId(deviceIdValue)
                await atomicPrivateWrite(deviceIdPath, JSON.stringify({ deviceId }))
                return true
            } catch {
                return false
            }
        }
    }
}
