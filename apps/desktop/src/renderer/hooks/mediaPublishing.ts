interface AudioTrackLike {
    enabled: boolean
}

interface LocalParticipantLike<TTrack extends AudioTrackLike, TSource> {
    publishTrack(track: TTrack, options: { source: TSource }): Promise<unknown>
    setMicrophoneEnabled(enabled: boolean): Promise<unknown>
}

export async function publishInitialMicrophoneTrack<TTrack extends AudioTrackLike, TSource>(
    participant: LocalParticipantLike<TTrack, TSource>,
    track: TTrack,
    enabled: boolean,
    source: TSource
): Promise<void> {
    track.enabled = enabled
    await participant.publishTrack(track, { source })
    await participant.setMicrophoneEnabled(enabled)
}
