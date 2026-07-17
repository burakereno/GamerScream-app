import type { Dispatch, SetStateAction } from 'react'
import { Bell, Music2, ShieldCheck, User } from 'lucide-react'
import type { AppSettings, AudioDeviceInfo } from '../../types'
import { JOIN_SOUNDS, playJoinSoundById } from '../../utils/joinSounds'
import { AdminPanel } from '../AdminPanel'
import { MicrophoneSelector } from '../MicrophoneSelector'
import { SpeakerSelector } from '../SpeakerSelector'
import { InputModeSettings } from './InputModeSettings'
import type { UpdateSetting } from './types'

interface SettingsViewProps {
    settings: AppSettings
    updateSetting: UpdateSetting
    microphones: AudioDeviceInfo[]
    selectedMic: string
    micLevel: number
    onMicSelect: (deviceId: string) => void
    onMicLevelChange: (level: number) => void
    speakers: AudioDeviceInfo[]
    selectedSpeaker: string
    onSpeakerSelect: (deviceId: string) => void
    onNoiseSuppressionChange: (level: number) => void
    onChangeName: () => void
    appVersion: string
    showAdmin: boolean
    onOpenAdmin: () => void
    onCloseAdmin: () => void
    recordingKeybind: boolean
    setRecordingKeybind: Dispatch<SetStateAction<boolean>>
    recordingMuteKeybind: boolean
    setRecordingMuteKeybind: Dispatch<SetStateAction<boolean>>
}

export function SettingsView({
    settings,
    updateSetting,
    microphones,
    selectedMic,
    micLevel,
    onMicSelect,
    onMicLevelChange,
    speakers,
    selectedSpeaker,
    onSpeakerSelect,
    onNoiseSuppressionChange,
    onChangeName,
    appVersion,
    showAdmin,
    onOpenAdmin,
    onCloseAdmin,
    recordingKeybind,
    setRecordingKeybind,
    recordingMuteKeybind,
    setRecordingMuteKeybind
}: SettingsViewProps) {
    return (
        <div id="settings-panel" className="settings-tab" role="tabpanel" aria-label="Settings">
            <MicrophoneSelector
                microphones={microphones}
                selectedMic={selectedMic}
                onSelect={onMicSelect}
                micLevel={micLevel}
                onMicLevelChange={onMicLevelChange}
            />

            <SpeakerSelector
                speakers={speakers}
                selectedSpeaker={selectedSpeaker}
                onSelect={onSpeakerSelect}
            />

            <div className="card">
                <div className="card-title"><ShieldCheck size={14} /> Noise Suppression</div>
                <div className="settings-row" style={{ flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <input
                            type="range"
                            aria-label="Noise suppression level"
                            min="0"
                            max="100"
                            step={5}
                            value={settings.noiseSuppression}
                            onChange={(event) => onNoiseSuppressionChange(Number(event.target.value))}
                            style={{
                                flex: 1,
                                background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${settings.noiseSuppression}%, var(--bg-primary) ${settings.noiseSuppression}%, var(--bg-primary) 100%)`
                            }}
                        />
                        <span className="settings-value" style={{ minWidth: 40, textAlign: 'right' }}>
                            {settings.noiseSuppression}%
                        </span>
                    </div>
                    <span className="settings-hint">
                        {settings.noiseSuppression === 0 ? 'Off — noise suppression disabled' :
                            settings.noiseSuppression < 50 ? 'Low — light background noise reduction' :
                                settings.noiseSuppression < 80 ? 'Medium — balanced noise reduction' :
                                    'High — aggressive noise cancellation'}
                    </span>
                </div>
            </div>

            <InputModeSettings
                settings={settings}
                updateSetting={updateSetting}
                recordingKeybind={recordingKeybind}
                setRecordingKeybind={setRecordingKeybind}
                recordingMuteKeybind={recordingMuteKeybind}
                setRecordingMuteKeybind={setRecordingMuteKeybind}
            />

            <div className="card">
                <div className="card-title"><Bell size={14} /> Join Sound</div>
                <div className="join-sound-grid">
                    {JOIN_SOUNDS.map((sound) => (
                        <button
                            type="button"
                            key={sound.id}
                            className={`join-sound-btn ${settings.joinSoundId === sound.id ? 'active' : ''}`}
                            aria-pressed={settings.joinSoundId === sound.id}
                            onClick={() => {
                                updateSetting('joinSoundId', sound.id)
                                playJoinSoundById(sound.id)
                            }}
                        >
                            <Music2 size={13} aria-hidden="true" /> {sound.name}
                        </button>
                    ))}
                </div>
                <span className="settings-hint">
                    “{JOIN_SOUNDS.find((sound) => sound.id === settings.joinSoundId)?.name}” plays for others when you join
                </span>
            </div>

            <div className="card">
                <div className="card-title"><User size={14} /> Account</div>
                <div className="settings-row">
                    <span className="settings-label">Signed in as</span>
                    <span className="settings-value">{settings.username}</span>
                </div>
                <button type="button" className="settings-signout" onClick={onChangeName}>
                    Change Name
                </button>
            </div>

            <div className="settings-version">
                {appVersion && (
                    <button
                        type="button"
                        className="version-badge"
                        aria-label={`Open admin panel. GamerScream version ${appVersion}`}
                        onClick={onOpenAdmin}
                    >
                        v{appVersion}
                    </button>
                )}
            </div>

            {showAdmin && <AdminPanel onClose={onCloseAdmin} />}
        </div>
    )
}
