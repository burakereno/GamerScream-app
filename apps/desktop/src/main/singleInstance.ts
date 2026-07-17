interface AppLike {
    requestSingleInstanceLock(): boolean
    quit(): void
    on(event: 'second-instance', listener: () => void): void
}

interface WindowLike {
    isDestroyed(): boolean
    isMinimized(): boolean
    restore(): void
    show(): void
    focus(): void
}

export function configureSingleInstance(app: AppLike, getWindow: () => WindowLike | null): boolean {
    if (!app.requestSingleInstanceLock()) {
        app.quit()
        return false
    }

    app.on('second-instance', () => {
        const window = getWindow()
        if (!window || window.isDestroyed()) return
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
    })
    return true
}
