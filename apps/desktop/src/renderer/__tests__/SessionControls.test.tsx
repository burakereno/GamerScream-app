import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionControls } from '../components/SessionControls'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
    Plug: () => <span data-testid="icon-plug" />,
    Unplug: () => <span data-testid="icon-unplug" />,
    Mic: () => <span data-testid="icon-mic" />,
    MicOff: () => <span data-testid="icon-micoff" />,
    Volume2: () => <span data-testid="icon-volume" />,
    VolumeX: () => <span data-testid="icon-volumex" />,
    Hash: () => <span data-testid="icon-hash" />,
    Lock: () => <span data-testid="icon-lock" />,
    Plus: () => <span data-testid="icon-plus" />,
    X: () => <span data-testid="icon-x" />,
    Radio: () => <span data-testid="icon-radio" />
}))

const defaultProps = {
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    isMuted: false,
    isVadGateOpen: true,
    allMuted: false,
    channel: 1,
    players: [],
    channels: [
        { channel: 1, name: 'ch-1', playerCount: 0 },
        { channel: 2, name: 'ch-2', playerCount: 2 },
        { channel: 3, name: 'ch-3', playerCount: 0 },
        { channel: 4, name: 'ch-4', playerCount: 0 },
        { channel: 5, name: 'ch-5', playerCount: 0 }
    ],
    roomName: '',
    username: 'TestUser',
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onToggleMute: vi.fn(),
    inputMode: 'voice' as const,
    onToggleMuteAll: vi.fn(),
    onChannelChange: vi.fn(),
    onPlayerVolumeChange: vi.fn(),
    onCreateChannel: vi.fn(),
    onVerifyPin: vi.fn(),
    onClearError: vi.fn()
}

describe('SessionControls', () => {
    describe('Channel Click — Select Only (No Auto-Connect)', () => {
        it('clicking a channel does NOT call onConnect', () => {
            const onConnect = vi.fn()
            render(<SessionControls {...defaultProps} onConnect={onConnect} />)

            const ch2 = screen.getByText('Channel 2')
            fireEvent.click(ch2)

            expect(onConnect).not.toHaveBeenCalled()
        })

        it('clicking a channel calls onChannelChange to select it', () => {
            const onChannelChange = vi.fn()
            render(<SessionControls {...defaultProps} onChannelChange={onChannelChange} />)

            const ch3 = screen.getByText('Channel 3')
            fireEvent.click(ch3)

            expect(onChannelChange).toHaveBeenCalledWith(3)
        })

        it('clicking Connect button calls onConnect', () => {
            const onConnect = vi.fn()
            render(<SessionControls {...defaultProps} onConnect={onConnect} />)

            const connectBtn = screen.getByText('Connect')
            fireEvent.click(connectBtn)

            expect(onConnect).toHaveBeenCalled()
        })

        it('clicking Disconnect button calls onDisconnect when connected', () => {
            const onDisconnect = vi.fn()
            render(
                <SessionControls
                    {...defaultProps}
                    isConnected={true}
                    roomName="ch-1"
                    onDisconnect={onDisconnect}
                />
            )

            const disconnectBtn = screen.getByText('Disconnect')
            fireEvent.click(disconnectBtn)

            expect(onDisconnect).toHaveBeenCalled()
        })

        it('channels are disabled when already connected (except current)', () => {
            render(
                <SessionControls
                    {...defaultProps}
                    isConnected={true}
                    roomName="ch-1"
                    channel={1}
                />
            )

            // Channel 2 should be disabled
            const ch2Button = screen.getByText('Channel 2').closest('button')
            expect(ch2Button).toBeDisabled()
        })
    })

    describe('Custom Channel Selection', () => {
        const customChannels = [
            ...defaultProps.channels,
            { name: 'Team Alpha', roomName: 'custom-123', playerCount: 1, isCustom: true },
            { name: 'Locked Room', roomName: 'custom-456', playerCount: 0, isCustom: true, hasPin: true }
        ]

        it('clicking a custom channel without PIN does NOT call onConnect', () => {
            const onConnect = vi.fn()
            render(<SessionControls {...defaultProps} channels={customChannels} onConnect={onConnect} />)

            const teamAlpha = screen.getByText('Team Alpha')
            fireEvent.click(teamAlpha)

            expect(onConnect).not.toHaveBeenCalled()
        })

        it('clicking Connect after selecting custom channel connects to it', () => {
            const onConnect = vi.fn()
            render(<SessionControls {...defaultProps} channels={customChannels} onConnect={onConnect} />)

            // Select custom channel
            const teamAlpha = screen.getByText('Team Alpha')
            fireEvent.click(teamAlpha)

            // Click Connect
            const connectBtn = screen.getByText('Connect')
            fireEvent.click(connectBtn)

            expect(onConnect).toHaveBeenCalledWith('custom-123', undefined)
        })

        it('clicking a PIN-protected channel shows PIN dialog', () => {
            render(<SessionControls {...defaultProps} channels={customChannels} />)

            const lockedRoom = screen.getByText('Locked Room')
            fireEvent.click(lockedRoom)

            expect(screen.getByText('Enter PIN')).toBeInTheDocument()
        })
    })

    describe('UI State', () => {
        it('shows player count badge for non-empty channels', () => {
            render(<SessionControls {...defaultProps} />)

            // Channel 2 has 2 players
            expect(screen.getByText('2')).toBeInTheDocument()
        })

        it('shows Mute button only when connected', () => {
            const { rerender } = render(<SessionControls {...defaultProps} />)

            const muteBtn = screen.getByText('Mute').closest('button')!
            expect(muteBtn.style.cursor).toBe('not-allowed')

            rerender(<SessionControls {...defaultProps} isConnected={true} roomName="ch-1" />)
            expect(muteBtn.style.cursor).not.toBe('not-allowed')
        })
    })
})
