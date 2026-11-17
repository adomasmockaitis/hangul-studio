/**
 * Aufnahmen für den Abgleich komprimieren: PCM ⇄ Opus (WebCodecs), etwa 15-mal kleiner.
 * Format: Folge von [Länge (2 Byte, little endian)][Opus-Paket]. Ohne WebCodecs wird nicht synchronisiert.
 */

export const OPUS_BITRATE = 24_000
const SUPPORTED_RATES = [8000, 12000, 16000, 24000, 48000]

export async function opusSupported(rate = 24000): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined' || !SUPPORTED_RATES.includes(rate)) return false
  try {
    const e = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: rate, numberOfChannels: 1, bitrate: OPUS_BITRATE })
    const d = await AudioDecoder.isConfigSupported({ codec: 'opus', sampleRate: rate, numberOfChannels: 1 })
    return !!e.supported && !!d.supported
  } catch {
    return false
  }
}

export async function encodeOpus(pcm: Int16Array, rate: number): Promise<Uint8Array> {
  // 60 ms Stille anhängen: Opus verzögert intern ein paar Millisekunden, so geht vom Wortende nichts verloren
  const padded = new Int16Array(pcm.length + Math.round(rate * 0.06))
  padded.set(pcm)
  const packets: Uint8Array[] = []
  let failure: unknown = null
  const enc = new AudioEncoder({
    output: (chunk) => {
      const b = new Uint8Array(chunk.byteLength)
      chunk.copyTo(b)
      packets.push(b)
    },
    error: (e) => (failure = e),
  })
  enc.configure({ codec: 'opus', sampleRate: rate, numberOfChannels: 1, bitrate: OPUS_BITRATE })
  const frame = Math.round(rate * 0.02) // 20-ms-Blöcke
  for (let i = 0; i < padded.length; i += frame) {
    const part = padded.slice(i, i + frame)
    const data = new AudioData({ format: 's16', sampleRate: rate, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round((i / rate) * 1e6), data: part })
    enc.encode(data)
    data.close()
  }
  await enc.flush()
  enc.close()
  if (failure) throw failure
  const total = packets.reduce((a, p) => a + 2 + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of packets) {
    out[o] = p.length & 0xff
    out[o + 1] = p.length >> 8
    out.set(p, o + 2)
    o += 2 + p.length
  }
  return out
}

/** Liefert PCM mit der Abtastrate des Decoders (Browser geben Opus oft mit 48 kHz aus) */
export async function decodeOpus(bytes: Uint8Array, rate: number): Promise<{ pcm: Int16Array; rate: number }> {
  const parts: Float32Array[] = []
  let outRate = rate
  let failure: unknown = null
  const dec = new AudioDecoder({
    output: (d) => {
      const f = new Float32Array(d.numberOfFrames)
      d.copyTo(f, { planeIndex: 0, format: 'f32-planar' })
      outRate = d.sampleRate
      parts.push(f)
      d.close()
    },
    error: (e) => (failure = e),
  })
  dec.configure({ codec: 'opus', sampleRate: rate, numberOfChannels: 1 })
  let o = 0
  let t = 0
  while (o + 2 <= bytes.length) {
    const len = bytes[o] | (bytes[o + 1] << 8)
    const pkt = bytes.subarray(o + 2, o + 2 + len)
    dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: t, data: pkt }))
    t += 20_000
    o += 2 + len
  }
  await dec.flush()
  dec.close()
  if (failure) throw failure
  const n = parts.reduce((a, p) => a + p.length, 0)
  const out = new Int16Array(n)
  let k = 0
  for (const p of parts) for (let i = 0; i < p.length; i++) out[k++] = Math.max(-32768, Math.min(32767, Math.round(p[i] * 32767)))
  return { pcm: out, rate: outRate }
}

export function bytesToB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
