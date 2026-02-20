import { Headphones } from 'lucide-react'
import type { AudioDeviceInfo } from '../types'

interface Props {
    speakers: AudioDeviceInfo[]
    selectedSpeaker: string
    onSelect: (deviceId: string) => void
}

export function SpeakerSelector({ speakers, selectedSpeaker, onSelect }: Props) {
    return (
        <div className="card">
            <h2 className="card-title"><Headphones size={14} /> Speaker</h2>

            <label className="form-label">Output device</label>
            <div className="select-wrapper">
                <select value={selectedSpeaker} onChange={(e) => onSelect(e.target.value)}>
                    {speakers.map((spk) => (
                        <option key={spk.deviceId} value={spk.deviceId}>
                            {spk.label}
                        </option>
                    ))}
                    {speakers.length === 0 && <option value="">No speakers found</option>}
                </select>
            </div>
        </div>
    )
}
