import { describe, expect, it } from 'vitest'
import { initialMicrophoneState, microphoneCaptureConstraints } from '../utils/microphoneSafety'

describe('initial microphone safety', () => {
    it('keeps system noise suppression disabled so zero means truly off', () => {
        expect(microphoneCaptureConstraints('mic-1')).toMatchObject({
            deviceId: { exact: 'mic-1' },
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false
        })
    })

    it('starts push-to-talk muted while preserving its configured gain', () => {
        expect(initialMicrophoneState('ptt', 80)).toEqual({ enabled: false, gain: 0.8 })
        expect(initialMicrophoneState('ptt', 500)).toEqual({ enabled: false, gain: 1 })
        expect(initialMicrophoneState('ptt', -20)).toEqual({ enabled: false, gain: 0 })
    })

    it('starts voice-activity sessions with the gain gate closed', () => {
        expect(initialMicrophoneState('vad', 80)).toEqual({ enabled: false, gain: 0 })
    })

    it('starts voice mode at the validated saved gain', () => {
        expect(initialMicrophoneState('voice', 80)).toEqual({ enabled: true, gain: 0.8 })
        expect(initialMicrophoneState('voice', 500)).toEqual({ enabled: true, gain: 1 })
        expect(initialMicrophoneState('voice', -20)).toEqual({ enabled: true, gain: 0 })
    })

    it('fails closed for unknown input modes', () => {
        expect(initialMicrophoneState('unknown', 80)).toEqual({ enabled: false, gain: 0 })
    })
})
