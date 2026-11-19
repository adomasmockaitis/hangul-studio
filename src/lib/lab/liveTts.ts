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

/** Testlabor: Anweisung für langsames, deutliches Vorlesen (wie die langsame Wiedergabe in Wörterbüchern) */
export const SLOW_INSTRUCTION =
  READ_ALOUD_INSTRUCTION +
  ' Sprich dabei deutlich langsamer als normal und sehr deutlich artikuliert, mit kurzen Pausen zwischen den Wörtern – ' +
  'wie die langsame Aussprache in einem Wörterbuch für Sprachlernende. Bleib trotzdem natürlich in Betonung und Satzmelodie.'

/** Testlabor: Lern-Tempo – Wörter Silbe für Silbe, Sätze Wort für Wort mit deutlichen Pausen */
export const SLOW_STEP_INSTRUCTION =
  READ_ALOUD_INSTRUCTION +
  ' Sprich langsam für Sprachlernende. Ist der Text ein einzelnes Wort oder eine kurze Wendung, sprich ihn Silbe für Silbe, ' +
  'mit einer kleinen, hörbaren Pause zwischen den Silben (z. B. 학교 → „학 … 교“). Sag das Wort danach NICHT noch einmal am Stück. ' +
  'Ist der Text ein Satz, sprich ihn Wort für Wort mit einer deutlichen Pause nach jedem Wort, aber jedes Wort selbst flüssig und mit natürlicher Aussprache. ' +
  'Sprich jeden Text genau einmal.'

/** Testlabor: Pausen stehen schon im Text (Trennzeichen zwischen Silben bzw. Wörtern) */
export const SLOW_TEXT_INSTRUCTION =
  READ_ALOUD_INSTRUCTION +
  ' Der Text ist für Sprachlernende mit Trennzeichen (z. B. „-“, „·“ oder „…“) zwischen Silben oder Wörtern geschrieben. ' +
  'Mach an jedem Trennzeichen eine kurze Pause (etwa eine Viertelsekunde) und sprich die Trennzeichen nicht mit. ' +
  'Sprich jede Silbe bzw. jedes Wort deutlich, etwas langsamer als normal. Sag den Text danach NICHT noch einmal am Stück.'

export type StepSep = '-' | '·' | '…' | ','

/** Wort → Silben mit Trennzeichen („학-생“), Satz → Wörter mit Trennzeichen („학교에 - 가요“) */
export function stepText(text: string, sep: StepSep): string {
  const t = text.trim().replace(/[.!?。]+$/, '')
  if (/\s/.test(t)) return t.split(/\s+/).join(sep === ',' ? ', ' : ` ${sep} `)
  const parts = [...t].reduce<string[]>((acc, ch) => {
    // Hangul-Silben einzeln, alles andere (Ziffern, Latein) bleibt zusammen
    if (/[가-힣]/.test(ch) || !acc.length || /[가-힣]/.test(acc[acc.length - 1].slice(-1))) acc.push(ch)
    else acc[acc.length - 1] += ch
    return acc
  }, [])
  return parts.join(sep === ',' ? ', ' : sep)
}

/** Koreanische Silben im Text */
export const syllableCount = (text: string) => (text.match(/[가-힣]/g) ?? []).length

/**
 * Langsame Fassung plausibel lang? (Die Gegenprüfung bricht bei Pausen ab, deshalb zählt hier die Länge.)
 * Mindestens `perSyllable` ms je Silbe; ohne koreanische Silben immer ok.
 */
export function slowLengthOk(text: string, audioMs: number, perSyllable = 300): boolean {
  const n = syllableCount(text)
  return !n || audioMs >= n * perSyllable
}

/** Aufnahme mit anderem Tempo abspielen, Tonhöhe bleibt gleich (Browser-Zeitdehnung) */
export function playPcmAtSpeed(chunks: Int16Array[], sampleRate: number, speed: number) {
  const wav = pcmToWav(chunks, sampleRate)
  const url = URL.createObjectURL(new Blob([wav.slice()], { type: 'audio/wav' }))
  const a = new Audio(url)
  a.preservesPitch = true
  a.playbackRate = speed
  a.onended = () => URL.revokeObjectURL(url)
  void a.play()
}

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
  /** Länge des empfangenen Audios */
  audioMs?: number
  /** Audiostücke, die erst nach „turnComplete“ kamen */
  lateChunks?: number
  /** Unabhängige Gegenprüfung: was ein zweites Modell im Audio hört */
  heard?: string
  /** Rohe Antworten des Prüfmodells (gekürzt), um unbekannte Formate zu verstehen */
  heardRaw?: string[]
  heardOk?: boolean
  /** Endprüfung: Lautstärke am Ende im Verhältnis zum lautesten Teil */
  tailRatio?: number
  tailCut?: boolean
  /** Wie viele Erzeugungen nötig waren */
  attempts?: number
  error?: string
}

