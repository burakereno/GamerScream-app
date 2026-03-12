import { useState, useRef, useCallback } from 'react'
import { Plug, Unplug, Mic, MicOff, Volume2, VolumeX, Hash, Lock, Plus, X } from 'lucide-react'
import Avatar from 'boring-avatars'
import type { ConnectedPlayer, ChannelInfo } from '../types'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

interface Props {
    isConnected: boolean
    isConnecting: boolean
    isReconnecting: boolean
    isMuted: boolean
    isVadGateOpen: boolean
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
    inputMode: 'voice' | 'ptt' | 'vad'
    onToggleMuteAll: () => void
    onChannelChange: (channel: number) => void
    onAutoConnectChange: (autoConnect: boolean) => void
    onPlayerVolumeChange: (identity: string, volume: number) => void
    onCreateChannel: (name: string, pin: string, createdBy: string) => Promise<any>
    onVerifyPin: (roomName: string, pin: string) => Promise<boolean>
    onClearError?: () => void
}

// Avatar color palette matching app theme
const AVATAR_COLORS = ['#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#22c55e']

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
                        <div className={`soundwave ${player.isSpeaking ? 'active' : player.isMuted ? 'muted' : ''}`}>
                            <span /><span /><span /><span />
                        </div>
                        <Avatar
                            name={player.displayName}
                            variant="beam"
                            size={22}
                            colors={AVATAR_COLORS}
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
    isReconnecting,
    isMuted,
    isVadGateOpen,
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
    inputMode,
    onChannelChange,
    onAutoConnectChange,
    onPlayerVolumeChange,
    onCreateChannel,
    onVerifyPin,
    onClearError
}: Props) {
    const [masterVolume, setMasterVolume] = useState(100)

    // Secret channel: triple-click "Session" title
    const secretClickCount = useRef(0)
    const secretClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const handleTitleClick = () => {
        if (isConnected || isConnecting) return
        secretClickCount.current++
        if (secretClickTimer.current) clearTimeout(secretClickTimer.current)
        secretClickTimer.current = setTimeout(() => { secretClickCount.current = 0 }, 1000)
        if (secretClickCount.current >= 3) {
            secretClickCount.current = 0
            onConnect('secret-room')
        }
    }

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

    // Track selected custom channel (for Connect button)
    const [selectedCustomRoom, setSelectedCustomRoom] = useState<{ roomName: string; pin?: string } | null>(null)

    // Channel click = SELECT only, never auto-connect
    const handleChannelClick = (ch: ChannelInfo) => {
        if (isConnected) return
        if (ch.isCustom) {
            if (ch.hasPin) {
                // Show PIN dialog — will store PIN for Connect button
                setPendingChannel(ch)
                setPinInput('')
                setPinError('')
                setShowPinDialog(true)
            } else {
                // Select custom channel (no PIN)
                setSelectedCustomRoom({ roomName: ch.roomName || ch.name })
            }
        } else if (ch.channel !== undefined) {
            // Select default channel
            onChannelChange(ch.channel)
            setSelectedCustomRoom(null)
            onClearError?.()
        }
    }

    const handlePinSubmit = async () => {
        if (!pendingChannel) return
        const actualRoomName = pendingChannel.roomName || pendingChannel.name
        const valid = await onVerifyPin(actualRoomName, pinInput)
        if (valid) {
            setShowPinDialog(false)
            // Store verified PIN — user must click Connect to join
            setSelectedCustomRoom({ roomName: actualRoomName, pin: pinInput })
        } else {
            setPinError('Wrong PIN')
        }
    }

    // Hover-based player names (on-demand fetch, not from SSE)
    const [hoverPlayers, setHoverPlayers] = useState<Record<string, string[]>>({})
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleChannelHover = useCallback((roomNameToFetch: string, playerCount: number) => {
        if (playerCount === 0) return
        hoverTimerRef.current = setTimeout(async () => {
            try {
                const token = (window as any).__gamerScreamAccessToken || ''
                const res = await fetch(`${SERVER_URL}/api/room-players/${roomNameToFetch}`, {
                    headers: { 'x-access-token': token }
                })
                if (res.ok) {
                    const data = await res.json()
                    setHoverPlayers(prev => ({ ...prev, [roomNameToFetch]: data.players }))
                }
            } catch { /* ignore */ }
        }, 300)
    }, [])

    const handleChannelLeave = useCallback(() => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        setHoverPlayers({})
    }, [])

    return (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 className="card-title" onClick={handleTitleClick} style={{ userSelect: 'none' }}><Plug size={14} /> Session</h2>

            <div className="controls-row">
                <button
                    className={`btn ${isConnected ? 'btn-disconnect' : 'btn-connect'}`}
                    onClick={() => {
                        if (isConnected) {
                            onDisconnect()
                        } else if (selectedCustomRoom) {
                            onConnect(selectedCustomRoom.roomName, selectedCustomRoom.pin)
                            setSelectedCustomRoom(null)
                        } else {
                            onConnect()
                        }
                    }}
                    disabled={isConnecting || isReconnecting}
                >
                    {isReconnecting ? 'Reconnecting...' :
                        isConnecting ? 'Connecting...' :
                            isConnected ? <><Unplug size={14} /> Disconnect</> :
                                <><Plug size={14} /> Connect</>
                    }
                </button>

                {/* Mute button — VAD mode shows gate state */}
                {inputMode === 'vad' && isConnected ? (
                    <div className={`mute-btn-wrapper has-tooltip`}
                        data-tooltip="Activity modunda otomatik kontrol">
                        <button
                            className={`btn ${isVadGateOpen ? 'btn-vad-open' : 'btn-vad-closed'}`}
                        >
                            {isVadGateOpen ? <><Mic size={14} /> Live</> : <><MicOff size={14} /> Gate</>}
                        </button>
                    </div>
                ) : (
                    <div className={`mute-btn-wrapper ${inputMode === 'ptt' ? 'has-tooltip' : ''}`}
                        data-tooltip={inputMode === 'ptt' ? 'PTT modunda tuş ile kontrol' : ''}>
                        <button
                            className={`btn ${isMuted ? 'btn-muted' : 'btn-mute'}`}
                            onClick={() => {
                                if (!isConnected || inputMode !== 'voice') return
                                onToggleMute()
                            }}
                            style={!isConnected || inputMode !== 'voice' ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                        >
                            {isMuted ? <><MicOff size={14} /> Unmute</> : <><Mic size={14} /> Mute</>}
                        </button>
                    </div>
                )}

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
                                onMouseEnter={() => handleChannelHover(`ch-${chNum}`, ch.playerCount)}
                                onMouseLeave={handleChannelLeave}
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
                                {hoverPlayers[`ch-${chNum}`] && hoverPlayers[`ch-${chNum}`].length > 0 && (
                                    <div className="channel-players-tooltip">
                                        {hoverPlayers[`ch-${chNum}`].map((name, i) => (
                                            <div key={i} className="channel-players-tooltip-item"><Avatar size={16} name={name} variant="beam" /> {name}</div>
                                        ))}
                                    </div>
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
                    const isSelected = !isConnected && selectedCustomRoom?.roomName === customRoomName
                    return (
                        <div key={customRoomName} className="channel-item-wrapper">
                            <button
                                className={`channel-item ${isSelected ? 'channel-item-active' : ''} ${isCurrent ? 'channel-item-connected' : ''}`}
                                onClick={() => handleChannelClick(ch)}
                                disabled={isConnected && !isCurrent}
                                onMouseEnter={() => handleChannelHover(customRoomName, ch.playerCount)}
                                onMouseLeave={handleChannelLeave}
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
                                {hoverPlayers[customRoomName] && hoverPlayers[customRoomName].length > 0 && (
                                    <div className="channel-players-tooltip">
                                        {hoverPlayers[customRoomName].map((name: string, i: number) => (
                                            <div key={i} className="channel-players-tooltip-item"><Avatar size={16} name={name} variant="beam" /> {name}</div>
                                        ))}
                                    </div>
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

                {/* Create channel button at bottom */}
                <button
                    className="create-channel-btn"
                    onClick={() => { setShowCreateDialog(true); setCreateError(''); setNewChannelName(''); setNewChannelPin('') }}
                    disabled={isConnected}
                >
                    <Plus size={14} />
                    Create Channel
                </button>

                {/* Secret room player list */}
                {isConnected && roomName === 'secret-room' && players.length > 0 && (
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
