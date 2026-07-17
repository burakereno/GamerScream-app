import { useEffect, useState } from 'react'
import type { AppSettings, ConnectedPlayer } from '../../types'

const SAMPLE_INTERVAL_MS = 50
const SPEAKING_THRESHOLD = 0.09
const SPEAKING_HOLD_SAMPLES = 4

interface LocalSpeakingIndicatorOptions {
    isConnected: boolean
    isMuted: boolean
    micLevel: number
    inputMode: AppSettings['inputMode']
    isVadGateOpen: boolean
    getMicActivityLevel: () => number
}

export function withLocalSpeakingState(
    players: ConnectedPlayer[],
    isSpeaking: boolean
): ConnectedPlayer[] {
    const localPlayer = players.find((player) => player.isLocal)
    if (!localPlayer || localPlayer.isSpeaking === isSpeaking) return players
    return players.map((player) => player.isLocal ? { ...player, isSpeaking } : player)
}

export function useLocalSpeakingIndicator({
    isConnected,
    isMuted,
    micLevel,
    inputMode,
    isVadGateOpen,
    getMicActivityLevel
}: LocalSpeakingIndicatorOptions): boolean {
    const [rawSpeaking, setRawSpeaking] = useState(false)
    const canTransmit = isConnected && !isMuted && isVadGateOpen &&
        Number.isFinite(micLevel) && micLevel > 0
    const vadIsSpeaking = inputMode === 'vad' && isVadGateOpen

    useEffect(() => {
        if (!canTransmit || vadIsSpeaking) {
            setRawSpeaking(false)
            return
        }

        let holdSamples = 0
        let renderedState = false
        const sample = () => {
            let level = 0
            try {
                level = getMicActivityLevel()
            } catch {
                level = 0
            }

            if (Number.isFinite(level) && level >= SPEAKING_THRESHOLD) {
                holdSamples = SPEAKING_HOLD_SAMPLES
            } else if (holdSamples > 0) {
                holdSamples--
            }

            const nextState = holdSamples > 0
            if (nextState !== renderedState) {
                renderedState = nextState
                setRawSpeaking(nextState)
            }
        }

        sample()
        const interval = setInterval(sample, SAMPLE_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [canTransmit, getMicActivityLevel, vadIsSpeaking])

    return canTransmit && (vadIsSpeaking || rawSpeaking)
}
