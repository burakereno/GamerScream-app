const JOIN_SOUND_IDS = new Set(['hero', 'laser', 'coin', 'thunder', 'whoosh', 'bubble', 'horn', 'glitch', 'bell', 'drum'])

interface RemoteTrackLike {
    kind: string
    attach(): HTMLMediaElement
    setVolume(volume: number): void
}

interface DetachableRemoteTrackLike {
    kind: string
    detach(): Array<{ remove(): void }>
}

interface DocumentLike {
    getElementById(id: string): { remove(): void } | null | undefined
    body: { appendChild(element: HTMLMediaElement): unknown }
}

interface AttachRemoteAudioTrackOptions {
    track: RemoteTrackLike
    participantIdentity: string
    volume: number
    speakerId: string
    document: DocumentLike
}

export function attachRemoteAudioTrack({
    track,
    participantIdentity,
    volume,
    speakerId,
    document
}: AttachRemoteAudioTrackOptions): boolean {
    if (track.kind !== 'audio') return false

    document.getElementById(`audio-${participantIdentity}`)?.remove()
    const element = track.attach()
    element.id = `audio-${participantIdentity}`
    if (speakerId && typeof element.setSinkId === 'function') {
        void element.setSinkId(speakerId).catch(() => undefined)
    }
    document.body.appendChild(element)
    track.setVolume(volume)
    return true
}

interface DetachRemoteAudioTrackOptions {
    track: DetachableRemoteTrackLike
    participantIdentity: string
    document: DocumentLike
}

export function detachRemoteAudioTrack({
    track,
    participantIdentity,
    document
}: DetachRemoteAudioTrackOptions): boolean {
    if (track.kind !== 'audio') return false

    track.detach().forEach((element) => element.remove())
    document.getElementById(`audio-${participantIdentity}`)?.remove()
    return true
}

export function parseJoinSoundMessage(message: string): string | null {
    if (message.length > 64 || !message.startsWith('join-sound:')) return null
    const soundId = message.slice('join-sound:'.length)
    return JOIN_SOUND_IDS.has(soundId) ? soundId : null
}

export interface ParticipantEventRateLimiter {
    allow(participantId: string, now?: number): boolean
}

export function createParticipantEventRateLimiter(windowMs: number): ParticipantEventRateLimiter {
    const lastEventByParticipant = new Map<string, number>()
    return {
        allow: (participantId, now = Date.now()) => {
            const lastEvent = lastEventByParticipant.get(participantId)
            if (lastEvent !== undefined && now - lastEvent < windowMs) return false
            lastEventByParticipant.set(participantId, now)
            return true
        }
    }
}