/** So lange nach „turnComplete“ noch auf nachgeschickte Stücke warten */
const LATE_GRACE_MS = 700

/** PCM in eine WAV-Datei packen (für die Gegenprüfung) */
export function pcmToWav(chunks: Int16Array[], sampleRate: number): Uint8Array {
  const n = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(44 + n * 2)
  const dv = new DataView(out.buffer)
  const w = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, n * 2, true)
  let o = 44
  for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) dv.setInt16(o, c[i], true)
  return out
}

/**
 * Endprüfung: Natürliche Sprache klingt am Ende leise aus. Hört das Audio mitten im Ton auf,
 * ist es abgeschnitten. Verglichen wird die Lautstärke der letzten 30 ms mit dem lautesten 20-ms-Fenster.
 */
export const TAIL_CUT_RATIO = 0.15
export function tailCheck(chunks: Int16Array[], sampleRate: number): { ratio: number; cut: boolean } {
  const n = chunks.reduce((a, c) => a + c.length, 0)
  if (!n) return { ratio: 1, cut: true }
  const all = new Int16Array(n)
  let o = 0
  for (const c of chunks) { all.set(c, o); o += c.length }
  const rms = (from: number, to: number) => {
    let sum = 0
    for (let i = from; i < to; i++) sum += all[i] * all[i]
    return Math.sqrt(sum / Math.max(1, to - from))
  }
  const win = Math.floor(sampleRate * 0.02)
  let peak = 1
  for (let i = 0; i + win <= n; i += win) peak = Math.max(peak, rms(i, i + win))
  const tail = rms(Math.max(0, n - Math.floor(sampleRate * 0.03)), n)
  const ratio = Math.round((tail / peak) * 100) / 100
  return { ratio, cut: ratio > TAIL_CUT_RATIO }
}

/** Text mit Schlusszeichen senden, damit das Modell zu Ende betont */
export const withFinalStop = (t: string) => (/[.!?。…~]$/.test(t.trim()) ? t.trim() : t.trim() + '.')

/** Alle "text"-Felder einer unbekannten Antwortstruktur einsammeln */
function anyText(o: unknown): string {
  if (!o || typeof o !== 'object') return ''
  let out = ''
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (k === 'text' && typeof v === 'string') out += v
    else if (v && typeof v === 'object') out += anyText(v)
  }
  return out
}

