import { Mic, MicOff, Plug, Unplug } from 'lucide-react'
import type { SelectedCustomRoom, SessionControlsProps } from './types'

interface SessionActionsProps {
    isConnected: boolean
    isConnecting: boolean
    isReconnecting: boolean
    isMuted: boolean
    isVadGateOpen: boolean
    inputMode: SessionControlsProps['inputMode']
    muteToggleKey?: string
    selectedCustomRoom: SelectedCustomRoom | null
    onConnect: SessionControlsProps['onConnect']
    onDisconnect: SessionControlsProps['onDisconnect']
    onCancelReconnect: SessionControlsProps['onCancelReconnect']
    onToggleMute: SessionControlsProps['onToggleMute']
}

function formatMuteKey(code: string): string {
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    const map: Record<string, string> = {
        CapsLock: 'CAPS', Tab: 'TAB', Space: 'SPC',
        ShiftLeft: 'L⇧', ShiftRight: 'R⇧',
        ControlLeft: 'L⌃', ControlRight: 'R⌃',
        Backquote: '~', Backslash: '\\'
    }
    return map[code] || code
}

export function SessionActions({
    isConnected,
    isConnecting,
    isReconnecting,
    isMuted,
    isVadGateOpen,
    inputMode,
    muteToggleKey,
    selectedCustomRoom,
    onConnect,
    onDisconnect,
    onCancelReconnect,
    onToggleMute
}: SessionActionsProps) {
    const handleConnection = () => {
        if (isReconnecting) {
            onCancelReconnect()
        } else if (isConnected) {
            onDisconnect()
        } else if (selectedCustomRoom) {
            onConnect(selectedCustomRoom.roomName, selectedCustomRoom.roomCapability)
        } else {
            onConnect()
        }
    }

    return (
        <div className="controls-row">
            <button
                type="button"
                className={`btn ${isConnected ? 'btn-disconnect' : 'btn-connect'}`}
                onClick={handleConnection}
                disabled={isConnecting}
                aria-busy={isConnecting}
            >
                {isReconnecting ? 'Cancel reconnect' :
                    isConnecting ? 'Connecting…' :
                        isConnected ? <><Unplug size={14} aria-hidden="true" /> Disconnect</> :
                            <><Plug size={14} aria-hidden="true" /> Connect</>}
            </button>

            {inputMode === 'vad' && isConnected ? (
                <div
                    className="mute-btn-wrapper has-tooltip"
                    data-tooltip="Voice activity is controlled automatically"
                >
                    <div
                        className={`btn ${isVadGateOpen ? 'btn-vad-open' : 'btn-vad-closed'}`}
                        role="status"
                        aria-live="polite"
                    >
                        {isVadGateOpen
                            ? <><Mic size={14} aria-hidden="true" /> Live</>
                            : <><MicOff size={14} aria-hidden="true" /> Gate</>}
                    </div>
                </div>
            ) : (
                <div
                    className={`mute-btn-wrapper ${inputMode === 'ptt' ? 'has-tooltip' : ''}`}
                    data-tooltip={inputMode === 'ptt' ? 'Controlled by your push-to-talk key' : ''}
                >
                    <button
                        type="button"
                        className={`btn ${isMuted ? 'btn-muted' : 'btn-mute'}`}
                        onClick={() => {
                            if (!isConnected || inputMode !== 'voice') return
                            onToggleMute()
                        }}
                        disabled={!isConnected || inputMode !== 'voice'}
                        aria-pressed={isMuted}
                    >
                        {isMuted
                            ? <><MicOff size={14} aria-hidden="true" /> Unmute</>
                            : <><Mic size={14} aria-hidden="true" /> Mute</>}
                        {muteToggleKey && inputMode === 'voice' && (
                            <span className="mute-key-badge">{formatMuteKey(muteToggleKey)}</span>
                        )}
                    </button>
                </div>
            )}
        </div>
    )
}
