import { useCallback, useRef, useState } from 'react'
import { Room, Track } from 'livekit-client'
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import {
    initialMicrophoneState,
    microphoneCaptureConstraints,
    type InitialMicrophoneState
} from '../utils/microphoneSafety'
import { disposeConnectionResources } from './connectionLifecycle'
import { publishInitialMicrophoneTrack } from './mediaPublishing'
import type { RefLike } from './liveKitCore'
import { applyNoiseSuppressionMix } from '../utils/noiseSuppression'

interface CaptureMicrophoneOptions {
    micDeviceId: string
    micLevel: number
    noiseSuppression: number
    inputMode: string
    initialState?: InitialMicrophoneState
    isCurrent(): boolean
}

export interface LiveKitMediaController {
    rnnoiseActive: boolean | null
    isVadGateOpen: boolean
    speakerIdRef: RefLike<string>
    releaseMediaPipeline(): Promise<void>
    captureAndPublish(room: Room, options: CaptureMicrophoneOptions): Promise<boolean>
    resetMediaState(): void
    setMicGain(level: number): void
    setNoiseSuppressionLevel(level: number): void
    getRawMicLevel(): number
    setVadGate(open: boolean): void
    setVadActive(active: boolean): void
    setSpeakerDevice(deviceId: string): void
}

