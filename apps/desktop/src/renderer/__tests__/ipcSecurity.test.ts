import { describe, expect, it } from 'vitest'
import { isAllowedRendererPermission, isTrustedIpcSender, isTrustedRendererUrl } from '../../main/ipcSecurity'
import {
    parseDeviceId,
    parseNotificationPayload,
    parsePlayerVolumesPayload,
    parsePttKey,
    parseSettingsPayload,
    parseToken
} from '../../main/ipcPayloads'

describe('renderer trust boundary', () => {
    it('allows only the packaged renderer entry file', () => {
        const expected = 'app://gamerscream/index.html'

        expect(isTrustedRendererUrl(`${expected}#settings`, expected, true)).toBe(true)
        expect(isTrustedRendererUrl('app://attacker/index.html', expected, true)).toBe(false)
        expect(isTrustedRendererUrl('app://gamerscream/attacker.html', expected, true)).toBe(false)
        expect(isTrustedRendererUrl('file:///tmp/attacker.html', expected, true)).toBe(false)
        expect(isTrustedRendererUrl('https://example.com/', expected, true)).toBe(false)
    })

    it('allows only the configured development origin', () => {
        const expected = 'http://localhost:5173/'

        expect(isTrustedRendererUrl('http://localhost:5173/settings', expected, false)).toBe(true)
        expect(isTrustedRendererUrl('http://localhost:3000/', expected, false)).toBe(false)
        expect(isTrustedRendererUrl('https://localhost:5173/', expected, false)).toBe(false)
    })

    it('rejects IPC from a child frame or a different webContents', () => {
        const mainFrame = { url: 'file:///app/index.html' }
        const webContents = { mainFrame }

        expect(isTrustedIpcSender({ sender: webContents, senderFrame: mainFrame }, webContents, mainFrame.url, true)).toBe(true)
        expect(isTrustedIpcSender({ sender: {}, senderFrame: mainFrame }, webContents, mainFrame.url, true)).toBe(false)
        expect(isTrustedIpcSender({ sender: webContents, senderFrame: { url: mainFrame.url } }, webContents, mainFrame.url, true)).toBe(false)
    })

    it('grants only audio capture and speaker selection permissions', () => {
        expect(isAllowedRendererPermission('media', ['audio'])).toBe(true)
        expect(isAllowedRendererPermission('speaker-selection')).toBe(true)
        expect(isAllowedRendererPermission('media', ['video'])).toBe(false)
        expect(isAllowedRendererPermission('media', ['audio', 'video'])).toBe(false)
        expect(isAllowedRendererPermission('notifications')).toBe(false)
    })
})

describe('IPC payload validation', () => {
    it('accepts legacy production access tokens during the server rollout', () => {
        const legacyToken = `1760000000000.${'a'.repeat(64)}`

        expect(parseToken(legacyToken)).toBe(legacyToken)
    })

    it('accepts bounded production values', () => {
        const token = `${'e'.repeat(180)}.${'a'.repeat(43)}`
        const settings = JSON.stringify({
            username: 'Player One',
            microphoneId: 'default',
            speakerId: 'default',
            micLevel: 75,
            channel: 2,
            noiseSuppression: 80,
            inputMode: 'ptt',
            pttKey: 'CapsLock',
            muteToggleEnabled: false,
            muteToggleKey: 'KeyM',
            vadThreshold: 10,
            joinSoundId: 'hero'
        })

        expect(parseToken(token)).toBe(token)
        expect(parseDeviceId('e8df0e95-7600-41f0-b835-f5504bbbfafd')).toBe('e8df0e95-7600-41f0-b835-f5504bbbfafd')
        expect(parsePttKey('CapsLock')).toBe('CapsLock')
        expect(parseNotificationPayload({ title: 'GamerScream', body: 'Player joined' })).toEqual({
            title: 'GamerScream',
            body: 'Player joined'
        })
        expect(parseSettingsPayload(settings)).toEqual(JSON.parse(settings))
        expect(parsePlayerVolumesPayload(JSON.stringify({
            'e8df0e95-7600-41f0-b835-f5504bbbfafd': 35,
            'legacy-player': 80
        }))).toEqual({
            'e8df0e95-7600-41f0-b835-f5504bbbfafd': 35,
            'legacy-player': 80
        })
    })

    it('rejects malformed or unbounded values', () => {
        expect(() => parseToken('not-a-token')).toThrow('Invalid access token')
        expect(() => parseDeviceId('../device')).toThrow('Invalid device ID')
        expect(() => parseDeviceId('device:legacy')).toThrow('Invalid device ID')
        expect(() => parsePttKey('x'.repeat(80))).toThrow('Invalid shortcut key')
        expect(() => parseNotificationPayload({ title: 'x'.repeat(101), body: 'ok' })).toThrow('Invalid notification')
        expect(() => parseSettingsPayload(JSON.stringify({ micLevel: 900 }))).toThrow('Invalid settings')
        expect(() => parsePlayerVolumesPayload(JSON.stringify({ player: 101 }))).toThrow('Invalid player volumes')
    })
})
