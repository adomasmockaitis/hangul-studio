/**
 * Gemini-Stimme zur Laufzeit: Live-Verbindung, Prüfungen, Warteschlange, Zwischenspeicher und Status je Text.
 * Die Logik dahinter steht in clips.ts; hier werden nur die echten Bausteine eingesetzt.
 */
import { listAllModels } from '../lab/bench'
import { getItem, setItem } from '../storage'
import { AudioSync, forgetSynced, type AudioRemote, type SyncMemory } from './audioSync'
import { b64ToBytes, bytesToB64, decodeOpus, encodeOpus, opusSupported } from './codec'
import { LiveSession, SLOW_INSTRUCTION, speakWithTtsModel, verifyAudioLive } from '../lab/liveTts'
import {
  ClipQueue, DEFAULT_GEMINI_VOICE, baseVoice, isSlowVoice, shouldSyncKey, textOfKey, TTS_DAILY_LIMIT, canUseTts, clipKey, countTts, idbClipStore, pickVoiceModels, produceClip, ttsUsed,
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
  if (next.apiKey !== prev.apiKey) {
    closeSession()
    modelsPromise = null
  }
  if (!next.enabled) queue.clear()
  notify()
}

export const geminiVoiceActive = () => cfg.enabled && !!cfg.apiKey.trim()
export const currentGeminiVoice = () => cfg.voice

// ---------- Status (für die Anzeige je Wort) ----------

