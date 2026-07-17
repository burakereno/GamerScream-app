import crypto from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelRegistry } from '../channel-registry'

describe('ChannelRegistry join lifecycle', () => {
    afterEach(() => vi.restoreAllMocks())

    it('keeps an unlocked custom room when a join starts at the empty-room deadline', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
        const registry = new ChannelRegistry()
        const created = await registry.create('Open Room', undefined, 'Owner', 'session-one')
        expect(created).not.toBeNull()

        now.mockReturnValue(2_000)
        registry.buildRoomList([])
        now.mockReturnValue(12_001)

        expect(registry.authorizeJoin('session-one', created!.roomName, undefined)).toBe(true)
        const result = registry.buildRoomList([])

        expect(registry.get(created!.roomName)).toBeDefined()
        expect(result.rooms.some(room => room.roomName === created!.roomName)).toBe(true)
    })

    it('keeps a protected room when an authorized session reconnects at the deadline', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
        const registry = new ChannelRegistry()
        const created = await registry.create('Locked Room', '1234', 'Owner', 'session-one')
        expect(created?.roomCapability).toEqual(expect.any(String))
        expect(registry.authorizeJoin('session-one', created!.roomName, created!.roomCapability)).toBe(true)

        now.mockReturnValue(2_000)
        registry.buildRoomList([])
        now.mockReturnValue(12_001)

        expect(registry.authorizeJoin('session-one', created!.roomName, undefined)).toBe(true)
        registry.buildRoomList([])

        expect(registry.get(created!.roomName)).toBeDefined()
    })

    it('hashes an untrusted custom-channel PIN without blocking the event loop', async () => {
        const synchronousScrypt = vi.spyOn(crypto, 'scryptSync')
        try {
            const registry = new ChannelRegistry()
            const created = await registry.create('Async PIN', '1234', 'Owner', 'session-one')

            expect(created).not.toBeNull()
            expect(synchronousScrypt).not.toHaveBeenCalled()
        } finally {
            synchronousScrypt.mockRestore()
        }
    })
})
