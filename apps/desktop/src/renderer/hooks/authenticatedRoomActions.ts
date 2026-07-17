export type ParticipantInputMode = 'voice' | 'ptt' | 'vad'
export type ParticipantModeUpdateResult = 'updated' | 'auth-expired' | 'failed'

interface ResponseLike {
    ok: boolean
    status: number
}

interface ParticipantModeUpdateOptions {
    serverUrl: string
    accessToken: string
    room: string
    inputMode: ParticipantInputMode
    fetcher: (url: string, init: {
        method: 'POST'
        headers: Record<string, string>
        body: string
    }) => Promise<ResponseLike>
}

export function isAuthenticationFailureStatus(status: number): boolean {
    return status === 401 || status === 403
}

export async function updateParticipantMode({
    serverUrl,
    accessToken,
    room,
    inputMode,
    fetcher
}: ParticipantModeUpdateOptions): Promise<ParticipantModeUpdateResult> {
    try {
        const response = await fetcher(`${serverUrl}/api/participant-mode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-access-token': accessToken
            },
            body: JSON.stringify({ room, inputMode })
        })

        if (response.ok) return 'updated'
        return isAuthenticationFailureStatus(response.status) ? 'auth-expired' : 'failed'
    } catch {
        return 'failed'
    }
}
