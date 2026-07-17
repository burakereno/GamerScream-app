import { describe, expect, it, vi } from 'vitest'
import { readFrequencyLevel } from '../utils/audioLevels'
import {
    applyNoiseSuppressionMix,
    clampNoiseSuppression,
    withReconnectNoiseSuppression
} from '../utils/noiseSuppression'

describe('audio processing helpers', () => {
    it('uses the same normalized frequency level for channel activity and Settings', () => {
        const analyser = {
            getByteFrequencyData: vi.fn((data: Uint8Array<ArrayBuffer>) => {
                data.set([64, 128, 192, 0])
            })
        }

        expect(readFrequencyLevel(analyser, new Uint8Array(4))).toBe(0.75)
    })

    it('clamps the reconnect suppression level and preserves the other connection fields', () => {
        const params = { noiseSuppression: 100, channel: 3, username: 'Tester' }

        expect(withReconnectNoiseSuppression(params, 65)).toEqual({
            noiseSuppression: 65,
            channel: 3,
            username: 'Tester'
        })
        expect(clampNoiseSuppression(-10)).toBe(0)
        expect(clampNoiseSuppression(120)).toBe(100)
        expect(clampNoiseSuppression(Number.NaN)).toBe(100)
    })

    it('falls back to fully dry audio when the RNNoise processor is unavailable', () => {
        const wetGain = { gain: { value: 0 } }
        const dryGain = { gain: { value: 0 } }

        expect(applyNoiseSuppressionMix(wetGain, dryGain, 80)).toBe(80)
        expect(wetGain.gain.value).toBe(0.8)
        expect(dryGain.gain.value).toBeCloseTo(0.2)

        expect(applyNoiseSuppressionMix(wetGain, dryGain, 80, false)).toBe(0)
        expect(wetGain.gain.value).toBe(0)
        expect(dryGain.gain.value).toBe(1)
    })
})
