import { app, BrowserWindow, ipcMain, nativeImage, Menu, screen, globalShortcut, shell, Notification as ElectronNotification } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { autoUpdater } from 'electron-updater'

// Suppress harmless EIO pipe errors in dev mode (broken stdout after restart)
process.on('uncaughtException', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'EIO') return
    console.error('Uncaught:', err)
})

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let currentPttKey: string | null = null

// Safe IPC send — prevents crashes when sending to destroyed windows
function safeSend(channel: string, ...args: unknown[]): void {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args)
    }
}

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

    // Clean up reference when overlay is destroyed (prevents stale ref crashes)
    overlayWindow.on('closed', () => {
        overlayWindow = null
    })

    // Inline HTML — no external file dependency (fixes production build)
    // NOTE: Inline script only triggers CSS leave animation — does NOT call window.close()
    // The main process setTimeout below is the SOLE close mechanism (prevents double-close race)
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
<script>setTimeout(()=>{document.getElementById('overlay').classList.add('leaving')},4700)</script>
</body></html>`

    overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    // Auto-close after 5 seconds — SOLE close mechanism
    setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.close()
        }
    }, 5000)
}

function createWindow(): void {
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
            nodeIntegration: false
        }
    })

    // Fix 2: Clean up reference when main window is destroyed
    mainWindow.on('closed', () => {
        mainWindow = null
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
        safeSend('update-available', { version: info.version })
    })

    autoUpdater.on('update-downloaded', (info) => {
        safeSend('update-downloaded', { version: info.version })
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
        const icon = nativeImage.createFromPath(join(__dirname, '../../build/macos.png'))
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
    if (process.platform === 'darwin') {
        // macOS: unsigned apps can't auto-update via Squirrel — open release page
        shell.openExternal('https://github.com/burakereno/GamerScream-app/releases/latest')
    } else {
        autoUpdater.quitAndInstall(false, true)
    }
})

// Overlay notification — shows over fullscreen games
ipcMain.on('show-notification', (_event, { title, body }: { title: string; body: string }) => {
    if (process.platform === 'darwin') {
        // macOS: use native Notification (overlay BrowserWindow crashes unsigned apps)
        const notification = new ElectronNotification({ title, body })
        notification.show()
    } else {
        // Windows: custom overlay (works over fullscreen games)
        const name = body.replace(/ (joined|left).*/, '') || title
        const type = body.includes('left') ? 'leave' : 'join'
        showOverlay(name, type)
    }
})

// ── Push-to-Talk global hotkey ──
// globalShortcut only fires on key-down (no key-up support).
// We detect key-up by using a timeout: if no new key-down arrives
// within 300ms, we assume the key was released. This works even
// when the app is in the background during games.
let pttHeldTimer: ReturnType<typeof setTimeout> | null = null
let pttIsHeld = false
let pttRepeatSeen = false // true once first key repeat arrives

function unregisterPttKey() {
    if (currentPttKey) {
        try {
            globalShortcut.unregister(currentPttKey)
        } catch { /* ignore */ }
        currentPttKey = null
    }
    if (pttHeldTimer) {
        clearTimeout(pttHeldTimer)
        pttHeldTimer = null
    }
    if (pttIsHeld) {
        pttIsHeld = false
        pttRepeatSeen = false
        safeSend('ptt-key-up')
    }
}

function resetPttHeldTimer() {
    if (pttHeldTimer) clearTimeout(pttHeldTimer)
    // macOS initial key repeat delay is ~375ms (default), can be up to 1800ms.
    // Use 800ms until first repeat arrives, then 300ms for fast release detection.
    const timeout = pttRepeatSeen ? 300 : 800
    pttHeldTimer = setTimeout(() => {
        if (pttIsHeld) {
            pttIsHeld = false
            pttRepeatSeen = false
            safeSend('ptt-key-up')
        }
    }, timeout)
}

ipcMain.on('register-ptt-key', (_event, key: string) => {
    unregisterPttKey()

    try {
        const registered = globalShortcut.register(key, () => {
            if (!pttIsHeld) {
                pttIsHeld = true
                pttRepeatSeen = false
                safeSend('ptt-key-down')
            } else {
                // Key repeat arrived — switch to shorter timeout
                pttRepeatSeen = true
            }
            resetPttHeldTimer()
        })

        if (registered) {
            currentPttKey = key
            console.log(`🎤 PTT key registered: ${key}`)
        } else {
            console.warn(`⚠️ Failed to register PTT key: ${key}`)
            safeSend('ptt-register-failed', key)
        }
    } catch (err) {
        console.warn(`⚠️ PTT key registration error:`, err)
        safeSend('ptt-register-failed', key)
    }
})

ipcMain.on('unregister-ptt-key', () => {
    unregisterPttKey()
    console.log('🎤 PTT key unregistered')
})

// Renderer tells us it's focused and will handle keyup — cancel our timer
ipcMain.on('ptt-cancel-timer', () => {
    if (pttHeldTimer) {
        clearTimeout(pttHeldTimer)
        pttHeldTimer = null
    }
})

// Renderer detected key release via native keyup event
ipcMain.on('ptt-release', () => {
    if (pttIsHeld) {
        pttIsHeld = false
        pttRepeatSeen = false
        if (pttHeldTimer) {
            clearTimeout(pttHeldTimer)
            pttHeldTimer = null
        }
        safeSend('ptt-key-up')
    }
})

// Clean up global shortcuts on quit
app.on('will-quit', () => {
    globalShortcut.unregisterAll()
})

// ── Persistent token storage (file-based, immune to macOS translocation) ──
function getTokenPath(): string {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'auth-token.json')
}

ipcMain.handle('get-stored-token', () => {
    try {
        const tokenPath = getTokenPath()
        if (!existsSync(tokenPath)) return null
        const data = JSON.parse(readFileSync(tokenPath, 'utf-8'))
        return data.accessToken || null
    } catch {
        return null
    }
})

ipcMain.handle('set-stored-token', (_event, token: string) => {
    try {
        writeFileSync(getTokenPath(), JSON.stringify({ accessToken: token }), 'utf-8')
        return true
    } catch {
        return false
    }
})

ipcMain.handle('remove-stored-token', () => {
    try {
        const tokenPath = getTokenPath()
        if (existsSync(tokenPath)) unlinkSync(tokenPath)
        return true
    } catch {
        return false
    }
})

// ── Persistent settings storage ──
function getSettingsPath(): string {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'settings.json')
}

ipcMain.handle('get-stored-settings', () => {
    try {
        const p = getSettingsPath()
        if (!existsSync(p)) return null
        return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
        return null
    }
})

ipcMain.handle('set-stored-settings', (_event, data: string) => {
    try {
        writeFileSync(getSettingsPath(), data, 'utf-8')
        return true
    } catch {
        return false
    }
})

// ── Persistent device ID storage (survives cache clears) ──
function getDeviceIdPath(): string {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'device-id.json')
}

ipcMain.handle('get-device-id', () => {
    try {
        const p = getDeviceIdPath()
        if (!existsSync(p)) return null
        const data = JSON.parse(readFileSync(p, 'utf-8'))
        return data.deviceId || null
    } catch {
        return null
    }
})

ipcMain.handle('set-device-id', (_event, id: string) => {
    try {
        writeFileSync(getDeviceIdPath(), JSON.stringify({ deviceId: id }), 'utf-8')
        return true
    } catch {
        return false
    }
})
