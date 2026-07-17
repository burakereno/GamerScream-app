import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer content security policy', () => {
    it('permits RNNoise WebAssembly without enabling general script eval', () => {
        const html = readFileSync(resolve('src/renderer/index.html'), 'utf8')

        expect(html).toContain("script-src 'self' 'wasm-unsafe-eval'")
        expect(html).not.toMatch(/script-src[^;]*\s'unsafe-eval'(?:\s|;)/)
    })
})
