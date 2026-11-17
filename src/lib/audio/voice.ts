/**
 * Gemini-Stimme zur Laufzeit: Live-Verbindung, Prüfungen, Warteschlange und Zwischenspeicher.
 * Die Logik dahinter steht in clips.ts; hier werden nur die echten Bausteine eingesetzt.
 */
import { listAllModels } from '../lab/bench'
import { LiveSession, speakWithTtsModel, verifyAudioLive } from '../lab/liveTts'
import {
  ClipQueue, DEFAULT_GEMINI_VOICE, canUseTts, clipKey, countTts, idbClipStore, pickVoiceModels, produceClip, today,
  type Clip, type ClipLang, type Generator, type Priority, type QuotaState, type VoiceModels,
} from './clips'

interface Cfg {
  enabled: boolean
  apiKey: string
  voice: string
}
let cfg: Cfg = { enabled: false, apiKey: '', voice: DEFAULT_GEMINI_VOICE }

export function configureGeminiVoice(next: Cfg) {
  const prev = cfg
  cfg = next
  if (next.apiKey !== prev.apiKey || next.voice !== prev.voice) closeSession()
  if (next.apiKey !== prev.apiKey) modelsPromise = null
  if (!next.enabled) queue.clear()
}

export const geminiVoiceActive = () => cfg.enabled && !!cfg.apiKey.trim()

// ---------- Modelle ----------

const K_MODELS = 'hangul-studio:voice-models'
const MODELS_TTL = 7 * 86_400_000
let modelsPromise: Promise<VoiceModels | null> | null = null

function resolveModels(): Promise<VoiceModels | null> {
  if (modelsPromise) return modelsPromise
  modelsPromise = (async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(K_MODELS) || 'null') as { m: VoiceModels; t: number } | null
      if (saved?.m?.live && Date.now() - saved.t < MODELS_TTL) return saved.m
    } catch { /* ignore */ }
    try {
      const m = pickVoiceModels(await listAllModels(cfg.apiKey))
      if (m) localStorage.setItem(K_MODELS, JSON.stringify({ m, t: Date.now() }))
      return m
    } catch {
      modelsPromise = null // später erneut versuchen
      return null
    }
  })()
  return modelsPromise
}

// ---------- Live-Verbindung (eine, wird wiederverwendet) ----------

let session: { s: LiveSession; voice: string; ready: Promise<number> } | null = null
let idle: ReturnType<typeof setTimeout> | undefined

function closeSession() {
  clearTimeout(idle)
  session?.s.close()
  session = null
}

async function liveSession(model: string): Promise<LiveSession | null> {
  if (!session || session.voice !== cfg.voice) {
    closeSession()
    const s = new LiveSession(cfg.apiKey, model, cfg.voice)
    session = { s, voice: cfg.voice, ready: s.open() }
  }
  try {
    await session.ready
    return session.s
  } catch {
    closeSession()
    return null
  }
}

// ---------- Tageszähler TTS-Modell ----------

const K_QUOTA = 'hangul-studio:tts-quota'
const readQuota = (): QuotaState | null => {
  try {
    return JSON.parse(localStorage.getItem(K_QUOTA) || 'null')
  } catch {
    return null
  }
}
export function ttsUsedToday(): number {
  const q = readQuota()
  return q && q.day === today() ? q.used : 0
}

// ---------- Erzeugen ----------

function generator(models: VoiceModels, background: boolean): Generator {
  return {
    async live(text) {
      const s = await liveSession(models.live)
      if (!s) return null
      const r = await s.speak(text)
      if (r.error) {
        closeSession()
        return null
      }
      return { pcm: r.pcm, rate: r.sampleRate }
    },
    async heard(raw) {
      if (!models.check) return null
      return verifyAudioLive(cfg.apiKey, models.check, raw.pcm, raw.rate).catch(() => null)
    },
    tts: models.tts
      ? async (text) => {
          if (!canUseTts(readQuota(), background)) return null
          try { localStorage.setItem(K_QUOTA, JSON.stringify(countTts(readQuota()))) } catch { /* ignore */ }
          const r = await speakWithTtsModel(cfg.apiKey, models.tts!, cfg.voice, text)
          return r.error ? null : { pcm: r.pcm, rate: r.sampleRate }
        }
      : undefined,
  }
}

const store = idbClipStore()
/** Schnellzugriff im Arbeitsspeicher (zuletzt gespielte Aufnahmen) */
const hot = new Map<string, Clip>()
const HOT_MAX = 200
const remember = (k: string, c: Clip) => {
  hot.delete(k)
  hot.set(k, c)
  if (hot.size > HOT_MAX) hot.delete(hot.keys().next().value as string)
}
/** Fehlgeschlagene Texte nicht ständig neu versuchen */
const failed = new Map<string, number>()
const RETRY_AFTER = 3_600_000
const queue = new ClipQueue()

export function hotClip(text: string, lang: ClipLang): Clip | null {
  return hot.get(clipKey(cfg.voice, lang, text)) ?? null
}

export async function cachedClip(text: string, lang: ClipLang): Promise<Clip | null> {
  const k = clipKey(cfg.voice, lang, text)
  const h = hot.get(k)
  if (h) return h
  const c = await store.get(k)
  if (c) remember(k, c)
  return c
}

/** Aufnahme holen oder erzeugen lassen; null, wenn Gemini aus ist oder es nicht klappt */
export async function requestClip(text: string, lang: ClipLang, prio: Priority): Promise<Clip | null> {
  if (!geminiVoiceActive() || !text.trim()) return null
  const k = clipKey(cfg.voice, lang, text)
  const c = await cachedClip(text, lang)
  if (c) return c
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  if (Date.now() - (failed.get(k) ?? 0) < RETRY_AFTER) return null
  return queue.add(k, prio, async () => {
    const models = await resolveModels()
    if (!models || !geminiVoiceActive()) return null
    const { clip } = await produceClip(text, generator(models, prio === 'background'))
    if (!clip) {
      failed.set(k, Date.now())
      return null
    }
    remember(k, clip)
    await store.put(k, clip)
    clearTimeout(idle)
    idle = setTimeout(() => { if (!queue.size()) closeSession() }, 30_000)
    return clip
  })
}

export function prefetchClips(items: { text: string; lang: ClipLang }[]) {
  if (!geminiVoiceActive()) return
  for (const it of items) void requestClip(it.text, it.lang, 'background')
}

export const clipQueueSize = () => queue.size()

export async function clipStats() {
  return store.stats()
}

export async function clearClips() {
  hot.clear()
  failed.clear()
  await store.clear()
}
