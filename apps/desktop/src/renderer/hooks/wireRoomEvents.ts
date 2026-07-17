import { RemoteAudioTrack, Room, RoomEvent, Track, type RemoteParticipant } from 'livekit-client'
import { playJoinSoundById } from '../utils/joinSounds'
import { shouldScheduleReconnect } from './connectionLifecycle'
import { requestPresenceRefresh } from './liveKitApi'
import { getParticipantInputMode, type LiveKitCallbacks, type RefLike } from './liveKitCore'
import { attachRemoteAudioTrack, detachRemoteAudioTrack, parseJoinSoundMessage, type ParticipantEventRateLimiter } from './remoteMedia'
import type { ParticipantAudioController } from './useParticipantAudio'
import type { LiveKitMediaController } from './useLiveKitMedia'

interface WireRoomEventsOptions {
    room: Room
    roomRef: RefLike<Room | null>
    callbacksRef: RefLike<LiveKitCallbacks | undefined>
    participantAudio: ParticipantAudioController
    media: LiveKitMediaController
    fetchChannels(): Promise<void>
    onDisconnected(): void
    intentionalDisconnectRef: RefLike<boolean>
    reconnectingRef: RefLike<boolean>
    hasReconnectParams(): boolean
    attemptReconnect(): void
    joinSoundRateLimiter: ParticipantEventRateLimiter
}

function setPublishedVolume(participant: RemoteParticipant, volume: number): void {
    participant.audioTrackPublications.forEach((publication) => {
        if (publication.track instanceof RemoteAudioTrack) publication.track.setVolume(volume)
    })
}

export function wireRoomEvents({
    room,
    roomRef,
    callbacksRef,
    participantAudio,
    media,
    fetchChannels,
    onDisconnected,
    intentionalDisconnectRef,
    reconnectingRef,
    hasReconnectParams,
    attemptReconnect,
    joinSoundRateLimiter
}: WireRoomEventsOptions): void {
    room.on(RoomEvent.ParticipantConnected, (participant) => {
        const appliedVolume = participantAudio.participantConnectedVolume(participant)
        if (appliedVolume !== 100) setPublishedVolume(participant, appliedVolume / 100)
        participantAudio.updatePlayerList(room)
        void fetchChannels()
        callbacksRef.current?.onParticipantJoin?.(participant.name || participant.identity)
    })

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        participantAudio.updatePlayerList(room)
        void fetchChannels()
        callbacksRef.current?.onParticipantLeave?.(participant.name || participant.identity)
    })

    room.on(RoomEvent.TrackMuted, (publication, participant) => {
        participantAudio.updatePlayerList(room)
        if (participant !== room.localParticipant && publication.kind === Track.Kind.Audio &&
            getParticipantInputMode(participant) !== 'ptt') {
            callbacksRef.current?.onParticipantMute?.(participant.name || participant.identity)
        }
    })

    room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
        participantAudio.updatePlayerList(room)
        if (participant !== room.localParticipant && publication.kind === Track.Kind.Audio &&
            getParticipantInputMode(participant) !== 'ptt') {
            callbacksRef.current?.onParticipantUnmute?.(participant.name || participant.identity)
        }
    })

    room.on(RoomEvent.ActiveSpeakersChanged, () => participantAudio.updatePlayerList(room))
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (!(track instanceof RemoteAudioTrack)) return
        const appliedVolume = participantAudio.subscribedTrackVolume(participant)
        attachRemoteAudioTrack({
            track,
            participantIdentity: participant.identity,
            volume: appliedVolume / 100,
            speakerId: media.speakerIdRef.current,
            document
        })
        participantAudio.updatePlayerList(room)
    })

    room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        detachRemoteAudioTrack({ track, participantIdentity: participant.identity, document })
        participantAudio.updatePlayerList(room)
    })

    room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return
        roomRef.current = null
        onDisconnected()
        if (!intentionalDisconnectRef.current) {
            void requestPresenceRefresh(room.name).catch(() => undefined)
        }
        void media.releaseMediaPipeline().then(() => {
            if (shouldScheduleReconnect({
                intentional: intentionalDisconnectRef.current,
                reconnecting: reconnectingRef.current,
                hasParams: hasReconnectParams()
            })) {
                console.warn('[Reconnect] Unexpected disconnect — attempting auto-reconnect')
                attemptReconnect()
            }
        })
    })

    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
        if (!participant || payload.byteLength > 64) return
        try {
            const soundId = parseJoinSoundMessage(new TextDecoder().decode(payload))
            if (soundId && joinSoundRateLimiter.allow(participant.identity)) playJoinSoundById(soundId)
        } catch {
            // Ignore malformed participant data.
        }
    })
}
