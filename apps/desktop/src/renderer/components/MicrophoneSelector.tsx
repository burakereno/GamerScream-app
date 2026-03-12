import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic } from 'lucide-react'
import type { AudioDeviceInfo } from '../types'

interface Props {
    microphones: AudioDeviceInfo[]
    selectedMic: string
    onSelect: (deviceId: string) => void
    micLevel: number
    onMicLevelChange: (level: number) => void
}

export function MicrophoneSelector({ microphones, selectedMic, onSelect, micLevel, onMicLevelChange }: Props) {
    const [liveLevel, setLiveLevel] = useState(0)
    const streamRef = useRef<MediaStream | null>(null)
    const ctxRef = useRef<AudioContext | null>(null)
    const rafRef = useRef<number>(0)

    const stopMonitoring = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
        if (ctxRef.current) {
            ctxRef.current.close().catch(() => {})
            ctxRef.current = null
        }
        setLiveLevel(0)
    }, [])

    useEffect(() => {
        if (!selectedMic) return

        let cancelled = false
        const start = async () => {
            stopMonitoring()
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: selectedMic } }
                })
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

                const ctx = new AudioContext()
                const source = ctx.createMediaStreamSource(stream)
                const analyser = ctx.createAnalyser()
                analyser.fftSize = 256
                analyser.smoothingTimeConstant = 0.5
                source.connect(analyser)

                streamRef.current = stream
                ctxRef.current = ctx

                const data = new Uint8Array(analyser.frequencyBinCount)
                const poll = () => {
                    if (cancelled) return
                    analyser.getByteFrequencyData(data)
                    // RMS-like average of frequency data
                    let sum = 0
                    for (let i = 0; i < data.length; i++) sum += data[i]
                    const avg = sum / data.length
                    const pct = Math.min(100, Math.round((avg / 128) * 100))
                    setLiveLevel(pct)
                    rafRef.current = requestAnimationFrame(poll)
                }
                poll()
            } catch {
                // No mic access
            }
        }
        start()

        return () => {
            cancelled = true
            stopMonitoring()
        }
    }, [selectedMic, stopMonitoring])

    return (
        <div className="card">
            <h2 className="card-title"><Mic size={14} /> Microphone</h2>

            <label className="form-label">Input device</label>
            <div className="select-wrapper">
                <select value={selectedMic} onChange={(e) => onSelect(e.target.value)}>
                    {microphones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                            {mic.label}
                        </option>
                    ))}
                    {microphones.length === 0 && <option value="">No microphones found</option>}
                </select>
            </div>

            {/* Live mic level visualizer */}
            <div className="mic-level-bar" style={{ marginTop: 8 }}>
                <div
                    className="mic-level-fill"
                    style={{ width: `${liveLevel}%` }}
                />
            </div>

            <div className="settings-row" style={{ flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step={5}
                        value={micLevel}
                        onChange={(e) => onMicLevelChange(Number(e.target.value))}
                        style={{
                            flex: 1,
                            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${micLevel}%, var(--bg-primary) ${micLevel}%, var(--bg-primary) 100%)`
                        }}
                    />
                    <span className="settings-value" style={{ minWidth: 40, textAlign: 'right' }}>{micLevel}%</span>
                </div>
            </div>
        </div>
    )
}
