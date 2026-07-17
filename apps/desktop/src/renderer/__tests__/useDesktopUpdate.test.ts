import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../types'
import { useDesktopUpdate } from '../hooks/app/useDesktopUpdate'

describe('useDesktopUpdate', () => {
    it('keeps a pushed update event when the initial snapshot resolves later', async () => {
        const api = window.electronAPI as any
        const unsubscribe = vi.fn()
        let emitStatus: (status: UpdateStatus) => void = () => undefined
        let resolveSnapshot: (status: UpdateStatus) => void = () => undefined

        api.onUpdateStatus = vi.fn((listener: (status: UpdateStatus) => void) => {
            emitStatus = listener
            return unsubscribe
        })
        api.getUpdateStatus = vi.fn(() => new Promise<UpdateStatus>((resolve) => {
            resolveSnapshot = resolve
        }))
        api.getAppVersion = vi.fn().mockResolvedValue('2.8.0')

        const { result, unmount } = renderHook(() => useDesktopUpdate())
        act(() => emitStatus({ phase: 'downloading', version: '2.8.0', percent: 42 }))
        await act(async () => {
            resolveSnapshot({ phase: 'idle' })
            await Promise.resolve()
        })

        expect(result.current.updateStatus).toEqual({
            phase: 'downloading',
            version: '2.8.0',
            percent: 42
        })
        await waitFor(() => expect(result.current.appVersion).toBe('2.8.0'))

        unmount()
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })
})
