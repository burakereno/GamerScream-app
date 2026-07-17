import { useCallback, useEffect, useRef, useState } from 'react'
import { readFrequencyLevel } from '../utils/audioLevels'

const SAMPLE_INTERVAL_MS = 50

export function useMicrophoneLevelMonitor(
    deviceId: string,
    enabled: boolean,
    renderLevel: boolean
) {
    const levelRef = useRef(0)
    const [displayLevel, setDisplayLevel] = useState(0)
    const getLevel = useCallback(() => levelRef.current, [])

    useEffect(() => {
        levelRef.current = 0
        if (renderLevel) setDisplayLevel(0)
        if (!enabled || !deviceId) return

        let cancelled = false
        let stream: MediaStream | null = null
        let context: AudioContext | null = null
        let interval: ReturnType<typeof setInterval> | null = null

        const start = async () => {
            try {
                const nextStream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: deviceId } }
                })
                if (cancelled) {
                    nextStream.getTracks().forEach((track) => track.stop())
                    return
                }

                stream = nextStream
                context = new AudioContext()
                if (context.state === 'suspended') await context.resume()
                const source = context.createMediaStreamSource(stream)
                const analyser = context.createAnalyser()
                analyser.fftSize = 256
                analyser.smoothingTimeConstant = 0.5
                source.connect(analyser)
                const data = new Uint8Array(analyser.frequencyBinCount)
                const sample = () => {
                    const level = readFrequencyLevel(analyser, data)
                    levelRef.current = level
                    if (renderLevel) {
                        const percent = Math.round(level * 100)
                        setDisplayLevel((current) => current === percent ? current : percent)
                    }
                }
                sample()
                interval = setInterval(sample, SAMPLE_INTERVAL_MS)
            } catch {
                levelRef.current = 0
            }
        }
        void start()

        return () => {
            cancelled = true
            if (interval) clearInterval(interval)
            stream?.getTracks().forEach((track) => track.stop())
            void context?.close().catch(() => undefined)
        }
    }, [deviceId, enabled, renderLevel])

    return { displayLevel, getLevel }
}
