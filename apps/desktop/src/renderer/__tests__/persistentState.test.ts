import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPersistentStateStore } from '../../main/persistentState'

const createdDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'gamerscream-state-test-'))
    createdDirectories.push(directory)
    return directory
}

const encryption = {
    isAvailable: () => true,
    encrypt: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decrypt: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, '')
}

afterEach(async () => {
    await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('persistent desktop state', () => {
    it('stores bearer tokens encrypted with private file permissions', async () => {
        const directory = await temporaryDirectory()
        const store = createPersistentStateStore({ directory, encryption })
        const token = `${'e'.repeat(180)}.${'a'.repeat(43)}`

        expect(await store.setToken(token)).toBe(true)
        expect(await store.getToken()).toBe(token)

        const path = join(directory, 'auth-token.json')
        const raw = await readFile(path, 'utf8')
        const mode = (await stat(path)).mode & 0o777
        expect(raw).not.toContain(token)
        expect(mode).toBe(0o600)
    })

    it('migrates a valid legacy plaintext token on first read', async () => {
        const directory = await temporaryDirectory()
        const token = `${'f'.repeat(180)}.${'b'.repeat(43)}`
        await writeFile(join(directory, 'auth-token.json'), JSON.stringify({ accessToken: token }))
        const store = createPersistentStateStore({ directory, encryption })

        expect(await store.getToken()).toBe(token)
        expect(await readFile(join(directory, 'auth-token.json'), 'utf8')).not.toContain(token)
    })

    it('does not persist a token when OS encryption is unavailable', async () => {
        const directory = await temporaryDirectory()
        const tokenPath = join(directory, 'auth-token.json')
        await writeFile(tokenPath, JSON.stringify({ accessToken: `${'h'.repeat(180)}.${'d'.repeat(43)}` }))
        const store = createPersistentStateStore({
            directory,
            encryption: { ...encryption, isAvailable: () => false }
        })

        expect(await store.setToken(`${'g'.repeat(180)}.${'c'.repeat(43)}`)).toBe(false)
        expect(await store.getToken()).toBeNull()
        await expect(stat(tokenPath)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('round-trips validated settings and device state through atomic files', async () => {
        const directory = await temporaryDirectory()
        const store = createPersistentStateStore({ directory, encryption })

        expect(await store.setSettings({ micLevel: 65, inputMode: 'voice' })).toBe(true)
        expect(await store.setDeviceId('e8df0e95-7600-41f0-b835-f5504bbbfafd')).toBe(true)
        expect(await store.getSettings()).toEqual({ micLevel: 65, inputMode: 'voice' })
        expect(await store.getDeviceId()).toBe('e8df0e95-7600-41f0-b835-f5504bbbfafd')
    })

    it('migrates legacy settings into a versioned file without losing mute preferences', async () => {
        const directory = await temporaryDirectory()
        const settingsPath = join(directory, 'settings.json')
        await writeFile(settingsPath, JSON.stringify({
            username: 'Legacy Player',
            channel: 2,
            autoConnect: false,
            muteToggleEnabled: true,
            muteToggleKey: 'KeyN',
            joinSoundId: 'bubble'
        }))
        const store = createPersistentStateStore({ directory, encryption })

        expect(await store.getSettings()).toEqual({
            username: 'Legacy Player',
            channel: 2,
            muteToggleEnabled: true,
            muteToggleKey: 'KeyN',
            joinSoundId: 'bubble'
        })
        expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({
            settingsVersion: 1,
            settings: {
                username: 'Legacy Player',
                channel: 2,
                muteToggleEnabled: true,
                muteToggleKey: 'KeyN',
                joinSoundId: 'bubble'
            }
        })
    })

    it('round-trips validated participant volumes through a versioned private file', async () => {
        const directory = await temporaryDirectory()
        const store = createPersistentStateStore({ directory, encryption })
        const volumes = {
            'e8df0e95-7600-41f0-b835-f5504bbbfafd': 35,
            'legacy-player': 80
        }

        expect(await store.setPlayerVolumes(volumes)).toBe(true)
        expect(await store.getPlayerVolumes()).toEqual(volumes)

        const volumePath = join(directory, 'player-volumes.json')
        expect(JSON.parse(await readFile(volumePath, 'utf8'))).toEqual({
            volumesVersion: 1,
            volumes
        })
        expect((await stat(volumePath)).mode & 0o777).toBe(0o600)
    })

    it('rejects settings that were tampered with on disk or bypassed IPC validation', async () => {
        const directory = await temporaryDirectory()
        const store = createPersistentStateStore({ directory, encryption })

        expect(await store.setSettings({ micLevel: 900 })).toBe(false)
        await writeFile(join(directory, 'settings.json'), JSON.stringify({ inputMode: 'always-hot', unknown: true }))
        expect(await store.getSettings()).toBeNull()
    })

    it('rejects oversized state envelopes before attempting to decrypt them', async () => {
        const directory = await temporaryDirectory()
        const decrypt = vi.fn(encryption.decrypt)
        await writeFile(join(directory, 'auth-token.json'), JSON.stringify({ encrypted: 'a'.repeat(8_000) }))
        const store = createPersistentStateStore({ directory, encryption: { ...encryption, decrypt } })

        expect(await store.getToken()).toBeNull()
        expect(decrypt).not.toHaveBeenCalled()
    })
})
