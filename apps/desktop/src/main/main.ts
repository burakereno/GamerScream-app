import { app, BrowserWindow, ipcMain, nativeImage, Notification, Menu } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 720,
        minWidth: 400,
        minHeight: 600,
        backgroundColor: '#09090b',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 16, y: 12 },
        autoHideMenuBar: true, // Hide menu bar on Windows
        icon: join(__dirname, '../../build/icon_512x512@2x@2x.png'),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    // Remove menu bar completely on Windows
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

    // Check for updates after a short delay
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
            console.error('Update check failed:', err.message)
        })
    }, 3000)
}

app.whenReady().then(() => {
    // Set dock icon on macOS
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

// Native OS notification — shows even when app is in background
ipcMain.on('show-notification', (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
        new Notification({ title, body }).show()
    }
})
