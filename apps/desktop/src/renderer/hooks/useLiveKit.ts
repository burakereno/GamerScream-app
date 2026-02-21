import { useState, useCallback, useRef, useEffect } from 'react'
import {
    Room,
    RoomEvent,
    Track,
    RemoteParticipant,
    RemoteTrackPublication
} from 'livekit-client'
import type { ConnectedPlayer, ChannelInfo } from '../types'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (window.__gamerScreamAccessToken) {
        headers['x-access-token'] = window.__gamerScreamAccessToken
    }
    return headers
}

// Generate or retrieve a persistent device ID
const DEVICE_ID_KEY = 'gamerscream-device-id'
function getDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
}

const deviceId = getDeviceId()

// Helper: extract device ID from participant metadata
function getParticipantDeviceId(participant: RemoteParticipant | { metadata?: string | null }): string {
    try {
        if (participant.metadata) {
            const meta = JSON.parse(participant.metadata)
            if (meta.deviceId) return meta.deviceId
        }
    } catch { /* ignore */ }
    return ''
}

// Volume key: prefer device ID, fallback to identity
function getVolumeKey(participant: RemoteParticipant): string {
    return getParticipantDeviceId(participant) || participant.identity
}

export interface LiveKitCallbacks {
    onParticipantJoin?: (name: string) => void
    onParticipantLeave?: (name: string) => void
}

