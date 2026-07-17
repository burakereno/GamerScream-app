import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionControls } from '../components/SessionControls'
import { withLocalSpeakingState } from '../hooks/app/useLocalSpeakingIndicator'

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
    onCancelReconnect: vi.fn(),
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
        it('keeps the Session title informational and never starts a connection', () => {
            const onConnect = vi.fn()
            render(<SessionControls {...defaultProps} onConnect={onConnect} />)

            const title = screen.getByRole('heading', { name: 'Session' })
            fireEvent.click(title)
            fireEvent.click(title)
            fireEvent.click(title)

            expect(onConnect).not.toHaveBeenCalled()
        })

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

        it('lets the user cancel an active reconnect', () => {
            const onCancelReconnect = vi.fn()
            render(
                <SessionControls
                    {...defaultProps}
                    isReconnecting
                    onCancelReconnect={onCancelReconnect}
                />
            )

            fireEvent.click(screen.getByRole('button', { name: 'Cancel reconnect' }))
            expect(onCancelReconnect).toHaveBeenCalledTimes(1)
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

        it('keeps muted state visually dominant over a stale speaking signal', () => {
            const { container } = render(
                <SessionControls
                    {...defaultProps}
                    isConnected
                    roomName="ch-1"
                    players={[
                        {
                            identity: 'local', displayName: 'Local', isMuted: true,
                            isSpeaking: true, isLocal: true, volume: 100
                        },
                        {
                            identity: 'remote', displayName: 'Remote', isMuted: false,
                            isSpeaking: true, isLocal: false, volume: 100
                        }
                    ]}
                />
            )

            const soundwaves = container.querySelectorAll('.soundwave')
            expect(soundwaves[0]).toHaveClass('muted')
            expect(soundwaves[0]).not.toHaveClass('active')
            expect(soundwaves[1]).toHaveClass('active')
        })

        it('renders derived local microphone activity without changing remote state', () => {
            const visiblePlayers = withLocalSpeakingState([
                {
                    identity: 'local', displayName: 'Local', isMuted: false,
                    isSpeaking: false, isLocal: true, volume: 100
                },
                {
                    identity: 'remote', displayName: 'Remote', isMuted: false,
                    isSpeaking: false, isLocal: false, volume: 100
                }
            ], true)
            const { container } = render(
                <SessionControls
                    {...defaultProps}
                    isConnected
                    roomName="ch-1"
                    players={visiblePlayers}
                />
            )

            const soundwaves = container.querySelectorAll('.soundwave')
            expect(soundwaves[0]).toHaveClass('active')
            expect(soundwaves[1]).not.toHaveClass('active')
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

        it('creates a channel and connects with the returned room capability', async () => {
            const onCreateChannel = vi.fn().mockResolvedValue({
                roomName: 'custom-created',
                roomCapability: 'create-capability'
            })
            const onConnect = vi.fn()
            render(
                <SessionControls
                    {...defaultProps}
                    onCreateChannel={onCreateChannel}
                    onConnect={onConnect}
                />
            )

            fireEvent.click(screen.getByRole('button', { name: 'Create Channel' }))
            fireEvent.change(screen.getByLabelText('Channel Name'), {
                target: { value: 'Team Bravo' }
            })
            fireEvent.change(screen.getByRole('textbox', { name: /PIN \(optional\)/ }), {
                target: { value: '2468' }
            })
            fireEvent.click(screen.getByRole('button', { name: 'Create & Join' }))

            await waitFor(() => {
                expect(onCreateChannel).toHaveBeenCalledWith('Team Bravo', '2468', 'TestUser')
                expect(onConnect).toHaveBeenCalledWith('custom-created', 'create-capability')
            })
        })

        it('connects to a protected channel with its verified room capability', async () => {
            const onVerifyPin = vi.fn().mockResolvedValue('verified-capability')
            const onConnect = vi.fn()
            render(
                <SessionControls
                    {...defaultProps}
                    channels={customChannels}
                    onVerifyPin={onVerifyPin}
                    onConnect={onConnect}
                />
            )

            fireEvent.click(screen.getByText('Locked Room'))
            fireEvent.change(screen.getByLabelText('Channel PIN'), {
                target: { value: '1357' }
            })
            fireEvent.click(screen.getByRole('button', { name: 'Select channel' }))

            await waitFor(() => {
                expect(onVerifyPin).toHaveBeenCalledWith('custom-456', '1357')
            })
            fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
            expect(onConnect).toHaveBeenCalledWith('custom-456', 'verified-capability')
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
            expect(muteBtn).toBeDisabled()

            rerender(<SessionControls {...defaultProps} isConnected={true} roomName="ch-1" />)
            expect(muteBtn).not.toBeDisabled()
        })
    })
})
