import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDesktopIpc } from '../../main/desktopIpc'
import { createUpdateStateController } from '../../main/updateState'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
vi.mock('electron', () => ({
    app: { on: vi.fn() },
    globalShortcut: { unregisterAll: vi.fn() },
    ipcMain: {
        on: (channel: string, handler: (...args: unknown[]) => void) => handlers.set(channel, handler),
        handle: vi.fn()
    }
}))

describe('mute overlay IPC boundary', () => {
    const trustedEvent = {}
    const notifications = { show: vi.fn(), setMuteOverlayVisible: vi.fn(), dispose: vi.fn() }

    beforeEach(() => {
        vi.clearAllMocks()
        handlers.clear()
        registerDesktopIpc({
            isTrustedEvent: event => event === trustedEvent,
            requireTrustedEvent: vi.fn(),
            safeSend: vi.fn(),
            getPersistentState: () => { throw new Error('Unused in this test') },
            updateState: createUpdateStateController({ emit: vi.fn(), install: vi.fn() }),
            notifications
        })
    })

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
})
