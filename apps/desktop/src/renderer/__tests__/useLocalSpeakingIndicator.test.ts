import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    useLocalSpeakingIndicator,
    withLocalSpeakingState
} from '../hooks/app/useLocalSpeakingIndicator'
import type { ConnectedPlayer } from '../types'

const baseOptions = {
    isConnected: true,
    isMuted: false,
    micLevel: 100,
    inputMode: 'voice' as const,
    isVadGateOpen: true
}

describe('local speaking indicator', () => {
    afterEach(() => vi.useRealTimers())

    it('activates from the local microphone level and releases after a short hold', () => {
        vi.useFakeTimers()
        let level = 0.12
        const getMicActivityLevel = vi.fn(() => level)
        const { result } = renderHook(() => useLocalSpeakingIndicator({
            ...baseOptions,
            getMicActivityLevel
        }))

        expect(result.current).toBe(true)
        level = 0
        act(() => vi.advanceTimersByTime(150))
        expect(result.current).toBe(true)
        act(() => vi.advanceTimersByTime(50))
        expect(result.current).toBe(false)
    })

    it('never reports speaking while disconnected, muted, or set to zero gain', () => {
        const getMicActivityLevel = vi.fn(() => 1)
        const { result, rerender } = renderHook(
            (options) => useLocalSpeakingIndicator({ ...options, getMicActivityLevel }),
            { initialProps: { ...baseOptions, isConnected: false } }
        )

        expect(result.current).toBe(false)
        rerender({ ...baseOptions, isMuted: true })
        expect(result.current).toBe(false)
        rerender({ ...baseOptions, micLevel: 0 })
        expect(result.current).toBe(false)
        expect(getMicActivityLevel).not.toHaveBeenCalled()
    })

    it('only samples push-to-talk audio while the microphone is unmuted', () => {
        const getMicActivityLevel = vi.fn(() => 0.12)
        const { result, rerender } = renderHook(
            (options) => useLocalSpeakingIndicator({ ...options, getMicActivityLevel }),
            { initialProps: { ...baseOptions, inputMode: 'ptt' as const, isMuted: true } }
        )

        expect(result.current).toBe(false)
        rerender({ ...baseOptions, inputMode: 'ptt' as const, isMuted: false })
        expect(result.current).toBe(true)
        rerender({ ...baseOptions, inputMode: 'ptt' as const, isMuted: true })
        expect(result.current).toBe(false)
    })

    it('stays inactive while the effective gain gate is closed', () => {
        const getMicActivityLevel = vi.fn(() => 0.12)
        const { result } = renderHook(() => useLocalSpeakingIndicator({
            ...baseOptions,
            inputMode: 'ptt',
            isVadGateOpen: false,
            getMicActivityLevel
        }))

        expect(result.current).toBe(false)
        expect(getMicActivityLevel).not.toHaveBeenCalled()
    })

    it('uses the existing VAD gate without starting a duplicate level poller', () => {
        const getMicActivityLevel = vi.fn(() => 0.12)
        const { result, rerender } = renderHook(
            (options) => useLocalSpeakingIndicator({ ...options, getMicActivityLevel }),
            {
                initialProps: {
                    ...baseOptions,
                    inputMode: 'vad' as const,
                    isVadGateOpen: false
                }
            }
        )

        expect(result.current).toBe(false)
        rerender({ ...baseOptions, inputMode: 'vad' as const, isVadGateOpen: true })
        expect(result.current).toBe(true)
        rerender({ ...baseOptions, inputMode: 'vad' as const, isVadGateOpen: false })
        expect(result.current).toBe(false)
        expect(getMicActivityLevel).not.toHaveBeenCalled()
    })

    it('ignores ambient microphone levels below the speaking threshold', () => {
        const { result } = renderHook(() => useLocalSpeakingIndicator({
            ...baseOptions,
            getMicActivityLevel: () => 0.06
        }))

        expect(result.current).toBe(false)
    })

    it('stops sampling when the indicator unmounts', () => {
        vi.useFakeTimers()
        const getMicActivityLevel = vi.fn(() => 0)
        const { unmount } = renderHook(() => useLocalSpeakingIndicator({
            ...baseOptions,
            getMicActivityLevel
        }))

        act(() => vi.advanceTimersByTime(100))
        const callsBeforeUnmount = getMicActivityLevel.mock.calls.length
        unmount()
        act(() => vi.advanceTimersByTime(200))

        expect(getMicActivityLevel).toHaveBeenCalledTimes(callsBeforeUnmount)
    })

    it('updates only the local player and leaves remote speaking state untouched', () => {
        const players: ConnectedPlayer[] = [
            {
                identity: 'local', displayName: 'Local', isMuted: false,
                isSpeaking: false, isLocal: true, volume: 100
            },
            {
                identity: 'remote', displayName: 'Remote', isMuted: false,
                isSpeaking: true, isLocal: false, volume: 100
            }
        ]

        const updated = withLocalSpeakingState(players, true)
        expect(updated[0].isSpeaking).toBe(true)
        expect(updated[1]).toBe(players[1])
        expect(updated[1].isSpeaking).toBe(true)
    })
})
