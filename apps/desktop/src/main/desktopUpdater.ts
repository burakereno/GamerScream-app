import { autoUpdater } from 'electron-updater'
import { createUpdateStateController, type UpdateStateController } from './updateState'

export interface DesktopUpdater {
    state: UpdateStateController
    setup(): void
}

export function createDesktopUpdater(
    send: (channel: string, ...args: unknown[]) => void
): DesktopUpdater {
    const state = createUpdateStateController({
        emit: (nextState) => send('update-status', nextState),
        install: () => autoUpdater.quitAndInstall(false, true)
    })

    return {
        state,
        setup: () => {
            autoUpdater.autoDownload = true
            autoUpdater.autoInstallOnAppQuit = false

            autoUpdater.on('checking-for-update', () => state.checking())
            autoUpdater.on('update-available', (info) => {
                state.updateAvailable(info.version)
                send('update-available', { version: info.version })
            })
            autoUpdater.on('update-not-available', () => state.updateNotAvailable())
            autoUpdater.on('download-progress', (progress) => state.downloadProgress(progress.percent))
            autoUpdater.on('update-downloaded', (info) => {
                state.updateDownloaded(info.version)
                send('update-downloaded', { version: info.version })
            })
            autoUpdater.on('error', (error) => {
                state.updateError(error)
                console.error('Auto-update error:', error.message)
            })

            setTimeout(() => {
                autoUpdater.checkForUpdates().catch((error) => {
                    state.updateError(error)
                    console.error('Update check failed:', error.message)
                })
            }, 3000)
        }
    }
}
