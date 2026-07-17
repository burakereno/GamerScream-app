import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDeviceSettingsSync } from '../hooks/app/useDeviceSettingsSync'
import { defaultSettings } from '../hooks/settingsState'

function createOptions(overrides: Record<string, unknown> = {}) {
    return {
        settings: defaultSettings,
        microphones: [],
        speakers: [],
        isConnected: true,
        rnnoiseActive: true,
        setSelectedMic: vi.fn(),
        setSelectedSpeaker: vi.fn(),
        setMicLevel: vi.fn(),
        setSpeakerDevice: vi.fn(),
        setMicGain: vi.fn(),
        setNoiseSuppressionLevel: vi.fn(),
        updateReconnectNoiseSuppression: vi.fn(),
        updateSetting: vi.fn(),
        addToast: vi.fn(),
        ...overrides
    }
}

describe('device settings sync', () => {
    it('keeps the active and reconnect noise suppression levels in sync', () => {
        const options = createOptions()
        const { result } = renderHook(() => useDeviceSettingsSync(options))

        act(() => result.current.handleNoiseSuppressionChange(65))

        expect(options.updateSetting).toHaveBeenCalledWith('noiseSuppression', 65)
        expect(options.setNoiseSuppressionLevel).toHaveBeenCalledWith(65)
        expect(options.updateReconnectNoiseSuppression).toHaveBeenCalledWith(65)
        expect(options.addToast).not.toHaveBeenCalledWith('Full effect requires reconnect', 'leave')
    })

    it('reports an RNNoise initialization failure as unfiltered audio', () => {
        const options = createOptions({ rnnoiseActive: false })
        renderHook(() => useDeviceSettingsSync(options))

        expect(options.addToast).toHaveBeenCalledWith(
            'Noise suppression unavailable — using unfiltered audio',
            'leave'
        )
    })
})
