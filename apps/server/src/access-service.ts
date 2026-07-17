import crypto from 'crypto'
import type { ServerConfig } from './config.js'
import { hashPin, hashPinAsync, verifyPinHashAsync } from './pin-security.js'
import { cleanDisplayName } from './security-utils.js'
import { AdminStateCommittedError, type AdminStateStore, MemoryAdminStateStore } from './state-store.js'

const ACCESS_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000
export const LIVEKIT_JOIN_TOKEN_TTL_SECONDS = 30
export const VOICE_REVOCATION_WINDOW_MS = (LIVEKIT_JOIN_TOKEN_TTL_SECONDS + 5) * 1_000

export interface AccessSession {
    sid: string
    jti: string
    issuedAt: number
    expiresAt: number
    epoch: number
    generation: string
}

export interface SessionProfile {
    name: string
    deviceId?: string
    expiresAt: number
}

export class AccessService {
    private readonly defaultStore: AdminStateStore
    private store: AdminStateStore
    private appPinHash?: string
    private readonly configuredPinHash: string
    private tokenEpoch: number
    private tokenGeneration: string
    private voiceSuspendedUntil: number
    private readonly sessionProfiles = new Map<string, SessionProfile>()
    private readonly invalidationListeners = new Set<() => void>()

    constructor(private readonly config: ServerConfig, store: AdminStateStore) {
        this.defaultStore = store
        this.store = store
        const loaded = store.load()
        const state = loaded || { version: 1 as const, tokenEpoch: 0, tokenGeneration: crypto.randomUUID() }
        if (!loaded) store.save(state)
        this.appPinHash = state.appPinHash
        this.tokenEpoch = state.tokenEpoch
        this.tokenGeneration = state.tokenGeneration
        this.voiceSuspendedUntil = state.voiceSuspendedUntil || 0
        this.configuredPinHash = hashPin(config.configuredAppPin)
    }

    verifyAppPin(pin: string): Promise<boolean> {
        return verifyPinHashAsync(pin, this.appPinHash || this.configuredPinHash)
    }

    issueToken(): string {
        const issuedAt = Date.now()
        const session: AccessSession = {
            sid: crypto.randomUUID(),
            jti: crypto.randomUUID(),
            issuedAt,
            expiresAt: issuedAt + ACCESS_TOKEN_TTL,
            epoch: this.tokenEpoch,
            generation: this.tokenGeneration
        }
        const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
        const signature = crypto.createHmac('sha256', this.config.tokenSecret).update(payload).digest('base64url')
        return `${payload}.${signature}`
    }

    getSession(token: unknown): AccessSession | null {
        try {
            if (typeof token !== 'string' || token.length > 1024) return null
            const parts = token.split('.')
            if (parts.length !== 2) return null
            const [payload, signature] = parts
            if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null
            const actual = Buffer.from(signature, 'base64url')
            if (actual.toString('base64url') !== signature) return null
            const expected = crypto.createHmac('sha256', this.config.tokenSecret).update(payload).digest()
            if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null

            const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessSession
            if (!this.hasValidShape(session)) return null
            const now = Date.now()
            if (session.issuedAt > now + 30_000 || session.expiresAt <= now ||
                session.expiresAt - session.issuedAt !== ACCESS_TOKEN_TTL) return null
            return this.isActive(session) ? session : null
        } catch {
            return null
        }
    }

    isValid(token: unknown): boolean {
        return this.getSession(token) !== null
    }

    isActive(session: AccessSession): boolean {
        return session.epoch === this.tokenEpoch && session.generation === this.tokenGeneration &&
            session.expiresAt > Date.now()
    }

    isVoiceIssuanceSuspended(): boolean {
        return this.voiceSuspendedUntil > Date.now()
    }

    voiceRetryAfterSeconds(): number {
        return Math.max(0, Math.ceil((this.voiceSuspendedUntil - Date.now()) / 1_000))
    }

