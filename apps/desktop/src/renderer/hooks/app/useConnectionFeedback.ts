import { useCallback, useEffect, useState } from 'react'

const RECONNECT_ERROR = 'Could not reconnect. Check your connection and select Connect to try again.'

export function useConnectionFeedback() {
    const [connectError, setConnectError] = useState<string | null>(null)

    useEffect(() => {
        if (!connectError) return
        const timer = setTimeout(() => setConnectError(null), 5000)
        return () => clearTimeout(timer)
    }, [connectError])

    const clearConnectError = useCallback(() => setConnectError(null), [])
    const reportConnectError = useCallback((message: string) => setConnectError(message), [])
    const reportReconnectFailure = useCallback(() => setConnectError(RECONNECT_ERROR), [])

    return {
        connectError,
        clearConnectError,
        reportConnectError,
        reportReconnectFailure
    }
}
