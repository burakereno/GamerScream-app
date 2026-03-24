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
type OverlayType = 'join' | 'leave' | 'mute' | 'unmute'

const OVERLAY_CONFIG: Record<OverlayType, { action: string; nameColor: string; iconColor: string; svg: string }> = {
    join: {
        action: 'joined',
        nameColor: '#22c55e',
        iconColor: '#22c55e',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>'
    },
    leave: {
        action: 'left',
        nameColor: '#ef4444',
        iconColor: '#ef4444',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 13"/></svg>'
    },
    mute: {
        action: 'muted',
        nameColor: '#a1a1aa',
        iconColor: '#a1a1aa',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
    },
    unmute: {
        action: 'unmuted',
        nameColor: '#f97316',
        iconColor: '#f97316',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
    }
}

function showOverlay(name: string, type: OverlayType): void {
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

    overlayWindow.on('closed', () => {
        overlayWindow = null
    })

    const config = OVERLAY_CONFIG[type]
    const safeName = name.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
    const html = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-app-region:no-drag;user-select:none}
.overlay{display:flex;align-items:center;gap:10px;padding:12px 18px;background:rgba(15,15,18,0.95);border-radius:12px;color:#e4e4e7;font-size:14px;font-weight:500;animation:slideIn .3s ease-out}
.overlay.leaving{animation:slideOut .3s ease-in forwards}
.icon{flex-shrink:0;display:flex;align-items:center;color:${config.iconColor}}
.name{color:${config.nameColor};font-weight:600}
@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}
</style></head><body>
<div class="overlay" id="overlay"><span class="icon">${config.svg}</span><span><span class="name">${safeName}</span> ${config.action}</span></div>
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
// Persist pending update so the banner survives app restarts
function getPendingUpdatePath(): string {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return join(dir, 'pending-update.json')
}

function savePendingUpdate(version: string): void {
    try {
        writeFileSync(getPendingUpdatePath(), JSON.stringify({ version }), 'utf-8')
    } catch { /* ignore */ }
}

function clearPendingUpdate(): void {
    try {
        const p = getPendingUpdatePath()
        if (existsSync(p)) unlinkSync(p)
    } catch { /* ignore */ }
}

function getPendingUpdate(): string | null {
    try {
        const p = getPendingUpdatePath()
        if (!existsSync(p)) return null
        const data = JSON.parse(readFileSync(p, 'utf-8'))
        // Only return if it's newer than current version
        if (data.version && data.version !== app.getVersion()) return data.version
        // Same version means user already updated — clean up
        clearPendingUpdate()
        return null
    } catch { return null }
}

function setupAutoUpdater(): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
        safeSend('update-available', { version: info.version })
    })

    autoUpdater.on('update-downloaded', (info) => {
        savePendingUpdate(info.version)
        safeSend('update-downloaded', { version: info.version })
    })

    autoUpdater.on('error', (err) => {
        console.error('Auto-update error:', err.message)
    })

    // Check for pending update from a previous session first
    const pendingVersion = getPendingUpdate()
    if (pendingVersion) {
        // Delay slightly so renderer has time to set up IPC listeners
        setTimeout(() => {
            safeSend('update-downloaded', { version: pendingVersion })
        }, 2000)
    }

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
    clearPendingUpdate()
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
        // Detect notification type from body text
        let type: OverlayType = 'join'
        if (body.includes('unmuted')) type = 'unmute'
        else if (body.includes('muted')) type = 'mute'
        else if (body.includes('left')) type = 'leave'
        // Extract name: strip emoji prefix and action suffix
        const name = body.replace(/^[🔇🎤\s]+/, '').replace(/\s*(joined|left|muted|unmuted).*/, '').trim() || title
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
