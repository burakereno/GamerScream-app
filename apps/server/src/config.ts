import path from 'path'

export interface ServerConfig {
    isProduction: boolean
    port: number
    host: string
    livekitApiKey: string
    livekitApiSecret: string
    livekitUrl: string
    livekitHttpUrl: string
    livekitClientUrl: string
    configuredAppPin: string
    tokenSecret: string
    adminSecret?: string
    adminStatePath: string
}

function requiredOrDevelopment(
    environment: NodeJS.ProcessEnv,
    isProduction: boolean,
    name: string,
    developmentFallback: string
): string {
    const value = environment[name]
    if (value?.trim()) return value
    if (isProduction) throw new Error(`${name} is required in production`)
    return developmentFallback
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
    const value = environment[name]
    if (value?.trim()) return value
    throw new Error(`${name} is required`)
}

function isValidUrl(value: string, protocols: string[]): boolean {
    try {
        const parsed = new URL(value)
        return protocols.includes(parsed.protocol) && Boolean(parsed.hostname) &&
            !parsed.username && !parsed.password
    } catch {
        return false
    }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
    const isProduction = environment.NODE_ENV === 'production'
    const port = Number(environment.PORT || 3002)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Invalid PORT')

    const livekitApiKey = requiredOrDevelopment(environment, isProduction, 'LIVEKIT_API_KEY', 'devkey')
    const livekitApiSecret = requiredOrDevelopment(environment, isProduction, 'LIVEKIT_API_SECRET', 'devsecret')
    const livekitUrl = environment.LIVEKIT_URL || 'ws://localhost:7880'
    const livekitClientUrl = environment.LIVEKIT_CLIENT_URL || livekitUrl
    const livekitHttpUrl = environment.LIVEKIT_HTTP_URL || 'http://localhost:7880'
    const configuredAppPin = required(environment, 'APP_PIN')
    const tokenSecret = requiredOrDevelopment(
        environment,
        isProduction,
        'TOKEN_SECRET',
        'development-only-token-secret-change-me'
    )
    const adminSecret = environment.ADMIN_SECRET?.trim()
        ? environment.ADMIN_SECRET
        : (environment.NODE_ENV === 'test' ? 'test-admin-secret' : undefined)

    if (!/^\d{4,8}$/.test(configuredAppPin)) throw new Error('APP_PIN must be 4-8 digits')
    if (isProduction && Buffer.byteLength(tokenSecret, 'utf8') < 32) {
        throw new Error('TOKEN_SECRET must be at least 32 bytes in production')
    }
    if (isProduction && tokenSecret === 'development-only-token-secret-change-me') {
        throw new Error('The development TOKEN_SECRET is forbidden in production')
    }
    if (isProduction && !isValidUrl(livekitClientUrl, ['wss:'])) {
        throw new Error('LIVEKIT_CLIENT_URL must be a valid wss:// URL in production')
    }
    if (!isValidUrl(livekitHttpUrl, ['http:', 'https:'])) throw new Error('Invalid LIVEKIT_HTTP_URL')
    if (isProduction && (livekitApiKey === 'devkey' || livekitApiSecret === 'devsecret')) {
        throw new Error('Development LiveKit credentials are forbidden in production')
    }
    if (isProduction && !adminSecret) throw new Error('ADMIN_SECRET is required in production')
    if (isProduction && Buffer.byteLength(livekitApiSecret, 'utf8') < 16) {
        throw new Error('LIVEKIT_API_SECRET must be at least 16 bytes in production')
    }
    if (isProduction && adminSecret && Buffer.byteLength(adminSecret, 'utf8') < 16) {
        throw new Error('ADMIN_SECRET must be at least 16 bytes in production')
    }
    if (isProduction && adminSecret &&
        new Set([tokenSecret, adminSecret, livekitApiSecret]).size !== 3) {
        throw new Error('Production secrets must be independent')
    }

    return {
        isProduction,
        port,
        host: environment.HOST || '127.0.0.1',
        livekitApiKey,
        livekitApiSecret,
        livekitUrl,
        livekitHttpUrl,
        livekitClientUrl,
        configuredAppPin,
        tokenSecret,
        adminSecret,
        adminStatePath: environment.ADMIN_STATE_PATH || path.join(process.cwd(), 'data', 'admin-state.json')
    }
}
