import { memo } from 'react'
import Avatar from 'boring-avatars'
import { MicOff, Volume2, VolumeX } from 'lucide-react'
import type { ConnectedPlayer } from '../../types'

const AVATAR_COLORS = ['#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#22c55e']

interface PlayerRowProps {
    player: ConnectedPlayer
    allMuted: boolean
    onPlayerVolumeChange: (identity: string, volume: number) => void
}

const PlayerRow = memo(function PlayerRow({
    player,
    allMuted,
    onPlayerVolumeChange
}: PlayerRowProps) {
    const soundwaveState = player.isMuted ? 'muted' : player.isSpeaking ? 'active' : ''

    return (
        <div className="player-row">
            <div className="player-info">
                <div className={`soundwave ${soundwaveState}`}>
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
                    <MicOff
                        size={12}
                        aria-hidden="true"
                        style={{ color: 'var(--text-muted)', marginLeft: 4 }}
                    />
                )}
            </div>
            {!player.isLocal && (
                <div className="player-volume">
                    <Volume2
                        size={12}
                        aria-hidden="true"
                        style={{ flexShrink: 0, color: 'var(--text-muted)' }}
                    />
                    <input
                        type="range"
                        aria-label={`${player.displayName} volume`}
                        min="0"
                        max="100"
                        step={5}
                        value={player.volume}
                        disabled={allMuted}
                        onChange={(event) => onPlayerVolumeChange(player.identity, Number(event.target.value))}
                        className="player-volume-slider"
                        style={{
                            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${player.volume}%, var(--bg-primary) ${player.volume}%, var(--bg-primary) 100%)`
                        }}
                    />
                    <span className="player-volume-value">{player.volume}%</span>
                </div>
            )}
        </div>
    )
})

interface PlayerListProps {
    players: ConnectedPlayer[]
    masterVolume: number
    allMuted: boolean
    onMasterVolumeChange: (volume: number) => void
    onToggleMuteAll: () => void
    onPlayerVolumeChange: (identity: string, volume: number) => void
}

export function PlayerList({
    players,
    masterVolume,
    allMuted,
    onMasterVolumeChange,
    onToggleMuteAll,
    onPlayerVolumeChange
}: PlayerListProps) {
    const remoteCount = players.filter((player) => !player.isLocal).length

    return (
        <div className="channel-players">
            {remoteCount > 0 && (
                <div className="master-volume">
                    <Volume2
                        size={13}
                        aria-hidden="true"
                        style={{ flexShrink: 0, color: 'var(--text-secondary)' }}
                    />
                    <span className="master-volume-label">All</span>
                    <input
                        type="range"
                        aria-label="All participants volume"
                        min="0"
                        max="100"
                        step={5}
                        value={masterVolume}
                        disabled={allMuted}
                        onChange={(event) => {
                            const volume = Number(event.target.value)
                            onMasterVolumeChange(volume)
                            players
                                .filter((player) => !player.isLocal)
                                .forEach((player) => onPlayerVolumeChange(player.identity, volume))
                        }}
                        className="player-volume-slider"
                        style={{
                            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${masterVolume}%, var(--bg-primary) ${masterVolume}%, var(--bg-primary) 100%)`
                        }}
                    />
                    <span className="player-volume-value">{masterVolume}%</span>
                    <button
                        type="button"
                        className={`master-mute-btn ${allMuted ? 'active' : ''}`}
                        onClick={onToggleMuteAll}
                        aria-label={allMuted ? 'Unmute all participants' : 'Mute all participants'}
                        aria-pressed={allMuted}
                    >
                        {allMuted
                            ? <VolumeX size={14} aria-hidden="true" />
                            : <Volume2 size={14} aria-hidden="true" />}
                    </button>
                </div>
            )}

            {players.map((player) => (
                <PlayerRow
                    key={player.identity}
                    player={player}
                    allMuted={allMuted}
                    onPlayerVolumeChange={onPlayerVolumeChange}
                />
            ))}
        </div>
    )
}
