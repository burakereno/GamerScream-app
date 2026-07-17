import { describe, it, expect, beforeEach } from 'vitest'
import { generateAccessToken, isValidAccessToken, safeCompare } from '../index'
import { settleWithConcurrency } from '../security-utils'

describe('Helper Functions', () => {
    describe('generateAccessToken / isValidAccessToken', () => {
        it('generates a valid token', () => {
            const token = generateAccessToken()
            expect(token).toBeDefined()
            expect(token.split('.').length).toBe(2)
        })

        it('issues a unique session token for every successful verification', () => {
            const first = generateAccessToken()
            const second = generateAccessToken()

            expect(first).not.toBe(second)
        })

        it('validates a freshly generated token', () => {
            const token = generateAccessToken()
            expect(isValidAccessToken(token)).toBe(true)
        })

        it('rejects a tampered token', () => {
            const token = generateAccessToken()
            const replacement = token.endsWith('x') ? 'y' : 'x'
            const tampered = token.slice(0, -1) + replacement
            expect(isValidAccessToken(tampered)).toBe(false)
        })

        it('rejects a completely invalid token', () => {
            expect(isValidAccessToken('garbage')).toBe(false)
            expect(isValidAccessToken('')).toBe(false)
            expect(isValidAccessToken('a.b.c')).toBe(false)
        })
    })

    describe('safeCompare', () => {
        it('returns true for identical strings', () => {
            expect(safeCompare('same', 'same')).toBe(true)
        })

        it('returns false for different strings of same length', () => {
            expect(safeCompare('left', 'fork')).toBe(false)
        })

        it('returns false for different length strings', () => {
            expect(safeCompare('short', 'longer')).toBe(false)
        })

        it('returns false for empty vs non-empty', () => {
            expect(safeCompare('', 'a')).toBe(false)
        })
    })

    it('settles every task while respecting the concurrency bound', async () => {
        let active = 0
        let maximumActive = 0
        const results = await settleWithConcurrency([1, 2, 3, 4], 2, async value => {
            active++
            maximumActive = Math.max(maximumActive, active)
            await Promise.resolve()
            active--
            if (value === 3) throw new Error('expected failure')
            return value * 2
        })

        expect(maximumActive).toBeLessThanOrEqual(2)
        expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled'])
    })
})
