import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesktopNotificationPresenter, type DesktopNotificationPresenter } from '../../main/desktopNotifications'

const electron = vi.hoisted(() => {
    type Bounds = { x: number; y: number; width: number; height: number }
    class Window {
        destroyed = false
        listeners = new Map<string, Array<() => void>>()
        bounds: Bounds
        constructor(public options: Bounds & Record<string, unknown>) {
            this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
        }
        on(event: string, listener: () => void) {
            this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
            return this
        }
        once(event: string, listener: () => void) { return this.on(event, listener) }
        emit(event: string) { this.listeners.get(event)?.forEach(listener => listener()) }
        isDestroyed() { return this.destroyed }
        close = vi.fn(() => { this.destroyed = true; this.emit('closed') })
        setBounds = vi.fn((bounds: Bounds) => { this.bounds = bounds })
        setIgnoreMouseEvents = vi.fn()
        setVisibleOnAllWorkspaces = vi.fn()
        setAlwaysOnTop = vi.fn()
        showInactive = vi.fn()
        loadURL = vi.fn(async (_url: string) => {})
    }
    const windows: Window[] = []
    const screenListeners = new Map<string, Set<() => void>>()
    const screen = {
        getPrimaryDisplay: vi.fn(() => ({
            workArea: { x: -1920, y: 44, width: 1920, height: 1036 }
        })),
        on: vi.fn((event: string, callback: () => void) => {
            if (!screenListeners.has(event)) screenListeners.set(event, new Set())
            screenListeners.get(event)!.add(callback)
        }),
        removeListener: vi.fn((event: string, callback: () => void) => {
            screenListeners.get(event)?.delete(callback)
        })
    }
    const nativeShow = vi.fn()
    const nativeNotifications: unknown[] = []
    return {
        Window, windows, screen, screenListeners, nativeShow, nativeNotifications,
        BrowserWindow: class extends Window {
            constructor(options: Bounds & Record<string, unknown>) { super(options); windows.push(this) }
        },
        Notification: class {
            constructor(options: unknown) { nativeNotifications.push(options) }
            show = nativeShow
        }
    }
})

vi.mock('electron', () => electron)

describe('desktop mute overlay and transient notifications', () => {
    const originalPlatform = process.platform
    let presenter: DesktopNotificationPresenter

    beforeEach(() => {
        vi.useFakeTimers()
        Object.defineProperty(process, 'platform', { value: 'win32' })
        electron.windows.length = 0
        electron.screenListeners.clear()
        electron.nativeNotifications.length = 0
        electron.nativeShow.mockClear()
        presenter = createDesktopNotificationPresenter()
    })

    afterEach(() => {
        presenter.dispose()
        vi.useRealTimers()
        Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('shows a large click-through red microphone icon without a dismissal timer', async () => {
        presenter.setMuteOverlayVisible(true)
        const overlay = electron.windows[0]
        expect(overlay.bounds).toEqual({ x: -116, y: 64, width: 96, height: 96 })
        expect(overlay.options).toMatchObject({ focusable: false, skipTaskbar: true, transparent: true })
        expect(overlay.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
        const html = decodeURIComponent(overlay.loadURL.mock.calls[0][0])
        expect(html).toContain('width="64" height="64"')
        expect(html).toContain('color:#ef4444')
        expect(html).toContain('aria-label="Microphone muted"')
        overlay.emit('ready-to-show')
        expect(overlay.setAlwaysOnTop).toHaveBeenCalledWith(true, 'pop-up-menu')
        expect(overlay.showInactive).toHaveBeenCalledOnce()

        await vi.advanceTimersByTimeAsync(60_000)
        presenter.setMuteOverlayVisible(true)
        expect(electron.windows).toHaveLength(1)
        expect(overlay.destroyed).toBe(false)
        presenter.setMuteOverlayVisible(false)
        expect(overlay.destroyed).toBe(true)
    })

    it('does not show a stale overlay when unmuted before the window is ready', () => {
        presenter.setMuteOverlayVisible(true)
        const overlay = electron.windows[0]
        presenter.setMuteOverlayVisible(false)
        overlay.emit('ready-to-show')
        expect(overlay.showInactive).not.toHaveBeenCalled()
        presenter.setMuteOverlayVisible(true)
        overlay.emit('closed')
        expect(electron.windows[1].destroyed).toBe(false)
    })

    it('keeps remote notifications transient without replacing or dismissing the local icon', () => {
        presenter.setMuteOverlayVisible(true)
        presenter.show('GamerScream', 'Other player muted')
        const [icon, muteToast] = electron.windows
        expect(muteToast.bounds.y).toBe(172)
        presenter.show('GamerScream', 'Another player joined the channel')
        expect(muteToast.destroyed).toBe(true)
        expect(icon.destroyed).toBe(false)
        vi.advanceTimersByTime(5000)
        expect(electron.windows[2].destroyed).toBe(true)
        expect(icon.destroyed).toBe(false)
    })

    it('moves an existing banner below the icon and back after unmute', () => {
        presenter.show('GamerScream', 'Other player unmuted')
        const banner = electron.windows[0]
        expect(banner.bounds.y).toBe(64)
        presenter.setMuteOverlayVisible(true)
        expect(banner.bounds.y).toBe(172)
        presenter.setMuteOverlayVisible(false)
        expect(banner.bounds.y).toBe(64)
        expect(banner.destroyed).toBe(false)
    })

    it('repositions on display changes without restarting the overlay', () => {
        presenter.setMuteOverlayVisible(true)
        electron.screen.getPrimaryDisplay.mockReturnValueOnce({
            workArea: { x: 100, y: 0, width: 1280, height: 720 }
        })
        electron.screenListeners.get('display-metrics-changed')!.forEach(listener => listener())
        expect(electron.windows[0].bounds).toEqual({ x: 1264, y: 20, width: 96, height: 96 })
        expect(electron.windows).toHaveLength(1)
    })

    it('preserves native macOS notifications while showing a persistent local icon', () => {
        Object.defineProperty(process, 'platform', { value: 'darwin' })
        presenter.setMuteOverlayVisible(true)
        presenter.show('GamerScream', 'Other player muted')
        expect(electron.windows).toHaveLength(1)
        expect(electron.windows[0].options.type).toBe('panel')
        expect(electron.windows[0].setVisibleOnAllWorkspaces)
            .toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
        expect(electron.nativeNotifications).toEqual([{ title: 'GamerScream', body: 'Other player muted' }])
        expect(electron.nativeShow).toHaveBeenCalledOnce()
    })

    it('cleans up all overlays and display listeners on teardown', () => {
        presenter.setMuteOverlayVisible(true)
        presenter.show('GamerScream', 'Other player muted')
        presenter.dispose()
        expect(electron.windows.every(window => window.destroyed)).toBe(true)
        expect([...electron.screenListeners.values()].every(listeners => listeners.size === 0)).toBe(true)
    })
})
