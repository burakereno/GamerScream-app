import { useCallback, useRef, useState } from 'react'
import { RemoteAudioTrack, type RemoteParticipant, type RemoteTrackPublication, type Room } from 'livekit-client'
import type { ConnectedPlayer } from '../types'
import { getVolumeKey, type RefLike } from './liveKitCore'

const VOLUME_STORAGE_KEY = 'gamerscream-player-volumes'

function loadVolumes(): Map<string, number> {
    try {
        const stored = localStorage.getItem(VOLUME_STORAGE_KEY)
        if (stored) return new Map(Object.entries(JSON.parse(stored)).map(([key, value]) => [key, Number(value)]))
    } catch {
        // Ignore malformed legacy preferences.
    }
    return new Map()
}

function saveVolumes(volumes: Map<string, number>): void {
    localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(Object.fromEntries(volumes)))
}

function setParticipantTrackVolume(participant: RemoteParticipant, volume: number): void {
    participant.audioTrackPublications.forEach((publication: RemoteTrackPublication) => {
        if (publication.track instanceof RemoteAudioTrack) publication.track.setVolume(volume)
    })
}

export interface ParticipantAudioController {
    players: ConnectedPlayer[]
    allMuted: boolean
    allMutedRef: RefLike<boolean>
    updatePlayerList(room: Room): void
    setPlayerVolume(room: Room | null, identity: string, volume: number): void
    toggleMuteAll(room: Room | null): void
    participantConnectedVolume(participant: RemoteParticipant): number
    subscribedTrackVolume(participant: RemoteParticipant): number
    resetSession(clearSavedVolumes?: boolean): void
}

export function useParticipantAudio(): ParticipantAudioController {
    const [players, setPlayers] = useState<ConnectedPlayer[]>([])
    const [allMuted, setAllMuted] = useState(false)
    const allMutedRef = useRef(false)
    const volumeMapRef = useRef(loadVolumes())
    const savedVolumesRef = useRef(new Map<string, number>())

    const updatePlayerList = useCallback((room: Room) => {
        const localParticipant = room.localParticipant
        const nextPlayers: ConnectedPlayer[] = [{
            identity: localParticipant.identity,
            displayName: localParticipant.name || localParticipant.identity,
            isMuted: !localParticipant.isMicrophoneEnabled,
            isSpeaking: localParticipant.isSpeaking,
            isLocal: true,
            volume: 100
        }]

        room.remoteParticipants.forEach((participant) => {
            nextPlayers.push({
                identity: participant.identity,
                displayName: participant.name || participant.identity,
                isMuted: !participant.isMicrophoneEnabled,
                isSpeaking: participant.isSpeaking,
                isLocal: false,
                volume: volumeMapRef.current.get(getVolumeKey(participant)) ?? 100
            })
        })

        setPlayers((previous) => {
            if (previous.length !== nextPlayers.length) return nextPlayers
            const changed = nextPlayers.some((next, index) => {
                const prior = previous[index]
                return prior.identity !== next.identity ||
                    prior.displayName !== next.displayName ||
                    prior.isMuted !== next.isMuted ||
                    prior.isSpeaking !== next.isSpeaking ||
                    prior.volume !== next.volume
            })
            return changed ? nextPlayers : previous
        })
    }, [])

    const setPlayerVolume = useCallback((room: Room | null, identity: string, volume: number) => {
        if (!room) return
        let key = identity
        const participant = room.remoteParticipants.get(identity)
        if (participant) {
            key = getVolumeKey(participant)
            if (allMutedRef.current) {
                savedVolumesRef.current.set(key, volume)
                const persisted = new Map(volumeMapRef.current)
                savedVolumesRef.current.forEach((saved, savedKey) => persisted.set(savedKey, saved))
                saveVolumes(persisted)
                updatePlayerList(room)
                return
            }
            setParticipantTrackVolume(participant, volume / 100)
        }
        volumeMapRef.current.set(key, volume)
        saveVolumes(volumeMapRef.current)
        updatePlayerList(room)
    }, [updatePlayerList])

    const toggleMuteAll = useCallback((room: Room | null) => {
        if (!room) return
        const nextMuted = !allMutedRef.current
        allMutedRef.current = nextMuted
        setAllMuted(nextMuted)

        room.remoteParticipants.forEach((participant) => {
            const key = getVolumeKey(participant)
            if (nextMuted) {
                const currentVolume = volumeMapRef.current.get(key) ?? 100
                savedVolumesRef.current.set(key, currentVolume)
                setParticipantTrackVolume(participant, 0)
                volumeMapRef.current.set(key, 0)
            } else {
                const savedVolume = savedVolumesRef.current.get(key) ?? 100
                setParticipantTrackVolume(participant, savedVolume / 100)
                volumeMapRef.current.set(key, savedVolume)
            }
        })
        updatePlayerList(room)
    }, [updatePlayerList])

    const participantConnectedVolume = useCallback((participant: RemoteParticipant): number => {
        const key = getVolumeKey(participant)
        const preferredVolume = volumeMapRef.current.get(key) ?? 100
        if (!allMutedRef.current) return preferredVolume
        savedVolumesRef.current.set(key, preferredVolume)
        volumeMapRef.current.set(key, 0)
        return 0
    }, [])

    const subscribedTrackVolume = useCallback((participant: RemoteParticipant): number => {
        const key = getVolumeKey(participant)
        const preferredVolume = savedVolumesRef.current.get(key) ?? volumeMapRef.current.get(key) ?? 100
        if (!allMutedRef.current) return preferredVolume
        savedVolumesRef.current.set(key, preferredVolume)
        volumeMapRef.current.set(key, 0)
        return 0
    }, [])

    const resetSession = useCallback((clearSavedVolumes = false) => {
        allMutedRef.current = false
        setAllMuted(false)
        setPlayers([])
        if (clearSavedVolumes) savedVolumesRef.current.clear()
    }, [])

    return {
        players,
        allMuted,
        allMutedRef,
        updatePlayerList,
        setPlayerVolume,
        toggleMuteAll,
        participantConnectedVolume,
        subscribedTrackVolume,
        resetSession
    }
}
