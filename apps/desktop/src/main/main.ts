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
    const { width } = display.workAreaSize
    const overlayWidth = 280
    const overlayHeight = 60

    overlayWindow = new BrowserWindow({
        width: overlayWidth,
        height: overlayHeight,
        x: width - overlayWidth - 20,
        y: 20,
        frame: false,
        transparent: true,
        show: false,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        ...(process.platform === 'win32' ? { type: 'toolbar' as const, roundedCorners: false } : {}),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    overlayWindow.setIgnoreMouseEvents(true)
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    overlayWindow.once('ready-to-show', () => {
        if (!overlayWindow || overlayWindow.isDestroyed()) return
        overlayWindow.setAlwaysOnTop(true, 'pop-up-menu')
        overlayWindow.showInactive()
    })

    // Inline HTML — no external file dependency (fixes production build)
    const icon = type === 'join' ? '🎮' : '👋'
    const action = type === 'join' ? 'joined' : 'left'
    const safeName = name.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
    const html = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-app-region:no-drag;user-select:none}
.overlay{display:flex;align-items:center;gap:10px;padding:12px 18px;background:rgba(15,15,18,0.95);border:1px solid rgba(249,115,22,0.3);border-radius:12px;color:#e4e4e7;font-size:13px;font-weight:500;animation:slideIn .3s ease-out;box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.overlay.leaving{animation:slideOut .3s ease-in forwards}
.icon{font-size:16px;flex-shrink:0}
.name{color:#f97316;font-weight:600}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}
</style></head><body>
<div class="overlay" id="overlay"><span class="icon">${icon}</span><span><span class="name">${safeName}</span> ${action}</span></div>
<script>setTimeout(()=>{document.getElementById('overlay').classList.add('leaving');setTimeout(()=>window.close(),300)},4700)</script>
</body></html>`

    overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

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
