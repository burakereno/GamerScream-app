import Avatar from 'boring-avatars'
import { Hash, Lock, Plus } from 'lucide-react'
import { useMemo } from 'react'
import type { ChannelInfo, ConnectedPlayer } from '../../types'
import { PlayerList } from './PlayerList'
import type { ChannelSelectionHandler, SelectedCustomRoom } from './types'
import { useChannelHover } from './useChannelHover'

interface ChannelListProps {
    channels: ChannelInfo[]
    channel: number
    isConnected: boolean
    roomName: string
    players: ConnectedPlayer[]
    allMuted: boolean
    masterVolume: number
    selectedCustomRoom: SelectedCustomRoom | null
    onMasterVolumeChange: (volume: number) => void
    onToggleMuteAll: () => void
    onPlayerVolumeChange: (identity: string, volume: number) => void
    onChannelSelect: ChannelSelectionHandler
    onCreateChannel: () => void
}

export function ChannelList({
    channels,
    channel,
    isConnected,
    roomName,
    players,
    allMuted,
    masterVolume,
    selectedCustomRoom,
    onMasterVolumeChange,
    onToggleMuteAll,
    onPlayerVolumeChange,
    onChannelSelect,
    onCreateChannel
}: ChannelListProps) {
    const defaultChannels = channels.filter((item) => !item.isCustom)
    const customChannels = channels.filter((item) => item.isCustom)
    const hoverPlayerCounts = useMemo(() => Object.fromEntries(channels.map((item) => {
        const itemRoomName = item.isCustom
            ? item.roomName || item.name
            : `ch-${item.channel ?? 0}`
        const isCurrent = isConnected && roomName === itemRoomName
        return [itemRoomName, isCurrent ? players.length : item.playerCount]
    })), [channels, isConnected, players.length, roomName])
    const { hoverPlayers, handleChannelHover, handleChannelLeave } = useChannelHover(hoverPlayerCounts)

    const renderPlayers = () => (
        <PlayerList
            players={players}
            masterVolume={masterVolume}
            allMuted={allMuted}
            onMasterVolumeChange={onMasterVolumeChange}
            onToggleMuteAll={onToggleMuteAll}
            onPlayerVolumeChange={onPlayerVolumeChange}
        />
    )

    return (
        <div className="channel-list" style={{ flex: 1 }}>
            {defaultChannels.map((item) => {
                const channelNumber = item.channel ?? 0
                const itemRoomName = `ch-${channelNumber}`
                const isActive = !selectedCustomRoom && channel === channelNumber
                const isCurrent = isConnected && roomName === itemRoomName
                const names = hoverPlayers[itemRoomName]
                const displayedPlayerCount = isCurrent ? players.length : item.playerCount

                return (
                    <div key={channelNumber} className="channel-item-wrapper">
                        <button
                            type="button"
                            className={`channel-item ${isActive ? 'channel-item-active' : ''} ${isCurrent ? 'channel-item-connected' : ''}`}
                            onClick={() => onChannelSelect(item)}
                            disabled={isConnected && !isCurrent}
                            aria-pressed={isActive || isCurrent}
                            onMouseEnter={() => handleChannelHover(itemRoomName, displayedPlayerCount)}
                            onMouseLeave={handleChannelLeave}
                        >
                            <span className="channel-name">
                                <Hash size={13} aria-hidden="true" style={{ opacity: 0.5 }} />
                                Channel {channelNumber}
                            </span>
                            {displayedPlayerCount > 0 ? (
                                <span className="channel-badge">{displayedPlayerCount}</span>
                            ) : null}
                            {!isCurrent && names && names.length > 0 && (
                                <div className="channel-players-tooltip" role="tooltip">
                                    {names.map((name, index) => (
                                        <div key={index} className="channel-players-tooltip-item">
                                            <Avatar size={16} name={name} variant="beam" /> {name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </button>

                        {isCurrent && players.length > 0 && renderPlayers()}
                    </div>
                )
            })}

            {customChannels.length > 0 && (
                <div className="custom-channels-divider">
                    <span>Custom Channels</span>
                </div>
            )}

            {customChannels.map((item) => {
                const customRoomName = item.roomName || item.name
                const isCurrent = isConnected && roomName === customRoomName
                const isSelected = !isConnected && selectedCustomRoom?.roomName === customRoomName
                const names = hoverPlayers[customRoomName]
                const displayedPlayerCount = isCurrent ? players.length : item.playerCount

                return (
                    <div key={customRoomName} className="channel-item-wrapper">
                        <button
                            type="button"
                            className={`channel-item ${isSelected ? 'channel-item-active' : ''} ${isCurrent ? 'channel-item-connected' : ''}`}
                            onClick={() => onChannelSelect(item)}
                            disabled={isConnected && !isCurrent}
                            aria-pressed={isSelected || isCurrent}
                            onMouseEnter={() => handleChannelHover(customRoomName, displayedPlayerCount)}
                            onMouseLeave={handleChannelLeave}
                        >
                            <span className="channel-name">
                                <Hash size={13} aria-hidden="true" style={{ opacity: 0.5 }} />
                                {item.name}
                            </span>
                            <span className="channel-icons">
                                {item.hasPin && (
                                    <Lock size={12} aria-hidden="true" className="channel-lock-icon" />
                                )}
                                {displayedPlayerCount > 0 ? (
                                    <span className="channel-badge">{displayedPlayerCount}</span>
                                ) : null}
                            </span>
                            {!isCurrent && names && names.length > 0 && (
                                <div className="channel-players-tooltip" role="tooltip">
                                    {names.map((name, index) => (
                                        <div key={index} className="channel-players-tooltip-item">
                                            <Avatar size={16} name={name} variant="beam" /> {name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </button>

                        {isCurrent && players.length > 0 && renderPlayers()}
                    </div>
                )
            })}

            <button
                type="button"
                className="create-channel-btn"
                onClick={onCreateChannel}
                disabled={isConnected}
            >
                <Plus size={14} aria-hidden="true" />
                Create Channel
            </button>
        </div>
    )
}
