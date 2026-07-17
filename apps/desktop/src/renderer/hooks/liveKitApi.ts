import type { ConnectParams } from './liveKitCore'

export const LIVEKIT_SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

export function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (window.__gamerScreamAccessToken) headers['x-access-token'] = window.__gamerScreamAccessToken
    return headers
}

export function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${LIVEKIT_SERVER_URL}${path}`, {
        ...init,
        headers: { ...getAuthHeaders(), ...(init.headers ?? {}) }
    })
}

export function requestRoomToken(params: ConnectParams, deviceId: string): Promise<Response> {
    const room = params.customRoomName || `ch-${params.channel}`
    return authenticatedFetch('/api/token', {
        method: 'POST',
        body: JSON.stringify({
            username: params.username,
            room,
            deviceId,
            roomCapability: params.roomCapability,
            inputMode: params.inputMode
        })
    })
}

export function requestPresenceRefresh(room: string): Promise<Response> {
    return authenticatedFetch('/api/presence-refresh', {
        method: 'POST',
        body: JSON.stringify({ room })
    })
}

export function notifyRoomLeave(room: string): void {
    void requestPresenceRefresh(room).catch(() => undefined)
}
