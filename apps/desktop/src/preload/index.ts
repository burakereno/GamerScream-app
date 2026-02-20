import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    getServerUrl: () => ipcRenderer.invoke('get-server-url'),

    // Auto-update
    onUpdateAvailable: (callback: (info: { version: string }) => void) => {
        ipcRenderer.on('update-available', (_event, info) => callback(info))
    },
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
        ipcRenderer.on('update-downloaded', (_event, info) => callback(info))
    },
    installUpdate: () => ipcRenderer.invoke('install-update')
})
