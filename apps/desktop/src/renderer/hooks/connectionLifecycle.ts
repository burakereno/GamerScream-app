interface DisposableConnectionResources {
    room?: { disconnect(): Promise<unknown> | unknown } | null
    rnnoiseNode?: { destroy(): void } | null
    micStream?: { getTracks(): Array<{ stop(): void }> } | null
    audioContext?: { close(): Promise<unknown> | unknown } | null
}

export async function disposeConnectionResources(
    resources: DisposableConnectionResources,
    disconnectRoom: boolean
): Promise<void> {
    if (disconnectRoom && resources.room) {
        try {
            await resources.room.disconnect()
        } catch {
            // Continue releasing independently-owned media resources.
        }
    }
    try {
        resources.rnnoiseNode?.destroy()
    } catch {
        // Continue releasing the remaining independently-owned resources.
    }
    let tracks: Array<{ stop(): void }> = []
    try {
        tracks = resources.micStream?.getTracks() ?? []
    } catch {
        // A broken stream must not prevent the remaining context cleanup.
    }
    for (const track of tracks) {
        try { track.stop() } catch { /* continue */ }
    }
    if (resources.audioContext) {
        try {
            await resources.audioContext.close()
        } catch {
            // Cleanup is best effort and idempotent.
        }
    }
}

interface ReconnectState {
    intentional: boolean
    reconnecting: boolean
    hasParams: boolean
}

export function shouldScheduleReconnect({ intentional, reconnecting, hasParams }: ReconnectState): boolean {
    return !intentional && !reconnecting && hasParams
}

interface AuthenticationExpiryTeardown {
    room?: DisposableConnectionResources['room']
    releaseMedia(): Promise<void> | void
    resetUi(): void
    notifyExpired(): void
}

export async function teardownForAuthenticationExpiry({
    room,
    releaseMedia,
    resetUi,
    notifyExpired
}: AuthenticationExpiryTeardown): Promise<void> {
    try {
        await disposeConnectionResources({ room }, true)
        try {
            await releaseMedia()
        } catch {
            // Authentication state still must be invalidated if media cleanup fails.
        }
    } finally {
        try {
            resetUi()
        } finally {
            notifyExpired()
        }
    }
}
