/**
 * Discord-style notification sounds using Web Audio API
 * No external files needed — all sounds are generated programmatically.
 * Supports routing to a specific output device via setSinkId.
 */

let audioCtx: AudioContext | null = null
let speakerDeviceId: string = ''

function getCtx(): AudioContext {
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
}

/** Set the output device for notification sounds */
export function setSoundOutputDevice(deviceId: string): void {
    speakerDeviceId = deviceId
    // If AudioContext exists, re-route it
    if (audioCtx && typeof (audioCtx as any).setSinkId === 'function') {
        (audioCtx as any).setSinkId(deviceId).catch(() => { /* device unavailable */ })
    }
}

/** Short rising "plop" — someone joined */
export function playJoinSound(): void {
    try {
        const ctx = getCtx()
        // Route to selected speaker if set
        if (speakerDeviceId && typeof (ctx as any).setSinkId === 'function') {
            (ctx as any).setSinkId(speakerDeviceId).catch(() => { /* ignore */ })
        }
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(600, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08)

        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.15)
    } catch {
        // Audio context not available
    }
}

/** Short falling "bonk" — someone left */
export function playLeaveSound(): void {
    try {
        const ctx = getCtx()
        // Route to selected speaker if set
        if (speakerDeviceId && typeof (ctx as any).setSinkId === 'function') {
            (ctx as any).setSinkId(speakerDeviceId).catch(() => { /* ignore */ })
        }
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(500, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.12)

        gain.gain.setValueAtTime(0.12, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.18)
    } catch {
        // Audio context not available
    }
}
