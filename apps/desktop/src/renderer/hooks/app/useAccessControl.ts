import { useCallback, useEffect, useState } from 'react'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3002'

interface AccessVerificationResponse {
    valid?: boolean
}

interface PinVerificationResponse {
    accessToken?: string
    error?: string
}

export function useAccessControl() {
    const [accessVerified, setAccessVerified] = useState(false)
    const [checkingAccess, setCheckingAccess] = useState(true)

    useEffect(() => {
        (async () => {
            const stored = await window.electronAPI?.getStoredToken?.() || null
            if (!stored) {
                setCheckingAccess(false)
                return
            }

            try {
                const response = await fetch(`${SERVER_URL}/api/verify-access-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken: stored })
                })
                const data = await response.json() as AccessVerificationResponse
                if (data.valid) {
                    setAccessVerified(true)
                    window.__gamerScreamAccessToken = stored
                } else {
                    window.electronAPI?.removeStoredToken?.()
                }
            } catch {
                await window.electronAPI?.removeStoredToken?.()
                window.__gamerScreamAccessToken = undefined
            } finally {
                setCheckingAccess(false)
            }
        })()
    }, [])

    const submitPin = useCallback(async (pin: string): Promise<boolean | string> => {
        try {
            const response = await fetch(`${SERVER_URL}/api/verify-app-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            })
            if (!response.ok) {
                if (response.status === 403) return false
                try {
                    const data = await response.json() as PinVerificationResponse
                    return data.error || 'PIN verification failed'
                } catch {
                    return 'PIN verification failed'
                }
            }

            const data = await response.json() as PinVerificationResponse
            if (data.accessToken) {
                try {
                    const persisted = await window.electronAPI?.setStoredToken?.(data.accessToken)
                    if (persisted === false) console.warn('[PIN] Secure token persistence unavailable')
                } catch (error) {
                    // The verified token can remain memory-only for this session.
                    console.error('[PIN] Secure token storage failed:', error)
                }
                window.__gamerScreamAccessToken = data.accessToken
                setAccessVerified(true)
                return true
            }
            return false
        } catch (error) {
            console.error('[PIN] Server unreachable:', error)
            return 'Server unreachable — check your connection'
        }
    }, [])

    const revokeAccess = useCallback(() => {
        window.electronAPI?.removeStoredToken?.()
        window.__gamerScreamAccessToken = undefined
        setAccessVerified(false)
    }, [])

    return { accessVerified, checkingAccess, submitPin, revokeAccess }
}
