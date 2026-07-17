import { useCallback, useRef } from 'react'
import type { LiveKitCallbacks } from './liveKitCore'
import { useLiveKitConnection } from './useLiveKitConnection'
import { useLiveKitMedia } from './useLiveKitMedia'
import { useParticipantAudio } from './useParticipantAudio'
import { useRoomDirectory } from './useRoomDirectory'

export type { LiveKitCallbacks } from './liveKitCore'

export function useLiveKit(callbacks?: LiveKitCallbacks, enabled = true) {
    const callbacksRef = useRef(callbacks)
    callbacksRef.current = callbacks

    const expireAuthenticationRef = useRef<() => Promise<void>>(async () => undefined)
    const onUnauthorized = useCallback(() => expireAuthenticationRef.current(), [])
    const media = useLiveKitMedia()
    const participantAudio = useParticipantAudio()
    const directory = useRoomDirectory({ enabled, onUnauthorized })
    const connection = useLiveKitConnection({ callbacksRef, media, participantAudio, directory })
    expireAuthenticationRef.current = connection.expireAuthentication

    const setPlayerVolume = useCallback((identity: string, volume: number) => {
        participantAudio.setPlayerVolume(connection.roomRef.current, identity, volume)
    }, [connection.roomRef, participantAudio.setPlayerVolume])

    const toggleMuteAll = useCallback(() => {
        participantAudio.toggleMuteAll(connection.roomRef.current)
    }, [connection.roomRef, participantAudio.toggleMuteAll])

    return {
        isConnected: connection.isConnected,
        isConnecting: connection.isConnecting,
        isReconnecting: connection.isReconnecting,
        isMuted: connection.isMuted,
        isVadGateOpen: media.isVadGateOpen,
        allMuted: participantAudio.allMuted,
        players: participantAudio.players,
        roomName: connection.roomName,
        channels: directory.channels,
        rnnoiseActive: media.rnnoiseActive,
        connect: connection.connect,
        disconnect: connection.disconnect,
        cancelReconnect: connection.cancelReconnect,
        toggleMute: connection.toggleMute,
        setMuted: connection.setMuted,
        toggleMuteAll,
        setPlayerVolume,
        fetchChannels: directory.fetchChannels,
        createChannel: directory.createChannel,
        verifyPin: directory.verifyPin,
        setMicGain: media.setMicGain,
        setNoiseSuppressionLevel: media.setNoiseSuppressionLevel,
        getRawMicLevel: media.getRawMicLevel,
        setVadGate: media.setVadGate,
        setVadActive: media.setVadActive,
        setSpeakerDevice: media.setSpeakerDevice,
        updateInputModeMetadata: connection.updateInputModeMetadata,
        updateReconnectNoiseSuppression: connection.updateReconnectNoiseSuppression
    }
}
