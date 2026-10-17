import { useEffect } from 'react'
import type { AppSettings } from '../../types'

interface MuteOverlayParams {
    isConnected: boolean
    isMuted: boolean
    inputMode: AppSettings['inputMode']
}

export function useMuteOverlay({ isConnected, isMuted, inputMode }: MuteOverlayParams): void {
    const visible = isConnected && inputMode === 'voice' && isMuted

    useEffect(() => {
        window.electronAPI?.setMuteOverlayVisible?.(visible)
    }, [visible])

    useEffect(() => () => {
        window.electronAPI?.setMuteOverlayVisible?.(false)
    }, [])
}
