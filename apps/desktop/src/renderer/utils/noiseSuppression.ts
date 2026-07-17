export function clampNoiseSuppression(level: number): number {
    if (!Number.isFinite(level)) return 100
    return Math.max(0, Math.min(100, level))
}

interface GainNodeLike {
    gain: { value: number }
}

export function applyNoiseSuppressionMix(
    wetGain: GainNodeLike,
    dryGain: GainNodeLike,
    level: number,
    processorAvailable = true
): number {
    const wetLevel = processorAvailable ? clampNoiseSuppression(level) : 0
    wetGain.gain.value = wetLevel / 100
    dryGain.gain.value = 1 - wetLevel / 100
    return wetLevel
}

export function withReconnectNoiseSuppression<T extends { noiseSuppression: number }>(
    params: T | null,
    level: number
): T | null {
    return params ? { ...params, noiseSuppression: clampNoiseSuppression(level) } : null
}
