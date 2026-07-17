import { describe, expect, it, vi } from 'vitest'
import { createOverlayLifecycle } from '../../main/overlayLifecycle'
import { configureSingleInstance } from '../../main/singleInstance'
import { createPttStateController } from '../../main/pttState'

class FakeOverlayWindow {
    destroyed = false
    closed = vi.fn(() => { this.destroyed = true })
    private closedListener: (() => void) | null = null

    close(): void {
        this.closed()
    }

    isDestroyed(): boolean {
        return this.destroyed
    }

    on(event: 'closed', listener: () => void): void {
        if (event === 'closed') this.closedListener = listener
    }

    emitClosed(): void {
        this.closedListener?.()
    }
}

describe('overlay lifecycle', () => {
    it('an old close event or timer cannot clear or close the replacement overlay', () => {
        const timers: Array<() => void> = []
        const lifecycle = createOverlayLifecycle<FakeOverlayWindow>((callback) => {
            timers.push(callback)
            return timers.length
        })
        const first = new FakeOverlayWindow()
        const second = new FakeOverlayWindow()

        lifecycle.show(() => first, 5000)
        lifecycle.show(() => second, 5000)
        first.emitClosed()
        timers[0]()

        expect(lifecycle.current()).toBe(second)
        expect(second.closed).not.toHaveBeenCalled()

        timers[1]()
        expect(second.closed).toHaveBeenCalledOnce()
    })
})

describe('single-instance lifecycle', () => {
    it('quits a second process and focuses the existing window on a later launch', () => {
        let secondInstance: (() => void) | undefined
        const app = {
            requestSingleInstanceLock: vi.fn(() => false),
            quit: vi.fn(),
            on: vi.fn()
        }
        expect(configureSingleInstance(app, () => null)).toBe(false)
        expect(app.quit).toHaveBeenCalledOnce()

        const window = {
            isDestroyed: () => false,
            isMinimized: () => true,
            restore: vi.fn(),
            show: vi.fn(),
            focus: vi.fn()
        }
        app.requestSingleInstanceLock.mockReturnValue(true)
        app.on.mockImplementation((_event: string, listener: () => void) => { secondInstance = listener })
        expect(configureSingleInstance(app, () => window)).toBe(true)
        secondInstance?.()
        expect(window.restore).toHaveBeenCalledOnce()
        expect(window.show).toHaveBeenCalledOnce()
        expect(window.focus).toHaveBeenCalledOnce()
    })
})

describe('background push-to-talk state', () => {
    it('does not infer release before the slowest supported initial key-repeat delay', () => {
        const scheduled: Array<{ delay: number; callback: () => void }> = []
        const controller = createPttStateController({
            emitDown: vi.fn(),
            emitUp: vi.fn(),
            schedule: (callback, delay) => {
                scheduled.push({ callback, delay })
                return scheduled.length
            },
            cancel: vi.fn()
        })

        controller.keyDown()
        expect(scheduled[0].delay).toBeGreaterThan(1800)
    })

    it('emits one balanced key-down/key-up pair across repeats', () => {
        const callbacks = new Map<number, () => void>()
        let nextTimer = 0
        const emitDown = vi.fn()
        const emitUp = vi.fn()
        const controller = createPttStateController({
            emitDown,
            emitUp,
            schedule: (callback) => {
                const id = ++nextTimer
                callbacks.set(id, callback)
                return id
            },
            cancel: (id) => { callbacks.delete(id as number) }
        })

        controller.keyDown()
        controller.keyDown()
        controller.release()

        expect(emitDown).toHaveBeenCalledOnce()
        expect(emitUp).toHaveBeenCalledOnce()
        expect(callbacks.size).toBe(0)
    })
})
