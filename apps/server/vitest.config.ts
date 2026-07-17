import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        env: {
            APP_PIN: '8642',
            ADMIN_SECRET: 'test-admin-secret',
            TOKEN_SECRET: 'test-token-secret',
            LIVEKIT_API_KEY: 'test-key',
            LIVEKIT_API_SECRET: 'test-secret',
            LIVEKIT_URL: 'ws://localhost:7880',
            LIVEKIT_HTTP_URL: 'http://localhost:7880',
            LIVEKIT_CLIENT_URL: 'ws://localhost:7880'
        }
    }
})