/** Lineares Umrechnen auf 16 kHz – die übliche Eingangsrate der Live API */
function resampleTo16k(chunks: Int16Array[], rate: number): Int16Array {
  const n = chunks.reduce((a, c) => a + c.length, 0)
  const src = new Int16Array(n)
  let o = 0
  for (const c of chunks) { src.set(c, o); o += c.length }
  if (rate === 16000) return src
  const outLen = Math.floor((n * 16000) / rate)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const x = (i * rate) / 16000
    const i0 = Math.floor(x)
    const f = x - i0
    out[i] = Math.round((src[i0] ?? 0) * (1 - f) + (src[i0 + 1] ?? src[i0] ?? 0) * f)
  }
  return out
}
const int16ToB64 = (a: Int16Array) => {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Gegenprüfung über ein Transcribe-Live-Modell (kein Tageslimit): eigene kurze Verbindung pro Text,
 * Audio als 16-kHz-PCM senden, danach Ende signalisieren und allen zurückkommenden Text einsammeln.
 * Das genaue Antwortformat dieses Modells ist nicht dokumentiert – daher werden alle Textfelder gelesen.
 */
export function verifyAudioLive(apiKey: string, model: string, chunks: Int16Array[], sampleRate: number, onRaw?: (raw: string) => void, timeoutMs = 12_000): Promise<string> {
  const pcm16 = resampleTo16k(chunks, sampleRate)
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?key=${encodeURIComponent(apiKey.trim())}`)
    let text = ''
    let quiet: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const end = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(quiet)
      ws.onclose = null
      ws.close()
      if (err && !text) reject(err)
      else resolve(text.trim())
    }
    const timer = setTimeout(() => end(new Error('Zeitüberschreitung')), timeoutMs)
    ws.onerror = () => end(new Error('WebSocket-Fehler'))
    ws.onclose = (e) => end(new Error(`Verbindung geschlossen (${e.code}${e.reason ? ': ' + e.reason : ''})`))
    let queue = Promise.resolve()
    ws.onmessage = (ev) => {
      queue = queue.then(async () => {
        const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text()
        // Rohe Antwort für die Auswertung (lange Base64-Daten gekürzt)
        onRaw?.(raw.replace(/"[A-Za-z0-9+/=]{200,}"/g, '"…"').slice(0, 600))
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(raw)
        } catch {
          return
        }
        if ('setupComplete' in msg) {
          // Audio in Stücken zu 0,2 s, dann 0,4 s Stille und Ende des Datenstroms
          const step = 3200
          const padded = new Int16Array(pcm16.length + 6400)
          padded.set(pcm16)
          for (let i = 0; i < padded.length; i += step) {
            ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: int16ToB64(padded.subarray(i, i + step)) } } }))
          }
          ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
          return
        }
        const sc = msg.serverContent as
          | { inputTranscription?: { text?: string }; outputTranscription?: { text?: string }; modelTurn?: { parts?: { text?: string }[] }; turnComplete?: boolean }
          | undefined
        if (!sc) {
          const t = anyText(msg)
          if (t) text += t
          return
        }
        // interimInputTranscription enthält jedes Mal den GANZEN bisherigen Text -> ersetzen statt anhängen
        const interim = (sc as { interimInputTranscription?: { text?: string } }).interimInputTranscription?.text
        if (interim) text = interim
        else {
          const piece = sc.inputTranscription?.text ?? sc.outputTranscription?.text ?? sc.modelTurn?.parts?.map((p) => p.text ?? '').join('') ?? anyText(sc)
          if (piece) text += piece
        }
        clearTimeout(quiet)
        // Fertig, wenn das Modell den Zug beendet oder 1,5 s lang nichts mehr kommt
        quiet = setTimeout(() => end(), sc.turnComplete ? 300 : 1500)
      })
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({ setup: { model: `models/${model}`, inputAudioTranscription: {} } }))
    }
  })
}

/**
 * Unabhängige Gegenprüfung: Ein normales Gemini-Modell hört sich das erzeugte Audio an und schreibt auf, was es hört.
 * Die eigene Mitschrift der Live API reicht nicht – sie zeigte schon den vollen Text, obwohl das Audio abgeschnitten war.
 */
export async function verifyAudio(apiKey: string, model: string, chunks: Int16Array[], sampleRate: number): Promise<string> {
  const wav = pcmToWav(chunks, sampleRate)
  let s = ''
  for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode(...wav.subarray(i, i + 0x8000))
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: 'Transkribiere exakt, was in dieser Aufnahme gesprochen wird – nur den gesprochenen Text in Originalsprache und Originalschrift (Koreanisch in Hangul), ohne Übersetzung, ohne Ergänzung. Ist etwas abgeschnitten, schreib nur den hörbaren Teil. Nichts zu hören: leere Antwort.' },
        { inlineData: { mimeType: 'audio/wav', data: btoa(s) } },
      ] }],
      generationConfig: { temperature: 0 },
    }),
  })
  const j = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
  if (!res.ok) throw new Error(j.error?.message ?? `HTTP ${res.status}`)
  return (j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim()
}

const normalize = (s: string) => s.normalize('NFC').replace(/[\s.,!?·'"„“…~-]/g, '').toLowerCase()
/** Wörtlich gesprochen? Auch, wenn die Gegenprüfung den Satzanfang nach einer Pause doppelt geliefert hat */
export const isVerbatim = (text: string, transcript: string) =>
  !!transcript && (normalize(text) === normalize(transcript) || normalize(text) === normalize(collapseRepeat(transcript)))

/**
 * Die Gegenprüfung schickt bei Pausen (z. B. langsames Sprechen) den bisherigen Text nach der Pause oft
 * noch einmal komplett – dann steht der Anfang doppelt: „A B“ wird zu „AA B“. Wiederholten Anfang entfernen.
 */
export function collapseRepeat(s: string): string {
  let t = s
  for (let guard = 0; guard < 5; guard++) {
    const compact = t.replace(/\s+/g, ' ')
    let cut = -1
    // längsten Anfang suchen, der direkt danach noch einmal beginnt
    for (let k = Math.floor(compact.length / 2); k >= 2; k--) {
      const head = compact.slice(0, k).trim()
      const rest = compact.slice(k).trimStart()
      if (head.length >= 2 && rest.startsWith(head)) {
        cut = k
        break
      }
    }
    if (cut < 0) return t
    t = compact.slice(cut).trimStart()
  }
  return t
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
function b64ToInt16(b64: string): Int16Array {
  const bytes = b64ToBytes(b64)
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2))
}

/**
 * Audio aus einer TTS-Antwort: Ist es eine WAV-Datei, nur den „data“-Block nehmen.
 * Metadaten-Blöcke (z. B. LIST am Dateiende) würden sonst als lautes Rauschen abgespielt.
 */
export function pcmFromAudio(bytes: Uint8Array, mime: string | undefined): { pcm: Int16Array; rate: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
  if (bytes.length > 12 && tag(0) === 'RIFF' && tag(8) === 'WAVE') {
    let rate = 24000
    let o = 12
    while (o + 8 <= bytes.length) {
      const id = tag(o)
      const size = dv.getUint32(o + 4, true)
      if (id === 'fmt ') rate = dv.getUint32(o + 12, true)
      if (id === 'data') {
        const len = Math.min(size, bytes.length - o - 8)
        const copy = bytes.slice(o + 8, o + 8 + len - (len % 2))
        return { pcm: new Int16Array(copy.buffer), rate }
      }
      o += 8 + size + (size % 2)
    }
  }
  const copy = bytes.slice(0, bytes.length - (bytes.length % 2))
  return { pcm: new Int16Array(copy.buffer), rate: rateOf(mime) }
}
const rateOf = (mime: string | undefined) => Number(/rate=(\d+)/.exec(mime ?? '')?.[1] ?? 24000)

/** Eine Live-Sitzung für mehrere Texte nacheinander */
export class LiveSession {
  private ws: WebSocket | null = null
  private handler: ((msg: Record<string, unknown>) => void) | null = null
  private readonly apiKey: string
  private readonly model: string
  private readonly voice: string
  private readonly instruction: string

  constructor(apiKey: string, model: string, voice: string, instruction = READ_ALOUD_INSTRUCTION) {
    this.apiKey = apiKey
    this.model = model
    this.voice = voice
    this.instruction = instruction
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
      // Nachrichten strikt in Ankunftsreihenfolge verarbeiten: Blob.text() ist asynchron, sonst könnte
      // „turnComplete“ vor dem letzten Audiostück ankommen und das Wortende abschneiden.
      let queue = Promise.resolve()
      ws.onmessage = (ev) => {
        queue = queue.then(async () => {
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
        })
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
              systemInstruction: { parts: [{ text: this.instruction }] },
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
      let done = false
      let quiet: ReturnType<typeof setTimeout> | undefined
      let turnDone = false
      const finish = (error?: string) => {
        if (done) return
        done = true
        clearTimeout(timer)
        clearTimeout(quiet)
        this.handler = null
        res.totalMs = Math.round(performance.now() - t0)
        res.transcript = res.transcript.trim()
        res.verbatim = isVerbatim(text, res.transcript)
        res.audioMs = Math.round((res.pcm.reduce((a, c) => a + c.length, 0) / res.sampleRate) * 1000)
        resolve(error ? { ...res, error } : res)
      }
      const timer = setTimeout(() => finish('Zeitüberschreitung'), timeoutMs)
      ws.onclose = (e) => finish(`Verbindung geschlossen (${e.code}${e.reason ? ': ' + e.reason : ''})`)
      // Die Live API schickt Audio und Mitschrift teils NACH „turnComplete“ nach. Deshalb erst abschließen,
      // wenn danach eine Weile nichts mehr kommt – sonst landet das Wortende beim nächsten Text.
      const settle = () => {
        clearTimeout(quiet)
        quiet = setTimeout(() => finish(), LATE_GRACE_MS)
      }
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
            if (turnDone) res.lateChunks = (res.lateChunks ?? 0) + 1
          }
        }
        if (sc.outputTranscription?.text) res.transcript += sc.outputTranscription.text
        if (sc.turnComplete) turnDone = true
        if (turnDone) settle()
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
    const { pcm, rate } = pcmFromAudio(b64ToBytes(part.inlineData.data), part.inlineData.mimeType)
    // TTS-Modelle lesen laut Doku wörtlich; keine Mitschrift verfügbar
    return { ...base, transcript: '(TTS-Modell, keine Mitschrift)', verbatim: true, firstAudioMs: totalMs, totalMs, pcm: [pcm], sampleRate: rate }
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
  // 15 ms ein- und ausblenden, damit Anfang und Ende nicht knacken
  const fade = Math.min(Math.floor(sampleRate * 0.015), Math.floor(total / 4))
  for (let i = 0; i < fade; i++) {
    const g = i / fade
    ch[i] *= g
    ch[total - 1 - i] *= g
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
}