export function useLiveKit(callbacks?: LiveKitCallbacks) {
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [players, setPlayers] = useState<ConnectedPlayer[]>([])
    const [roomName, setRoomName] = useState('')
    const defaultChannels: ChannelInfo[] = [1, 2, 3, 4, 5].map(ch => ({ channel: ch, name: `ch-${ch}`, playerCount: 0 }))
    const [channels, setChannels] = useState<ChannelInfo[]>(defaultChannels)
    const [allMuted, setAllMuted] = useState(false)
    const roomRef = useRef<Room | null>(null)

    // Persist per-device volumes in localStorage
    const VOLUME_STORAGE_KEY = 'gamerscream-player-volumes'
    const loadVolumes = (): Map<string, number> => {
        try {
            const stored = localStorage.getItem(VOLUME_STORAGE_KEY)
            if (stored) return new Map(Object.entries(JSON.parse(stored)).map(([k, v]) => [k, Number(v)]))
        } catch { /* ignore */ }
        return new Map()
    }
    const saveVolumes = (map: Map<string, number>) => {
        localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(Object.fromEntries(map)))
    }

    const volumeMapRef = useRef<Map<string, number>>(loadVolumes())
    const savedVolumesRef = useRef<Map<string, number>>(new Map())

    const updatePlayerList = useCallback((room: Room) => {
        const localParticipant = room.localParticipant
        const playerList: ConnectedPlayer[] = []

        playerList.push({
            identity: localParticipant.identity,
            displayName: localParticipant.name || localParticipant.identity,
            isMuted: !localParticipant.isMicrophoneEnabled,
            isSpeaking: localParticipant.isSpeaking,
            isLocal: true,
            volume: 100
        })

        room.remoteParticipants.forEach((participant: RemoteParticipant) => {
            const key = getVolumeKey(participant)
            const savedVolume = volumeMapRef.current.get(key) ?? 100
            playerList.push({
                identity: participant.identity,
                displayName: participant.name || participant.identity,
                isMuted: !participant.isMicrophoneEnabled,
                isSpeaking: participant.isSpeaking,
                isLocal: false,
                volume: savedVolume
            })
        })

        setPlayers(playerList)
    }, [])

    // Fetch channel info (player counts) from server
    const fetchChannels = useCallback(async () => {
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms`, {
                headers: getAuthHeaders()
            })
            if (res.ok) {
                const data = await res.json()
                setChannels(data.rooms || [])
            }
        } catch {
            // silently fail
        }
    }, [])

    // Poll channel info periodically
    useEffect(() => {
        fetchChannels()
        const interval = setInterval(fetchChannels, 5000)
        return () => clearInterval(interval)
    }, [fetchChannels])

    const setPlayerVolume = useCallback((identity: string, volume: number) => {
        // Find the remote participant to get their device ID
        const room = roomRef.current
        let key = identity // fallback
        if (room) {
            const participant = room.remoteParticipants.get(identity)
            if (participant) {
                key = getVolumeKey(participant)
                participant.audioTrackPublications.forEach((pub: RemoteTrackPublication) => {
                    if (pub.track) {
                        ; (pub.track as any).setVolume(volume / 100)
                    }
                })
            }
            // Also store by identity for the current session
            volumeMapRef.current.set(key, volume)
            saveVolumes(volumeMapRef.current)
            updatePlayerList(room)
        }
    }, [updatePlayerList])

    const toggleMuteAll = useCallback(() => {
        const room = roomRef.current
        if (!room) return

        const newAllMuted = !allMuted
        setAllMuted(newAllMuted)

        room.remoteParticipants.forEach((participant: RemoteParticipant) => {
            const key = getVolumeKey(participant)
            if (newAllMuted) {
                const currentVol = volumeMapRef.current.get(key) ?? 100
                savedVolumesRef.current.set(key, currentVol)
                participant.audioTrackPublications.forEach((pub: RemoteTrackPublication) => {
                    if (pub.track) { ; (pub.track as any).setVolume(0) }
                })
                volumeMapRef.current.set(key, 0)
            } else {
                const savedVol = savedVolumesRef.current.get(key) ?? 100
                participant.audioTrackPublications.forEach((pub: RemoteTrackPublication) => {
                    if (pub.track) { ; (pub.track as any).setVolume(savedVol / 100) }
                })
                volumeMapRef.current.set(key, savedVol)
            }
        })

        updatePlayerList(room)
    }, [allMuted, updatePlayerList])

    const connect = useCallback(
        async (username: string, channel: number, micDeviceId: string, micLevel: number, customRoomName?: string, pin?: string) => {
            if (roomRef.current) {
                await roomRef.current.disconnect()
            }

            setIsConnecting(true)

            try {
                const channelName = customRoomName || `ch-${channel}`
                const res = await fetch(`${SERVER_URL}/api/token`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ username, room: channelName, deviceId, pin })
                })

                if (!res.ok) {
                    throw new Error(`Failed to get token: ${res.statusText}`)
                }

                const { token, livekitUrl } = await res.json()

                const room = new Room({
                    audioCaptureDefaults: {
                        deviceId: micDeviceId || undefined
                    }
                })

                room.on(RoomEvent.ParticipantConnected, (p) => {
                    // Apply saved volume for this device
                    const key = getVolumeKey(p as RemoteParticipant)
                    const savedVol = volumeMapRef.current.get(key)
                    if (savedVol !== undefined) {
                        p.audioTrackPublications.forEach((pub) => {
                            if (pub.track) { ; (pub.track as any).setVolume(savedVol / 100) }
                        })
                    }
                    updatePlayerList(room)
                    fetchChannels()
                    // Notify: someone joined
                    callbacks?.onParticipantJoin?.(p.name || p.identity)
                })
                room.on(RoomEvent.ParticipantDisconnected, (p) => {
                    updatePlayerList(room)
                    fetchChannels()
                    // Notify: someone left
                    callbacks?.onParticipantLeave?.(p.name || p.identity)
                })
                room.on(RoomEvent.TrackMuted, () => updatePlayerList(room))
                room.on(RoomEvent.TrackUnmuted, () => updatePlayerList(room))
                room.on(RoomEvent.ActiveSpeakersChanged, () => updatePlayerList(room))
                room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
                    // Attach audio track to DOM so it plays
                    if (track.kind === Track.Kind.Audio) {
                        const el = track.attach()
                        el.id = `audio-${participant.identity}`
                        document.body.appendChild(el)
                    }
                    // Apply saved volume to newly subscribed tracks
                    const key = getVolumeKey(participant)
                    const savedVolume = volumeMapRef.current.get(key) ?? 100
                        ; (track as any).setVolume(savedVolume / 100)
                    updatePlayerList(room)
                })
                room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
                    // Clean up audio element
                    track.detach().forEach((el: HTMLMediaElement) => el.remove())
                    const existingEl = document.getElementById(`audio-${participant.identity}`)
                    if (existingEl) existingEl.remove()
                    updatePlayerList(room)
                })
                room.on(RoomEvent.Disconnected, () => {
                    setIsConnected(false)
                    setPlayers([])
                    roomRef.current = null
                    fetchChannels()
                })

                await room.connect(livekitUrl, token)
                await room.localParticipant.setMicrophoneEnabled(true)

                roomRef.current = room
                setRoomName(channelName)
                setIsConnected(true)
                setIsMuted(false)
                updatePlayerList(room)
                fetchChannels()
            } catch (err) {
                console.error('Failed to connect:', err)
                throw err
            } finally {
                setIsConnecting(false)
            }
        },
        [updatePlayerList, fetchChannels]
    )

    const disconnect = useCallback(async () => {
        if (roomRef.current) {
            await roomRef.current.disconnect()
            roomRef.current = null
        }
        setIsConnected(false)
        setIsMuted(false)
        setPlayers([])
        setRoomName('')
        fetchChannels()
    }, [fetchChannels])

    const toggleMute = useCallback(async () => {
        if (!roomRef.current) return
        const newMuted = !isMuted
        await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted)
        setIsMuted(newMuted)
        updatePlayerList(roomRef.current)
    }, [isMuted, updatePlayerList])

    useEffect(() => {
        return () => {
            if (roomRef.current) {
                roomRef.current.disconnect()
            }
        }
    }, [])

    const createChannel = useCallback(async (name: string, pin: string, createdBy: string) => {
        const res = await fetch(`${SERVER_URL}/api/channels`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name, pin: pin || undefined, createdBy })
        })
        if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'Failed to create channel')
        }
        const data = await res.json()
        await fetchChannels()
        return data
    }, [fetchChannels])

    const verifyPin = useCallback(async (roomName: string, pin: string): Promise<boolean> => {
        const res = await fetch(`${SERVER_URL}/api/channels/verify-pin`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ roomName, pin })
        })
        if (!res.ok) return false
        const data = await res.json()
        return data.valid
    }, [])

    return {
        isConnected,
        isConnecting,
        isMuted,
        allMuted,
        players,
        roomName,
        channels,
        connect,
        disconnect,
        toggleMute,
        toggleMuteAll,
        setPlayerVolume,
        fetchChannels,
        createChannel,
        verifyPin
    }
}
