import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../types'

export function useDesktopUpdate() {
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ phase: 'idle' })
    const [appVersion, setAppVersion] = useState('')

    useEffect(() => {
        const api = window.electronAPI
        if (!api?.onUpdateStatus) return

        let receivedEvent = false
        let active = true
        const unsubscribe = api.onUpdateStatus((status) => {
            receivedEvent = true
            setUpdateStatus(status)
        })
        api.getUpdateStatus().then((status) => {
            if (active && !receivedEvent) setUpdateStatus(status)
        }).catch(() => undefined)

        return () => {
            active = false
            unsubscribe()
        }
    }, [])

    useEffect(() => {
        window.electronAPI?.getAppVersion?.()
            .then(setAppVersion)
            .catch(() => setAppVersion(''))
    }, [])

    return { updateStatus, appVersion }
}
