import { app, globalShortcut, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import {
    parseDeviceId,
    parseNotificationPayload,
    parsePlayerVolumesPayload,
    parsePttKey,
    parseSettingsPayload,
    parseToken
} from './ipcPayloads'
import type { PersistentStateStore } from './persistentState'
import { createPttStateController } from './pttState'
import type { UpdateStateController } from './updateState'
import type { DesktopNotificationPresenter } from './desktopNotifications'

interface DesktopIpcDependencies {
    isTrustedEvent(event: IpcMainEvent | IpcMainInvokeEvent): boolean
    requireTrustedEvent(event: IpcMainInvokeEvent): void
    safeSend(channel: string, ...args: unknown[]): void
    getPersistentState(): PersistentStateStore
    updateState: UpdateStateController
    notifications: DesktopNotificationPresenter
}

export function registerDesktopIpc({
    isTrustedEvent,
    requireTrustedEvent,
    safeSend,
    getPersistentState,
    updateState,
    notifications
}: DesktopIpcDependencies): void {
    let currentInputKey: string | null = null
    const pttState = createPttStateController({
        emitDown: () => safeSend('ptt-key-down'),
        emitUp: () => safeSend('ptt-key-up'),
        schedule: (callback, delay) => setTimeout(callback, delay),
        cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>)
    })

    const unregisterInputKey = (): void => {
        if (currentInputKey) {
            try {
                globalShortcut.unregister(currentInputKey)
            } catch {
                // Continue releasing the renderer state if native unregister fails.
            }
            currentInputKey = null
        }
        pttState.release()
    }

    ipcMain.handle('install-update', (event) => {
        requireTrustedEvent(event)
        return updateState.installUpdate()
    })
    ipcMain.handle('get-update-status', (event) => {
        requireTrustedEvent(event)
        return updateState.getState()
    })
    ipcMain.handle('get-app-version', (event) => {
        requireTrustedEvent(event)
        return app.getVersion()
    })

    ipcMain.on('show-notification', (event, payload: unknown) => {
        if (!isTrustedEvent(event)) return
        let notification
        try {
            notification = parseNotificationPayload(payload)
        } catch {
            return
        }
        notifications.show(notification.title, notification.body)
    })

    ipcMain.on('set-mute-overlay-visible', (event, visible: unknown) => {
        if (!isTrustedEvent(event) || typeof visible !== 'boolean') return
        notifications.setMuteOverlayVisible(visible)
    })

    const registerInputKey = (event: IpcMainEvent, value: unknown, onPress: () => void): void => {
        if (!isTrustedEvent(event)) return
        let key: string
        try {
            key = parsePttKey(value)
        } catch {
            return
        }
        unregisterInputKey()

        try {
            const registered = globalShortcut.register(key, onPress)
            if (registered) {
                currentInputKey = key
                console.log(`Input key registered: ${key}`)
            } else {
                console.warn(`Failed to register input key: ${key}`)
                safeSend('ptt-register-failed', key)
            }
        } catch (error) {
            console.warn('Input key registration error:', error)
            safeSend('ptt-register-failed', key)
        }
    }
    ipcMain.on('register-ptt-key', (event, value: unknown) => {
        registerInputKey(event, value, () => pttState.keyDown())
    })
    ipcMain.on('register-mute-toggle-key', (event, value: unknown) => {
        registerInputKey(event, value, () => safeSend('mute-toggle'))
    })
    ipcMain.on('unregister-ptt-key', (event) => {
        if (!isTrustedEvent(event)) return
        unregisterInputKey()
    })
    ipcMain.on('unregister-mute-toggle-key', (event) => {
        if (isTrustedEvent(event)) unregisterInputKey()
    })
    ipcMain.on('ptt-cancel-timer', (event) => {
        if (isTrustedEvent(event)) pttState.cancelTimer()
    })
    ipcMain.on('ptt-release', (event) => {
        if (isTrustedEvent(event)) pttState.release()
    })
    app.on('will-quit', () => globalShortcut.unregisterAll())

    ipcMain.handle('get-stored-token', (event) => {
        requireTrustedEvent(event)
        return getPersistentState().getToken()
    })
    ipcMain.handle('set-stored-token', (event, value: unknown) => {
        requireTrustedEvent(event)
        return getPersistentState().setToken(parseToken(value))
    })
    ipcMain.handle('remove-stored-token', (event) => {
        requireTrustedEvent(event)
        return getPersistentState().removeToken()
    })
    ipcMain.handle('get-stored-settings', (event) => {
        requireTrustedEvent(event)
        return getPersistentState().getSettings()
    })
    ipcMain.handle('set-stored-settings', (event, value: unknown) => {
        requireTrustedEvent(event)
        return getPersistentState().setSettings(parseSettingsPayload(value))
    })
    ipcMain.handle('get-player-volumes', (event) => {
        requireTrustedEvent(event)
        return getPersistentState().getPlayerVolumes()
    })
    ipcMain.handle('set-player-volumes', (event, value: unknown) => {
        requireTrustedEvent(event)
        return getPersistentState().setPlayerVolumes(parsePlayerVolumesPayload(value))
    })
    ipcMain.handle('get-device-id', (event) => {
        requireTrustedEvent(event)
        return getPersistentState().getDeviceId()
    })
    ipcMain.handle('set-device-id', (event, value: unknown) => {
        requireTrustedEvent(event)
        return getPersistentState().setDeviceId(parseDeviceId(value))
    })
}
