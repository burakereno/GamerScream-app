import { useCallback, useEffect, useRef, useState } from 'react'
import { Room } from 'livekit-client'
import type { ParticipantInputMode } from './authenticatedRoomActions'
import { updateParticipantMode } from './authenticatedRoomActions'
import { disposeConnectionResources } from './connectionLifecycle'
import {
    removeRemoteAudioElements,
    type ConnectParams,
    type LiveKitCallbacks,
    type RefLike
} from './liveKitCore'
import { LIVEKIT_SERVER_URL, notifyRoomLeave } from './liveKitApi'
import { openRoomConnection } from './openRoomConnection'
import { createParticipantEventRateLimiter } from './remoteMedia'
import { useAuthenticationExpiry } from './useAuthenticationExpiry'
import type { LiveKitMediaController } from './useLiveKitMedia'
import { withReconnectNoiseSuppression } from '../utils/noiseSuppression'
import type { ParticipantAudioController } from './useParticipantAudio'
import type { RoomDirectoryController } from './useRoomDirectory'
import { wireRoomEvents } from './wireRoomEvents'

interface UseLiveKitConnectionOptions {
    callbacksRef: RefLike<LiveKitCallbacks | undefined>
    media: LiveKitMediaController
    participantAudio: ParticipantAudioController
    directory: RoomDirectoryController
}

export interface LiveKitConnectionController {
    isConnected: boolean
    isConnecting: boolean
    isReconnecting: boolean
    isMuted: boolean
    roomName: string
    roomRef: RefLike<Room | null>
    expireAuthentication(): Promise<void>
    connect(
        username: string,
        channel: number,
        micDeviceId: string,
        micLevel: number,
        customRoomName?: string,
        roomCapability?: string,
        noiseSuppression?: number,
        joinSoundId?: string,
        inputMode?: string
    ): Promise<void>
    disconnect(): Promise<void>
    cancelReconnect(): void
    toggleMute(): Promise<void>
    setMuted(muted: boolean): Promise<void>
    updateInputModeMetadata(inputMode: ParticipantInputMode): Promise<void>
    updateReconnectNoiseSuppression(level: number): void
}

