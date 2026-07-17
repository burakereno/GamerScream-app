import { describe, expect, it, vi } from 'vitest'
import { createUpdateStateController } from '../../main/updateState'

describe('desktop update state', () => {
    it('allows installation only after the updater reports a real downloaded artifact', () => {
        const install = vi.fn()
        const states: Array<{ phase: string; version?: string }> = []
        const controller = createUpdateStateController({
            emit: (state) => states.push(state),
            install
        })

        controller.updateAvailable('2.8.0')
        expect(controller.installUpdate()).toEqual({
            ok: false,
            error: 'Update is not ready to install'
        })
        expect(install).not.toHaveBeenCalled()

        controller.updateDownloaded('2.8.0')
        expect(controller.installUpdate()).toEqual({ ok: true })
        expect(install).toHaveBeenCalledOnce()
        expect(states.at(-1)).toMatchObject({ phase: 'downloaded', version: '2.8.0' })
    })

    it('publishes progress and a recoverable error after an announced update', () => {
        const states: Array<{ phase: string; percent?: number; error?: string }> = []
        const controller = createUpdateStateController({
            emit: (state) => states.push(state),
            install: vi.fn()
        })

        controller.updateAvailable('2.8.0')
        controller.downloadProgress(42.4)
        controller.updateError(new Error('network unavailable'))

        expect(states).toContainEqual(expect.objectContaining({ phase: 'downloading', percent: 42.4 }))
        expect(states.at(-1)).toEqual({
            phase: 'error',
            version: '2.8.0',
            error: 'network unavailable'
        })
    })
})
