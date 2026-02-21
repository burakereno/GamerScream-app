import { app, BrowserWindow, ipcMain, nativeImage, Notification, Menu } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { exec } from 'child_process'

// Set Windows microphone volume to 100% via WASAPI
function setWindowsMicVolume(): void {
    if (process.platform !== 'win32') return

    const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int _0(); int _1(); int _2(); int _3();
    int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
    int _5();
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref System.Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int _0();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorClass {}
"@

try {
    \\$enumerator = New-Object MMDeviceEnumeratorClass
    \\$device = \\$null
    # dataFlow 1 = eCapture (microphone), role 1 = eMultimedia
    [void]\\$enumerator.GetDefaultAudioEndpoint(1, 1, [ref]\\$device)
    \\$iid = [Guid]"5CDF2C82-841E-4546-9722-0CF74078229A"
    \\$volume = \\$null
    [void]\\$device.Activate([ref]\\$iid, 1, [IntPtr]::Zero, [ref]\\$volume)
    [void]\\$volume.SetMasterVolumeLevelScalar(1.0, [Guid]::Empty)
    [void]\\$volume.SetMute(\\$false, [Guid]::Empty)
} catch {}
`

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, (err) => {
        if (err) console.warn('Could not set mic volume:', err.message)
        else console.log('🎤 Windows mic volume set to 100%')
    })
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 820,
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
    setWindowsMicVolume()

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
