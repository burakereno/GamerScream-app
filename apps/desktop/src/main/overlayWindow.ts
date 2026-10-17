import { BrowserWindow, type Rectangle } from 'electron'

const OVERLAY_MARGIN = 20

export function topRightOverlayBounds(
    workArea: Rectangle,
    width: number,
    height: number,
    topOffset = 0
): Rectangle {
    return {
        x: workArea.x + Math.max(0, workArea.width - width - OVERLAY_MARGIN),
        y: workArea.y + OVERLAY_MARGIN + topOffset,
        width,
        height
    }
}

export function createOverlayWindow(bounds: Rectangle): BrowserWindow {
    const window = new BrowserWindow({
        ...bounds,
        frame: false,
        transparent: true,
        show: false,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        ...(process.platform === 'win32' ? { type: 'toolbar' as const, roundedCorners: false } : {}),
        ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        }
    })
    window.setIgnoreMouseEvents(true)
    if (process.platform === 'darwin') {
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    window.once('ready-to-show', () => {
        if (window.isDestroyed()) return
        window.setAlwaysOnTop(true, 'pop-up-menu')
        window.showInactive()
    })
    return window
}
