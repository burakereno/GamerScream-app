import { screen, type BrowserWindow } from 'electron'
import { MUTE_OVERLAY_HTML } from './muteOverlayContent'
import { createOverlayWindow, topRightOverlayBounds } from './overlayWindow'

export const MUTE_OVERLAY_SIZE = 96
export const MUTE_OVERLAY_GAP = 12

export interface MuteOverlayController {
    setVisible(visible: boolean): void
    isVisible(): boolean
}

export function createMuteOverlayController(onChange: () => void): MuteOverlayController {
    let window: BrowserWindow | null = null

    const reposition = (): void => {
        if (!window || window.isDestroyed()) return
        window.setBounds(topRightOverlayBounds(
            screen.getPrimaryDisplay().workArea, MUTE_OVERLAY_SIZE, MUTE_OVERLAY_SIZE
        ))
        onChange()
    }

    const clear = (): void => {
        const previousWindow = window
        window = null
        screen.removeListener('display-added', reposition)
        screen.removeListener('display-removed', reposition)
        screen.removeListener('display-metrics-changed', reposition)
        if (previousWindow && !previousWindow.isDestroyed()) previousWindow.close()
        onChange()
    }

    return {
        isVisible: () => window !== null && !window.isDestroyed(),
        setVisible: (visible) => {
            if (!visible) {
                if (window) clear()
                return
            }
            if (window && !window.isDestroyed()) return

            const nextWindow = createOverlayWindow(topRightOverlayBounds(
                screen.getPrimaryDisplay().workArea, MUTE_OVERLAY_SIZE, MUTE_OVERLAY_SIZE
            ))
            window = nextWindow
            nextWindow.on('closed', () => {
                if (window === nextWindow) clear()
            })
            screen.on('display-added', reposition)
            screen.on('display-removed', reposition)
            screen.on('display-metrics-changed', reposition)
            onChange()
            void nextWindow.loadURL(
                `data:text/html;charset=utf-8,${encodeURIComponent(MUTE_OVERLAY_HTML)}`
            ).catch(() => {
                if (window === nextWindow) clear()
            })
        }
    }
}