export function useLiveKitConnection({
    callbacksRef,
    media,
    participantAudio,
    directory
}: UseLiveKitConnectionOptions): LiveKitConnectionController {
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [isReconnecting, setIsReconnecting] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [roomName, setRoomName] = useState('')
    const roomRef = useRef<Room | null>(null)
    const reconnectingRef = useRef(false)
    const connectingRef = useRef(false)
    const intentionalDisconnectRef = useRef(false)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const attemptReconnectRef = useRef<(attempt: number) => void>(() => {})
    const connectionGenerationRef = useRef(0)
    const lastConnectParamsRef = useRef<ConnectParams | null>(null)
    const joinSoundRateLimiterRef = useRef(createParticipantEventRateLimiter(3000))

    const resetAuthenticationUi = useCallback(() => {
        removeRemoteAudioElements()
        media.resetMediaState()
        participantAudio.resetSession(true)
        setIsConnecting(false)
        setIsReconnecting(false)
        setIsConnected(false)
        setIsMuted(false)
        setRoomName('')
    }, [media.resetMediaState, participantAudio.resetSession])

    const notifyExpired = useCallback(() => {
        callbacksRef.current?.onAuthExpired?.()
    }, [callbacksRef])

    const expireAuthentication = useAuthenticationExpiry({
        refs: {
            intentionalDisconnect: intentionalDisconnectRef,
            connectionGeneration: connectionGenerationRef,
            lastConnectParams: lastConnectParamsRef,
            connecting: connectingRef,
            reconnecting: reconnectingRef,
            reconnectTimer: reconnectTimerRef,
            room: roomRef
        },
        stopRealtime: directory.stopRealtime,
        releaseMedia: media.releaseMediaPipeline,
        resetUi: resetAuthenticationUi,
        notifyExpired
    })

    const handleRoomDisconnected = useCallback(() => {
        setIsConnected(false)
        setRoomName('')
        participantAudio.resetSession()
        removeRemoteAudioElements()
    }, [participantAudio.resetSession])

    const connect = useCallback(async (
        username: string,
        channel: number,
        micDeviceId: string,
        micLevel: number,
        customRoomName?: string,
        roomCapability?: string,
        noiseSuppression = 100,
        joinSoundId = '',
        inputMode = 'voice'
    ) => {
        if (connectingRef.current) throw new Error('A connection attempt is already in progress')
        connectingRef.current = true
        intentionalDisconnectRef.current = false
        const generation = ++connectionGenerationRef.current
        const params: ConnectParams = {
            username, channel, micDeviceId, micLevel, customRoomName, roomCapability,
            noiseSuppression, joinSoundId, inputMode
        }
        lastConnectParamsRef.current = params
        setIsConnecting(true)

        try {
            const result = await openRoomConnection({
                params,
                generation,
                connectionGenerationRef,
                roomRef,
                media,
                onUnauthorized: expireAuthentication,
                wireEvents: (room) => wireRoomEvents({
                    room,
                    roomRef,
                    callbacksRef,
                    participantAudio,
                    media,
                    fetchChannels: directory.fetchChannels,
                    onDisconnected: handleRoomDisconnected,
                    intentionalDisconnectRef,
                    reconnectingRef,
                    hasReconnectParams: () => lastConnectParamsRef.current !== null,
                    attemptReconnect: () => attemptReconnectRef.current(0),
                    joinSoundRateLimiter: joinSoundRateLimiterRef.current
                })
            })
            setRoomName(result.roomName)
            setIsConnected(true)
            setIsMuted(result.isMuted)
            participantAudio.updatePlayerList(result.room)
            void directory.fetchChannels()

            if (params.joinSoundId) {
                void result.room.localParticipant.publishData(
                    new TextEncoder().encode(`join-sound:${params.joinSoundId}`),
                    { reliable: true }
                ).catch(() => undefined)
            }
        } catch (error) {
            console.error('Failed to connect:', error)
            setIsConnected(false)
            participantAudio.resetSession()
            setRoomName('')
            throw error
        } finally {
            setIsConnecting(false)
            connectingRef.current = false
        }
    }, [
        callbacksRef,
        directory.fetchChannels,
        expireAuthentication,
        handleRoomDisconnected,
        media,
        participantAudio
    ])

    const attemptReconnect = useCallback((attempt: number) => {
        const maxRetries = 5
        const params = lastConnectParamsRef.current
        if (intentionalDisconnectRef.current || !params || attempt >= maxRetries) {
            reconnectingRef.current = false
            setIsReconnecting(false)
            console.warn(`[Reconnect] ${attempt >= maxRetries ? 'Max retries reached' : 'No params'} — giving up`)
            if (attempt >= maxRetries) callbacksRef.current?.onReconnectFailed?.()
            return
        }
        if (reconnectTimerRef.current) return

        reconnectingRef.current = true
        setIsReconnecting(true)
        const delay = Math.min(1000 * 2 ** attempt, 16_000)
        console.log(`[Reconnect] Attempt ${attempt + 1}/${maxRetries} in ${delay}ms`)
        reconnectTimerRef.current = setTimeout(async () => {
            reconnectTimerRef.current = null
            try {
                await connect(
                    params.username, params.channel, params.micDeviceId, params.micLevel,
                    params.customRoomName, params.roomCapability, params.noiseSuppression, '', params.inputMode
                )
                reconnectingRef.current = false
                setIsReconnecting(false)
                console.log('[Reconnect] Success!')
            } catch {
                attemptReconnect(attempt + 1)
            }
        }, delay)
    }, [callbacksRef, connect])
    attemptReconnectRef.current = attemptReconnect

    const cancelReconnect = useCallback(() => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
        reconnectingRef.current = false
        setIsReconnecting(false)
    }, [])

    const disconnect = useCallback(async () => {
        intentionalDisconnectRef.current = true
        connectionGenerationRef.current++
        lastConnectParamsRef.current = null
        cancelReconnect()
        const room = roomRef.current
        roomRef.current = null
        if (room) await disposeConnectionResources({ room }, true)
        await media.releaseMediaPipeline()
        removeRemoteAudioElements()
        media.resetMediaState()
        setIsConnected(false)
        participantAudio.resetSession()
        setIsMuted(false)
        setRoomName('')
        if (room) notifyRoomLeave(room.name)
    }, [cancelReconnect, media.releaseMediaPipeline, media.resetMediaState, participantAudio.resetSession])

    const toggleMute = useCallback(async () => {
        const room = roomRef.current
        if (!room) return
        const nextMuted = !isMuted
        await room.localParticipant.setMicrophoneEnabled(!nextMuted)
        setIsMuted(nextMuted)
        participantAudio.updatePlayerList(room)
    }, [isMuted, participantAudio.updatePlayerList])

    const setMuted = useCallback(async (muted: boolean) => {
        const room = roomRef.current
        if (!room) return
        await room.localParticipant.setMicrophoneEnabled(!muted)
        setIsMuted(muted)
        participantAudio.updatePlayerList(room)
    }, [participantAudio.updatePlayerList])

    const updateInputModeMetadata = useCallback(async (inputMode: ParticipantInputMode) => {
        const room = roomRef.current
        if (!room) return
        const accessToken = window.__gamerScreamAccessToken
        if (!accessToken) return void await expireAuthentication()
        const result = await updateParticipantMode({
            serverUrl: LIVEKIT_SERVER_URL,
            accessToken,
            room: room.name,
            inputMode,
            fetcher: (url, init) => fetch(url, init)
        })
        if (result === 'auth-expired') await expireAuthentication()
    }, [expireAuthentication])

    const updateReconnectNoiseSuppression = useCallback((level: number) => {
        lastConnectParamsRef.current = withReconnectNoiseSuppression(lastConnectParamsRef.current, level)
    }, [])

    useEffect(() => () => {
        intentionalDisconnectRef.current = true
        connectionGenerationRef.current++
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        const room = roomRef.current
        roomRef.current = null
        if (room) void disposeConnectionResources({ room }, true)
        void media.releaseMediaPipeline()
    }, [media.releaseMediaPipeline])

    return {
        isConnected, isConnecting, isReconnecting, isMuted, roomName, roomRef,
        expireAuthentication, connect, disconnect, cancelReconnect, toggleMute, setMuted,
        updateInputModeMetadata, updateReconnectNoiseSuppression
    }
}