const listeners = new Set<() => void>()
let version = 0
function notify() {
  version++
  listeners.forEach((f) => f())
}
export function subscribeClips(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const clipsVersion = () => version

/** Schlüssel aller gespeicherten Aufnahmen (beim Start einmal aus IndexedDB gelesen) */
const ready = new Set<string>()
let readyLoaded: Promise<void> | null = null
function loadReady(): Promise<void> {
  return (readyLoaded ??= store.keys().then((ks) => {
    ks.forEach((k) => ready.add(k))
    notify()
  }))
}

export type ClipStatus = 'ready' | 'pending' | 'failed' | 'missing' | 'off'

export function clipStatus(text: string, lang: ClipLang, voice = cfg.voice): ClipStatus {
  if (!geminiVoiceActive()) return 'off'
  const k = clipKey(voice, lang, text)
  if (ready.has(k)) return 'ready'
  if (queue.pending(k)) return 'pending'
  if (Date.now() - (failed.get(k) ?? 0) < RETRY_AFTER) return 'failed'
  return 'missing'
}

// ---------- Modelle ----------

const K_MODELS = 'hangul-studio:voice-models-v2'
const MODELS_TTL = 7 * 86_400_000
let modelsPromise: Promise<VoiceModels | null> | null = null

function resolveModels(): Promise<VoiceModels | null> {
  if (modelsPromise) return modelsPromise
  modelsPromise = (async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(K_MODELS) || 'null') as { m: VoiceModels; t: number } | null
      if (saved?.m?.live && Array.isArray(saved.m.tts) && Date.now() - saved.t < MODELS_TTL) return saved.m
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

/** Für die Anzeige: gefundene TTS-Modelle und ihr heutiger Verbrauch */
export async function ttsOverview(): Promise<{ model: string; used: number; limit: number }[]> {
  const m = await resolveModels()
  const q = readQuota()
  return (m?.tts ?? []).map((model) => ({ model, used: ttsUsed(q, model), limit: TTS_DAILY_LIMIT }))
}

// ---------- Live-Verbindung (eine, wird wiederverwendet; neu bei anderer Stimme) ----------

let session: { s: LiveSession; voice: string; ready: Promise<number> } | null = null
let idle: ReturnType<typeof setTimeout> | undefined

function closeSession() {
  clearTimeout(idle)
  session?.s.close()
  session = null
}

async function liveSession(model: string, voice: string): Promise<LiveSession | null> {
  if (!session || session.voice !== voice) {
    closeSession()
    // Langsame Variante: gleiche Stimme, Anweisung „langsam und deutlich“
    const s = new LiveSession(cfg.apiKey, model, baseVoice(voice), isSlowVoice(voice) ? SLOW_INSTRUCTION : undefined)
    session = { s, voice, ready: s.open() }
  }
  try {
    await session.ready
    return session.s
  } catch {
    closeSession()
    return null
  }
}

// ---------- Tageszähler TTS-Modelle ----------

const K_QUOTA = 'hangul-studio:tts-quota-v2'
const readQuota = (): QuotaState | null => {
  try {
    return JSON.parse(localStorage.getItem(K_QUOTA) || 'null')
  } catch {
    return null
  }
}

// ---------- Erzeugen ----------

/** Alle Bausteine nutzen dieselbe, beim Auftrag festgelegte Stimme */
function generator(models: VoiceModels, voice: string, background: boolean): Generator {
  return {
    voice,
    liveModel: models.live,
    async live(text) {
      const s = await liveSession(models.live, voice)
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
    // Ersatzmodelle nur für normales Tempo (für langsam spielt die App stattdessen die normale Aufnahme gedehnt ab)
    tts: models.tts.length && !isSlowVoice(voice)
      ? async (text) => {
          // bestes Modell zuerst, jedes mit eigenem Tageskontingent
          for (const model of models.tts) {
            if (!canUseTts(readQuota(), model, background)) continue
            try { localStorage.setItem(K_QUOTA, JSON.stringify(countTts(readQuota(), model))) } catch { /* ignore */ }
            const r = await speakWithTtsModel(cfg.apiKey, model, voice, text)
            if (!r.error && r.pcm.length) return { pcm: r.pcm, rate: r.sampleRate, model }
          }
          return null
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

export function hotClip(text: string, lang: ClipLang, voice = cfg.voice): Clip | null {
  return hot.get(clipKey(voice, lang, text)) ?? null
}

export async function cachedClip(text: string, lang: ClipLang, voice = cfg.voice): Promise<Clip | null> {
  const k = clipKey(voice, lang, text)
  const h = hot.get(k)
  if (h) return h
  const c = await store.get(k)
  if (c) {
    remember(k, c)
    if (!ready.has(k)) {
      ready.add(k)
      notify()
    }
  }
  return c
}

/**
 * Aufnahme holen oder erzeugen lassen; null, wenn Gemini aus ist oder es nicht klappt.
 * `voice` legt die Stimme fest (Standard: die eingestellte), `force` erlaubt Hörproben auch bei „Systemstimme“.
 */
export async function requestClip(text: string, lang: ClipLang, prio: Priority, opts: { voice?: string; force?: boolean; regenerate?: boolean } = {}): Promise<Clip | null> {
  const voice = opts.voice ?? cfg.voice
  if (!cfg.apiKey.trim() || (!opts.force && !cfg.enabled) || !text.trim()) return null
  const k = clipKey(voice, lang, text)
  if (!opts.regenerate) {
    const c = await cachedClip(text, lang, voice)
    if (c) return c
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  if (prio === 'background' && Date.now() - (failed.get(k) ?? 0) < RETRY_AFTER) return null
  const p = queue.add(k, prio, async () => {
    const models = await resolveModels()
    if (!models || !cfg.apiKey.trim()) return null
    const { clip } = await produceClip(text, generator(models, voice, prio === 'background'))
    if (!clip) {
      failed.set(k, Date.now())
      return null
    }
    failed.delete(k)
    remember(k, clip)
    ready.add(k)
    await store.put(k, clip)
    if (opts.regenerate && syncer) {
      const memKey = `hangul-studio:audio-sync:${syncer.id}`
      setItem(memKey, forgetSynced(getItem<SyncMemory>(memKey, { known: {}, synced: [] }), [k]))
    }
    scheduleAudioPush()
    clearTimeout(idle)
    idle = setTimeout(() => { if (!queue.size()) closeSession() }, 30_000)
    return clip
  })
  notify()
  const clip = await p
  notify()
  return clip
}

export function prefetchClips(items: { text: string; lang: ClipLang }[], prio: Priority = 'background', voice = cfg.voice) {
  if (!geminiVoiceActive()) return
  void loadReady().then(() => {
    for (const it of items) {
      if (clipStatus(it.text, it.lang, voice) === 'missing') void requestClip(it.text, it.lang, prio, { voice })
    }
  })
}

/** Alle Aufnahmen neu erzeugen; bis die neue fertig ist, spielt die alte */
export function regenerateClips(items: { text: string; lang: ClipLang }[]) {
  if (!geminiVoiceActive()) return
  failed.clear()
  for (const it of items) void requestClip(it.text, it.lang, 'background', { regenerate: true })
}

/** Fehlgeschlagene wieder zulassen (Knopf „Fehlende jetzt erstellen“) */
export function retryFailed() {
  failed.clear()
  notify()
}

export const clipQueueSize = () => queue.size()

export async function clipStats() {
  return store.stats()
}

/** Wie viele der Texte haben schon eine Aufnahme mit der eingestellten Stimme? */
export async function coverage(items: { text: string; lang: ClipLang }[]): Promise<Record<ClipLang, { ready: number; total: number }>> {
  await loadReady()
  const out: Record<ClipLang, { ready: number; total: number }> = { ko: { ready: 0, total: 0 }, de: { ready: 0, total: 0 } }
  for (const it of items) {
    out[it.lang].total++
    if (ready.has(clipKey(cfg.voice, it.lang, it.text))) out[it.lang].ready++
  }
  return out
}

export async function clearClips() {
  hot.clear()
  failed.clear()
  ready.clear()
  await store.clear()
  notify()
}

// ---------- Abgleich der Aufnahmen zwischen Geräten ----------

const slots: { account: AudioRemote | null; drive: AudioRemote | null } = { account: null, drive: null }
/** Texte der Vokabeln (Koreanisch und gekürztes Deutsch) – nur deren Aufnahmen werden abgeglichen */
let syncTexts: Set<string> | null = null
export function setSyncTexts(texts: Set<string>) {
  syncTexts = texts
}
let syncer: { id: string; s: AudioSync } | null = null
let syncBusy = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
export interface AudioSyncInfo {
  active: boolean
  /** Browser kann kein Opus (dann bleiben Aufnahmen auf dem Gerät) */
  unsupported?: boolean
  lastSync: number | null
  error: string
  where: 'account' | 'drive' | null
}
let syncInfo: AudioSyncInfo = { active: false, lastSync: null, error: '', where: null }
export const audioSyncInfo = () => syncInfo

const codec = { encode: encodeOpus, decode: decodeOpus, toB64: bytesToB64, fromB64: b64ToBytes }

/** Konto oder Drive als Ziel für die Aufnahmen setzen (null = nicht verbunden). Das Konto hat Vorrang. */
export function setAudioRemote(slot: 'account' | 'drive', remote: AudioRemote | null) {
  slots[slot] = remote
  const r = slots.account ?? slots.drive
  if (!r) {
    syncer = null
    syncInfo = { active: false, lastSync: null, error: '', where: null }
    notify()
    return
  }
  if (syncer?.id === r.id) return
  const memKey = `hangul-studio:audio-sync:${r.id}`
  syncer = {
    id: r.id,
    s: new AudioSync({
      remote: r,
      store,
      codec,
      load: () => getItem<SyncMemory>(memKey, { known: {}, synced: [] }),
      save: (m) => setItem(memKey, m),
      // Abgeglichen werden nur die Vokabeln selbst; Sätze, Beugungsformen und langsame Aufnahmen bleiben auf dem Gerät
      filter: (k) => shouldSyncKey(k) && (!syncTexts || syncTexts.has(textOfKey(k))),
    }),
  }
  syncInfo = { active: true, lastSync: null, error: '', where: slots.account ? 'account' : 'drive' }
  notify()
  setTimeout(() => void syncAudioNow(), 4000)
}

/** Holen und hochladen; leise bei Fehlern (die App funktioniert ohne Abgleich weiter) */
export async function syncAudioNow(): Promise<void> {
  const cur = syncer
  if (!cur || syncBusy) return
  if (!(await opusSupported())) {
    syncInfo = { ...syncInfo, unsupported: true }
    notify()
    return
  }
  syncBusy = true
  try {
    const added = await cur.s.pull()
    for (const k of added) ready.add(k)
    await cur.s.push()
    if (syncer === cur) syncInfo = { ...syncInfo, lastSync: Date.now(), error: '' }
  } catch (e) {
    if (syncer === cur) syncInfo = { ...syncInfo, error: e instanceof Error ? e.message : 'Abgleich fehlgeschlagen' }
  } finally {
    syncBusy = false
    notify()
  }
}

function scheduleAudioPush() {
  if (!syncer) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void syncAudioNow(), 20_000)
}

if (typeof window !== 'undefined') {
  setInterval(() => { if (document.visibilityState === 'visible') void syncAudioNow() }, 10 * 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - (syncInfo.lastSync ?? 0) > 60_000) void syncAudioNow() })
}

// Beim Laden der App: vorhandene Aufnahmen kennen
if (typeof indexedDB !== 'undefined') void loadReady()
