import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMainWindowController } from '../../main/mainWindow'

const electron = vi.hoisted(() => {
    const windowEvents = new Map<string, () => void>()
    const rendererEvents = new Map<string, () => void>()
    const window = {
        on: vi.fn((event: string, listener: () => void) => windowEvents.set(event, listener)),
        loadURL: vi.fn(),
        webContents: {
            on: vi.fn((event: string, listener: () => void) => rendererEvents.set(event, listener)),
            setWindowOpenHandler: vi.fn(),
            session: {
                setPermissionCheckHandler: vi.fn(),
                setPermissionRequestHandler: vi.fn()
            }
        }
    }
    return {
        window, windowEvents, rendererEvents,
        app: { isPackaged: false },
        Menu: { setApplicationMenu: vi.fn() },
        BrowserWindow: class { constructor() { return window } }
    }
})
vi.mock('electron', () => electron)

describe('main window overlay cleanup', () => {
    beforeEach(() => {
        electron.windowEvents.clear()
        electron.rendererEvents.clear()
    })

    it.each(['did-start-loading', 'render-process-gone'])(
        'clears overlays when the renderer emits %s', (event) => {
            const clearOverlays = vi.fn()
            const controller = createMainWindowController(clearOverlays)
            controller.createWindow()
            electron.rendererEvents.get(event)!()
            expect(clearOverlays).toHaveBeenCalledOnce()
        }
    )

    it('clears overlays when the main window closes so an orphan overlay cannot keep the app alive', () => {
        const clearOverlays = vi.fn()
        const controller = createMainWindowController(clearOverlays)
        controller.createWindow()
        electron.windowEvents.get('closed')!()
        expect(controller.getWindow()).toBeNull()
        expect(clearOverlays).toHaveBeenCalledOnce()
    })
})
