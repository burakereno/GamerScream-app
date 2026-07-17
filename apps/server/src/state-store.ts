import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export interface PersistedAdminState {
    version: 1
    tokenEpoch: number
    tokenGeneration: string
    appPinHash?: string
    voiceSuspendedUntil?: number
}

export interface AdminStateStore {
    load(): PersistedAdminState | null
    save(state: PersistedAdminState): void
}

export class AdminStateCommittedError extends Error {
    readonly committed = true

    constructor(cause: unknown) {
        super('Admin state committed but durability verification failed', {
            cause: cause instanceof Error ? cause : undefined
        })
        this.name = 'AdminStateCommittedError'
    }
}

function isCanonicalBase64Url(value: string, byteLength: number): boolean {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return false
    const decoded = Buffer.from(value, 'base64url')
    return decoded.length === byteLength && decoded.toString('base64url') === value
}

function isValidPinHash(value: string): boolean {
    const [algorithm, salt, digest, extra] = value.split('$')
    return algorithm === 'scrypt' && extra === undefined &&
        Boolean(salt && digest) && isCanonicalBase64Url(salt, 16) && isCanonicalBase64Url(digest, 32)
}

export function validateAdminState(value: unknown): PersistedAdminState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid admin state')
    }
    const state = value as Record<string, unknown>
    const allowedKeys = new Set([
        'version', 'tokenEpoch', 'tokenGeneration', 'appPinHash', 'voiceSuspendedUntil'
    ])
    if (Object.keys(state).some(key => !allowedKeys.has(key))) throw new Error('Invalid admin state')
    if (state.version !== 1 || !Number.isSafeInteger(state.tokenEpoch) || Number(state.tokenEpoch) < 0 ||
        typeof state.tokenGeneration !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state.tokenGeneration)) {
        throw new Error('Invalid admin state')
    }
    if (state.appPinHash !== undefined &&
        (typeof state.appPinHash !== 'string' || !isValidPinHash(state.appPinHash))) {
        throw new Error('Invalid admin state')
    }
    if (state.voiceSuspendedUntil !== undefined &&
        (!Number.isSafeInteger(state.voiceSuspendedUntil) || Number(state.voiceSuspendedUntil) < 0)) {
        throw new Error('Invalid admin state')
    }
    return {
        version: 1,
        tokenEpoch: Number(state.tokenEpoch),
        tokenGeneration: state.tokenGeneration,
        ...(state.appPinHash ? { appPinHash: state.appPinHash } : {}),
        ...(state.voiceSuspendedUntil !== undefined
            ? { voiceSuspendedUntil: Number(state.voiceSuspendedUntil) }
            : {})
    }
}

export class FileAdminStateStore implements AdminStateStore {
    constructor(private readonly filePath: string) {}

    load(): PersistedAdminState | null {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
            const state = validateAdminState(parsed)
            fs.chmodSync(this.filePath, 0o600)
            return state
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
            throw error
        }
    }

    save(state: PersistedAdminState): void {
        const validated = validateAdminState(state)
        const directory = path.dirname(this.filePath)
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
        fs.chmodSync(directory, 0o700)
        const temporary = path.join(
            directory,
            `.${path.basename(this.filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
        )
        let descriptor: number | null = null
        let directoryDescriptor: number | null = null
        let committed = false
        try {
            descriptor = fs.openSync(temporary, 'wx', 0o600)
            fs.writeFileSync(descriptor, `${JSON.stringify(validated, null, 2)}\n`, 'utf8')
            fs.fsyncSync(descriptor)
            fs.closeSync(descriptor)
            descriptor = null
            directoryDescriptor = fs.openSync(directory, 'r')
            fs.renameSync(temporary, this.filePath)
            committed = true
            fs.fsyncSync(directoryDescriptor)
            fs.closeSync(directoryDescriptor)
            directoryDescriptor = null
        } catch (error) {
            if (descriptor !== null) {
                try { fs.closeSync(descriptor) } catch { /* best-effort cleanup */ }
            }
            if (directoryDescriptor !== null) {
                try { fs.closeSync(directoryDescriptor) } catch { /* best-effort cleanup */ }
            }
            if (!committed) {
                try { fs.unlinkSync(temporary) } catch { /* best-effort cleanup */ }
            }
            if (committed) throw new AdminStateCommittedError(error)
            throw error
        }
    }
}

export class MemoryAdminStateStore implements AdminStateStore {
    private state: PersistedAdminState | null = null

    load(): PersistedAdminState | null {
        return this.state ? structuredClone(this.state) : null
    }

    save(state: PersistedAdminState): void {
        this.state = structuredClone(validateAdminState(state))
    }

    reset(): void {
        this.state = null
    }
}
