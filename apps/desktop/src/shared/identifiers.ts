const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function isValidDeviceId(value: unknown): value is string {
    return typeof value === 'string' && DEVICE_ID_PATTERN.test(value)
}
