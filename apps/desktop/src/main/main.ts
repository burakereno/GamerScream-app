import { app, BrowserWindow, ipcMain, nativeImage, Menu, screen } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

// ── Overlay Notification (always-on-top, works over fullscreen games) ──
function showOverlay(name: string, type: 'join' | 'leave'): void {
    // Close any existing overlay
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.close()
        overlayWindow = null
    }

    const display = screen.getPrimaryDisplay()
    const { width, height } = display.workAreaSize
    const overlayWidth = 280
    const overlayHeight = 60

    overlayWindow = new BrowserWindow({
        width: overlayWidth,
        height: overlayHeight,
        x: width - overlayWidth - 20,
        y: 20,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        backgroundColor: '#00000000',
        focusable: false,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    overlayWindow.setIgnoreMouseEvents(true)

    const overlayPath = app.isPackaged
        ? join(__dirname, 'overlay.html')
        : join(__dirname, '../../src/main/overlay.html')
    overlayWindow.loadFile(overlayPath, {
        query: { name, type }
    })

    // Auto-close after 5 seconds
    setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.close()
            overlayWindow = null
        }
    }, 5000)
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 820,
        minWidth: 400,
        minHeight: 600,
        backgroundColor: '#09090b',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 16, y: 12 },
        autoHideMenuBar: true,
        icon: join(__dirname, '../../build/icon_512x512@2x@2x.png'),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null)
    }

    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// ── Auto-Update ──
function setupAutoUpdater(): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('update-available', {
            version: info.version
        })
    })

    autoUpdater.on('update-downloaded', (info) => {
        mainWindow?.webContents.send('update-downloaded', {
            version: info.version
        })
    })

    autoUpdater.on('error', (err) => {
        console.error('Auto-update error:', err.message)
    })

    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
            console.error('Update check failed:', err.message)
        })
    }, 3000)
}

app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) {
        const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon_512x512@2x@2x.png'))
        if (!icon.isEmpty()) {
            app.dock.setIcon(icon)
        }
    }

    createWindow()
    setupAutoUpdater()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// IPC handlers
ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true)
})

// Overlay notification — shows over fullscreen games
ipcMain.on('show-notification', (_event, { title, body }: { title: string; body: string }) => {
    // Extract name from body like "Burak joined the channel"
    const name = body.replace(/ (joined|left).*/, '') || title
    const type = body.includes('left') ? 'leave' : 'join'
    showOverlay(name, type)
})
