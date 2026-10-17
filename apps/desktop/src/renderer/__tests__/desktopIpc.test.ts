import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDesktopIpc } from '../../main/desktopIpc'
import { createUpdateStateController } from '../../main/updateState'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
const shortcuts = vi.hoisted(() => new Map<string, () => void>())
vi.mock('electron', () => ({
    app: { on: vi.fn() },
    globalShortcut: {
        register: vi.fn((key: string, callback: () => void) => { shortcuts.set(key, callback); return true }),
        unregister: vi.fn((key: string) => shortcuts.delete(key)),
        unregisterAll: vi.fn()
    },
    ipcMain: {
        on: (channel: string, handler: (...args: unknown[]) => void) => handlers.set(channel, handler),
        handle: vi.fn()
    }
}))

describe('mute overlay IPC boundary', () => {
    const trustedEvent = {}
    const notifications = { show: vi.fn(), setMuteOverlayVisible: vi.fn(), dispose: vi.fn() }
    const safeSend = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        handlers.clear()
        shortcuts.clear()
        registerDesktopIpc({
            isTrustedEvent: event => event === trustedEvent,
            requireTrustedEvent: vi.fn(),
            safeSend,
            getPersistentState: () => { throw new Error('Unused in this test') },
            updateState: createUpdateStateController({ emit: vi.fn(), install: vi.fn() }),
            notifications
        })
    })

    afterEach(() => vi.useRealTimers())

    it('accepts booleans from the trusted renderer and rejects other senders or payloads', () => {
        const setVisible = handlers.get('set-mute-overlay-visible')!
        setVisible(trustedEvent, true)
        setVisible(trustedEvent, false)
        setVisible({}, true)
        for (const value of ['true', 1, null, {}, undefined]) setVisible(trustedEvent, value)
        expect(notifications.setMuteOverlayVisible.mock.calls).toEqual([[true], [false]])
        expect(notifications.show).not.toHaveBeenCalled()
    })

    it('keeps remote notification IPC independent from the persistent local indicator', () => {
        handlers.get('show-notification')!(trustedEvent, { title: 'GamerScream', body: 'Other player muted' })
        expect(notifications.show).toHaveBeenCalledWith('GamerScream', 'Other player muted')
        expect(notifications.setMuteOverlayVisible).not.toHaveBeenCalled()
    })

    it('delivers each mute shortcut press while its toast is still visible', () => {
        vi.useFakeTimers()
        handlers.get('register-mute-toggle-key')!(trustedEvent, 'M')
        const press = shortcuts.get('M')!
        for (let i = 0; i < 4; i++) {
            press()
            handlers.get('show-notification')!(trustedEvent, {
                title: 'GamerScream', body: i % 2 === 0 ? 'Tester muted' : 'Tester unmuted'
            })
            vi.advanceTimersByTime(500)
        }
        expect(safeSend.mock.calls).toEqual(Array.from({ length: 4 }, () => ['mute-toggle']))
        expect(notifications.show).toHaveBeenCalledTimes(4)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('preserves PTT hold behavior and releases it when switching to mute toggle', () => {
        vi.useFakeTimers()
        handlers.get('register-ptt-key')!(trustedEvent, 'CapsLock')
        const pressPtt = shortcuts.get('CapsLock')!
        pressPtt()
        vi.advanceTimersByTime(500)
        pressPtt()
        expect(safeSend.mock.calls).toEqual([['ptt-key-down']])

        handlers.get('register-mute-toggle-key')!(trustedEvent, 'M')
        expect(shortcuts.has('CapsLock')).toBe(false)
        expect(safeSend).toHaveBeenLastCalledWith('ptt-key-up')
        expect(vi.getTimerCount()).toBe(0)
        shortcuts.get('M')!()
        expect(safeSend).toHaveBeenLastCalledWith('mute-toggle')
        handlers.get('unregister-mute-toggle-key')!(trustedEvent)
        expect(shortcuts.has('M')).toBe(false)
    })

    it('rejects untrusted or malformed mute shortcut registration without disturbing the active key', () => {
        handlers.get('register-mute-toggle-key')!(trustedEvent, 'M')
        handlers.get('register-mute-toggle-key')!({}, 'N')
        handlers.get('register-mute-toggle-key')!(trustedEvent, { key: 'N' })
        handlers.get('unregister-mute-toggle-key')!({})
        expect([...shortcuts.keys()]).toEqual(['M'])
    })
})
