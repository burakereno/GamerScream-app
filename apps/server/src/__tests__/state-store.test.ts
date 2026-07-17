import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminStateCommittedError, FileAdminStateStore, validateAdminState } from '../state-store'
import { hashPin, verifyPinHash, verifyPinHashAsync } from '../pin-security'

const temporaryDirectories: string[] = []

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

describe('Admin state persistence', () => {
    it('persists only a PIN hash and revocation epoch with owner-only permissions', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerscream-state-'))
        temporaryDirectories.push(directory)
        const statePath = path.join(directory, 'admin-state.json')
        const store = new FileAdminStateStore(statePath)
        const appPinHash = hashPin('2468')
        const tokenGeneration = '11111111-1111-4111-8111-111111111111'

        store.save({ version: 1, tokenEpoch: 7, tokenGeneration, appPinHash })

        const raw = fs.readFileSync(statePath, 'utf8')
        expect(Object.keys(JSON.parse(raw)).sort()).toEqual([
            'appPinHash', 'tokenEpoch', 'tokenGeneration', 'version'
        ])
        expect(raw).not.toContain('2468')
        expect(raw).not.toContain('TOKEN_SECRET')
        expect(fs.statSync(statePath).mode & 0o777).toBe(0o600)
        expect(store.load()).toEqual({ version: 1, tokenEpoch: 7, tokenGeneration, appPinHash })
        expect(verifyPinHash('2468', appPinHash)).toBe(true)
        expect(verifyPinHash('9999', appPinHash)).toBe(false)
        await expect(verifyPinHashAsync('2468', appPinHash)).resolves.toBe(true)
        await expect(verifyPinHashAsync('9999', appPinHash)).resolves.toBe(false)
    })

    it('fails closed when persisted state is malformed', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerscream-state-'))
        temporaryDirectories.push(directory)
        const statePath = path.join(directory, 'admin-state.json')
        fs.writeFileSync(statePath, '{"version":1,"tokenEpoch":"invalid","tokenGeneration":"invalid"}', 'utf8')

        expect(() => new FileAdminStateStore(statePath).load()).toThrow('Invalid admin state')
    })

    it('rejects a structurally valid-looking PIN hash with invalid decoded lengths', () => {
        expect(() => validateAdminState({
            version: 1,
            tokenEpoch: 0,
            tokenGeneration: '123e4567-e89b-42d3-a456-426614174000',
            appPinHash: 'scrypt$A$A'
        })).toThrow('Invalid admin state')
    })

    it('marks failures after rename as committed and leaves the new state readable', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerscream-state-'))
        temporaryDirectories.push(directory)
        const statePath = path.join(directory, 'admin-state.json')
        const store = new FileAdminStateStore(statePath)
        let fsyncCalls = 0
        const fsync = vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
            fsyncCalls++
            if (fsyncCalls === 2) throw new Error('directory fsync failed')
        })

        const state = {
            version: 1 as const,
            tokenEpoch: 8,
            tokenGeneration: '11111111-1111-4111-8111-111111111111'
        }
        try {
            expect(() => store.save(state)).toThrow(AdminStateCommittedError)
        } finally {
            fsync.mockRestore()
        }
        expect(store.load()).toEqual(state)
    })
})
