import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    // Auto-update
    onUpdateAvailable: (callback: (info: { version: string }) => void) => {
        ipcRenderer.on('update-available', (_event, info) => callback(info))
    },
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
        ipcRenderer.on('update-downloaded', (_event, info) => callback(info))
    },
    installUpdate: () => ipcRenderer.invoke('install-update'),

    // Native OS notifications
    showNotification: (title: string, body: string) => {
        ipcRenderer.send('show-notification', { title, body })
    },

    // Push-to-Talk — uses removeAllListeners to prevent listener leak
    onPttKeyDown: (callback: () => void) => {
        ipcRenderer.removeAllListeners('ptt-key-down')
        ipcRenderer.on('ptt-key-down', () => callback())
    },
    onPttKeyUp: (callback: () => void) => {
        ipcRenderer.removeAllListeners('ptt-key-up')
        ipcRenderer.on('ptt-key-up', () => callback())
    },
    offPttEvents: () => {
        ipcRenderer.removeAllListeners('ptt-key-down')
        ipcRenderer.removeAllListeners('ptt-key-up')
    },
    registerPttKey: (key: string) => {
        ipcRenderer.send('register-ptt-key', key)
    },
    unregisterPttKey: () => {
        ipcRenderer.send('unregister-ptt-key')
    },
    /** Tell main process to cancel the key-up timer (renderer handles keyup when focused) */
    cancelPttTimer: () => {
        ipcRenderer.send('ptt-cancel-timer')
    },
    /** Tell main process the key was released (detected by renderer keyup) */
    pttRelease: () => {
        ipcRenderer.send('ptt-release')
    },
    onPttRegisterFailed: (callback: (key: string) => void) => {
        ipcRenderer.removeAllListeners('ptt-register-failed')
        ipcRenderer.on('ptt-register-failed', (_event, key) => callback(key))
    }
})
