import { describe, expect, it } from 'vitest'
import { defaultSettings, mergeStoredSettings } from '../hooks/settingsState'

describe('renderer settings state', () => {
    it('migrates the exact legacy v2 settings shape without resetting valid preferences', () => {
        expect(mergeStoredSettings({
            username: 'Legacy Player',
            microphoneId: 'legacy-mic',
            speakerId: 'legacy-speaker',
            micLevel: 65,
            channel: 2,
            autoConnect: false,
            noiseSuppression: 70,
            inputMode: 'voice',
            pttKey: 'KeyB',
            muteToggleEnabled: true,
            muteToggleKey: 'KeyN',
            vadThreshold: 15,
            joinSoundId: 'bubble'
        })).toEqual({
            ...defaultSettings,
            username: 'Legacy Player',
            microphoneId: 'legacy-mic',
            speakerId: 'legacy-speaker',
            micLevel: 65,
            channel: 2,
            noiseSuppression: 70,
            inputMode: 'voice',
            pttKey: 'KeyB',
            muteToggleEnabled: true,
            muteToggleKey: 'KeyN',
            vadThreshold: 15,
            joinSoundId: 'bubble'
        })
    })

    it('merges a valid partial persisted state with safe defaults', () => {
        expect(mergeStoredSettings({ username: 'Player One', micLevel: 65 })).toEqual({
            ...defaultSettings,
            username: 'Player One',
            micLevel: 65
        })
    })

    it('keeps valid legacy fields while replacing malformed controls with defaults', () => {
        expect(mergeStoredSettings({
            username: 'Player',
            micLevel: 900,
            unknownLegacyFlag: true
        })).toEqual({
            ...defaultSettings,
            username: 'Player'
        })
    })

    it('rejects storage with no usable settings', () => {
        expect(mergeStoredSettings({ inputMode: 'always-hot' })).toBeNull()
        expect(mergeStoredSettings({ unknown: true })).toBeNull()
        expect(mergeStoredSettings('not-an-object')).toBeNull()
    })
})
