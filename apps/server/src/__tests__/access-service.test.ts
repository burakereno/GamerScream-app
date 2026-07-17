import { describe, expect, it, vi } from 'vitest'
import { AccessService } from '../access-service'
import type { ServerConfig } from '../config'
import {
    AdminStateCommittedError,
    type AdminStateStore,
    MemoryAdminStateStore,
    type PersistedAdminState
} from '../state-store'

const config: ServerConfig = {
    isProduction: false,
    port: 3002,
    host: '127.0.0.1',
    livekitApiKey: 'test-key',
    livekitApiSecret: 'test-secret',
    livekitUrl: 'ws://localhost:7880',
    livekitHttpUrl: 'http://localhost:7880',
    livekitClientUrl: 'ws://localhost:7880',
    configuredAppPin: '8642',
    tokenSecret: 'test-token-secret',
    adminSecret: 'test-admin-secret',
    adminStatePath: '/unused/admin-state.json'
}

function stateStore(failAfterCommit: boolean): AdminStateStore {
    let state: PersistedAdminState | null = null
    let initialized = false
    return {
        load: () => state,
        save: nextState => {
            if (initialized) {
                if (!failAfterCommit) throw new Error('write failed before commit')
                state = structuredClone(nextState)
                throw new AdminStateCommittedError(new Error('directory fsync failed'))
            }
            state = structuredClone(nextState)
            initialized = true
        }
    }
}

describe('AccessService durable invalidation', () => {
    it('keeps the old epoch active when persistence fails before commit', () => {
        const access = new AccessService(config, stateStore(false))
        const token = access.issueToken()

        expect(() => access.invalidateAll()).toThrow('write failed before commit')
        expect(access.isValid(token)).toBe(true)
    })

    it('advances the in-memory epoch when disk commit completed before an fsync error', () => {
        const access = new AccessService(config, stateStore(true))
        const token = access.issueToken()

        expect(() => access.invalidateAll()).toThrow(AdminStateCommittedError)
        expect(access.isValid(token)).toBe(false)
    })

    it('persists and enforces a bounded voice issuance suspension after revocation', () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
        const store = new MemoryAdminStateStore()
        const access = new AccessService(config, store)

        access.invalidateAll()

        expect(access.isVoiceIssuanceSuspended()).toBe(true)
        expect(access.voiceRetryAfterSeconds()).toBe(35)
        expect(store.load()?.voiceSuspendedUntil).toBe(45_000)
        now.mockReturnValue(45_001)
        expect(access.isVoiceIssuanceSuspended()).toBe(false)
        now.mockRestore()
    })
})
