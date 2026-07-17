import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChannelList } from '../components/session-controls/ChannelList'
import type { ConnectedPlayer } from '../types'

vi.mock('boring-avatars', () => ({ default: () => <span aria-hidden="true" /> }))
vi.mock('lucide-react', () => ({
    Hash: () => <span aria-hidden="true" />,
    Lock: () => <span aria-hidden="true" />,
    Plus: () => <span aria-hidden="true" />,
    Volume2: () => <span aria-hidden="true" />,
    VolumeX: () => <span aria-hidden="true" />
}))

const players: ConnectedPlayer[] = [
    { identity: 'local', displayName: 'Local', isMuted: false, isSpeaking: false, isLocal: true, volume: 100 },
    { identity: 'remote-1', displayName: 'Remote 1', isMuted: false, isSpeaking: false, isLocal: false, volume: 100 },
    { identity: 'remote-2', displayName: 'Remote 2', isMuted: false, isSpeaking: false, isLocal: false, volume: 100 }
]

const renderList = (isConnected: boolean, roomName: string) => render(
    <ChannelList
        channels={[
            { channel: 1, name: 'ch-1', playerCount: 0 },
            { channel: 2, name: 'ch-2', playerCount: 1 }
        ]}
        channel={2}
        isConnected={isConnected}
        roomName={roomName}
        players={players}
        allMuted={false}
        masterVolume={100}
        selectedCustomRoom={null}
        onMasterVolumeChange={vi.fn()}
        onToggleMuteAll={vi.fn()}
        onPlayerVolumeChange={vi.fn()}
        onChannelSelect={vi.fn()}
        onCreateChannel={vi.fn()}
    />
)

describe('ChannelList presence count', () => {
    it('uses the live participant list immediately for the connected room', () => {
        renderList(true, 'ch-2')

        const channel = screen.getByRole('button', { name: /Channel 2/ })
        expect(within(channel).getByText('3')).toHaveClass('channel-badge')
    })

    it('keeps the authoritative directory count for rooms not currently connected', () => {
        renderList(false, '')

        const channel = screen.getByRole('button', { name: /Channel 2/ })
        expect(within(channel).getByText('1')).toHaveClass('channel-badge')
    })
})
