import { useCallback, useEffect, useRef } from 'react'
import type { AppSettings } from '../../types'
import type { AddToast } from '../../components/app-shell/types'

interface VoiceInputLifecycleParams {
    isConnected: boolean
    isMuted: boolean
    inputMode: AppSettings['inputMode']
    pttKey: string
    muteToggleEnabled: boolean
    muteToggleKey: string
    vadThreshold: number
    username: string
    toggleMute: () => void | Promise<void>
    setMuted: (muted: boolean) => void | Promise<void>
    setVadGate: (open: boolean) => void
    setVadActive: (active: boolean) => void
    getRawMicLevel: () => number
    updateInputModeMetadata: (inputMode: AppSettings['inputMode']) => void | Promise<void>
    playMuteBeep: (muting: boolean) => void
    addToast: AddToast
}

function codeToAccelerator(code: string): string {
    const map: Record<string, string> = {
        Backquote: '`', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
        Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
        CapsLock: 'CapsLock', Tab: 'Tab', Space: 'Space', Escape: 'Escape',
        Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete',
        ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
        ShiftLeft: 'Shift', ShiftRight: 'Shift',
        ControlLeft: 'Control', ControlRight: 'Control',
        AltLeft: 'Alt', AltRight: 'Alt',
        MetaLeft: 'Meta', MetaRight: 'Meta'
    }
    if (map[code]) return map[code]
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    if (code.startsWith('F') && code.length <= 3) return code
    if (code.startsWith('Numpad')) return `num${code.slice(6)}`
    return code
}

export function useVoiceInputLifecycle({
    isConnected,
    isMuted,
    inputMode,
    pttKey,
    muteToggleEnabled,
    muteToggleKey,
    vadThreshold,
    username,
    toggleMute,
    setMuted,
    setVadGate,
    setVadActive,
    getRawMicLevel,
    updateInputModeMetadata,
    playMuteBeep,
    addToast
}: VoiceInputLifecycleParams) {
    const pttActiveRef = useRef(false)
    const isMutedRef = useRef(isMuted)
    isMutedRef.current = isMuted
    const isConnectedRef = useRef(isConnected)
    isConnectedRef.current = isConnected
    const setMutedRef = useRef(setMuted)
    setMutedRef.current = setMuted
    const updateInputModeMetadataRef = useRef(updateInputModeMetadata)
    updateInputModeMetadataRef.current = updateInputModeMetadata

    useEffect(() => {
        let cancelled = false
        if (isConnected && inputMode === 'ptt') {
            setVadGate(false)
            void Promise.resolve(setMuted(true))
                .then(() => {
                    if (!cancelled) setVadGate(true)
                })
                .catch(() => undefined)
        }
        if (isConnected && inputMode === 'vad') {
            setVadGate(false)
            if (isMuted) setMuted(false)
        }
        if (isConnected && inputMode === 'voice') {
            setVadGate(true)
            if (isMuted) setMuted(false)
        }
        if (!isConnected) {
            pttActiveRef.current = false
            setVadActive(false)
            setVadGate(true)
        }
        return () => { cancelled = true }
    }, [isConnected, inputMode]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (isConnected) updateInputModeMetadataRef.current(inputMode)
    }, [isConnected, inputMode])

    useEffect(() => {
        if (inputMode !== 'vad' || !isConnected) return

        setVadActive(true)
        setVadGate(false)
        const threshold = vadThreshold / 100
        let holdTimer: ReturnType<typeof setTimeout> | null = null
        let isOpen = false

        const interval = setInterval(() => {
            const level = getRawMicLevel()
            if (level > threshold) {
                if (!isOpen) {
                    isOpen = true
                    setVadGate(true)
                }
                if (holdTimer) {
                    clearTimeout(holdTimer)
                    holdTimer = null
                }
            } else if (isOpen && !holdTimer) {
                holdTimer = setTimeout(() => {
                    isOpen = false
                    setVadGate(false)
                    holdTimer = null
                }, 250)
            }
        }, 50)

        return () => {
            clearInterval(interval)
            if (holdTimer) clearTimeout(holdTimer)
            setVadActive(false)
        }
    }, [inputMode, vadThreshold, isConnected, getRawMicLevel, setVadGate, setVadActive])

    useEffect(() => {
        if (inputMode !== 'ptt') {
            window.electronAPI?.unregisterPttKey?.()
            return
        }

        const accelerator = codeToAccelerator(pttKey)
        const handlePttDown = () => {
            if (!pttActiveRef.current && isConnectedRef.current) {
                pttActiveRef.current = true
                setMutedRef.current(false)
            }
        }
        const handlePttUp = () => {
            if (pttActiveRef.current) {
                pttActiveRef.current = false
                setMutedRef.current(true)
            }
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === pttKey && !event.repeat) handlePttDown()
        }
        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === pttKey) {
                handlePttUp()
                window.electronAPI?.pttRelease?.()
            }
        }
        const onFocus = () => {
            window.electronAPI?.unregisterPttKey?.()
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
        }
        const onBlur = () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            if (pttActiveRef.current) handlePttUp()
            window.electronAPI?.registerPttKey?.(accelerator)
        }

        window.electronAPI?.onPttKeyDown?.(handlePttDown)
        window.electronAPI?.onPttKeyUp?.(handlePttUp)
        if (document.hasFocus()) {
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
        } else {
            window.electronAPI?.registerPttKey?.(accelerator)
        }
        window.addEventListener('focus', onFocus)
        window.addEventListener('blur', onBlur)

        return () => {
            window.electronAPI?.offPttEvents?.()
            window.electronAPI?.unregisterPttKey?.()
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('blur', onBlur)
        }
    }, [inputMode, pttKey])

    const handleMuteToggle = useCallback(() => {
        const willMute = !isMutedRef.current
        toggleMute()
        playMuteBeep(willMute)
        window.electronAPI?.showNotification?.(
            'GamerScream',
            willMute ? `${username} muted` : `${username} unmuted`
        )
    }, [toggleMute, playMuteBeep]) // eslint-disable-line react-hooks/exhaustive-deps

    const toggleMuteRef = useRef(handleMuteToggle)
    toggleMuteRef.current = handleMuteToggle

    useEffect(() => {
        if (inputMode !== 'voice' || !muteToggleEnabled) return

        const accelerator = codeToAccelerator(muteToggleKey)
        let lastToggleTime = 0
        const handleToggle = () => {
            if (!isConnectedRef.current) return
            const now = Date.now()
            if (now - lastToggleTime < 300) return
            lastToggleTime = now
            toggleMuteRef.current()
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === muteToggleKey && !event.repeat) handleToggle()
        }
        const onFocus = () => {
            window.electronAPI?.unregisterPttKey?.()
            window.addEventListener('keydown', handleKeyDown)
        }
        const onBlur = () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.electronAPI?.registerPttKey?.(accelerator)
        }

        window.electronAPI?.onPttKeyDown?.(handleToggle)
        if (document.hasFocus()) window.addEventListener('keydown', handleKeyDown)
        else window.electronAPI?.registerPttKey?.(accelerator)
        window.addEventListener('focus', onFocus)
        window.addEventListener('blur', onBlur)

        return () => {
            window.electronAPI?.offPttEvents?.()
            window.electronAPI?.unregisterPttKey?.()
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('blur', onBlur)
        }
    }, [inputMode, muteToggleEnabled, muteToggleKey])

    useEffect(() => {
        window.electronAPI?.onPttRegisterFailed?.((key) => {
            addToast(`Failed to register key: ${key}`, 'leave')
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return { handleMuteToggle }
}
