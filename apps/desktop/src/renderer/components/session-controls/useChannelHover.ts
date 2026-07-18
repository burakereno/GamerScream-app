import { useCallback, useEffect, useRef, useState } from 'react'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

interface RoomPlayersResponse {
    players: string[]
}

export function useChannelHover(playerCounts: Record<string, number>) {
    const [hoverPlayers, setHoverPlayers] = useState<Record<string, string[]>>({})
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const hoveredRoomRef = useRef<string | null>(null)
    const hoveredCountRef = useRef<number | null>(null)
    const requestGenerationRef = useRef(0)

    const fetchPlayers = useCallback(async (roomName: string) => {
        const requestGeneration = ++requestGenerationRef.current
        try {
            const token = (window as any).__gamerScreamAccessToken || ''
            const response = await fetch(`${SERVER_URL}/api/room-players/${roomName}`, {
                headers: { 'x-access-token': token }
            })
            if (!response.ok) return
            const data = await response.json() as RoomPlayersResponse
            if (requestGeneration !== requestGenerationRef.current ||
                hoveredRoomRef.current !== roomName) return
            setHoverPlayers((current) => ({ ...current, [roomName]: data.players }))
        } catch {
            // Hover details are optional; keep the channel list usable.
        }
    }, [])

    const handleChannelHover = useCallback((roomName: string, playerCount: number) => {
        hoveredRoomRef.current = roomName
        hoveredCountRef.current = playerCount
        requestGenerationRef.current++
        if (playerCount === 0) return

        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null
            void fetchPlayers(roomName)
        }, 50)
    }, [fetchPlayers])

    const handleChannelLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        hoveredRoomRef.current = null
        hoveredCountRef.current = null
        requestGenerationRef.current++
        setHoverPlayers({})
    }, [])

    useEffect(() => {
        const roomName = hoveredRoomRef.current
        if (!roomName) return
        const nextCount = playerCounts[roomName] ?? 0
        if (nextCount === hoveredCountRef.current) return

        hoveredCountRef.current = nextCount
        requestGenerationRef.current++
        setHoverPlayers((current) => ({ ...current, [roomName]: [] }))
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        if (nextCount > 0) void fetchPlayers(roomName)
    }, [fetchPlayers, playerCounts])

    return { hoverPlayers, handleChannelHover, handleChannelLeave }
}
