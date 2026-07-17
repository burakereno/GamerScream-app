import { app, BrowserWindow, nativeImage, net, protocol, safeStorage } from 'electron'
import { join } from 'path'
import { APP_SCHEME, APP_SCHEME_PRIVILEGES, createAppProtocolHandler } from './appProtocol'
import { createDesktopNotificationPresenter } from './desktopNotifications'
import { registerDesktopIpc } from './desktopIpc'
import { createDesktopUpdater } from './desktopUpdater'
import { createMainWindowController } from './mainWindow'
import { createPersistentStateStore, type PersistentStateStore } from './persistentState'
import { configureSingleInstance } from './singleInstance'

protocol.registerSchemesAsPrivileged([{
    scheme: APP_SCHEME,
    privileges: APP_SCHEME_PRIVILEGES
}])

process.on('uncaughtException', (error) => {
    if (!app.isPackaged && (error as NodeJS.ErrnoException).code === 'EIO') return
    console.error('Uncaught:', error)
    process.exit(1)
})

let persistentState: PersistentStateStore | null = null
const getPersistentState = (): PersistentStateStore => {
    if (!persistentState) throw new Error('Persistent state is not ready')
    return persistentState
}

const mainWindow = createMainWindowController()
const updater = createDesktopUpdater((channel, ...args) => mainWindow.safeSend(channel, ...args))
const notifications = createDesktopNotificationPresenter()
const isPrimaryInstance = configureSingleInstance(app, () => mainWindow.getWindow())

registerDesktopIpc({
    isTrustedEvent: mainWindow.isTrustedEvent,
    requireTrustedEvent: mainWindow.requireTrustedEvent,
    safeSend: mainWindow.safeSend,
    getPersistentState,
    updateState: updater.state,
    notifications
})

if (isPrimaryInstance) app.whenReady().then(() => {
    protocol.handle(
        APP_SCHEME,
        createAppProtocolHandler(
            join(__dirname, '../renderer'),
            (fileUrl, method) => net.fetch(fileUrl, { method })
        )
    )
    persistentState = createPersistentStateStore({
        directory: app.getPath('userData'),
        encryption: {
            isAvailable: () => safeStorage.isEncryptionAvailable(),
            encrypt: (value) => safeStorage.encryptString(value),
            decrypt: (value) => safeStorage.decryptString(value)
        }
    })

    if (process.platform === 'darwin' && app.dock) {
        const icon = nativeImage.createFromPath(join(__dirname, '../../build/macos.png'))
        if (!icon.isEmpty()) app.dock.setIcon(icon)
    }

    mainWindow.createWindow()
    updater.setup()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow.createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
