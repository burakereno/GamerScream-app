import {
    app,
    BrowserWindow,
    Menu,
    type IpcMainEvent,
    type IpcMainInvokeEvent,
    type WebContents
} from 'electron'
import { join } from 'path'
import { APP_ENTRY_URL } from './appProtocol'
import { isAllowedRendererPermission, isTrustedIpcSender, isTrustedRendererUrl } from './ipcSecurity'

export interface MainWindowController {
    createWindow(): BrowserWindow
    getWindow(): BrowserWindow | null
    safeSend(channel: string, ...args: unknown[]): void
    isTrustedEvent(event: IpcMainEvent | IpcMainInvokeEvent): boolean
    requireTrustedEvent(event: IpcMainInvokeEvent): void
}

export function createMainWindowController(): MainWindowController {
    let mainWindow: BrowserWindow | null = null
    let expectedRendererUrl = ''

    const isTrustedWebContents = (webContents: WebContents | null): boolean => {
        return webContents === mainWindow?.webContents &&
            expectedRendererUrl.length > 0 &&
            isTrustedRendererUrl(webContents.getURL(), expectedRendererUrl, app.isPackaged)
    }

    const isTrustedEvent = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => {
        return isTrustedIpcSender(event, mainWindow?.webContents ?? null, expectedRendererUrl, app.isPackaged)
    }

    const createWindow = (): BrowserWindow => {
        const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
        expectedRendererUrl = developmentUrl || APP_ENTRY_URL

        mainWindow = new BrowserWindow({
            width: 500,
            height: 840,
            minWidth: 480,
            minHeight: 600,
            backgroundColor: '#09090b',
            titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
            trafficLightPosition: { x: 16, y: 12 },
            autoHideMenuBar: true,
            icon: join(__dirname, '../../build/macos.png'),
            webPreferences: {
                preload: join(__dirname, '../preload/index.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                webSecurity: true
            }
        })

        mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
            if (!isTrustedRendererUrl(targetUrl, expectedRendererUrl, app.isPackaged)) event.preventDefault()
        })
        mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
        mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

        const rendererSession = mainWindow.webContents.session
        rendererSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
            if (!isTrustedWebContents(webContents) ||
                !details.isMainFrame ||
                !details.requestingUrl ||
                !isTrustedRendererUrl(details.requestingUrl, expectedRendererUrl, app.isPackaged)) return false
            const mediaTypes = permission === 'media' && details.mediaType ? [details.mediaType] : []
            return isAllowedRendererPermission(permission, mediaTypes)
        })
        rendererSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
            if (!isTrustedWebContents(webContents) ||
                !details.isMainFrame ||
                !isTrustedRendererUrl(details.requestingUrl, expectedRendererUrl, app.isPackaged)) {
                callback(false)
                return
            }

            const mediaTypes = permission === 'media'
                ? (details as { mediaTypes?: string[] }).mediaTypes ?? []
                : []
            callback(isAllowedRendererPermission(permission, mediaTypes))
        })

        mainWindow.on('closed', () => {
            mainWindow = null
        })

        if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
        if (developmentUrl) mainWindow.loadURL(developmentUrl)
        else mainWindow.loadURL(APP_ENTRY_URL)

        return mainWindow
    }

    return {
        createWindow,
        getWindow: () => mainWindow,
        safeSend: (channel, ...args) => {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send(channel, ...args)
            }
        },
        isTrustedEvent,
        requireTrustedEvent: (event) => {
            if (!isTrustedEvent(event)) throw new Error('Untrusted IPC sender')
        }
    }
}
