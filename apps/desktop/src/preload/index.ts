import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    // Auto-update
    onUpdateAvailable: (callback: (info: { version: string }) => void) => {
        const listener = (_event: IpcRendererEvent, info: { version: string }) => callback(info)
        ipcRenderer.on('update-available', listener)
        return () => ipcRenderer.removeListener('update-available', listener)
    },
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
        const listener = (_event: IpcRendererEvent, info: { version: string }) => callback(info)
        ipcRenderer.on('update-downloaded', listener)
        return () => ipcRenderer.removeListener('update-downloaded', listener)
    },
    onUpdateStatus: (callback: (status: {
        phase: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'
        version?: string
        percent?: number
        error?: string
    }) => void) => {
        const listener = (_event: IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status)
        ipcRenderer.on('update-status', listener)
        return () => ipcRenderer.removeListener('update-status', listener)
    },
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

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
    },

    // Persistent token storage (file-based, works on unsigned macOS)
    getStoredToken: () => ipcRenderer.invoke('get-stored-token'),
    setStoredToken: (token: string) => ipcRenderer.invoke('set-stored-token', token),
    removeStoredToken: () => ipcRenderer.invoke('remove-stored-token'),
    getStoredSettings: () => ipcRenderer.invoke('get-stored-settings'),
    setStoredSettings: (data: string) => ipcRenderer.invoke('set-stored-settings', data),
    getDeviceId: () => ipcRenderer.invoke('get-device-id'),
    setDeviceId: (id: string) => ipcRenderer.invoke('set-device-id', id)
})
