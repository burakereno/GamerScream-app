import crypto from 'crypto'
import type express from 'express'

interface AttemptEntry {
    count: number
    lastAttempt: number
}

export class RateLimiter {
    private readonly attempts = new Map<string, AttemptEntry>()

    constructor(
        private readonly limit: number,
        private readonly windowMs: number,
        private readonly maxKeys = 5_000
    ) {}

    consume(key: string): boolean {
        const now = Date.now()
        const entry = this.attempts.get(key)
        if (!entry || now - entry.lastAttempt > this.windowMs) {
            this.ensureCapacity(entry === undefined)
            this.attempts.set(key, { count: 1, lastAttempt: now })
            return true
        }
        if (entry.count >= this.limit) return false
        entry.count++
        entry.lastAttempt = now
        return true
    }

    allowsFailure(key: string): boolean {
        const entry = this.attempts.get(key)
        return !entry || Date.now() - entry.lastAttempt > this.windowMs || entry.count < this.limit
    }

    recordFailure(key: string): void {
        const now = Date.now()
        const entry = this.attempts.get(key)
        if (!entry || now - entry.lastAttempt > this.windowMs) {
            this.ensureCapacity(entry === undefined)
            this.attempts.set(key, { count: 1, lastAttempt: now })
            return
        }
        entry.count++
        entry.lastAttempt = now
    }

    delete(key: string): void {
        this.attempts.delete(key)
    }

    refund(key: string): void {
        const entry = this.attempts.get(key)
        if (!entry) return
        entry.count--
        if (entry.count <= 0) this.attempts.delete(key)
    }

    reset(): void {
        this.attempts.clear()
    }

    private ensureCapacity(isNew: boolean): void {
        if (!isNew || this.attempts.size < this.maxKeys) return
        const oldest = this.attempts.keys().next().value
        if (oldest) this.attempts.delete(oldest)
    }
}

export function safeCompare(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false
    const actual = crypto.createHash('sha256').update(a, 'utf8').digest()
    const expected = crypto.createHash('sha256').update(b, 'utf8').digest()
    return crypto.timingSafeEqual(actual, expected)
}

export function requestBody(req: express.Request): Record<string, unknown> {
    return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {}
}

export function cleanDisplayName(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const clean = value.trim().normalize('NFC')
    if (!clean || clean.length > 20 || !/^[\p{L}\p{N} _-]+$/u.test(clean)) return null
    return clean
}

export async function withTimeout<T>(operation: Promise<T>, timeoutMs = 5_000): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            operation,
            new Promise<T>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error('LiveKit request timed out')), timeoutMs)
            })
        ])
    } finally {
        if (timeout) clearTimeout(timeout)
    }
}

export async function settleWithConcurrency<T, R>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency')
    const results = new Array<PromiseSettledResult<R>>(items.length)
    let nextIndex = 0
    const run = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++
            try {
                results[index] = { status: 'fulfilled', value: await worker(items[index]) }
            } catch (reason) {
                results[index] = { status: 'rejected', reason }
            }
        }
    }
    const workers = Math.min(concurrency, items.length)
    await Promise.all(Array.from({ length: workers }, run))
    return results
}
