import type { Dispatch, SetStateAction } from 'react'
import { Mic } from 'lucide-react'
import type { AppSettings } from '../../types'
import type { UpdateSetting } from './types'

interface InputModeSettingsProps {
    settings: AppSettings
    updateSetting: UpdateSetting
    recordingKeybind: boolean
    setRecordingKeybind: Dispatch<SetStateAction<boolean>>
    recordingMuteKeybind: boolean
    setRecordingMuteKeybind: Dispatch<SetStateAction<boolean>>
}

function formatKeyName(code: string): string {
    const map: Record<string, string> = {
        Backquote: '~', '`': '~', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
        CapsLock: 'Caps Lock', Tab: 'Tab', Space: 'Space',
        ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', Shift: 'Shift',
        ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', Control: 'Ctrl',
        AltLeft: 'L-Alt', AltRight: 'R-Alt', Alt: 'Alt'
    }
    if (map[code]) return map[code]
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    return code
}

export function InputModeSettings({
    settings,
    updateSetting,
    recordingKeybind,
    setRecordingKeybind,
    recordingMuteKeybind,
    setRecordingMuteKeybind
}: InputModeSettingsProps) {
    return (
        <div className="card">
            <div className="card-title"><Mic size={14} /> Input Mode</div>
            <div className="settings-row">
                <span className="settings-label">Mode</span>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['voice', 'vad', 'ptt'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            className={`ptt-mode-btn ${settings.inputMode === mode ? 'active' : ''}`}
                            onClick={() => updateSetting('inputMode', mode)}
                            aria-pressed={settings.inputMode === mode}
                        >
                            {mode === 'voice' ? 'Voice' : mode === 'vad' ? 'Activity' : 'Push-to-Talk'}
                        </button>
                    ))}
                </div>
            </div>

            {settings.inputMode === 'voice' && (
                <>
                    <div className="settings-row">
                        <span className="settings-label">Mute Toggle Key</span>
                        <label className="toggle">
                            <input
                                type="checkbox"
                                checked={settings.muteToggleEnabled}
                                onChange={(event) => updateSetting('muteToggleEnabled', event.target.checked)}
                            />
                            <span className="toggle-track" />
                        </label>
                    </div>
                    {settings.muteToggleEnabled && (
                        <div className="settings-row">
                            <span className="settings-label">Keybind</span>
                            <button
                                type="button"
                                className={`ptt-keybind-btn ${recordingMuteKeybind ? 'recording' : ''}`}
                                onClick={() => setRecordingMuteKeybind(true)}
                                onKeyDown={(event) => {
                                    if (!recordingMuteKeybind) return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    updateSetting('muteToggleKey', event.code)
                                    setRecordingMuteKeybind(false)
                                }}
                                onBlur={() => setRecordingMuteKeybind(false)}
                            >
                                {recordingMuteKeybind
                                    ? 'Press any key…'
                                    : formatKeyName(settings.muteToggleKey)}
                            </button>
                        </div>
                    )}
                </>
            )}

            {settings.inputMode === 'ptt' && (
                <div className="settings-row">
                    <span className="settings-label">Keybind</span>
                    <button
                        type="button"
                        className={`ptt-keybind-btn ${recordingKeybind ? 'recording' : ''}`}
                        onClick={() => setRecordingKeybind(true)}
                        onKeyDown={(event) => {
                            if (!recordingKeybind) return
                            event.preventDefault()
                            event.stopPropagation()
                            updateSetting('pttKey', event.code)
                            setRecordingKeybind(false)
                        }}
                        onBlur={() => setRecordingKeybind(false)}
                    >
                        {recordingKeybind ? 'Press any key…' : formatKeyName(settings.pttKey)}
                    </button>
                </div>
            )}

            {settings.inputMode === 'vad' && (
                <div className="settings-row" style={{ flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <input
                            type="range"
                            aria-label="Voice activity threshold"
                            min="1"
                            max="50"
                            step={1}
                            value={settings.vadThreshold}
                            onChange={(event) => updateSetting('vadThreshold', Number(event.target.value))}
                            style={{
                                flex: 1,
                                background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${settings.vadThreshold * 2}%, var(--bg-primary) ${settings.vadThreshold * 2}%, var(--bg-primary) 100%)`
                            }}
                        />
                        <span className="settings-value" style={{ minWidth: 40, textAlign: 'right' }}>
                            {settings.vadThreshold}%
                        </span>
                    </div>
                </div>
            )}

            <span className="settings-hint">
                {settings.inputMode === 'voice'
                    ? (settings.muteToggleEnabled
                        ? `Press ${formatKeyName(settings.muteToggleKey)} to toggle mute — works in background`
                        : 'Always transmitting when connected')
                    : settings.inputMode === 'vad'
                        ? 'Auto-mutes when you stop talking — noise gate'
                        : `Hold ${formatKeyName(settings.pttKey)} to talk — works in background`}
            </span>
        </div>
    )
}
