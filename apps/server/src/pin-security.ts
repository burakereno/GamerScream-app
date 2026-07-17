import crypto from 'crypto'

const KEY_LENGTH = 32

export function hashPin(pin: string): string {
    const salt = crypto.randomBytes(16)
    const digest = crypto.scryptSync(pin, salt, KEY_LENGTH)
    return `scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}`
}

export async function hashPinAsync(pin: string): Promise<string> {
    const salt = crypto.randomBytes(16)
    const digest = await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(pin, salt, KEY_LENGTH, (error, derivedKey) => {
            if (error) reject(error)
            else resolve(derivedKey)
        })
    })
    return `scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}`
}

export function verifyPinHash(pin: string, encoded: string): boolean {
    try {
        const [algorithm, saltValue, digestValue, extra] = encoded.split('$')
        if (algorithm !== 'scrypt' || !saltValue || !digestValue || extra !== undefined) return false
        const expected = Buffer.from(digestValue, 'base64url')
        if (expected.length !== KEY_LENGTH) return false
        const actual = crypto.scryptSync(pin, Buffer.from(saltValue, 'base64url'), KEY_LENGTH)
        return crypto.timingSafeEqual(actual, expected)
    } catch {
        return false
    }
}

export async function verifyPinHashAsync(pin: string, encoded: string): Promise<boolean> {
    try {
        const [algorithm, saltValue, digestValue, extra] = encoded.split('$')
        if (algorithm !== 'scrypt' || !saltValue || !digestValue || extra !== undefined) return false
        const expected = Buffer.from(digestValue, 'base64url')
        if (expected.length !== KEY_LENGTH) return false
        const actual = await new Promise<Buffer>((resolve, reject) => {
            crypto.scrypt(pin, Buffer.from(saltValue, 'base64url'), KEY_LENGTH, (error, derivedKey) => {
                if (error) reject(error)
                else resolve(derivedKey)
            })
        })
        return crypto.timingSafeEqual(actual, expected)
    } catch {
        return false
    }
}
