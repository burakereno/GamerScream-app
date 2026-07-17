export function clampNoiseSuppression(level: number): number {
    if (!Number.isFinite(level)) return 100
    return Math.max(0, Math.min(100, level))
}

export function withReconnectNoiseSuppression<T extends { noiseSuppression: number }>(
    params: T | null,
    level: number
): T | null {
    return params ? { ...params, noiseSuppression: clampNoiseSuppression(level) } : null
}
