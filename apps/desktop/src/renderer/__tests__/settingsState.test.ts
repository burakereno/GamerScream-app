import { describe, expect, it } from 'vitest'
import { defaultSettings, mergeStoredSettings } from '../hooks/settingsState'

describe('renderer settings state', () => {
    it('merges a valid partial persisted state with safe defaults', () => {
        expect(mergeStoredSettings({ username: 'Player One', micLevel: 65 })).toEqual({
            ...defaultSettings,
            username: 'Player One',
            micLevel: 65
        })
    })

    it('rejects malformed local storage instead of propagating invalid controls', () => {
        expect(mergeStoredSettings({ username: 'Player', micLevel: 900 })).toBeNull()
        expect(mergeStoredSettings({ inputMode: 'always-hot' })).toBeNull()
        expect(mergeStoredSettings({ unknown: true })).toBeNull()
        expect(mergeStoredSettings('not-an-object')).toBeNull()
    })
})
