interface TicketResponse {
    ticket?: unknown
}

interface FetchResponseLike {
    ok: boolean
    status: number
    json(): Promise<TicketResponse>
}

interface EventSourceLike {
    onerror: ((event: Event) => void) | null
    onopen: ((event: Event) => void) | null
    close(): void
    addEventListener(event: string, listener: (event: MessageEvent<string>) => void): void
}

interface TicketedEventSourceOptions {
    serverUrl: string
    accessToken: string
    fetcher: (url: string, init: { method: 'POST'; headers: Record<string, string> }) => Promise<FetchResponseLike>
    createEventSource: (url: string) => EventSourceLike
    schedule: (callback: () => void | Promise<void>, delay: number) => unknown
    cancel: (timer: unknown) => void
    onRooms: (rooms: unknown[]) => void
    onUnauthorized: () => void
    onUnavailable: () => void
    maxFailures?: number
}

export interface TicketedEventSource {
    start(): Promise<void>
    close(): void
}

export function createTicketedEventSource({
    serverUrl,
    accessToken,
    fetcher,
    createEventSource,
    schedule,
    cancel,
    onRooms,
    onUnauthorized,
    onUnavailable,
    maxFailures = 3
}: TicketedEventSourceOptions): TicketedEventSource {
    let source: EventSourceLike | null = null
    let reconnectTimer: unknown = null
    let stopped = true
    let failures = 0
    let generation = 0

    const closeSource = (): void => {
        source?.close()
        source = null
    }

    const clearReconnect = (): void => {
        if (reconnectTimer === null) return
        cancel(reconnectTimer)
        reconnectTimer = null
    }

    const scheduleReconnect = (): void => {
        if (stopped || reconnectTimer !== null) return
        failures++
        if (failures >= maxFailures) {
            stopped = true
            onUnavailable()
            return
        }
        const delay = Math.min(1000 * 2 ** (failures - 1), 10_000)
        reconnectTimer = schedule(async () => {
            reconnectTimer = null
            await connect()
        }, delay)
    }

    const connect = async (): Promise<void> => {
        if (stopped) return
        const connectionGeneration = generation
        try {
            const response = await fetcher(`${serverUrl}/api/events-ticket`, {
                method: 'POST',
                headers: { 'x-access-token': accessToken }
            })
            if (stopped || connectionGeneration !== generation) return
            if (response.status === 401) {
                stopped = true
                onUnauthorized()
                return
            }
            if (!response.ok) {
                scheduleReconnect()
                return
            }

            const payload = await response.json()
            if (typeof payload.ticket !== 'string' || payload.ticket.length < 1 || payload.ticket.length > 2048) {
                scheduleReconnect()
                return
            }

            closeSource()
            const eventSource = createEventSource(`${serverUrl}/api/events?ticket=${encodeURIComponent(payload.ticket)}`)
            source = eventSource
            eventSource.onopen = () => { failures = 0 }
            eventSource.addEventListener('rooms', (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (Array.isArray(data.rooms)) onRooms(data.rooms)
                } catch {
                    // Ignore malformed server events without tearing down the stream.
                }
            })
            eventSource.onerror = () => {
                if (source !== eventSource) return
                closeSource()
                scheduleReconnect()
            }
        } catch {
            if (!stopped && connectionGeneration === generation) scheduleReconnect()
        }
    }

    return {
        start: async () => {
            clearReconnect()
            closeSource()
            stopped = false
            generation++
            failures = 0
            await connect()
        },
        close: () => {
            stopped = true
            generation++
            clearReconnect()
            closeSource()
        }
    }
}
