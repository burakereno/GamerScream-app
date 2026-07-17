import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccessControl } from '../hooks/app/useAccessControl'

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

describe('useAccessControl', () => {
    const api = window.electronAPI as any

    beforeEach(() => {
        api.getStoredToken = vi.fn().mockResolvedValue(null)
        api.setStoredToken = vi.fn().mockResolvedValue(true)
        api.removeStoredToken = vi.fn().mockResolvedValue(true)
        window.__gamerScreamAccessToken = undefined
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        window.__gamerScreamAccessToken = undefined
    })

    it('restores a valid persisted access token', async () => {
        api.getStoredToken.mockResolvedValue('persisted-access-token')
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ valid: true })))

        const { result } = renderHook(() => useAccessControl())

        await waitFor(() => expect(result.current.checkingAccess).toBe(false))
        expect(result.current.accessVerified).toBe(true)
        expect(window.__gamerScreamAccessToken).toBe('persisted-access-token')
    })

    it('preserves a non-auth server error returned during PIN verification', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
            error: 'Too many attempts. Try again later.'
        }, 429)))
        const { result } = renderHook(() => useAccessControl())
        await waitFor(() => expect(result.current.checkingAccess).toBe(false))

        let response: boolean | string = false
        await act(async () => {
            response = await result.current.submitPin('8642')
        })

        expect(response).toBe('Too many attempts. Try again later.')
        expect(result.current.accessVerified).toBe(false)
    })

    it('keeps verified access in memory when secure persistence fails', async () => {
        const token = `1760000000000.${'a'.repeat(64)}`
        api.setStoredToken.mockRejectedValue(new Error('Secure storage unavailable'))
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ accessToken: token })))
        const { result } = renderHook(() => useAccessControl())
        await waitFor(() => expect(result.current.checkingAccess).toBe(false))

        let response: boolean | string = false
        await act(async () => {
            response = await result.current.submitPin('8642')
        })

        expect(response).toBe(true)
        expect(result.current.accessVerified).toBe(true)
        expect(window.__gamerScreamAccessToken).toBe(token)
    })
})
