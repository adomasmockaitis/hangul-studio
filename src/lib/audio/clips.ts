/**
 * Natürliche Sprachausgabe über Gemini: Erzeugungs-Kette, Zwischenspeicher, Modellwahl, Tageszähler.
 * Reine Logik mit austauschbaren Bausteinen (getestet in audio.test.ts); die echten Verbindungen stehen in voice.ts.
 *
 * Ablauf je Text (entschieden im Testlabor, siehe docs/SPEC-v2.md):
 *   Live API erzeugt → Endprüfung (endet das Audio in Stille?) → Gegenprüfung (hört ein Transcribe-Modell den Text?)
 *   → bis zu 3 Versuche → sonst TTS-Modell (10/Tag) → sonst Systemstimme.
 */
import { collapseRepeat, isVerbatim, tailCheck, withFinalStop } from '../lab/liveTts'

export type ClipLang = 'ko' | 'de'

export interface Clip {
  pcm: Int16Array
  rate: number
  /** Womit erzeugt */
  via: 'live' | 'tts'
  /** Stimme, mit der die Aufnahme erzeugt wurde */
  voice?: string
  /** Modell (beim TTS-Ersatz wichtig, klingt leicht anders als die Live API) */
  model?: string
  createdAt: number
}

/** Vier Gemini-Stimmen (2 weiblich, 2 männlich) */
export const GEMINI_VOICES = [
  { id: 'Kore', label: 'Kore', desc: 'weiblich · klar und ruhig' },
  { id: 'Aoede', label: 'Aoede', desc: 'weiblich · leicht und freundlich' },
  { id: 'Charon', label: 'Charon', desc: 'männlich · sachlich und deutlich' },
  { id: 'Puck', label: 'Puck', desc: 'männlich · lebhaft' },
] as const
export type GeminiVoice = (typeof GEMINI_VOICES)[number]['id']
export const DEFAULT_GEMINI_VOICE: GeminiVoice = 'Kore'

export const normText = (t: string) => t.normalize('NFC').replace(/\s+/g, ' ').trim()

/** Langsame Variante einer Stimme (eigene Aufnahmen mit der Anweisung „langsam und deutlich“) */
export const SLOW_SUFFIX = '~slow'
export const slowVoice = (voice: string) => (voice.endsWith(SLOW_SUFFIX) ? voice : voice + SLOW_SUFFIX)
export const isSlowVoice = (voice: string) => voice.endsWith(SLOW_SUFFIX)
export const baseVoice = (voice: string) => voice.replace(SLOW_SUFFIX, '')

/** Wort oder kurze Wendung (bis 3 Wörter, kein Satzzeichen am Ende) */
export function isWordLikeText(text: string): boolean {
  const t = text.trim()
  return !!t && !/[.!?。]$/.test(t) && t.split(/\s+/).length <= 3 && t.length <= 24
}
/** Text aus einem Schlüssel „gemini|Stimme|Sprache|Text“ */
export const textOfKey = (key: string) => key.split('|').slice(3).join('|')
/** Stimme aus einem Schlüssel „gemini|Stimme|Sprache|Text“ */
export const voiceOfKey = (key: string) => key.split('|')[1] ?? ''
/** Abgeglichen werden nur normale Wort-Aufnahmen; Sätze und langsame Aufnahmen bleiben auf dem Gerät (bei Bedarf neu erzeugt) */
export const shouldSyncKey = (key: string) => !isSlowVoice(voiceOfKey(key)) && isWordLikeText(textOfKey(key))

