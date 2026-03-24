import { describe, it, expect, beforeEach } from 'vitest'
import { generateAccessToken, isValidAccessToken, safeCompare } from '../index'

describe('Helper Functions', () => {
    describe('generateAccessToken / isValidAccessToken', () => {
        it('generates a valid token', () => {
            const token = generateAccessToken()
            expect(token).toBeDefined()
            expect(token.split('.').length).toBe(2)
        })

        it('validates a freshly generated token', () => {
            const token = generateAccessToken()
            expect(isValidAccessToken(token)).toBe(true)
        })

        it('rejects a tampered token', () => {
            const token = generateAccessToken()
            const tampered = token.slice(0, -1) + 'x'
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
            expect(safeCompare('1520', '1520')).toBe(true)
        })

        it('returns false for different strings of same length', () => {
            expect(safeCompare('1520', '1521')).toBe(false)
        })

        it('returns false for different length strings', () => {
            expect(safeCompare('short', 'longer')).toBe(false)
        })

        it('returns false for empty vs non-empty', () => {
            expect(safeCompare('', 'a')).toBe(false)
        })
    })
})
