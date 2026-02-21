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
    }
})
