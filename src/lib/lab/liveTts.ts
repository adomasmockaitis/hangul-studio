/**
 * Testlabor: Vorlesen über die Gemini Live API (WebSocket) und zum Vergleich über ein TTS-Modell.
 * Prüft anhand der Mitschrift des Modells, ob es wirklich wörtlich vorliest.
 */
const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export const LIVE_VOICES = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Orus', 'Fenrir'] as const

export const READ_ALOUD_INSTRUCTION =
  'Du bist die Vorlesestimme einer Sprachlern-App. Jede Nachricht enthält genau einen Text. ' +
  'Sprich exakt diesen Text genau einmal vor – Wort für Wort, ohne etwas hinzuzufügen, wegzulassen, zu übersetzen, zu erklären oder zu antworten. ' +
  'Koreanischen Text sprichst du mit natürlicher koreanischer Standardaussprache (Seoul), deutschen Text mit natürlicher deutscher Aussprache. ' +
  'Keine Begrüßung, keine Rückfrage, kein Kommentar.'

export interface SpeakResult {
  text: string
  /** Was das Modell laut eigener Mitschrift gesagt hat */
  transcript: string
  verbatim: boolean
  /** ms bis zum ersten Audio-Stück */
  firstAudioMs: number | null
  totalMs: number
  /** PCM 16 bit mono */
  pcm: Int16Array[]
  sampleRate: number
  error?: string
}

const normalize = (s: string) => s.normalize('NFC').replace(/[\s.,!?·'"„“…~-]/g, '').toLowerCase()
export const isVerbatim = (text: string, transcript: string) => !!transcript && normalize(text) === normalize(transcript)

function b64ToInt16(b64: string): Int16Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2))
}
const rateOf = (mime: string | undefined) => Number(/rate=(\d+)/.exec(mime ?? '')?.[1] ?? 24000)

/** Eine Live-Sitzung für mehrere Texte nacheinander */
export class LiveSession {
  private ws: WebSocket | null = null
  private handler: ((msg: Record<string, unknown>) => void) | null = null
  private readonly apiKey: string
  private readonly model: string
  private readonly voice: string

  constructor(apiKey: string, model: string, voice: string) {
    this.apiKey = apiKey
    this.model = model
    this.voice = voice
  }

  open(timeoutMs = 10_000): Promise<number> {
    const t0 = performance.now()
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS}?key=${encodeURIComponent(this.apiKey.trim())}`)
      this.ws = ws
      const timer = setTimeout(() => reject(new Error('Verbindung: Zeitüberschreitung')), timeoutMs)
      ws.onerror = () => reject(new Error('WebSocket-Fehler'))
      ws.onclose = (e) => {
        clearTimeout(timer)
        reject(new Error(`Verbindung geschlossen (${e.code}${e.reason ? ': ' + e.reason : ''})`))
      }
      ws.onmessage = async (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text()
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(raw)
        } catch {
          return
        }
        if ('setupComplete' in msg) {
          clearTimeout(timer)
          resolve(Math.round(performance.now() - t0))
          return
        }
        this.handler?.(msg)
      }
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${this.model}`,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } },
              },
              systemInstruction: { parts: [{ text: READ_ALOUD_INSTRUCTION }] },
              outputAudioTranscription: {},
            },
          }),
        )
      }
    })
  }

  speak(text: string, timeoutMs = 15_000): Promise<SpeakResult> {
    const ws = this.ws
    const t0 = performance.now()
    const res: SpeakResult = { text, transcript: '', verbatim: false, firstAudioMs: null, totalMs: 0, pcm: [], sampleRate: 24000 }
    return new Promise((resolve) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        resolve({ ...res, error: 'Keine offene Verbindung' })
        return
      }
      const finish = (error?: string) => {
        clearTimeout(timer)
        this.handler = null
        res.totalMs = Math.round(performance.now() - t0)
        res.transcript = res.transcript.trim()
        res.verbatim = isVerbatim(text, res.transcript)
        resolve(error ? { ...res, error } : res)
      }
      const timer = setTimeout(() => finish('Zeitüberschreitung'), timeoutMs)
      ws.onclose = (e) => finish(`Verbindung geschlossen (${e.code}${e.reason ? ': ' + e.reason : ''})`)
      this.handler = (msg) => {
        const sc = msg.serverContent as
          | { modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }; outputTranscription?: { text?: string }; turnComplete?: boolean }
          | undefined
        if (!sc) return
        for (const p of sc.modelTurn?.parts ?? []) {
          if (p.inlineData?.data) {
            if (res.firstAudioMs === null) res.firstAudioMs = Math.round(performance.now() - t0)
            res.sampleRate = rateOf(p.inlineData.mimeType)
            res.pcm.push(b64ToInt16(p.inlineData.data))
          }
        }
        if (sc.outputTranscription?.text) res.transcript += sc.outputTranscription.text
        if (sc.turnComplete) finish()
      }
      ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }))
    })
  }

  close() {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
    }
    this.ws = null
  }
}

/** Zum Vergleich: ein Wort über ein TTS-Modell (stark begrenzt: 10 pro Tag) */
export async function speakWithTtsModel(apiKey: string, model: string, voice: string, text: string): Promise<SpeakResult> {
  const t0 = performance.now()
  const base: SpeakResult = { text, transcript: '', verbatim: false, firstAudioMs: null, totalMs: 0, pcm: [], sampleRate: 24000 }
  try {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    })
    const j = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]; error?: { message?: string } }
    const totalMs = Math.round(performance.now() - t0)
    if (!res.ok) return { ...base, totalMs, error: j.error?.message ?? `HTTP ${res.status}` }
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
    if (!part?.inlineData?.data) return { ...base, totalMs, error: 'Kein Audio in der Antwort' }
    let pcm = b64ToInt16(part.inlineData.data)
    // WAV-Kopf (RIFF) überspringen, falls vorhanden
    if (/wav/i.test(part.inlineData.mimeType ?? '')) pcm = pcm.subarray(22)
    // TTS-Modelle lesen laut Doku wörtlich; keine Mitschrift verfügbar
    return { ...base, transcript: '(TTS-Modell, keine Mitschrift)', verbatim: true, firstAudioMs: totalMs, totalMs, pcm: [pcm], sampleRate: rateOf(part.inlineData.mimeType) }
  } catch {
    return { ...base, totalMs: Math.round(performance.now() - t0), error: 'Netzwerkfehler' }
  }
}

let ctx: AudioContext | null = null
export function playPcm(chunks: Int16Array[], sampleRate: number) {
  const total = chunks.reduce((a, c) => a + c.length, 0)
  if (!total) return
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const buf = ctx.createBuffer(1, total, sampleRate)
  const ch = buf.getChannelData(0)
  let o = 0
  for (const c of chunks) for (let i = 0; i < c.length; i++) ch[o++] = c[i] / 32768
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
}