export function useLiveKitMedia(): LiveKitMediaController {
    const gainNodeRef = useRef<GainNode | null>(null)
    const vadAnalyserNodeRef = useRef<AnalyserNode | null>(null)
    const micLevelRef = useRef(100)
    const vadActiveRef = useRef(false)
    const audioContextRef = useRef<AudioContext | null>(null)
    const micStreamRef = useRef<MediaStream | null>(null)
    const rnnoiseNodeRef = useRef<RnnoiseWorkletNode | null>(null)
    const rnnoiseAvailableRef = useRef(false)
    const wetGainRef = useRef<GainNode | null>(null)
    const dryGainRef = useRef<GainNode | null>(null)
    const speakerIdRef = useRef('')
    const [rnnoiseActive, setRnnoiseActive] = useState<boolean | null>(null)
    const [isVadGateOpen, setIsVadGateOpen] = useState(true)

    const releaseMediaPipeline = useCallback(async () => {
        const resources = {
            rnnoiseNode: rnnoiseNodeRef.current,
            micStream: micStreamRef.current,
            audioContext: audioContextRef.current
        }
        rnnoiseNodeRef.current = null
        rnnoiseAvailableRef.current = false
        micStreamRef.current = null
        audioContextRef.current = null
        wetGainRef.current = null
        dryGainRef.current = null
        gainNodeRef.current = null
        vadAnalyserNodeRef.current = null
        await disposeConnectionResources(resources, false)
    }, [])

    const captureAndPublish = useCallback(async (room: Room, options: CaptureMicrophoneOptions): Promise<boolean> => {
        const { micDeviceId, micLevel, noiseSuppression, inputMode, isCurrent } = options
        const initialState = options.initialState ?? initialMicrophoneState(inputMode, micLevel)
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: microphoneCaptureConstraints(micDeviceId)
            })
            if (!isCurrent()) {
                micStream.getTracks().forEach((track) => track.stop())
                throw new Error('Connection attempt was cancelled')
            }
            micStreamRef.current = micStream
            const context = new AudioContext({ sampleRate: 48000 })
            const source = context.createMediaStreamSource(micStream)
            const gainNode = context.createGain()
            gainNode.gain.value = initialState.gain
            micLevelRef.current = micLevel

            // VAD keeps using the filtered signal so background noise does not open its gate.
            const vadAnalyser = context.createAnalyser()
            vadAnalyser.fftSize = 256
            vadAnalyserNodeRef.current = vadAnalyser
            const destination = context.createMediaStreamDestination()
            destination.channelCount = 1
            destination.channelCountMode = 'explicit'

            if (noiseSuppression > 0) {
                try {
                    await context.audioWorklet.addModule(rnnoiseWorkletUrl)
                    const wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })
                    const rnnoiseNode = new RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary })
                    rnnoiseNodeRef.current = rnnoiseNode
                    rnnoiseAvailableRef.current = true
                    const compensationGain = context.createGain()
                    compensationGain.gain.value = 2.5
                    const wetGain = context.createGain()
                    wetGainRef.current = wetGain
                    const dryGain = context.createGain()
                    dryGainRef.current = dryGain
                    applyNoiseSuppressionMix(wetGain, dryGain, noiseSuppression)
                    rnnoiseNode.onprocessorerror = () => {
                        if (rnnoiseNodeRef.current !== rnnoiseNode) return
                        rnnoiseAvailableRef.current = false
                        applyNoiseSuppressionMix(wetGain, dryGain, 0, false)
                        setRnnoiseActive(false)
                        console.warn('RNNoise processor failed, switched to unfiltered audio')
                    }
                    const merger = context.createGain()

                    source.connect(rnnoiseNode).connect(compensationGain)
                    compensationGain.connect(vadAnalyser)
                    compensationGain.connect(wetGain).connect(merger)
                    source.connect(dryGain).connect(merger)
                    merger.connect(gainNode).connect(destination)
                    setRnnoiseActive(true)
                    console.log(`RNNoise enabled at ${noiseSuppression}%`)
                } catch (error) {
                    console.warn('RNNoise init failed, using unfiltered audio pipeline:', error)
                    setRnnoiseActive(false)
                    source.connect(vadAnalyser)
                    source.connect(gainNode).connect(destination)
                }
            } else {
                source.connect(vadAnalyser)
                source.connect(gainNode).connect(destination)
            }

            gainNodeRef.current = gainNode
            audioContextRef.current = context
            const processedTrack = destination.stream.getAudioTracks()[0]
            await publishInitialMicrophoneTrack<MediaStreamTrack, Track.Source>(
                room.localParticipant,
                processedTrack,
                initialState.enabled,
                Track.Source.Microphone
            )
            return !initialState.enabled
        } catch (error) {
            if (!isCurrent()) throw error
            console.warn('Mic gain pipeline failed, falling back:', error)
            await releaseMediaPipeline()
            if (inputMode !== 'voice') {
                throw new Error('Audio processing could not start for the selected input mode')
            }
            await room.localParticipant.setMicrophoneEnabled(true)
            return false
        }
    }, [releaseMediaPipeline])

    const resetMediaState = useCallback(() => {
        vadActiveRef.current = false
        setIsVadGateOpen(true)
        setRnnoiseActive(null)
    }, [])

    const setMicGain = useCallback((level: number) => {
        micLevelRef.current = level
        const gainNode = gainNodeRef.current
        if (!gainNode) return
        if (!vadActiveRef.current || gainNode.gain.value > 0) gainNode.gain.value = level / 100
    }, [])

    const setNoiseSuppressionLevel = useCallback((level: number) => {
        if (!wetGainRef.current || !dryGainRef.current) return
        applyNoiseSuppressionMix(
            wetGainRef.current,
            dryGainRef.current,
            level,
            rnnoiseAvailableRef.current
        )
    }, [])

    const getRawMicLevel = useCallback((): number => {
        const analyser = vadAnalyserNodeRef.current
        if (!analyser) return 0
        const data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const sample of data) {
            const value = (sample - 128) / 128
            sum += value * value
        }
        return Math.sqrt(sum / data.length)
    }, [])

    const setVadGate = useCallback((open: boolean) => {
        if (!gainNodeRef.current) return
        gainNodeRef.current.gain.value = open ? micLevelRef.current / 100 : 0
        setIsVadGateOpen(open)
    }, [])

    const setVadActive = useCallback((active: boolean) => {
        vadActiveRef.current = active
    }, [])

    const setSpeakerDevice = useCallback((deviceId: string) => {
        speakerIdRef.current = deviceId
        document.querySelectorAll<HTMLAudioElement>('audio[id^="audio-"]').forEach((element) => {
            if (typeof element.setSinkId === 'function') {
                void element.setSinkId(deviceId).catch(() => undefined)
            }
        })
    }, [])

    return {
        rnnoiseActive,
        isVadGateOpen,
        speakerIdRef,
        releaseMediaPipeline,
        captureAndPublish,
        resetMediaState,
        setMicGain,
        setNoiseSuppressionLevel,
        getRawMicLevel,
        setVadGate,
        setVadActive,
        setSpeakerDevice
    }
}
