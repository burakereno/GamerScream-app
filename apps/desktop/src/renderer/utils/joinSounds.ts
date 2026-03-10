/**
 * 10 pre-built join sounds generated with Web Audio API.
 * No external files — all sounds are synthesized programmatically.
 */

export interface JoinSoundDef {
    id: string
    name: string
    emoji: string
}

export const JOIN_SOUNDS: JoinSoundDef[] = [
    { id: 'hero', name: 'Hero', emoji: '🎺' },
    { id: 'laser', name: 'Laser', emoji: '⚡' },
    { id: 'coin', name: 'Coin', emoji: '🪙' },
    { id: 'thunder', name: 'Thunder', emoji: '⛈' },
    { id: 'whoosh', name: 'Whoosh', emoji: '💨' },
    { id: 'bubble', name: 'Bubble', emoji: '🫧' },
    { id: 'horn', name: 'Horn', emoji: '📯' },
    { id: 'glitch', name: 'Glitch', emoji: '🔊' },
    { id: 'bell', name: 'Bell', emoji: '🔔' },
    { id: 'drum', name: 'Drum', emoji: '🥁' }
]

let soundCtx: AudioContext | null = null
let soundSpeakerDeviceId = ''

function getCtx(): AudioContext {
    if (!soundCtx || soundCtx.state === 'closed') {
        soundCtx = new AudioContext()
        if (soundSpeakerDeviceId && typeof (soundCtx as any).setSinkId === 'function') {
            (soundCtx as any).setSinkId(soundSpeakerDeviceId).catch(() => { })
        }
    }
    return soundCtx
}

/** Update the speaker device for join sounds */
export function setJoinSoundSpeaker(deviceId: string): void {
    soundSpeakerDeviceId = deviceId
    if (soundCtx && typeof (soundCtx as any).setSinkId === 'function') {
        (soundCtx as any).setSinkId(deviceId).catch(() => { })
    }
}

// ============================================
// Sound generators
// ============================================

function playHero(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

    // Fanfare: three ascending notes
    const notes = [523.25, 659.25, 783.99] // C5 E5 G5
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(freq, t + i * 0.12)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.12, t + i * 0.12)
        gain.gain.setValueAtTime(0.12, t + i * 0.12)
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.2)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t + i * 0.12)
        osc.stop(t + i * 0.12 + 0.25)
    })
}

function playLaser(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(1500, t)
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.4)
    gain.gain.setValueAtTime(0.15, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.45)
}

function playCoin(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

        // Two quick pings
        ;[988, 1319].forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'square'
            osc.frequency.setValueAtTime(freq, t + i * 0.07)
            gain.gain.setValueAtTime(0.1, t + i * 0.07)
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.15)
            osc.connect(gain).connect(ctx.destination)
            osc.start(t + i * 0.07)
            osc.stop(t + i * 0.07 + 0.2)
        })
}

function playThunder(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

    // Noise burst rumble
    const bufferSize = ctx.sampleRate * 0.6
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3))
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(200, t)
    filter.frequency.linearRampToValueAtTime(60, t + 0.6)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.3, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)

    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start(t)
    source.stop(t + 0.65)
}

function playWhoosh(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

    const bufferSize = ctx.sampleRate * 0.35
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
        const env = Math.sin((i / bufferSize) * Math.PI) // bell curve
        data[i] = (Math.random() * 2 - 1) * env
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(500, t)
    filter.frequency.exponentialRampToValueAtTime(3000, t + 0.15)
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.35)
    filter.Q.setValueAtTime(2, t)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.2, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)

    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start(t)
    source.stop(t + 0.4)
}

function playBubble(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

        // Bubbly ascending pops
        ;[0, 0.08, 0.15, 0.21].forEach((offset, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            const freq = 400 + i * 150
            osc.type = 'sine'
            osc.frequency.setValueAtTime(freq, t + offset)
            osc.frequency.exponentialRampToValueAtTime(freq * 1.8, t + offset + 0.06)
            gain.gain.setValueAtTime(0.12, t + offset)
            gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.1)
            osc.connect(gain).connect(ctx.destination)
            osc.start(t + offset)
            osc.stop(t + offset + 0.12)
        })
}

function playHorn(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

        // Air horn — stacked detuned sawtooths
        ;[0, 3, -3].forEach((detune) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(480, t)
            osc.detune.setValueAtTime(detune * 10, t)
            gain.gain.setValueAtTime(0.08, t)
            gain.gain.setValueAtTime(0.08, t + 0.3)
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
            osc.connect(gain).connect(ctx.destination)
            osc.start(t)
            osc.stop(t + 0.55)
        })
}

function playGlitch(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

    // Digital glitch: rapid frequency jumps
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'

    const freqs = [200, 1200, 400, 2000, 300, 1800, 100]
    freqs.forEach((f, i) => {
        osc.frequency.setValueAtTime(f, t + i * 0.04)
    })

    gain.gain.setValueAtTime(0.1, t)
    gain.gain.setValueAtTime(0.1, t + 0.25)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)

    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.4)
}

function playBell(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

    // Crystal bell: fundamental + overtones
    const fundamentals = [880, 880 * 2.76, 880 * 5.4]
    fundamentals.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, t)
        const vol = 0.1 / (i + 1)
        gain.gain.setValueAtTime(vol, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8 - i * 0.15)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.85)
    })
}

function playDrum(): void {
    const ctx = getCtx()
    const t = ctx.currentTime

    // Snare roll: rapid hits with noise
    for (let i = 0; i < 6; i++) {
        const offset = i * 0.05
        // Tone component
        const osc = ctx.createOscillator()
        const oscGain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(180, t + offset)
        osc.frequency.exponentialRampToValueAtTime(80, t + offset + 0.04)
        oscGain.gain.setValueAtTime(0.12, t + offset)
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.05)
        osc.connect(oscGain).connect(ctx.destination)
        osc.start(t + offset)
        osc.stop(t + offset + 0.06)

        // Noise component
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / (d.length * 0.3))
        const noise = ctx.createBufferSource()
        noise.buffer = buf
        const nGain = ctx.createGain()
        nGain.gain.setValueAtTime(0.08, t + offset)
        nGain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.04)
        const hpf = ctx.createBiquadFilter()
        hpf.type = 'highpass'
        hpf.frequency.setValueAtTime(2000, t + offset)
        noise.connect(hpf).connect(nGain).connect(ctx.destination)
        noise.start(t + offset)
        noise.stop(t + offset + 0.05)
    }
}

// ============================================
// Public API
// ============================================

const SOUND_MAP: Record<string, () => void> = {
    hero: playHero,
    laser: playLaser,
    coin: playCoin,
    thunder: playThunder,
    whoosh: playWhoosh,
    bubble: playBubble,
    horn: playHorn,
    glitch: playGlitch,
    bell: playBell,
    drum: playDrum
}

/** Play a join sound by ID. Used both for preview and when receiving via DataChannel. */
export function playJoinSoundById(id: string): void {
    if (!id || !SOUND_MAP[id]) return
    try {
        // Ensure speaker routing is set
        const ctx = getCtx()
        if (soundSpeakerDeviceId && typeof (ctx as any).setSinkId === 'function') {
            (ctx as any).setSinkId(soundSpeakerDeviceId).catch(() => { })
        }
        SOUND_MAP[id]()
    } catch {
        // AudioContext not available
    }
}
