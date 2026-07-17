interface PttStateDependencies {
    emitDown(): void
    emitUp(): void
    schedule(callback: () => void, delay: number): unknown
    cancel(timer: unknown): void
    initialRepeatTimeoutMs?: number
    repeatedKeyTimeoutMs?: number
}

export interface PttStateController {
    keyDown(): void
    release(): void
    cancelTimer(): void
    isHeld(): boolean
}

export function createPttStateController({
    emitDown,
    emitUp,
    schedule,
    cancel,
    initialRepeatTimeoutMs = 2000,
    repeatedKeyTimeoutMs = 300
}: PttStateDependencies): PttStateController {
    let held = false
    let repeatSeen = false
    let timer: unknown = null

    const cancelTimer = (): void => {
        if (timer === null) return
        cancel(timer)
        timer = null
    }

    const release = (): void => {
        cancelTimer()
        if (!held) return
        held = false
        repeatSeen = false
        emitUp()
    }

    const resetTimer = (): void => {
        cancelTimer()
        timer = schedule(release, repeatSeen ? repeatedKeyTimeoutMs : initialRepeatTimeoutMs)
    }

    return {
        keyDown: () => {
            if (!held) {
                held = true
                repeatSeen = false
                emitDown()
            } else {
                repeatSeen = true
            }
            resetTimer()
        },
        release,
        cancelTimer,
        isHeld: () => held
    }
}
