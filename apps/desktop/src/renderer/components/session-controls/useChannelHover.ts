import { useCallback, useRef, useState } from 'react'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

interface RoomPlayersResponse {
    players: string[]
}

export function useChannelHover() {
    const [hoverPlayers, setHoverPlayers] = useState<Record<string, string[]>>({})
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const hoverCacheTs = useRef<Record<string, number>>({})

    const handleChannelHover = useCallback((roomName: string, playerCount: number) => {
        if (playerCount === 0) return
        const cached = hoverCacheTs.current[roomName]
        if (cached && Date.now() - cached < 5000 && hoverPlayers[roomName]) return

        hoverTimerRef.current = setTimeout(async () => {
            try {
                const token = (window as any).__gamerScreamAccessToken || ''
                const response = await fetch(`${SERVER_URL}/api/room-players/${roomName}`, {
                    headers: { 'x-access-token': token }
                })
                if (response.ok) {
                    const data = await response.json() as RoomPlayersResponse
                    setHoverPlayers((current) => ({ ...current, [roomName]: data.players }))
                    hoverCacheTs.current[roomName] = Date.now()
                }
            } catch {
                // Hover details are optional; keep the channel list usable.
            }
        }, 50)
    }, [hoverPlayers])

    const handleChannelLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        setHoverPlayers({})
    }, [])

    return { hoverPlayers, handleChannelHover, handleChannelLeave }
}
