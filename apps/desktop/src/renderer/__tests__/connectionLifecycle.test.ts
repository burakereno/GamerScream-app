import { describe, expect, it, vi } from 'vitest'
import { disposeConnectionResources, shouldScheduleReconnect, teardownForAuthenticationExpiry } from '../hooks/connectionLifecycle'

describe('LiveKit connection lifecycle', () => {
    it('rolls back every owned room and microphone resource after a failed connection', async () => {
        const stopOne = vi.fn()
        const stopTwo = vi.fn()
        const resources = {
            room: { disconnect: vi.fn(async () => undefined) },
            rnnoiseNode: { destroy: vi.fn() },
            micStream: { getTracks: () => [{ stop: stopOne }, { stop: stopTwo }] },
            audioContext: { close: vi.fn(async () => undefined) }
        }

        await disposeConnectionResources(resources, true)

        expect(resources.room.disconnect).toHaveBeenCalledOnce()
        expect(resources.rnnoiseNode.destroy).toHaveBeenCalledOnce()
        expect(stopOne).toHaveBeenCalledOnce()
        expect(stopTwo).toHaveBeenCalledOnce()
        expect(resources.audioContext.close).toHaveBeenCalledOnce()
    })

    it('continues cleanup when individual resource disposers throw synchronously', async () => {
        const stop = vi.fn()
        const resources = {
            room: { disconnect: vi.fn(() => { throw new Error('room failed') }) },
            rnnoiseNode: { destroy: vi.fn(() => { throw new Error('worklet failed') }) },
            micStream: { getTracks: () => [{ stop }] },
            audioContext: { close: vi.fn(() => { throw new Error('context failed') }) }
        }

        await expect(disposeConnectionResources(resources, true)).resolves.toBeUndefined()
        expect(stop).toHaveBeenCalledOnce()
        expect(resources.audioContext.close).toHaveBeenCalledOnce()
    })

    it('never schedules another reconnect while one is already active', () => {
        expect(shouldScheduleReconnect({ intentional: false, reconnecting: true, hasParams: true })).toBe(false)
        expect(shouldScheduleReconnect({ intentional: false, reconnecting: false, hasParams: true })).toBe(true)
        expect(shouldScheduleReconnect({ intentional: true, reconnecting: false, hasParams: true })).toBe(false)
    })

    it('disconnects and releases active media before reporting authentication expiry', async () => {
        const order: string[] = []

        await teardownForAuthenticationExpiry({
            room: { disconnect: vi.fn(async () => { order.push('disconnect') }) },
            releaseMedia: vi.fn(async () => { order.push('release-media') }),
            resetUi: vi.fn(() => { order.push('reset-ui') }),
            notifyExpired: vi.fn(() => { order.push('notify-expired') })
        })

        expect(order).toEqual(['disconnect', 'release-media', 'reset-ui', 'notify-expired'])
    })
})