    prepareProfile(session: AccessSession, proposedName: unknown, rawDeviceId?: string): SessionProfile | null {
        const name = cleanDisplayName(proposedName)
        if (!name) return null
        const deviceId = rawDeviceId ? this.pseudonymousDeviceId(rawDeviceId) : undefined
        const existing = this.sessionProfiles.get(session.jti)
        if (existing?.name !== undefined && existing.name !== name) return null
        if (existing?.deviceId && deviceId && existing.deviceId !== deviceId) return null
        return {
            name,
            ...(existing?.deviceId || deviceId ? { deviceId: existing?.deviceId || deviceId } : {}),
            expiresAt: session.expiresAt
        }
    }

    commitProfile(session: AccessSession, profile: SessionProfile): void {
        const now = Date.now()
        for (const [jti, stored] of this.sessionProfiles) {
            if (stored.expiresAt <= now) this.sessionProfiles.delete(jti)
        }
        if (!this.sessionProfiles.has(session.jti) && this.sessionProfiles.size >= 5_000) {
            const oldest = this.sessionProfiles.keys().next().value
            if (oldest) this.sessionProfiles.delete(oldest)
        }
        this.sessionProfiles.set(session.jti, { ...profile, expiresAt: session.expiresAt })
    }

    getProfile(session: AccessSession): SessionProfile | null {
        const profile = this.sessionProfiles.get(session.jti)
        return profile && profile.expiresAt > Date.now() ? profile : null
    }

    participantIdentity(session: AccessSession, roomName: string): string {
        return `participant-${crypto.createHmac('sha256', this.config.tokenSecret)
            .update(`${session.jti}:${roomName}`).digest('hex').slice(0, 24)}`
    }

    async changePin(newPin: string): Promise<void> {
        this.advanceEpoch(await hashPinAsync(newPin))
    }

    invalidateAll(): void {
        this.advanceEpoch(this.appPinHash)
    }

    onInvalidated(listener: () => void): void {
        this.invalidationListeners.add(listener)
    }

    setStoreForTests(store: AdminStateStore): void {
        if (process.env.NODE_ENV !== 'test') throw new Error('Test-only state store override')
        this.store = store
    }

    resetForTests(): void {
        this.store = this.defaultStore
        if (this.defaultStore instanceof MemoryAdminStateStore) this.defaultStore.reset()
        this.appPinHash = undefined
        this.tokenEpoch = 0
        this.tokenGeneration = crypto.randomUUID()
        this.voiceSuspendedUntil = 0
        this.sessionProfiles.clear()
    }

    private advanceEpoch(nextPinHash?: string): void {
        const nextEpoch = this.tokenEpoch + 1
        const nextVoiceSuspendedUntil = Date.now() + VOICE_REVOCATION_WINDOW_MS
        const nextState = {
            version: 1,
            tokenEpoch: nextEpoch,
            tokenGeneration: this.tokenGeneration,
            ...(nextPinHash ? { appPinHash: nextPinHash } : {}),
            voiceSuspendedUntil: nextVoiceSuspendedUntil
        } as const
        try {
            this.store.save(nextState)
        } catch (error) {
            if (error instanceof AdminStateCommittedError) {
                this.applyCommittedEpoch(nextEpoch, nextVoiceSuspendedUntil, nextPinHash)
            }
            throw error
        }
        this.applyCommittedEpoch(nextEpoch, nextVoiceSuspendedUntil, nextPinHash)
    }

    private applyCommittedEpoch(nextEpoch: number, voiceSuspendedUntil: number, nextPinHash?: string): void {
        this.appPinHash = nextPinHash
        this.tokenEpoch = nextEpoch
        this.voiceSuspendedUntil = voiceSuspendedUntil
        this.sessionProfiles.clear()
        for (const listener of this.invalidationListeners) listener()
    }

    private hasValidShape(value: unknown): value is AccessSession {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false
        const session = value as Partial<AccessSession>
        return typeof session.sid === 'string' && typeof session.jti === 'string' &&
            typeof session.issuedAt === 'number' && typeof session.expiresAt === 'number' &&
            typeof session.epoch === 'number' && typeof session.generation === 'string'
    }

    private pseudonymousDeviceId(deviceId: string): string {
        return `device-${crypto.createHmac('sha256', this.config.tokenSecret)
            .update(deviceId).digest('hex').slice(0, 24)}`
    }
}
