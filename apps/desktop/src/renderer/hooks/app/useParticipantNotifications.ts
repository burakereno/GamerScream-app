import { useCallback } from 'react'
import type { LiveKitCallbacks } from '../useLiveKit'
import type { AddToast } from '../../components/app-shell/types'
import { playJoinSound, playLeaveSound } from '../../utils/sounds'

interface ParticipantNotificationsParams {
    addToast: AddToast
    onAuthExpired: () => void
    onReconnectFailed: () => void
}

export function useParticipantNotifications({
    addToast,
    onAuthExpired,
    onReconnectFailed
}: ParticipantNotificationsParams) {
    const playMuteBeep = useCallback((muting: boolean) => {
        try {
            const context = new AudioContext()
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.connect(gain)
            gain.connect(context.destination)
            oscillator.frequency.value = muting ? 300 : 600
            gain.gain.value = 0.08
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.15)
            oscillator.start()
            oscillator.stop(context.currentTime + 0.15)
            oscillator.onended = () => context.close()
        } catch {
            // Audio feedback is optional.
        }
    }, [])

    const callbacks: LiveKitCallbacks = {
        onParticipantJoin: (name) => {
            playJoinSound()
            addToast(`${name} joined`, 'join')
            window.electronAPI?.showNotification?.('GamerScream', `${name} joined the channel`)
        },
        onParticipantLeave: (name) => {
            playLeaveSound()
            addToast(`${name} left`, 'leave')
            window.electronAPI?.showNotification?.('GamerScream', `${name} left the channel`)
        },
        onParticipantMute: (name) => {
            playMuteBeep(true)
            addToast(`${name} muted`, 'leave')
            window.electronAPI?.showNotification?.('GamerScream', `${name} muted`)
        },
        onParticipantUnmute: (name) => {
            playMuteBeep(false)
            addToast(`${name} unmuted`, 'join')
            window.electronAPI?.showNotification?.('GamerScream', `${name} unmuted`)
        },
        onAuthExpired,
        onReconnectFailed
    }

    return { callbacks, playMuteBeep }
}
