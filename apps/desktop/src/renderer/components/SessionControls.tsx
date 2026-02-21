import { useState } from 'react'
import { Plug, Unplug, Mic, MicOff, Volume2, VolumeX, Hash, Lock, Plus, X } from 'lucide-react'
import type { ConnectedPlayer, ChannelInfo } from '../types'

interface Props {
    isConnected: boolean
    isConnecting: boolean
    isMuted: boolean
    allMuted: boolean
    channel: number
    autoConnect: boolean
    players: ConnectedPlayer[]
    channels: ChannelInfo[]
    roomName: string
    username: string
    onConnect: (customRoomName?: string, pin?: string) => void
    onDisconnect: () => void
    onToggleMute: () => void
    onToggleMuteAll: () => void
    onChannelChange: (channel: number) => void
    onAutoConnectChange: (autoConnect: boolean) => void
    onPlayerVolumeChange: (identity: string, volume: number) => void
    onCreateChannel: (name: string, pin: string, createdBy: string) => Promise<any>
    onVerifyPin: (roomName: string, pin: string) => Promise<boolean>
    onClearError?: () => void
}

// [P3-#14] Extracted reusable PlayerList component
function PlayerList({
    players,
    masterVolume,
    allMuted,
    onMasterVolumeChange,
    onToggleMuteAll,
    onPlayerVolumeChange
}: {
    players: ConnectedPlayer[]
    masterVolume: number
    allMuted: boolean
    onMasterVolumeChange: (vol: number) => void
    onToggleMuteAll: () => void
    onPlayerVolumeChange: (identity: string, volume: number) => void
}) {
    const remoteCount = players.filter(p => !p.isLocal).length

    return (
        <div className="channel-players">
            {remoteCount > 0 && (
                <div className="master-volume">
                    <Volume2 size={13} style={{ flexShrink: 0, color: 'var(--text-secondary)' }} />
                    <span className="master-volume-label">All</span>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step={5}
                        value={masterVolume}
                        onChange={(e) => {
                            const vol = Number(e.target.value)
                            onMasterVolumeChange(vol)
                            players.filter(p => !p.isLocal).forEach(p => onPlayerVolumeChange(p.identity, vol))
                        }}
                        className="player-volume-slider"
                        style={{
                            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${masterVolume}%, var(--bg-primary) ${masterVolume}%, var(--bg-primary) 100%)`
                        }}
                    />
                    <span className="player-volume-value">{masterVolume}%</span>
                    <button
                        className={`master-mute-btn ${allMuted ? 'active' : ''}`}
                        onClick={onToggleMuteAll}
                        title={allMuted ? 'Unmute All' : 'Mute All'}
                    >
                        {allMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                </div>
            )}

            {players.map((player) => (
                <div key={player.identity} className="player-row">
                    <div className="player-info">
                        <div
                            className={`player-dot ${player.isSpeaking ? 'speaking' : player.isMuted ? 'muted' : 'online'}`}
                        />
                        <span className="player-name">
                            {player.displayName}
                            {player.isLocal && ' (you)'}
                        </span>
                        {!player.isLocal && player.isMuted && (
                            <MicOff size={12} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />
                        )}
                    </div>
                    {!player.isLocal && (
                        <div className="player-volume">
                            <Volume2 size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step={5}
                                value={player.volume}
                                onChange={(e) => onPlayerVolumeChange(player.identity, Number(e.target.value))}
                                className="player-volume-slider"
                                style={{
                                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${player.volume}%, var(--bg-primary) ${player.volume}%, var(--bg-primary) 100%)`
                                }}
                            />
                            <span className="player-volume-value">{player.volume}%</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

export function SessionControls({
    isConnected,
    isConnecting,
    isMuted,
    allMuted,
    channel,
    autoConnect,
    players,
    channels,
    roomName,
    username,
    onConnect,
    onDisconnect,
    onToggleMute,
    onToggleMuteAll,
    onChannelChange,
    onAutoConnectChange,
    onPlayerVolumeChange,
    onCreateChannel,
    onVerifyPin,
    onClearError
}: Props) {
    const [masterVolume, setMasterVolume] = useState(100)

    // Create channel dialog
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [newChannelName, setNewChannelName] = useState('')
    const [newChannelPin, setNewChannelPin] = useState('')
    const [createError, setCreateError] = useState('')
    const [isCreating, setIsCreating] = useState(false)

    // PIN entry dialog
    const [showPinDialog, setShowPinDialog] = useState(false)
    const [pinInput, setPinInput] = useState('')
    const [pinError, setPinError] = useState('')
    const [pendingChannel, setPendingChannel] = useState<ChannelInfo | null>(null)

    const defaultChannels = channels.filter(ch => !ch.isCustom)
    const customChannels = channels.filter(ch => ch.isCustom)

    const handleCreateChannel = async () => {
        if (!newChannelName.trim()) {
            setCreateError('Channel name required')
            return
        }
        setIsCreating(true)
        setCreateError('')
        try {
            const result = await onCreateChannel(newChannelName.trim(), newChannelPin, username)
            setShowCreateDialog(false)
            setNewChannelName('')
            setNewChannelPin('')
            // Auto-join the created channel (with PIN if set)
            onConnect(result.roomName, newChannelPin || undefined)
        } catch (err: any) {
            setCreateError(err.message || 'Failed to create')
        } finally {
            setIsCreating(false)
        }
    }

    // [P2-#8] Fixed: clicking default channel now also triggers connect
    const handleChannelClick = (ch: ChannelInfo) => {
        if (isConnected) return
        if (ch.isCustom && ch.hasPin) {
            // Show PIN dialog
            setPendingChannel(ch)
            setPinInput('')
            setPinError('')
            setShowPinDialog(true)
        } else if (ch.isCustom) {
            // Custom channel without PIN — connect directly
            onConnect(ch.roomName || ch.name)
        } else {
            // Default channel — just select it, user presses Connect to join
            if (ch.channel !== undefined) {
                onChannelChange(ch.channel)
                onClearError?.()
            }
        }
    }

    const handlePinSubmit = async () => {
        if (!pendingChannel) return
        const actualRoomName = pendingChannel.roomName || pendingChannel.name
        const valid = await onVerifyPin(actualRoomName, pinInput)
        if (valid) {
            setShowPinDialog(false)
            onConnect(actualRoomName, pinInput)
        } else {
            setPinError('Wrong PIN')
        }
    }

    return (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 className="card-title"><Plug size={14} /> Session</h2>

            <div className="controls-row">
                <button
                    className={`btn ${isConnected ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => isConnected ? onDisconnect() : onConnect()}
                    disabled={isConnecting}
                >
                    {isConnecting ? 'Connecting...' :
                        isConnected ? <><Unplug size={14} /> Disconnect</> :
                            <><Plug size={14} /> Connect</>
                    }
                </button>

                <button
                    className={`btn ${isMuted ? 'btn-muted' : 'btn-mute'}`}
                    onClick={onToggleMute}
                    disabled={!isConnected}
                >
                    {isMuted ? <><MicOff size={14} /> Unmute</> : <><Mic size={14} /> Mute</>}
                </button>

                <div className="controls-spacer" />

                <label className="auto-connect-label">
                    <div className="toggle">
                        <input
                            type="checkbox"
                            checked={autoConnect}
                            onChange={(e) => onAutoConnectChange(e.target.checked)}
                        />
                        <span className="toggle-track" />
                    </div>
                    Auto-connect
                </label>
            </div>

            {/* Channel list */}
            <div className="channel-list" style={{ flex: 1 }}>

                {/* Default channels */}
                {defaultChannels.map((ch) => {
                    const chNum = ch.channel ?? 0
                    const isActive = channel === chNum
                    const isCurrent = isConnected && roomName === `ch-${chNum}`
                    return (
                        <div key={chNum} className="channel-item-wrapper">
                            <button
                                className={`channel-item ${isActive ? 'channel-item-active' : ''} ${isCurrent ? 'channel-item-connected' : ''}`}
                                onClick={() => handleChannelClick(ch)}
                                disabled={isConnected && !isCurrent}
                            >
                                <span className="channel-name">
                                    <Hash size={13} style={{ opacity: 0.5 }} />
                                    Channel {chNum}
                                </span>
                                {ch.playerCount > 0 && (
                                    <span className="channel-badge">
                                        {ch.playerCount}
                                    </span>
                                )}
                            </button>

                            {isCurrent && players.length > 0 && (
                                <PlayerList
                                    players={players}
                                    masterVolume={masterVolume}
                                    allMuted={allMuted}
                                    onMasterVolumeChange={setMasterVolume}
                                    onToggleMuteAll={onToggleMuteAll}
                                    onPlayerVolumeChange={onPlayerVolumeChange}
                                />
                            )}
                        </div>
                    )
                })}

                {/* Custom channels */}
                {customChannels.length > 0 && (
                    <div className="custom-channels-divider">
                        <span>Custom Channels</span>
                    </div>
                )}

                {customChannels.map((ch) => {
                    const customRoomName = ch.roomName || ch.name
                    const isCurrent = isConnected && roomName === customRoomName
                    return (
                        <div key={customRoomName} className="channel-item-wrapper">
                            <button
                                className={`channel-item ${isCurrent ? 'channel-item-connected' : ''}`}
                                onClick={() => handleChannelClick(ch)}
                                disabled={isConnected && !isCurrent}
                            >
                                <span className="channel-name">
                                    <Hash size={13} style={{ opacity: 0.5 }} />
                                    {ch.name}
                                </span>
                                <span className="channel-icons">
                                    {ch.hasPin && <Lock size={12} className="channel-lock-icon" />}
                                    {ch.playerCount > 0 && (
                                        <span className="channel-badge">{ch.playerCount}</span>
                                    )}
                                </span>
                            </button>

                            {isCurrent && players.length > 0 && (
                                <PlayerList
                                    players={players}
                                    masterVolume={masterVolume}
                                    allMuted={allMuted}
                                    onMasterVolumeChange={setMasterVolume}
                                    onToggleMuteAll={onToggleMuteAll}
                                    onPlayerVolumeChange={onPlayerVolumeChange}
                                />
                            )}
                        </div>
                    )
                })}

                {/* Divider + Create channel button at bottom */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />
                <button
                    className="create-channel-btn"
                    onClick={() => { setShowCreateDialog(true); setCreateError(''); setNewChannelName(''); setNewChannelPin('') }}
                    disabled={isConnected}
                >
                    <Plus size={14} />
                    Create Channel
                </button>
            </div>

            {/* Create channel dialog */}
            {showCreateDialog && (
                <div className="dialog-overlay" onClick={() => setShowCreateDialog(false)}>
                    <div className="dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="dialog-header">
                            <h3>Create Channel</h3>
                            <button className="dialog-close" onClick={() => setShowCreateDialog(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="dialog-body">
                            <label className="dialog-label">
                                Channel Name
                                <input
                                    type="text"
                                    className="dialog-input"
                                    placeholder="e.g. Team Alpha"
                                    value={newChannelName}
                                    onChange={(e) => setNewChannelName(e.target.value.slice(0, 20))}
                                    maxLength={20}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()}
                                />
                            </label>
                            <label className="dialog-label">
                                PIN (optional)
                                <input
                                    type="text"
                                    className="dialog-input"
                                    placeholder="1 2 3 4"
                                    value={newChannelPin}
                                    onChange={(e) => setNewChannelPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    maxLength={4}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()}
                                />
                                <span className="dialog-hint">Max 4 digits. Leave empty for open channel.</span>
                            </label>
                            {createError && <div className="dialog-error">{createError}</div>}
                        </div>
                        <div className="dialog-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCreateDialog(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleCreateChannel} disabled={isCreating}>
                                {isCreating ? 'Creating...' : 'Create & Join'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PIN entry dialog */}
            {showPinDialog && (
                <div className="dialog-overlay" onClick={() => setShowPinDialog(false)}>
                    <div className="dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="dialog-header">
                            <h3><Lock size={14} /> Enter PIN</h3>
                            <button className="dialog-close" onClick={() => setShowPinDialog(false)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="dialog-body">
                            <p className="dialog-text">
                                <strong>{pendingChannel?.name}</strong> requires a PIN to join.
                            </p>
                            <input
                                type="text"
                                className="dialog-input pin-input-center"
                                placeholder="• • • •"
                                value={pinInput}
                                onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError('') }}
                                maxLength={4}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                            />
                            {pinError && <div className="dialog-error">{pinError}</div>}
                        </div>
                        <div className="dialog-footer">
                            <button className="btn btn-secondary" onClick={() => setShowPinDialog(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handlePinSubmit}>Join</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
