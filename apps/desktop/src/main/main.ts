import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 720,
        minWidth: 400,
        minHeight: 600,
        backgroundColor: '#09090b',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 12 },
        icon: join(__dirname, '../../build/icon_512x512@2x@2x.png'),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
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

// IPC: Get audio devices (delegated to renderer, but we expose the API key securely)
ipcMain.handle('get-server-url', () => {
    return process.env.GAMERSCREAM_SERVER_URL || 'http://localhost:3002'
})
