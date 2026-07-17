import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVoiceInputLifecycle } from '../hooks/app/useVoiceInputLifecycle'
import type { AppSettings } from '../types'

describe('voice input mode transitions', () => {
    afterEach(() => vi.useRealTimers())

    it('updates participant metadata only when connection state or input mode changes', () => {
        const firstUpdate = vi.fn()
        const secondUpdate = vi.fn()
        const baseProps = {
            isConnected: true,
            isMuted: false,
            pttKey: 'CapsLock',
            muteToggleEnabled: false,
            muteToggleKey: 'KeyM',
            vadThreshold: 10,
            username: 'Tester',
            toggleMute: vi.fn(),
            setMuted: vi.fn(),
            setVadGate: vi.fn(),
            setVadActive: vi.fn(),
            getRawMicLevel: vi.fn(() => 0),
            playMuteBeep: vi.fn(),
            addToast: vi.fn()
        }
        const { rerender } = renderHook(
            ({ inputMode, updateInputModeMetadata }: {
                inputMode: AppSettings['inputMode']
                updateInputModeMetadata: (mode: AppSettings['inputMode']) => void
            }) => useVoiceInputLifecycle({ ...baseProps, inputMode, updateInputModeMetadata }),
            {
                initialProps: {
                    inputMode: 'voice' as AppSettings['inputMode'],
                    updateInputModeMetadata: firstUpdate
                }
            }
        )

        expect(firstUpdate).toHaveBeenCalledTimes(1)
        expect(firstUpdate).toHaveBeenCalledWith('voice')

        rerender({ inputMode: 'voice', updateInputModeMetadata: secondUpdate })
        expect(secondUpdate).not.toHaveBeenCalled()

        rerender({ inputMode: 'vad', updateInputModeMetadata: secondUpdate })
        expect(secondUpdate).toHaveBeenCalledTimes(1)
        expect(secondUpdate).toHaveBeenCalledWith('vad')
    })

    it('keeps the gain gate closed until VAD to PTT muting completes', async () => {
        vi.useFakeTimers()
        let resolveMute: (() => void) | undefined
        const muteCompleted = new Promise<void>((resolve) => { resolveMute = resolve })
        const setMuted = vi.fn((muted: boolean) => muted ? muteCompleted : Promise.resolve())
        const setVadGate = vi.fn()
        const setVadActive = vi.fn()
        const baseProps = {
            isConnected: true,
            isMuted: false,
            pttKey: 'CapsLock',
            muteToggleEnabled: false,
            muteToggleKey: 'KeyM',
            vadThreshold: 10,
            username: 'Tester',
            toggleMute: vi.fn(),
            setMuted,
            setVadGate,
            setVadActive,
            getRawMicLevel: vi.fn(() => 0),
            updateInputModeMetadata: vi.fn(),
            playMuteBeep: vi.fn(),
            addToast: vi.fn()
        }
        const { rerender, unmount } = renderHook(
            ({ inputMode }: { inputMode: AppSettings['inputMode'] }) =>
                useVoiceInputLifecycle({ ...baseProps, inputMode }),
            { initialProps: { inputMode: 'vad' as AppSettings['inputMode'] } }
        )

        setVadGate.mockClear()
        rerender({ inputMode: 'ptt' })
        expect(setVadGate).toHaveBeenCalledWith(false)
        expect(setVadGate).not.toHaveBeenCalledWith(true)
        expect(setMuted).toHaveBeenCalledWith(true)

        await act(async () => { resolveMute?.() })
        expect(setVadGate).toHaveBeenLastCalledWith(true)
        unmount()
    })
})
