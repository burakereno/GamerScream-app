import { Room } from 'livekit-client'
import { initialMicrophoneState } from '../utils/microphoneSafety'
import { disposeConnectionResources } from './connectionLifecycle'
import { deviceIdPromise, removeRemoteAudioElements, type ConnectParams, type RefLike } from './liveKitCore'
import { requestPresenceRefresh, requestRoomToken } from './liveKitApi'
import type { LiveKitMediaController } from './useLiveKitMedia'

interface OpenRoomConnectionOptions {
    params: ConnectParams
    generation: number
    connectionGenerationRef: RefLike<number>
    roomRef: RefLike<Room | null>
    media: LiveKitMediaController
    onUnauthorized(): Promise<void>
    wireEvents(room: Room): void
}

export interface OpenRoomConnectionResult {
    room: Room
    roomName: string
    isMuted: boolean
}

export async function openRoomConnection({
    params,
    generation,
    connectionGenerationRef,
    roomRef,
    media,
    onUnauthorized,
    wireEvents
}: OpenRoomConnectionOptions): Promise<OpenRoomConnectionResult> {
    const initialState = initialMicrophoneState(params.inputMode, params.micLevel)
    let ownedRoom: Room | null = null
    const isCurrent = () => generation === connectionGenerationRef.current &&
        (!ownedRoom || roomRef.current === ownedRoom)

    try {
        const previousRoom = roomRef.current
        roomRef.current = null
        if (previousRoom) await disposeConnectionResources({ room: previousRoom }, true)
        await media.releaseMediaPipeline()
        removeRemoteAudioElements()

        const deviceId = await deviceIdPromise
        if (generation !== connectionGenerationRef.current) throw new Error('Connection attempt was cancelled')
        const response = await requestRoomToken(params, deviceId)
        if (!response.ok) {
            if (response.status === 401) await onUnauthorized()
            throw new Error(`Failed to get token: ${response.statusText}`)
        }

        const { token, livekitUrl } = await response.json()
        if (generation !== connectionGenerationRef.current) throw new Error('Connection attempt was cancelled')
        const room = new Room({
            audioCaptureDefaults: { deviceId: params.micDeviceId || undefined }
        })
        ownedRoom = room
        roomRef.current = room
        wireEvents(room)

        await room.connect(livekitUrl, token)
        if (!isCurrent()) throw new Error('Connection attempt was cancelled')
        const isMuted = await media.captureAndPublish(room, {
            micDeviceId: params.micDeviceId,
            micLevel: params.micLevel,
            noiseSuppression: params.noiseSuppression,
            inputMode: params.inputMode,
            initialState,
            isCurrent
        })
        if (!isCurrent()) throw new Error('Connection attempt was cancelled')
        void requestPresenceRefresh(room.name).catch(() => undefined)

        return {
            room,
            roomName: params.customRoomName || `ch-${params.channel}`,
            isMuted
        }
    } catch (error) {
        if (ownedRoom && roomRef.current === ownedRoom) {
            roomRef.current = null
            await disposeConnectionResources({ room: ownedRoom }, true)
        }
        await media.releaseMediaPipeline()
        removeRemoteAudioElements()
        throw error
    }
}
