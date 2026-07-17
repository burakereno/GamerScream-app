import { useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import type { ChannelInfo } from '../types'
import { ChannelList } from './session-controls/ChannelList'
import { ChannelPinDialog } from './session-controls/ChannelPinDialog'
import { CreateChannelDialog } from './session-controls/CreateChannelDialog'
import { SessionActions } from './session-controls/SessionActions'
import type {
    SelectedCustomRoom,
    SessionControlsProps
} from './session-controls/types'

export function SessionControls({
    isConnected,
    isConnecting,
    isReconnecting,
    isMuted,
    isVadGateOpen,
    allMuted,
    channel,
    players,
    channels,
    roomName,
    username,
    onConnect,
    onDisconnect,
    onCancelReconnect,
    onToggleMute,
    onToggleMuteAll,
    inputMode,
    muteToggleKey,
    onChannelChange,
    onPlayerVolumeChange,
    onCreateChannel,
    onVerifyPin,
    onClearError
}: SessionControlsProps) {
    const [masterVolume, setMasterVolume] = useState(100)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [pendingChannel, setPendingChannel] = useState<ChannelInfo | null>(null)
    const [selectedCustomRoom, setSelectedCustomRoom] = useState<SelectedCustomRoom | null>(null)

    useEffect(() => {
        if (isConnected) setSelectedCustomRoom(null)
    }, [isConnected])

    useEffect(() => {
        if (!selectedCustomRoom) return
        const stillExists = channels.some(
            (item) => item.isCustom &&
                (item.roomName || item.name) === selectedCustomRoom.roomName
        )
        if (!stillExists) setSelectedCustomRoom(null)
    }, [channels, selectedCustomRoom])

    const handleChannelSelect = (selectedChannel: ChannelInfo) => {
        if (isConnected) return

        if (selectedChannel.isCustom) {
            if (selectedChannel.hasPin) {
                setPendingChannel(selectedChannel)
            } else {
                setSelectedCustomRoom({
                    roomName: selectedChannel.roomName || selectedChannel.name
                })
            }
            return
        }

        if (selectedChannel.channel !== undefined) {
            onChannelChange(selectedChannel.channel)
            setSelectedCustomRoom(null)
            onClearError?.()
        }
    }

    const handleCreatedChannel = (selection: SelectedCustomRoom) => {
        setSelectedCustomRoom(selection)
        onConnect(selection.roomName, selection.roomCapability)
    }

    return (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 className="card-title">
                <Radio size={14} aria-hidden="true" /> Session
            </h2>

            <SessionActions
                isConnected={isConnected}
                isConnecting={isConnecting}
                isReconnecting={isReconnecting}
                isMuted={isMuted}
                isVadGateOpen={isVadGateOpen}
                inputMode={inputMode}
                muteToggleKey={muteToggleKey}
                selectedCustomRoom={selectedCustomRoom}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onCancelReconnect={onCancelReconnect}
                onToggleMute={onToggleMute}
            />

            <ChannelList
                channels={channels}
                channel={channel}
                isConnected={isConnected}
                roomName={roomName}
                players={players}
                allMuted={allMuted}
                masterVolume={masterVolume}
                selectedCustomRoom={selectedCustomRoom}
                onMasterVolumeChange={setMasterVolume}
                onToggleMuteAll={onToggleMuteAll}
                onPlayerVolumeChange={onPlayerVolumeChange}
                onChannelSelect={handleChannelSelect}
                onCreateChannel={() => setShowCreateDialog(true)}
            />

            {showCreateDialog && (
                <CreateChannelDialog
                    username={username}
                    onCreateChannel={onCreateChannel}
                    onCreated={handleCreatedChannel}
                    onClose={() => setShowCreateDialog(false)}
                />
            )}

            {pendingChannel && (
                <ChannelPinDialog
                    channel={pendingChannel}
                    onVerifyPin={onVerifyPin}
                    onSelected={setSelectedCustomRoom}
                    onClose={() => setPendingChannel(null)}
                />
            )}
        </div>
    )
}
