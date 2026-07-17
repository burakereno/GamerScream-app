import type { ChannelInfo, ConnectedPlayer } from '../../types'

export interface CreateChannelResult {
    roomName: string
    roomCapability?: string
}

export interface SelectedCustomRoom {
    roomName: string
    roomCapability?: string
}

export interface SessionControlsProps {
    isConnected: boolean
    isConnecting: boolean
    isReconnecting: boolean
    isMuted: boolean
    isVadGateOpen: boolean
    allMuted: boolean
    channel: number
    players: ConnectedPlayer[]
    channels: ChannelInfo[]
    roomName: string
    username: string
    onConnect: (customRoomName?: string, roomCapability?: string) => void
    onDisconnect: () => void
    onCancelReconnect: () => void
    onToggleMute: () => void
    inputMode: 'voice' | 'ptt' | 'vad'
    muteToggleKey?: string
    onToggleMuteAll: () => void
    onChannelChange: (channel: number) => void
    onPlayerVolumeChange: (identity: string, volume: number) => void
    onCreateChannel: (
        name: string,
        pin: string,
        createdBy: string
    ) => Promise<CreateChannelResult>
    onVerifyPin: (roomName: string, pin: string) => Promise<string | null>
    onClearError?: () => void
}

export type ChannelSelectionHandler = (channel: ChannelInfo) => void