/** Ähnlichkeit zweier Texte (0–1), Leerzeichen und Satzzeichen zählen nicht */
export function similarity(a: string, b: string): number {
  const n = (s: string) => s.normalize('NFC').replace(/[\s.,!?·'"„“…~-]/g, '').toLowerCase()
  const x = n(a)
  const y = n(b)
  if (!x.length && !y.length) return 1
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length)
}

/**
 * Bei Sätzen weicht die Mitschrift der Gegenprüfung oft in Kleinigkeiten ab (z. B. „TU“ → „튀“, „내 주셨어요“ → „내주셨어요“),
 * obwohl alles richtig gesprochen wurde. Angenommen wird ein Satz, wenn er zu mindestens 85 % passt und das Ende stimmt –
 * fehlende Wortenden fängt außerdem die Endprüfung ab.
 */
export function closeEnough(text: string, heard: string): boolean {
  if (isWordLikeText(text)) return false
  const n = (s: string) => s.normalize('NFC').replace(/[\s.,!?·'"„“…~-]/g, '').toLowerCase()
  const t = n(text)
  const h = n(collapseRepeat(heard))
  return t.length >= 6 && h.endsWith(t.slice(-2)) && similarity(t, h) >= 0.85
}
export const clipKey = (voice: string, lang: ClipLang, text: string) => `gemini|${voice}|${lang}|${normText(text)}`

// ---------- Erzeugungs-Kette ----------

export interface Raw {
  pcm: Int16Array[]
  rate: number
}

export interface Generator {
  /** Live API; null bei Fehler */
  live(text: string): Promise<Raw | null>
  /** Gegenprüfung: was ein zweites Modell hört; null = Prüfung nicht möglich (dann zählt nur die Endprüfung) */
  heard(raw: Raw): Promise<string | null>
  /** Ersatz: TTS-Modelle (stark begrenzt); fehlt oder null = nicht verfügbar */
  tts?(text: string): Promise<(Raw & { model?: string }) | null>
  /** Name des Live-Modells (wird an der Aufnahme vermerkt) */
  liveModel?: string
  voice?: string
}

export interface ProduceResult {
  clip: Clip | null
  tries: number
  /** Gründe der verworfenen Versuche (für Tests und Fehlersuche) */
  rejected: string[]
}

const join = (chunks: Int16Array[]) => {
  const n = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Int16Array(n)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

/** Sätze sind komplexer und dürfen öfter neu erzeugt werden */
export function attemptsFor(text: string): number {
  const t = text.trim()
  return t.split(/\s+/).length > 3 || /[.!?。]$/.test(t) ? 5 : 3
}

export async function produceClip(text: string, gen: Generator, opts: { attempts?: number; now?: number } = {}): Promise<ProduceResult> {
  const attempts = opts.attempts ?? attemptsFor(text)
  const rejected: string[] = []
  const now = opts.now ?? Date.now()
  let tries = 0
  for (let i = 0; i < attempts; i++) {
    tries++
    const r = await gen.live(withFinalStop(text))
    if (!r || !r.pcm.some((c) => c.length)) {
      rejected.push('kein Audio')
      continue
    }
    if (tailCheck(r.pcm, r.rate).cut) {
      rejected.push('Ende abgeschnitten')
      continue
    }
    const heard = await gen.heard(r)
    if (heard !== null && !isVerbatim(text, heard) && !closeEnough(text, heard)) {
      rejected.push(`gehört: ${heard || '(nichts)'}`)
      continue
    }
    return { clip: { pcm: join(r.pcm), rate: r.rate, via: 'live', voice: gen.voice, model: gen.liveModel, createdAt: now }, tries, rejected }
  }
  if (gen.tts) {
    const r = await gen.tts(text)
    if (r && r.pcm.some((c) => c.length)) return { clip: { pcm: join(r.pcm), rate: r.rate, via: 'tts', voice: gen.voice, model: r.model, createdAt: now }, tries, rejected }
    rejected.push('TTS-Modell nicht verfügbar')
  }
  return { clip: null, tries, rejected }
}

// ---------- Modellwahl ----------

export interface ModelInfo {
  id: string
  methods: string[]
}
export interface VoiceModels {
  live: string
  check: string | null
  /** Alle TTS-Modelle, bestes zuerst (jedes hat sein eigenes Tageskontingent) */
  tts: string[]
}

/** Qualitätsstufe eines TTS-Modells: pro > flash > flash-lite */
export function ttsTier(id: string): number {
  if (/pro/i.test(id)) return 3
  if (/flash-lite|lite/i.test(id)) return 1
  if (/flash/i.test(id)) return 2
  return 0
}

/** Neueste passende Modelle aus der Modellliste der API (Namen ändern sich gelegentlich, z. B. „-preview“) */
export function pickVoiceModels(all: ModelInfo[]): VoiceModels | null {
  const bidi = all.filter((m) => m.methods.includes('bidiGenerateContent'))
  const version = (id: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0)
  const best = (list: ModelInfo[], prefer: RegExp) =>
    [...list].sort((a, b) => Number(prefer.test(b.id)) - Number(prefer.test(a.id)) || version(b.id) - version(a.id) || a.id.length - b.id.length)[0]?.id ?? null
  const live = best(bidi.filter((m) => /live/i.test(m.id) && !/transcribe|translate/i.test(m.id)), /3\.8-live$/)
  if (!live) return null
  return {
    live,
    check: best(bidi.filter((m) => /transcribe/i.test(m.id)), /3\.5-transcribe-live/),
    tts: all
      .filter((m) => /tts/i.test(m.id) && m.methods.includes('generateContent'))
      .map((m) => m.id)
      .sort((a, b) => version(b) - version(a) || ttsTier(b) - ttsTier(a) || a.localeCompare(b)),
  }
}

// ---------- Tageszähler für das TTS-Modell ----------

/** Je TTS-Modell und Tag (kostenloses Kontingent) */
export const TTS_DAILY_LIMIT = 10
/** Hintergrund-Erzeugung lässt je Modell Reserve für Wörter, die man gerade anhören will */
export const TTS_BACKGROUND_LIMIT = 5

export interface QuotaState {
  day: string
  /** Verbrauch je Modell */
  used: Record<string, number>
}
export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

export function ttsUsed(q: QuotaState | null, model: string, now = Date.now()): number {
  return q && q.day === today(now) && q.used && typeof q.used === 'object' ? q.used[model] ?? 0 : 0
}
export function canUseTts(q: QuotaState | null, model: string, background: boolean, now = Date.now()): boolean {
  return ttsUsed(q, model, now) < (background ? TTS_BACKGROUND_LIMIT : TTS_DAILY_LIMIT)
}
export function countTts(q: QuotaState | null, model: string, now = Date.now()): QuotaState {
  const d = today(now)
  const used = q && q.day === d && q.used && typeof q.used === 'object' ? { ...q.used } : {}
  used[model] = (used[model] ?? 0) + 1
  return { day: d, used }
}

// ---------- Systemstimme ----------

export interface VoiceLike {
  name: string
  lang: string
  localService?: boolean
  default?: boolean
}

/** Bewertet installierte Stimmen: natürliche/neuronale Stimmen zuerst */
export function voiceScore(v: VoiceLike): number {
  let s = 0
  if (/natural|neural|online/i.test(v.name)) s += 40
  if (/premium|enhanced|siri/i.test(v.name)) s += 30
  if (/google/i.test(v.name)) s += 20
  if (/microsoft/i.test(v.name)) s += 5
  if (v.default) s += 2
  return s
}

const langOf = (v: VoiceLike) => v.lang.toLowerCase().replace('_', '-')

export function voicesFor<T extends VoiceLike>(all: T[], lang: ClipLang): T[] {
  return all.filter((v) => langOf(v).startsWith(lang)).sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name))
}

/** Gewählte Stimme (Name) oder die beste installierte */
export function pickSystemVoice<T extends VoiceLike>(all: T[], lang: ClipLang, preferred = ''): T | null {
  const list = voicesFor(all, lang)
  return (preferred && list.find((v) => v.name === preferred)) || list[0] || null
}

// ---------- Zwischenspeicher ----------

export interface ClipStore {
  get(key: string): Promise<Clip | null>
  put(key: string, clip: Clip): Promise<void>
  clear(): Promise<void>
  stats(): Promise<{ count: number; bytes: number }>
  keys(): Promise<string[]>
}

export function memoryClipStore(): ClipStore {
  const m = new Map<string, Clip>()
  return {
    async get(k) { return m.get(k) ?? null },
    async put(k, c) { m.set(k, c) },
    async clear() { m.clear() },
    async stats() { return { count: m.size, bytes: [...m.values()].reduce((a, c) => a + c.pcm.byteLength, 0) } },
    async keys() { return [...m.keys()] },
  }
}

const DB = 'hangul-studio-audio'
const STORE = 'clips'

/** Aufnahmen in einer eigenen IndexedDB (nicht im Lerndaten-Speicher, wird nicht synchronisiert) */
export function idbClipStore(): ClipStore {
  if (typeof indexedDB === 'undefined') return memoryClipStore()
  let dbp: Promise<IDBDatabase> | null = null
  const db = () =>
    (dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db()
    return new Promise((resolve, reject) => {
      const r = fn(d.transaction(STORE, mode).objectStore(STORE))
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  }
  return {
    async get(k) {
      const v = (await tx('readonly', (s) => s.get(k)).catch(() => null)) as (Omit<Clip, 'pcm'> & { pcm: ArrayBuffer }) | null
      return v ? { ...v, pcm: new Int16Array(v.pcm) } : null
    },
    async put(k, c) {
      const buf = c.pcm.buffer.slice(c.pcm.byteOffset, c.pcm.byteOffset + c.pcm.byteLength)
      await tx('readwrite', (s) => s.put({ pcm: buf, rate: c.rate, via: c.via, voice: c.voice, model: c.model, createdAt: c.createdAt }, k)).catch(() => undefined)
    },
    async clear() {
      await tx('readwrite', (s) => s.clear()).catch(() => undefined)
    },
    async stats() {
      const all = ((await tx('readonly', (s) => s.getAll()).catch(() => [])) ?? []) as { pcm: ArrayBuffer }[]
      return { count: all.length, bytes: all.reduce((a, v) => a + (v.pcm?.byteLength ?? 0), 0) }
    },
    async keys() {
      return (((await tx('readonly', (s) => s.getAllKeys()).catch(() => [])) ?? []) as IDBValidKey[]).map(String)
    },
  }
}

// ---------- Warteschlange ----------

/** play = wird gerade angefordert (vor allem anderen), now = gleich gebraucht, background = Vorrat */
export type Priority = 'play' | 'now' | 'background'
const RANK: Record<Priority, number> = { play: 3, now: 2, background: 1 }

/**
 * Erzeugt Aufnahmen nacheinander (eine Live-Verbindung), dringende zuerst; doppelte Anfragen werden zusammengelegt.
 */
export class ClipQueue {
  private items: { key: string; prio: Priority; run: () => Promise<Clip | null>; waiters: ((c: Clip | null) => void)[] }[] = []
  private busy = false
  /** Schlüssel, die gerade erzeugt werden oder warten */
  pending(key: string) {
    return this.items.some((x) => x.key === key)
  }
  size() {
    return this.items.length
  }
  keys(): string[] {
    return this.items.map((x) => x.key)
  }
  add(key: string, prio: Priority, run: () => Promise<Clip | null>): Promise<Clip | null> {
    return new Promise((resolve) => {
      const ex = this.items.find((x) => x.key === key)
      if (ex) {
        if (RANK[prio] > RANK[ex.prio]) ex.prio = prio
        ex.waiters.push(resolve)
      } else this.items.push({ key, prio, run, waiters: [resolve] })
      void this.pump()
    })
  }
  clear() {
    for (const it of this.items.slice(this.busy ? 1 : 0)) it.waiters.forEach((w) => w(null))
    this.items = this.busy ? this.items.slice(0, 1) : []
  }
  private async pump() {
    if (this.busy) return
    this.busy = true
    try {
      while (this.items.length) {
        // dringende zuerst, sonst in Reihenfolge
        let idx = 0
        for (let j = 1; j < this.items.length; j++) if (RANK[this.items[j].prio] > RANK[this.items[idx].prio]) idx = j
        const [it] = this.items.splice(idx, 1)
        this.items.unshift(it) // bleibt sichtbar als „läuft“
        let clip: Clip | null = null
        try {
          clip = await it.run()
        } catch {
          clip = null
        }
        this.items = this.items.filter((x) => x !== it)
        it.waiters.forEach((w) => w(clip))
      }
    } finally {
      this.busy = false
    }
  }
}
