import { Mic } from 'lucide-react'
import type { AudioDeviceInfo } from '../types'
import { useMicrophoneLevelMonitor } from '../hooks/useMicrophoneLevelMonitor'

interface Props {
    microphones: AudioDeviceInfo[]
    selectedMic: string
    onSelect: (deviceId: string) => void
    micLevel: number
    onMicLevelChange: (level: number) => void
}

export function MicrophoneSelector({ microphones, selectedMic, onSelect, micLevel, onMicLevelChange }: Props) {
    const { displayLevel: liveLevel } = useMicrophoneLevelMonitor(selectedMic, true, true)

    return (
        <div className="card">
            <h2 className="card-title"><Mic size={14} aria-hidden="true" /> Microphone</h2>

            <label className="form-label" htmlFor="microphone-device">Input device</label>
            <div className="select-wrapper">
                <select id="microphone-device" value={selectedMic} onChange={(e) => onSelect(e.target.value)}>
                    {microphones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                            {mic.label}
                        </option>
                    ))}
                    {microphones.length === 0 && <option value="">No microphones found</option>}
                </select>
            </div>

            {/* Live mic level visualizer */}
            <div
                className="mic-level-bar"
                style={{ marginTop: 8 }}
                role="meter"
                aria-label="Live microphone level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={liveLevel}
            >
                <div
                    className="mic-level-fill"
                    style={{ width: `${liveLevel}%` }}
                />
            </div>

            <div className="settings-row" style={{ flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <input
                        type="range"
                        aria-label="Microphone level"
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
