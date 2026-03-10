import { useState, useCallback, useRef, useEffect } from 'react'
import {
    Room,
    RoomEvent,
    Track,
    RemoteParticipant,
    RemoteTrackPublication
} from 'livekit-client'
import {
    RnnoiseWorkletNode,
    loadRnnoise
} from '@sapphi-red/web-noise-suppressor'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import type { ConnectedPlayer, ChannelInfo } from '../types'
import { playJoinSoundById, setJoinSoundSpeaker } from '../utils/joinSounds'

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
    onAuthExpired?: () => void
}

export function useLiveKit(callbacks?: LiveKitCallbacks, enabled: boolean = true) {
    const [isConnected, setIsConnected] = useState(false)
    const [isConnecting, setIsConnecting] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [players, setPlayers] = useState<ConnectedPlayer[]>([])
    const [roomName, setRoomName] = useState('')
    const defaultChannels: ChannelInfo[] = [1, 2, 3, 4, 5].map(ch => ({ channel: ch, name: `ch-${ch}`, playerCount: 0 }))
    const [channels, setChannels] = useState<ChannelInfo[]>(defaultChannels)
    const [allMuted, setAllMuted] = useState(false)
    const roomRef = useRef<Room | null>(null)
    const gainNodeRef = useRef<GainNode | null>(null)
    const analyserNodeRef = useRef<AnalyserNode | null>(null)
    const micLevelRef = useRef(100) // Store current mic level for VAD gate restore
    const vadActiveRef = useRef(false) // Track if VAD is actively controlling gain
    const [isVadGateOpen, setIsVadGateOpen] = useState(true)
    const audioContextRef = useRef<AudioContext | null>(null)
    const micStreamRef = useRef<MediaStream | null>(null)
    const rnnoiseNodeRef = useRef<RnnoiseWorkletNode | null>(null)
    const wetGainRef = useRef<GainNode | null>(null)
    const dryGainRef = useRef<GainNode | null>(null)
    const speakerIdRef = useRef<string>('') // Track selected output device for setSinkId
    const [rnnoiseActive, setRnnoiseActive] = useState<boolean | null>(null) // null=not tried, true=active, false=failed
    const callbacksRef = useRef(callbacks)
    callbacksRef.current = callbacks

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
        if (!enabled) return
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms`, {
                headers: getAuthHeaders()
            })
            if (res.ok) {
                const data = await res.json()
                setChannels(data.rooms || [])
            } else if (res.status === 401) {
                // [P2-1] Token expired — notify parent to show PIN screen
                callbacksRef.current?.onAuthExpired?.()
            }
        } catch {
            // silently fail
        }
    }, [enabled])

    // [P2-6] Visibility-aware polling — pause when window is hidden
    // Only start polling when enabled (accessVerified) to prevent race condition
    useEffect(() => {
        if (!enabled) return
        fetchChannels()
        let interval: ReturnType<typeof setInterval> | null = setInterval(fetchChannels, 2000)

        const handleVisibility = () => {
            if (document.hidden) {
                if (interval) { clearInterval(interval); interval = null }
            } else {
                fetchChannels()
                if (!interval) interval = setInterval(fetchChannels, 2000)
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)

        return () => {
            if (interval) clearInterval(interval)
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [fetchChannels, enabled])

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
        async (username: string, channel: number, micDeviceId: string, micLevel: number, customRoomName?: string, pin?: string, noiseSuppression: number = 100, joinSoundId: string = '') => {
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
                    // [P2-10] Use stable ref for callbacks
                    callbacksRef.current?.onParticipantJoin?.(p.name || p.identity)
                })
                room.on(RoomEvent.ParticipantDisconnected, (p) => {
                    updatePlayerList(room)
                    fetchChannels()
                    callbacksRef.current?.onParticipantLeave?.(p.name || p.identity)
                })
                room.on(RoomEvent.TrackMuted, () => updatePlayerList(room))
                room.on(RoomEvent.TrackUnmuted, () => updatePlayerList(room))
                room.on(RoomEvent.ActiveSpeakersChanged, () => updatePlayerList(room))
                room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
                    // [P2-7] Remove existing audio element before appending new one
                    if (track.kind === Track.Kind.Audio) {
                        const existingEl = document.getElementById(`audio-${participant.identity}`)
                        if (existingEl) existingEl.remove()
                        const el = track.attach()
                        el.id = `audio-${participant.identity}`
                        // Route to selected speaker device
                        if (speakerIdRef.current && typeof (el as any).setSinkId === 'function') {
                            (el as any).setSinkId(speakerIdRef.current).catch(() => { /* device unavailable */ })
                        }
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
                // DataChannel: receive join sound ID from other participants
                room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
                    if (!participant) return // ignore server-sent data
                    try {
                        const msg = new TextDecoder().decode(payload)
                        if (msg.startsWith('join-sound:')) {
                            const soundId = msg.replace('join-sound:', '')
                            playJoinSoundById(soundId)
                        }
                    } catch { /* ignore malformed data */ }
                })

                await room.connect(livekitUrl, token)

                // Capture mic manually with gain control + noise suppression
                try {
                    const micConstraints: MediaTrackConstraints = {
                        echoCancellation: true,
                        noiseSuppression: noiseSuppression === 0, // Use browser builtin when RNNoise is off
                        autoGainControl: false, // We control gain manually
                        sampleRate: { ideal: 48000 } as any, // RNNoise prefers 48kHz, ideal allows fallback
                    }
                    if (micDeviceId) micConstraints.deviceId = { exact: micDeviceId }

                    const micStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints })
                    micStreamRef.current = micStream // Store for cleanup
                    const ctx = new AudioContext({ sampleRate: 48000 })
                    const source = ctx.createMediaStreamSource(micStream)
                    const gainNode = ctx.createGain()
                    gainNode.gain.value = micLevel / 100
                    micLevelRef.current = micLevel

                    // AnalyserNode for VAD raw level measurement (before gain)
                    const analyser = ctx.createAnalyser()
                    analyser.fftSize = 256
                    analyserNodeRef.current = analyser

                    // Force mono pipeline — RNNoise outputs mono, stereo dest causes left-only audio
                    const dest = ctx.createMediaStreamDestination()
                    dest.channelCount = 1
                    dest.channelCountMode = 'explicit'

                    // Connect analyser to source for raw level monitoring
                    source.connect(analyser)

                    if (noiseSuppression > 0) {
                        // Build wet/dry mix pipeline with RNNoise
                        try {
                            await ctx.audioWorklet.addModule(rnnoiseWorkletUrl)
                            const wasmBinary = await loadRnnoise({
                                url: rnnoiseWasmUrl,
                                simdUrl: rnnoiseSimdWasmUrl
                            })
                            const rnnoiseNode = new RnnoiseWorkletNode(ctx, {
                                maxChannels: 1,
                                wasmBinary
                            })
                            rnnoiseNodeRef.current = rnnoiseNode

                            // Compensate for RNNoise volume reduction
                            const compensationGain = ctx.createGain()
                            compensationGain.gain.value = 1.5

                            // Wet path (noise-suppressed)
                            const wetGain = ctx.createGain()
                            wetGain.gain.value = noiseSuppression / 100
                            wetGainRef.current = wetGain

                            // Dry path (original)
                            const dryGain = ctx.createGain()
                            dryGain.gain.value = 1 - (noiseSuppression / 100)
                            dryGainRef.current = dryGain

                            // Merger to combine wet + dry
                            const merger = ctx.createGain()

                            source.connect(rnnoiseNode).connect(compensationGain).connect(wetGain).connect(merger)
                            source.connect(dryGain).connect(merger)
                            merger.connect(gainNode).connect(dest)

                            setRnnoiseActive(true)
                            console.log(`RNNoise enabled at ${noiseSuppression}%`)
                        } catch (rnnoiseErr) {
                            console.warn('RNNoise init failed, using basic pipeline:', rnnoiseErr)
                            setRnnoiseActive(false)
                            source.connect(gainNode).connect(dest)
                        }
                    } else {
                        // No noise suppression — basic pipeline
                        source.connect(gainNode).connect(dest)
                    }

                    gainNodeRef.current = gainNode
                    audioContextRef.current = ctx

                    // Publish the processed track
                    const processedTrack = dest.stream.getAudioTracks()[0]
                    await room.localParticipant.publishTrack(processedTrack, {
                        source: Track.Source.Microphone
                    })
                } catch (e) {
                    console.warn('Mic gain pipeline failed, falling back:', e)
                    await room.localParticipant.setMicrophoneEnabled(true)
                }

                roomRef.current = room
                setRoomName(channelName)
                setIsConnected(true)
                setIsMuted(false)
                updatePlayerList(room)
                fetchChannels()

                // Send join sound to other participants via DataChannel
                if (joinSoundId) {
                    const encoder = new TextEncoder()
                    room.localParticipant.publishData(
                        encoder.encode(`join-sound:${joinSoundId}`),
                        { reliable: true }
                    ).catch(() => { /* ignore if no one else in room */ })
                }
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
        // Clean up RNNoise node
        if (rnnoiseNodeRef.current) {
            rnnoiseNodeRef.current.destroy()
            rnnoiseNodeRef.current = null
        }
        wetGainRef.current = null
        dryGainRef.current = null
        // [AUDIT-3] Stop mic stream tracks to release microphone
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop())
            micStreamRef.current = null
        }
        // [P2-8] Clean up AudioContext
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { })
            audioContextRef.current = null
            gainNodeRef.current = null
            analyserNodeRef.current = null
        }
        vadActiveRef.current = false
        setIsVadGateOpen(true)
        setRnnoiseActive(null)
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

    // Direct mute/unmute control for PTT
    const setMuted = useCallback(async (muted: boolean) => {
        if (!roomRef.current) return
        await roomRef.current.localParticipant.setMicrophoneEnabled(!muted)
        setIsMuted(muted)
        updatePlayerList(roomRef.current)
    }, [updatePlayerList])

    const setMicGain = useCallback((level: number) => {
        micLevelRef.current = level
        // Don't override gain if VAD gate is actively controlling it
        if (gainNodeRef.current && !vadActiveRef.current) {
            gainNodeRef.current.gain.value = level / 100
        }
    }, [])

    // Adjust noise suppression wet/dry mix in real-time
    const setNoiseSuppressionLevel = useCallback((level: number) => {
        if (wetGainRef.current && dryGainRef.current) {
            wetGainRef.current.gain.value = level / 100
            dryGainRef.current.gain.value = 1 - (level / 100)
        }
    }, [])

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

    // Get raw microphone input level for VAD (reads from AnalyserNode, works even when gain=0)
    const getRawMicLevel = useCallback((): number => {
        if (!analyserNodeRef.current) return 0
        const data = new Uint8Array(analyserNodeRef.current.frequencyBinCount)
        analyserNodeRef.current.getByteTimeDomainData(data)
        // Calculate RMS level from waveform data
        let sum = 0
        for (let i = 0; i < data.length; i++) {
            const val = (data[i] - 128) / 128
            sum += val * val
        }
        return Math.sqrt(sum / data.length) // 0-1 range
    }, [])

    // VAD gate control: set gain to 0 (closed) or restore to micLevel (open)
    const setVadGate = useCallback((open: boolean) => {
        if (!gainNodeRef.current) return
        gainNodeRef.current.gain.value = open ? micLevelRef.current / 100 : 0
        setIsVadGateOpen(open)
    }, [])

    // Let App.tsx tell the hook when VAD mode is active
    const setVadActive = useCallback((active: boolean) => {
        vadActiveRef.current = active
    }, [])

    // Switch audio output device for all existing audio elements
    const setSpeakerDevice = useCallback((deviceId: string) => {
        speakerIdRef.current = deviceId
        // Re-route all existing participant audio elements
        document.querySelectorAll<HTMLAudioElement>('audio[id^="audio-"]').forEach((el) => {
            if (typeof (el as any).setSinkId === 'function') {
                (el as any).setSinkId(deviceId).catch(() => { /* device unavailable */ })
            }
        })
    }, [])

    return {
        isConnected,
        isConnecting,
        isMuted,
        isVadGateOpen,
        allMuted,
        players,
        roomName,
        channels,
        rnnoiseActive,
        connect,
        disconnect,
        toggleMute,
        setMuted,
        toggleMuteAll,
        setPlayerVolume,
        fetchChannels,
        createChannel,
        verifyPin,
        setMicGain,
        setNoiseSuppressionLevel,
        getRawMicLevel,
        setVadGate,
        setVadActive,
        setSpeakerDevice
    }
}
