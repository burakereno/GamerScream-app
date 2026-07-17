import { useCallback, useRef } from 'react'
import type { Room } from 'livekit-client'
import { teardownForAuthenticationExpiry } from './connectionLifecycle'
import type { ConnectParams, RefLike } from './liveKitCore'

interface AuthenticationExpiryRefs {
    intentionalDisconnect: RefLike<boolean>
    connectionGeneration: RefLike<number>
    lastConnectParams: RefLike<ConnectParams | null>
    connecting: RefLike<boolean>
    reconnecting: RefLike<boolean>
    reconnectTimer: RefLike<ReturnType<typeof setTimeout> | null>
    room: RefLike<Room | null>
}

interface UseAuthenticationExpiryOptions {
    refs: AuthenticationExpiryRefs
    stopRealtime(): void
    releaseMedia(): Promise<void>
    resetUi(): void
    notifyExpired(): void
}

export function useAuthenticationExpiry({
    refs,
    stopRealtime,
    releaseMedia,
    resetUi,
    notifyExpired
}: UseAuthenticationExpiryOptions): () => Promise<void> {
    const expiryRef = useRef<{ token: string; task: Promise<void> } | null>(null)

    return useCallback((): Promise<void> => {
        const expiredToken = window.__gamerScreamAccessToken ?? '<missing>'
        const existing = expiryRef.current
        if (existing?.token === expiredToken) return existing.task

        refs.intentionalDisconnect.current = true
        refs.connectionGeneration.current++
        refs.lastConnectParams.current = null
        refs.connecting.current = false
        refs.reconnecting.current = false
        if (refs.reconnectTimer.current) clearTimeout(refs.reconnectTimer.current)
        refs.reconnectTimer.current = null
        stopRealtime()

        const activeRoom = refs.room.current
        refs.room.current = null
        const task = teardownForAuthenticationExpiry({
            room: activeRoom,
            releaseMedia,
            resetUi,
            notifyExpired
        })
        expiryRef.current = { token: expiredToken, task }
        return task
    }, [notifyExpired, refs, releaseMedia, resetUi, stopRealtime])
}
