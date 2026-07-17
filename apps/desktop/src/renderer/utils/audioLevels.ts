type FrequencyAnalyser = Pick<AnalyserNode, 'getByteFrequencyData'>

export function readFrequencyLevel(analyser: FrequencyAnalyser, data: Uint8Array<ArrayBuffer>): number {
    if (data.length === 0) return 0
    analyser.getByteFrequencyData(data)
    let sum = 0
    for (const sample of data) sum += sample
    return Math.min(1, (sum / data.length) / 128)
}
