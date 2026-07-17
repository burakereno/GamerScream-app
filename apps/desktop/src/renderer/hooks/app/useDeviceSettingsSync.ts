import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppSettings, AudioDeviceInfo } from '../../types'
import type { AddToast, UpdateSetting } from '../../components/app-shell/types'
import { setSoundOutputDevice } from '../../utils/sounds'
import { setJoinSoundSpeaker } from '../../utils/joinSounds'

interface DeviceSettingsSyncParams {
    settings: AppSettings
    microphones: AudioDeviceInfo[]
    speakers: AudioDeviceInfo[]
    isConnected: boolean
    rnnoiseActive: boolean | null
    setSelectedMic: Dispatch<SetStateAction<string>>
    setSelectedSpeaker: Dispatch<SetStateAction<string>>
    setMicLevel: Dispatch<SetStateAction<number>>
    setSpeakerDevice: (deviceId: string) => void
    setMicGain: (level: number) => void
    setNoiseSuppressionLevel: (level: number) => void
    updateReconnectNoiseSuppression: (level: number) => void
    updateSetting: UpdateSetting
    addToast: AddToast
}

export function useDeviceSettingsSync({
    settings,
    microphones,
    speakers,
    isConnected,
    rnnoiseActive,
    setSelectedMic,
    setSelectedSpeaker,
    setMicLevel,
    setSpeakerDevice,
    setMicGain,
    setNoiseSuppressionLevel,
    updateReconnectNoiseSuppression,
    updateSetting,
    addToast
}: DeviceSettingsSyncParams) {
    useEffect(() => {
        if (settings.microphoneId && microphones.some((item) => item.deviceId === settings.microphoneId)) {
            setSelectedMic(settings.microphoneId)
        } else if (settings.microphoneId && microphones.length > 0) {
            const fallback = microphones[0].deviceId
            setSelectedMic(fallback)
            updateSetting('microphoneId', fallback)
            addToast('Saved microphone is unavailable — using the default input', 'leave')
        }
    }, [settings.microphoneId, microphones, setSelectedMic, updateSetting, addToast])

    useEffect(() => {
        if (Number.isFinite(settings.micLevel) && settings.micLevel >= 0 && settings.micLevel <= 100) {
            setMicLevel(settings.micLevel)
        }
    }, [settings.micLevel, setMicLevel])

    useEffect(() => {
        if (settings.speakerId && speakers.some((item) => item.deviceId === settings.speakerId)) {
            setSelectedSpeaker(settings.speakerId)
            setSpeakerDevice(settings.speakerId)
            setSoundOutputDevice(settings.speakerId)
        } else if (settings.speakerId && speakers.length > 0) {
            const fallback = speakers[0].deviceId
            setSelectedSpeaker(fallback)
            setSpeakerDevice(fallback)
            setSoundOutputDevice(fallback)
            updateSetting('speakerId', fallback)
            addToast('Saved speaker is unavailable — using the default output', 'leave')
        }
    }, [settings.speakerId, speakers, setSelectedSpeaker, setSpeakerDevice, updateSetting, addToast])

    useEffect(() => {
        if (settings.speakerId) setJoinSoundSpeaker(settings.speakerId)
    }, [settings.speakerId])

    useEffect(() => {
        if (rnnoiseActive === false) {
            addToast('Noise suppression unavailable — using unfiltered audio', 'leave')
        }
    }, [rnnoiseActive]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleMicSelect = (deviceId: string) => {
        setSelectedMic(deviceId)
        updateSetting('microphoneId', deviceId)
    }

    const handleSpeakerSelect = (deviceId: string) => {
        setSelectedSpeaker(deviceId)
        updateSetting('speakerId', deviceId)
        setSpeakerDevice(deviceId)
        setSoundOutputDevice(deviceId)
        setJoinSoundSpeaker(deviceId)
    }

    const handleMicLevelChange = (level: number) => {
        setMicLevel(level)
        updateSetting('micLevel', level)
        setMicGain(level)
    }

    const handleNoiseSuppressionChange = (level: number) => {
        updateSetting('noiseSuppression', level)
        setNoiseSuppressionLevel(level)
        updateReconnectNoiseSuppression(level)
        const wetGainActive = rnnoiseActive === true && level > 0
        if (isConnected && level > 0 && !wetGainActive) {
            addToast('Full effect requires reconnect', 'leave')
        }
    }

    return {
        handleMicSelect,
        handleSpeakerSelect,
        handleMicLevelChange,
        handleNoiseSuppressionChange
    }
}
