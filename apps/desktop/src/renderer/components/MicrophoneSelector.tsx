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

            <div className="mic-level-row">
                <label className="form-label" style={{ margin: 0 }}>Mic level</label>
                <span className="mic-level-value">{micLevel}%</span>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                step={5}
                value={micLevel}
                onChange={(e) => onMicLevelChange(Number(e.target.value))}
                style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${micLevel}%, var(--bg-input) ${micLevel}%, var(--bg-input) 100%)`
                }}
            />
        </div>
    )
}
