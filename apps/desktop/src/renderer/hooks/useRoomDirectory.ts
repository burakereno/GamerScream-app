import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChannelInfo } from '../types'
import { authenticatedFetch, LIVEKIT_SERVER_URL } from './liveKitApi'
import { createTicketedEventSource, type TicketedEventSource } from './ticketedEventSource'

interface UseRoomDirectoryOptions {
    enabled: boolean
    onUnauthorized(): Promise<void> | void
}

export interface CreateChannelResult {
    roomName: string
    roomCapability?: string
}

export interface RoomDirectoryController {
    channels: ChannelInfo[]
    fetchChannels(): Promise<void>
    createChannel(name: string, pin: string, createdBy: string): Promise<CreateChannelResult>
    verifyPin(roomName: string, pin: string): Promise<string | null>
    stopRealtime(): void
}

function defaultChannels(): ChannelInfo[] {
    return [1, 2, 3, 4, 5].map((channel) => ({
        channel,
        name: `ch-${channel}`,
        playerCount: 0
    }))
}

export function useRoomDirectory({ enabled, onUnauthorized }: UseRoomDirectoryOptions): RoomDirectoryController {
    const [channels, setChannels] = useState<ChannelInfo[]>(defaultChannels)
    const sseRef = useRef<TicketedEventSource | null>(null)
    const sseAvailableRef = useRef(true)
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchChannels = useCallback(async () => {
        if (!enabled) return
        try {
            const response = await authenticatedFetch('/api/rooms')
            if (response.ok) {
                const data = await response.json()
                setChannels(data.rooms || [])
            } else if (response.status === 401) {
                await onUnauthorized()
            }
        } catch {
            // The realtime stream or the next polling interval will retry.
        }
    }, [enabled, onUnauthorized])

    const stopPolling = useCallback(() => {
        if (!pollingRef.current) return
        clearInterval(pollingRef.current)
        pollingRef.current = null
    }, [])

    const startPolling = useCallback(() => {
        if (pollingRef.current) return
        void fetchChannels()
        pollingRef.current = setInterval(fetchChannels, 10_000)
    }, [fetchChannels])

    const stopRealtime = useCallback(() => {
        sseRef.current?.close()
        sseRef.current = null
        stopPolling()
    }, [stopPolling])

    const connectSse = useCallback(() => {
        if (!enabled) return
        sseRef.current?.close()
        sseRef.current = null
        if (!sseAvailableRef.current) {
            startPolling()
            return
        }

        const accessToken = window.__gamerScreamAccessToken
        if (!accessToken) return
        stopPolling()
        const stream = createTicketedEventSource({
            serverUrl: LIVEKIT_SERVER_URL,
            accessToken,
            fetcher: (url, init) => fetch(url, init),
            createEventSource: (url) => new EventSource(url),
            schedule: (callback, delay) => setTimeout(callback, delay),
            cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
            onRooms: (rooms) => setChannels(rooms as ChannelInfo[]),
            onUnauthorized: () => { void onUnauthorized() },
            onUnavailable: () => {
                sseRef.current = null
                sseAvailableRef.current = false
                console.warn('[SSE] Unavailable — falling back to polling')
                startPolling()
            }
        })
        sseRef.current = stream
        void stream.start()
    }, [enabled, onUnauthorized, startPolling, stopPolling])

    useEffect(() => {
        if (!enabled) return
        connectSse()
        const handleVisibility = () => {
            if (document.hidden) stopRealtime()
            else connectSse()
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => {
            stopRealtime()
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [connectSse, enabled, stopRealtime])

    const createChannel = useCallback(async (
        name: string,
        pin: string,
        createdBy: string
    ): Promise<CreateChannelResult> => {
        const response = await authenticatedFetch('/api/channels', {
            method: 'POST',
            body: JSON.stringify({ name, pin: pin || undefined, createdBy })
        })
        if (!response.ok) {
            if (response.status === 401) await onUnauthorized()
            const error = await response.json()
            throw new Error(error.error || 'Failed to create channel')
        }
        const data = await response.json()
        await fetchChannels()
        return data
    }, [fetchChannels, onUnauthorized])

    const verifyPin = useCallback(async (roomName: string, pin: string): Promise<string | null> => {
        const response = await authenticatedFetch('/api/channels/verify-pin', {
            method: 'POST',
            body: JSON.stringify({ roomName, pin })
        })
        if (!response.ok) {
            if (response.status === 401) await onUnauthorized()
            return null
        }
        const data = await response.json()
        return data.valid && typeof data.roomCapability === 'string' ? data.roomCapability : null
    }, [onUnauthorized])

    return { channels, fetchChannels, createChannel, verifyPin, stopRealtime }
}
