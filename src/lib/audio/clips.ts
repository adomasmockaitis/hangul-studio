/**
 * Natürliche Sprachausgabe über Gemini: Erzeugungs-Kette, Zwischenspeicher, Modellwahl, Tageszähler.
 * Reine Logik mit austauschbaren Bausteinen (getestet in audio.test.ts); die echten Verbindungen stehen in voice.ts.
 *
 * Ablauf je Text (entschieden im Testlabor, siehe docs/SPEC-v2.md):
 *   Live API erzeugt → Endprüfung (endet das Audio in Stille?) → Gegenprüfung (hört ein Transcribe-Modell den Text?)
 *   → bis zu 3 Versuche → sonst TTS-Modell (10/Tag) → sonst Systemstimme.
 */
import { isVerbatim, tailCheck, withFinalStop } from '../lab/liveTts'

export type ClipLang = 'ko' | 'de'

export interface Clip {
  pcm: Int16Array
  rate: number
  /** Womit erzeugt */
  via: 'live' | 'tts'
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
  /** Ersatz: TTS-Modell (stark begrenzt); fehlt oder null = nicht verfügbar */
  tts?(text: string): Promise<Raw | null>
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

export async function produceClip(text: string, gen: Generator, opts: { attempts?: number; now?: number } = {}): Promise<ProduceResult> {
  const attempts = opts.attempts ?? 3
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
    if (heard !== null && !isVerbatim(text, heard)) {
      rejected.push(`gehört: ${heard || '(nichts)'}`)
      continue
    }
    return { clip: { pcm: join(r.pcm), rate: r.rate, via: 'live', createdAt: now }, tries, rejected }
  }
  if (gen.tts) {
    const r = await gen.tts(text)
    if (r && r.pcm.some((c) => c.length)) return { clip: { pcm: join(r.pcm), rate: r.rate, via: 'tts', createdAt: now }, tries, rejected }
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
  tts: string | null
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
    tts: best(all.filter((m) => /tts/i.test(m.id) && m.methods.includes('generateContent')), /flash-lite-tts/),
  }
}

// ---------- Tageszähler für das TTS-Modell ----------

export const TTS_DAILY_LIMIT = 10
/** Hintergrund-Erzeugung lässt Reserve für Wörter, die man gerade anhören will */
export const TTS_BACKGROUND_LIMIT = 5

export interface QuotaState {
  day: string
  used: number
}
export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

export function canUseTts(q: QuotaState | null, background: boolean, now = Date.now()): boolean {
  const used = q && q.day === today(now) ? q.used : 0
  return used < (background ? TTS_BACKGROUND_LIMIT : TTS_DAILY_LIMIT)
}
export function countTts(q: QuotaState | null, now = Date.now()): QuotaState {
  const d = today(now)
  return { day: d, used: (q && q.day === d ? q.used : 0) + 1 }
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
}

export function memoryClipStore(): ClipStore {
  const m = new Map<string, Clip>()
  return {
    async get(k) { return m.get(k) ?? null },
    async put(k, c) { m.set(k, c) },
    async clear() { m.clear() },
    async stats() { return { count: m.size, bytes: [...m.values()].reduce((a, c) => a + c.pcm.byteLength, 0) } },
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
      const v = (await tx('readonly', (s) => s.get(k)).catch(() => null)) as { pcm: ArrayBuffer; rate: number; via: Clip['via']; createdAt: number } | null
      return v ? { pcm: new Int16Array(v.pcm), rate: v.rate, via: v.via, createdAt: v.createdAt } : null
    },
    async put(k, c) {
      const buf = c.pcm.buffer.slice(c.pcm.byteOffset, c.pcm.byteOffset + c.pcm.byteLength)
      await tx('readwrite', (s) => s.put({ pcm: buf, rate: c.rate, via: c.via, createdAt: c.createdAt }, k)).catch(() => undefined)
    },
    async clear() {
      await tx('readwrite', (s) => s.clear()).catch(() => undefined)
    },
    async stats() {
      const all = ((await tx('readonly', (s) => s.getAll()).catch(() => [])) ?? []) as { pcm: ArrayBuffer }[]
      return { count: all.length, bytes: all.reduce((a, v) => a + (v.pcm?.byteLength ?? 0), 0) }
    },
  }
}

// ---------- Warteschlange ----------

export type Priority = 'now' | 'background'

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
  add(key: string, prio: Priority, run: () => Promise<Clip | null>): Promise<Clip | null> {
    return new Promise((resolve) => {
      const ex = this.items.find((x) => x.key === key)
      if (ex) {
        if (prio === 'now') ex.prio = 'now'
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
        const idx = Math.max(0, this.items.findIndex((x) => x.prio === 'now'))
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
