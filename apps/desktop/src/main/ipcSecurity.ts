interface FrameLike {
    url: string
}

interface WebContentsLike {
    mainFrame: FrameLike
}

interface IpcEventLike {
    sender: unknown
    senderFrame: unknown
}

export function isTrustedRendererUrl(candidateUrl: string, expectedUrl: string, isPackaged: boolean): boolean {
    try {
        const candidate = new URL(candidateUrl)
        const expected = new URL(expectedUrl)

        if (isPackaged) {
            return candidate.protocol === expected.protocol &&
                candidate.host === expected.host &&
                candidate.username === expected.username &&
                candidate.password === expected.password &&
                candidate.pathname === expected.pathname &&
                candidate.search === expected.search
        }

        return candidate.origin === expected.origin && ['http:', 'https:'].includes(candidate.protocol)
    } catch {
        return false
    }
}

export function isTrustedIpcSender(
    event: IpcEventLike,
    expectedWebContents: WebContentsLike | null,
    expectedUrl: string,
    isPackaged: boolean
): boolean {
    if (!expectedWebContents) return false
    if (event.sender !== expectedWebContents) return false
    if (event.senderFrame !== expectedWebContents.mainFrame) return false
    return isTrustedRendererUrl(expectedWebContents.mainFrame.url, expectedUrl, isPackaged)
}

export function isAllowedRendererPermission(permission: string, mediaTypes: readonly string[] = []): boolean {
    if (permission === 'speaker-selection') return true
    return permission === 'media' && mediaTypes.length > 0 && mediaTypes.every((type) => type === 'audio')
}
