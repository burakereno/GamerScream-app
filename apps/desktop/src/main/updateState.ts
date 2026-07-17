export type UpdatePhase = 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'

export interface UpdateStatus {
    phase: UpdatePhase
    version?: string
    percent?: number
    error?: string
}

export interface InstallUpdateResult {
    ok: boolean
    error?: string
}

interface UpdateStateControllerDependencies {
    emit: (state: UpdateStatus) => void
    install: () => void
}

export interface UpdateStateController {
    checking(): void
    updateNotAvailable(): void
    updateAvailable(version: string): void
    downloadProgress(percent: number): void
    updateDownloaded(version: string): void
    updateError(error: unknown): void
    installUpdate(): InstallUpdateResult
    getState(): UpdateStatus
}

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'string' && error) return error
    return 'Update failed'
}

export function createUpdateStateController({ emit, install }: UpdateStateControllerDependencies): UpdateStateController {
    let state: UpdateStatus = { phase: 'idle' }

    const publish = (next: UpdateStatus): void => {
        state = next
        emit({ ...next })
    }

    return {
        checking: () => publish({ phase: 'checking' }),
        updateNotAvailable: () => publish({ phase: 'up-to-date' }),
        updateAvailable: (version) => publish({ phase: 'downloading', version }),
        downloadProgress: (percent) => publish({
            phase: 'downloading',
            version: state.version,
            percent: Math.max(0, Math.min(100, percent))
        }),
        updateDownloaded: (version) => publish({ phase: 'downloaded', version, percent: 100 }),
        updateError: (error) => publish({
            phase: 'error',
            version: state.version,
            error: errorMessage(error)
        }),
        installUpdate: () => {
            if (state.phase !== 'downloaded') {
                return { ok: false, error: 'Update is not ready to install' }
            }
            try {
                install()
                return { ok: true }
            } catch (error) {
                const message = errorMessage(error)
                publish({ phase: 'error', version: state.version, error: message })
                return { ok: false, error: message }
            }
        },
        getState: () => ({ ...state })
    }
}
