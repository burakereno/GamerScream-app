interface OverlayWindowLike {
    close(): void
    isDestroyed(): boolean
    on(event: 'closed', listener: () => void): void
}

type Schedule = (callback: () => void, delay: number) => unknown

export interface OverlayLifecycle<T extends OverlayWindowLike> {
    show(createWindow: () => T, autoCloseMs: number): T
    current(): T | null
}

export function createOverlayLifecycle<T extends OverlayWindowLike>(
    schedule: Schedule = (callback, delay) => setTimeout(callback, delay)
): OverlayLifecycle<T> {
    let currentWindow: T | null = null

    return {
        show: (createWindow, autoCloseMs) => {
            const previousWindow = currentWindow
            if (previousWindow && !previousWindow.isDestroyed()) previousWindow.close()

            const window = createWindow()
            currentWindow = window
            window.on('closed', () => {
                if (currentWindow === window) currentWindow = null
            })
            schedule(() => {
                if (!window.isDestroyed()) window.close()
            }, autoCloseMs)
            return window
        },
        current: () => currentWindow
    }
}
