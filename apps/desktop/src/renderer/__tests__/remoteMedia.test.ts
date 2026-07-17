import { describe, expect, it, vi } from 'vitest'
import {
    attachRemoteAudioTrack,
    createParticipantEventRateLimiter,
    detachRemoteAudioTrack,
    parseJoinSoundMessage
} from '../hooks/remoteMedia'

describe('remote media guards', () => {
    it('ignores video subscriptions instead of treating them as audio', () => {
        const track = { kind: 'video', attach: vi.fn(), setVolume: vi.fn() }
        const documentLike = { getElementById: vi.fn(), body: { appendChild: vi.fn() } }

        expect(attachRemoteAudioTrack({
            track,
            participantIdentity: 'player-1',
            volume: 0.5,
            speakerId: '',
            document: documentLike
        })).toBe(false)
        expect(track.attach).not.toHaveBeenCalled()
        expect(track.setVolume).not.toHaveBeenCalled()
    })

    it('does not remove participant audio when an unrelated video track unsubscribes', () => {
        const audioElement = { remove: vi.fn() }
        const documentLike = {
            getElementById: vi.fn(() => audioElement),
            body: { appendChild: vi.fn() }
        }
        const track = { kind: 'video', detach: vi.fn(() => []) }

        expect(detachRemoteAudioTrack({
            track,
            participantIdentity: 'player-1',
            document: documentLike
        })).toBe(false)
        expect(track.detach).not.toHaveBeenCalled()
        expect(audioElement.remove).not.toHaveBeenCalled()
    })

    it('accepts only known bounded join sounds', () => {
        expect(parseJoinSoundMessage('join-sound:hero')).toBe('hero')
        expect(parseJoinSoundMessage('join-sound:not-real')).toBeNull()
        expect(parseJoinSoundMessage(`join-sound:${'x'.repeat(100)}`)).toBeNull()
        expect(parseJoinSoundMessage('other:hero')).toBeNull()
    })

    it('rate-limits repeated data messages per participant', () => {
        const limiter = createParticipantEventRateLimiter(3000)

        expect(limiter.allow('player-1', 1000)).toBe(true)
        expect(limiter.allow('player-1', 2000)).toBe(false)
        expect(limiter.allow('player-2', 2000)).toBe(true)
        expect(limiter.allow('player-1', 4001)).toBe(true)
    })
})
