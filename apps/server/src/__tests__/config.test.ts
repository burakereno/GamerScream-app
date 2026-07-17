import { describe, expect, it } from 'vitest'
import { loadConfig } from '../config'

const productionEnvironment = {
    NODE_ENV: 'production',
    APP_PIN: '2468',
    TOKEN_SECRET: '0123456789abcdef0123456789abcdef',
    ADMIN_SECRET: 'admin-secret-0123456789',
    LIVEKIT_API_KEY: 'production-key',
    LIVEKIT_API_SECRET: 'livekit-secret-0123456789',
    LIVEKIT_CLIENT_URL: 'wss://voice.example.test',
    LIVEKIT_HTTP_URL: 'http://livekit:7880'
}

describe('production configuration', () => {
    it('accepts distinct non-development credentials and a secure client URL', () => {
        const config = loadConfig(productionEnvironment)

        expect(config.isProduction).toBe(true)
        expect(config.livekitClientUrl).toBe('wss://voice.example.test')
    })

    it('rejects reused secrets', () => {
        expect(() => loadConfig({
            ...productionEnvironment,
            ADMIN_SECRET: productionEnvironment.TOKEN_SECRET
        })).toThrow('Production secrets must be independent')
    })

    it('rejects whitespace-only credentials and malformed secure URLs', () => {
        expect(() => loadConfig({
            ...productionEnvironment,
            LIVEKIT_API_KEY: '   '
        })).toThrow('LIVEKIT_API_KEY is required in production')
        expect(() => loadConfig({
            ...productionEnvironment,
            LIVEKIT_CLIENT_URL: 'wss://'
        })).toThrow('LIVEKIT_CLIENT_URL must be a valid wss:// URL in production')
    })
})

describe('application PIN configuration', () => {
    it('requires APP_PIN to be supplied outside the source code', () => {
        expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('APP_PIN is required')
    })
})
