import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createDemoWords, newStats } from './data/demo'
import { DEFAULT_MODEL, OBSOLETE_MODELS } from './lib/gemini'
import { observe, stamp } from './lib/clock'
import { configureSounds } from './lib/sounds'
import { configureSpeech, prepareWords, voiceTexts } from './lib/speech'
import { setSyncTexts } from './lib/audio/voice'
import { applyReview, dateKey } from './lib/srs'
import { LOCAL_ONLY_SETTINGS, maxStamp, type SyncPayload } from './lib/merge'
import { canAddSubfolder, descendantIds, planChapterConversion } from './lib/folders'
import { getItem, setItem } from './lib/storage'
import { mergeParticleStates, sanitizeParticleState, type ParticleState } from './lib/particles/engine'
import { cardOf, personalRetention, retrievability, schedule, type Dir, type Grade4, type ReviewLogEntry, type SrsCard } from './lib/fsrs'
import { MAX_EXAMPLES, type Activity, type BackupFile, type CheckMethod, type CheckStep, type Folder, type Settings, type WordItem, type WordType } from './types'

const K_DELETED = 'hangul-studio:deleted'
const K_WORDS = 'hangul-studio:words'
const K_SETTINGS = 'hangul-studio:settings'
const K_ACTIVITY = 'hangul-studio:activity'
const K_FOLDERS = 'hangul-studio:folders'
const K_DELETED_FOLDERS = 'hangul-studio:deleted-folders'
const K_PARTICLES = 'hangul-studio:particles'
/** Protokoll der Antworten (nur auf diesem Gerät) für Lernstand und persönliche Anpassung */
const K_REVIEW_LOG = 'hangul-studio:review-log'
const MAX_LOG = 5000

const ALL_METHODS: CheckMethod[] = ['gemini', 'inputtools', 'manual']
const DEFAULT_ORDER: CheckStep[] = ALL_METHODS.map((method) => ({ method, enabled: true }))

/** Stellt sicher, dass jede Methode genau einmal vorkommt */
export function normalizeOrder(o: unknown): CheckStep[] {
  const out: CheckStep[] = []
  if (Array.isArray(o)) {
    for (const s of o as Partial<CheckStep>[]) {
      if (s && ALL_METHODS.includes(s.method as CheckMethod) && !out.some((x) => x.method === s.method)) out.push({ method: s.method as CheckMethod, enabled: s.enabled !== false })
    }
  }
  for (const m of ALL_METHODS) if (!out.some((x) => x.method === m)) out.push({ method: m, enabled: true })
  return out
}

export const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  geminiModel: DEFAULT_MODEL,
  geminiTimeoutSec: 5,
  theme: 'system',
  canvasBackground: 'hangul',
  checkOrder: DEFAULT_ORDER,
  showTemplate: false,
  writingTips: true,
  tipThreshold: 4,
  autoLabel: true,
  showStrokeOrder: false,
  strokeOrderStyle: 'numbers',
  autoSpeak: false,
  speechMode: 'both',
  voiceSource: 'gemini',
  geminiVoice: 'Kore',
  slowMode: 'gemini',
  systemVoiceKo: '',
  systemVoiceDe: '',
  autoExamples: true,
  particleNewWords: true,
  contribute: false,
  soundEffects: true,
  soundVolume: 0.5,
  activeConjugations: ['presentPolite'],
  strokeWidth: 6,
  googleClientId: '',
  syncApiKey: false,
}

/** Lerndaten liegen in IndexedDB (siehe lib/storage.ts), vor dem Start in den Arbeitsspeicher geladen */
const load = <T,>(key: string, fallback: T): T => getItem<T>(key, fallback)
const save = (key: string, value: unknown) => setItem(key, value)

const WORD_TYPES: WordType[] = ['verb', 'adjective', 'noun', 'other']

/** Macht aus beliebigem Import-Objekt ein gültiges WordItem (oder null) */
export function sanitizeWord(raw: unknown): WordItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.korean !== 'string' || !r.korean.trim()) return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const c = (r.conjugations ?? {}) as Record<string, unknown>
  const conj = {
    presentPolite: str(c.presentPolite),
    presentFormal: str(c.presentFormal),
    pastPolite: str(c.pastPolite),
    futurePolite: str(c.futurePolite),
  }
  const s = (r.stats ?? {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    id: str(r.id) ?? crypto.randomUUID(),
    korean: r.korean.trim(),
    german: str(r.german) ?? '',
    pronunciation: str(r.pronunciation),
    wordType: WORD_TYPES.includes(r.wordType as WordType) ? (r.wordType as WordType) : 'other',
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    createdAt: num(r.createdAt, Date.now()),
    conjugations: Object.values(conj).some(Boolean) ? conj : undefined,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : undefined,
    folderId: str(r.folderId),
    srs: r.srs && typeof r.srs === 'object' ? (r.srs as WordItem['srs']) : undefined,
    note: str(r.note),
    needsReview: r.needsReview === true ? true : undefined,
    examples: Array.isArray(r.examples)
      ? (r.examples as Record<string, unknown>[])
          .filter((e) => e && typeof e.ko === 'string' && e.ko.trim())
          .slice(0, MAX_EXAMPLES)
          .map((e) => ({ ko: String(e.ko).trim(), de: typeof e.de === 'string' ? e.de.trim() : '', source: e.source === 'user' || e.source === 'pool' ? e.source : 'ai' }))
      : undefined,
    stats: {
      correctCount: num(s.correctCount, 0),
      wrongCount: num(s.wrongCount, 0),
      lastReviewed: typeof s.lastReviewed === 'number' ? s.lastReviewed : null,
      streak: num(s.streak, 0),
      easeFactor: num(s.easeFactor, 2.5),
    },
  }
}

interface Ctx {
  words: WordItem[]
  settings: Settings
  activity: Activity
  /** Löschmarken für den Geräte-Abgleich */
  deleted: Record<string, number>
  folders: Folder[]
  deletedFolders: Record<string, number>
  /** Neuer Ordner; liefert die ID oder null, wenn die maximale Tiefe erreicht ist */
  addFolder: (name: string, parentId: string | null) => string | null
  renameFolder: (id: string, name: string) => void
  /** Ordner samt Unterordnern löschen; Wörter mitlöschen oder nach „Ohne Ordner“ verschieben */
  deleteFolder: (id: string, words: 'delete' | 'move') => void
  moveWords: (ids: string[], folderId: string | null) => void
  addTagToWords: (ids: string[], tag: string) => void
  /** Kapitel-Tags (#Kapitel1 …) in Ordner umwandeln; liefert die Zahl der verschobenen Wörter */
  convertChapterTags: () => number
  /** Partikel-Trainer: Fortschritt, Stufe, KI-Sätze (synchronisiert) */
  particles: ParticleState
  updateParticles: (fn: (s: ParticleState) => ParticleState) => void
  /** Übernimmt einen zusammengeführten Stand aus der Synchronisation */
  applySyncPayload: (p: SyncPayload) => void
  updateSettings: (patch: Partial<Settings>) => void
  addWord: (w: Omit<WordItem, 'id' | 'createdAt' | 'stats'>) => void
  addWords: (ws: WordItem[]) => number
  updateWord: (id: string, patch: Partial<WordItem>) => void
  deleteWord: (id: string) => void
  /**
   * Antwort festhalten. Mit `fsrs` (nur Abfragen, nicht beim Durchblättern) wird zusätzlich die
   * Wiederholung dieser Richtung geplant.
   */
  recordReview: (id: string, correct: boolean, fsrs?: { dir: Dir; grade: Grade4 }) => void
  /** Nachträgliche Korrektur (Widerspruch): richtig zählt dann abgeschwächt als „Schwer“ */
  reviseReview: (id: string, nowCorrect: boolean) => void
  reviewLog: ReviewLogEntry[]
  /** Ziel-Behaltensquote (0,9 oder an die Person angepasst) */
  retention: { retention: number; personal: boolean; n: number }
  resetStats: () => void
  restoreDemo: () => void
  clearAll: () => void
  exportBackup: (includeApiKey: boolean) => void
  importBackup: (json: string, mode: 'merge' | 'replace') => { words: number }
}

const AppCtx = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp außerhalb des Providers')
  return c
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [words, setWords] = useState<WordItem[]>(() => load<WordItem[] | null>(K_WORDS, null) ?? createDemoWords())
  const [settings, setSettings] = useState<Settings>(() => {
    const raw = load<Partial<Settings> & { checkMode?: string }>(K_SETTINGS, {})
    const s = { ...DEFAULT_SETTINGS, ...raw }
    // Migration vom alten checkMode
    // Einmalige Umstellung: Gemini ist ab jetzt Standard-Methode Nr. 1
    const orderMigrated = load<boolean>('hangul-studio:order-v2', false)
    if (!orderMigrated) save('hangul-studio:order-v2', true)
    s.checkOrder = raw.checkOrder && orderMigrated
      ? normalizeOrder(raw.checkOrder)
      : raw.checkMode === 'manual'
        ? normalizeOrder([{ method: 'manual', enabled: true }, { method: 'inputtools', enabled: false }, { method: 'gemini', enabled: false }])
        : DEFAULT_ORDER
    // Veraltetes Modell automatisch ersetzen
    if (!s.geminiModel || OBSOLETE_MODELS.includes(s.geminiModel)) s.geminiModel = DEFAULT_SETTINGS.geminiModel
    return s
  })
  const [activity, setActivity] = useState<Activity>(() => load<Activity>(K_ACTIVITY, {}))
  const [deleted, setDeleted] = useState<Record<string, number>>(() => load<Record<string, number>>(K_DELETED, {}))
  const [folders, setFolders] = useState<Folder[]>(() => load<Folder[]>(K_FOLDERS, []))
  const [reviewLog, setReviewLog] = useState<ReviewLogEntry[]>(() => load<ReviewLogEntry[]>(K_REVIEW_LOG, []))
  const retention = useMemo(() => personalRetention(reviewLog), [reviewLog])
  const wordsRef = useRef<WordItem[]>([])
  const retentionRef = useRef(retention.retention)
  retentionRef.current = retention.retention
  /** Letzter Zustand vor einer Bewertung, damit ein Widerspruch sie korrigieren kann */
  const lastReview = useRef(new Map<string, { dir: Dir; prev: SrsCard | undefined; t: number }>())
  const [deletedFolders, setDeletedFolders] = useState<Record<string, number>>(() => load<Record<string, number>>(K_DELETED_FOLDERS, {}))
  const [particles, setParticles] = useState<ParticleState>(() => sanitizeParticleState(load<unknown>(K_PARTICLES, null)))
  useEffect(() => save(K_PARTICLES, particles), [particles])
  const updateParticles = useCallback((fn: (s: ParticleState) => ParticleState) => setParticles((s) => fn(s)), [])

  // Beim Start: bereits gespeicherte Zeitstempel in die logische Uhr übernehmen
  useEffect(() => {
    observe(maxStamp(words, deleted, settings.settingsUpdatedAt ?? 0, folders, deletedFolders))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => save(K_DELETED, deleted), [deleted])
  useEffect(() => save(K_WORDS, words), [words])
  useEffect(() => save(K_SETTINGS, settings), [settings])
  useEffect(() => save(K_ACTIVITY, activity), [activity])
  useEffect(() => save(K_FOLDERS, folders), [folders])
  useEffect(() => save(K_REVIEW_LOG, reviewLog), [reviewLog])
  wordsRef.current = words
  useEffect(() => save(K_DELETED_FOLDERS, deletedFolders), [deletedFolders])

  // Theme anwenden
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])

  useEffect(() => {
    configureSounds({ enabled: settings.soundEffects, volume: settings.soundVolume })
  }, [settings.soundEffects, settings.soundVolume])

  useEffect(() => {
    configureSpeech({
      source: settings.voiceSource, apiKey: settings.geminiApiKey, geminiVoice: settings.geminiVoice,
      systemVoiceKo: settings.systemVoiceKo, systemVoiceDe: settings.systemVoiceDe, speechMode: settings.speechMode, slowMode: settings.slowMode,
    })
  }, [settings.voiceSource, settings.geminiApiKey, settings.geminiVoice, settings.systemVoiceKo, settings.systemVoiceDe, settings.speechMode, settings.slowMode])

  // Nur die Aufnahmen der Vokabeln selbst werden zwischen Geräten abgeglichen
  useEffect(() => {
    const s = new Set<string>()
    for (const w of words) {
      const t = voiceTexts(w)
      if (t.ko) s.add(t.ko)
      if (t.de) s.add(t.de)
    }
    setSyncTexts(s)
  }, [words])

  // Fehlende Gemini-Aufnahmen (Koreanisch und Deutsch) im Hintergrund erzeugen: beim Start, bei neuer Stimme
  // und wenn Wörter dazukommen (auch von anderen Geräten)
  useEffect(() => {
    const id = setTimeout(() => prepareWords(wordsRef.current), 3000)
    return () => clearTimeout(id)
  }, [settings.voiceSource, settings.geminiApiKey, settings.geminiVoice, words.length])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    // Nur-Gerät-Einstellungen (Client-ID, Key-Sync) zählen nicht als „geänderte Einstellungen“ für den Abgleich
    const syncRelevant = Object.keys(patch).some((k) => !(LOCAL_ONLY_SETTINGS as readonly string[]).includes(k) && k !== 'geminiApiKey')
    setSettings((s) => ({ ...s, ...patch, ...(syncRelevant ? { settingsUpdatedAt: stamp() } : {}) }))
  }, [])

  /** Löschmarke entfernen, wenn ein Wort (wieder) angelegt wird */
  const clearTombstones = (koreans: string[]) =>
    setDeleted((d) => {
      if (!koreans.some((k) => k in d)) return d
      const next = { ...d }
      for (const k of koreans) delete next[k]
      return next
    })

  const addWord: Ctx['addWord'] = useCallback((w) => {
    const now = stamp()
    setWords((ws) => [...ws, { ...w, id: crypto.randomUUID(), createdAt: now, updatedAt: now, stats: newStats() }])
    clearTombstones([w.korean])
  }, [])

  const addWords: Ctx['addWords'] = useCallback(
    (list) => {
      const known = new Set(words.map((w) => w.korean))
      const now = stamp()
      const fresh = list.filter((w) => !known.has(w.korean)).map((w) => ({ ...w, updatedAt: now }))
      if (fresh.length) {
        setWords((ws) => [...ws, ...fresh])
        clearTombstones(fresh.map((w) => w.korean))
        // Neue Wörter im Hintergrund für die natürliche Stimme vorbereiten
        prepareWords(fresh)
      }
      return fresh.length
    },
    [words],
  )

  const updateWord: Ctx['updateWord'] = useCallback((id, patch) => {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: stamp() } : w)))
  }, [])

  const deleteWord = useCallback((id: string) => {
    setWords((ws) => {
      const gone = ws.find((w) => w.id === id)
      if (gone) setDeleted((d) => ({ ...d, [gone.korean]: stamp() }))
      return ws.filter((w) => w.id !== id)
    })
  }, [])

  const recordReview: Ctx['recordReview'] = useCallback((id, correct, f) => {
    const now = Date.now()
    // FSRS außerhalb des State-Updaters berechnen (Updater dürfen keine Nebenwirkungen haben)
    let card: { dir: Dir; card: SrsCard } | null = null
    if (f) {
      const w = wordsRef.current.find((x) => x.id === id)
      if (w) {
        const prev = cardOf(w, f.dir)
        lastReview.current.set(id, { dir: f.dir, prev, t: now })
        card = { dir: f.dir, card: schedule(prev, f.grade, now, retentionRef.current) }
        const r = retrievability(prev, now)
        setReviewLog((l) => [...l, { w: id, d: f.dir, t: now, g: f.grade, r }].slice(-MAX_LOG))
      }
    }
    const stampNow = stamp()
    setWords((ws) =>
      ws.map((w) =>
        w.id !== id
          ? w
          : { ...w, stats: applyReview(w.stats, correct), updatedAt: stampNow, ...(card ? { srs: { ...w.srs, [card.dir]: card.card } } : {}) },
      ),
    )
    const k = dateKey()
    setActivity((a) => ({ ...a, [k]: (a[k] ?? 0) + 1 }))
  }, [])

  /** Korrigiert die zuletzt gewertete Antwort (z. B. nach einem Widerspruch), ohne eine neue Aktivität zu zählen */
  const reviseReview = useCallback((id: string, nowCorrect: boolean) => {
    const last = lastReview.current.get(id)
    const grade: Grade4 = nowCorrect ? 2 : 1
    if (last) {
      setReviewLog((l) => {
        const i = l.findLastIndex((e) => e.w === id && e.t === last.t)
        if (i < 0) return l
        const n = [...l]
        n[i] = { ...n[i], g: grade }
        return n
      })
    }
    setWords((ws) =>
      ws.map((w) => {
        if (w.id !== id) return w
        const s = w.stats
        return {
          ...w,
          // FSRS: Bewertung vom Zustand davor neu berechnen
          ...(last ? { srs: { ...w.srs, [last.dir]: schedule(last.prev, grade, last.t, retentionRef.current) } } : {}),
          updatedAt: stamp(),
          stats: nowCorrect
            ? { ...s, wrongCount: Math.max(0, s.wrongCount - 1), correctCount: s.correctCount + 1, streak: Math.max(1, s.streak), easeFactor: Math.min(3, +(s.easeFactor + 0.3).toFixed(2)) }
            : { ...s, correctCount: Math.max(0, s.correctCount - 1), wrongCount: s.wrongCount + 1, streak: 0, easeFactor: Math.max(1.3, +(s.easeFactor - 0.3).toFixed(2)) },
        }
      }),
    )
  }, [])

  // ---------- Ordner ----------
  const addFolder: Ctx['addFolder'] = useCallback(
    (name, parentId) => {
      if (!name.trim() || !canAddSubfolder(folders, parentId)) return null
      const now = stamp()
      const id = crypto.randomUUID()
      setFolders((fs) => [...fs, { id, name: name.trim(), parentId, createdAt: now, updatedAt: now }])
      return id
    },
    [folders],
  )

  const renameFolder: Ctx['renameFolder'] = useCallback((id, name) => {
    if (!name.trim()) return
    const now = stamp()
    setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name: name.trim(), updatedAt: now } : f)))
  }, [])

  const deleteFolder: Ctx['deleteFolder'] = useCallback(
    (id, mode) => {
      const gone = descendantIds(folders, id)
      const now = stamp()
      setFolders((fs) => fs.filter((f) => !gone.has(f.id)))
      setDeletedFolders((d) => {
        const next = { ...d }
        for (const g of gone) next[g] = now
        return next
      })
      setWords((ws) => {
        if (mode === 'delete') {
          const removed = ws.filter((w) => w.folderId && gone.has(w.folderId))
          if (removed.length)
            setDeleted((d) => {
              const next = { ...d }
              for (const w of removed) next[w.korean] = now
              return next
            })
          return ws.filter((w) => !(w.folderId && gone.has(w.folderId)))
        }
        return ws.map((w) => (w.folderId && gone.has(w.folderId) ? { ...w, folderId: undefined, updatedAt: now } : w))
      })
    },
    [folders],
  )

  const moveWords: Ctx['moveWords'] = useCallback((ids, folderId) => {
    const set = new Set(ids)
    const now = stamp()
    setWords((ws) => ws.map((w) => (set.has(w.id) ? { ...w, folderId: folderId ?? undefined, updatedAt: now } : w)))
  }, [])

  const addTagToWords: Ctx['addTagToWords'] = useCallback((ids, tag) => {
    const t = tag.trim()
    if (!t) return
    const norm = t.startsWith('#') ? t : '#' + t
    const set = new Set(ids)
    const now = stamp()
    setWords((ws) => ws.map((w) => (set.has(w.id) && !w.tags.includes(norm) ? { ...w, tags: [...w.tags, norm], updatedAt: now } : w)))
  }, [])

  const convertChapterTags: Ctx['convertChapterTags'] = useCallback(() => {
    const now = stamp()
    const plan = planChapterConversion(words, folders, () => crypto.randomUUID(), now)
    if (!plan.moves.length) return 0
    setFolders((fs) => [...fs, ...plan.newFolders])
    const byId = new Map(plan.moves.map((m) => [m.id, m]))
    setWords((ws) => ws.map((w) => {
      const m = byId.get(w.id)
      return m ? { ...w, folderId: m.folderId, tags: m.tags, updatedAt: now } : w
    }))
    return plan.moves.length
  }, [words, folders])

  const resetStats = useCallback(() => {
    const now = stamp()
    // Zurücksetzen gilt als neue Änderung, damit es beim Abgleich nicht von alten Ständen überschrieben wird
    setWords((ws) => ws.map((w) => ({ ...w, stats: { ...newStats(), lastReviewed: null }, srs: undefined, updatedAt: now })))
    setActivity({})
    setReviewLog([])
  }, [])

  const restoreDemo = useCallback(() => {
    const now = stamp()
    setWords((cur) => {
      setDeleted((d) => {
        const next = { ...d }
        for (const w of cur) next[w.korean] = now
        return next
      })
      return []
    })
    const demo = createDemoWords().map((w) => ({ ...w, updatedAt: now + 1 }))
    setWords(demo)
    clearTombstones(demo.map((w) => w.korean))
  }, [])

  const clearAll = useCallback(() => {
    const now = stamp()
    setWords((cur) => {
      setDeleted((d) => {
        const next = { ...d }
        for (const w of cur) next[w.korean] = now
        return next
      })
      return []
    })
    setActivity({})
    setFolders((cur) => {
      if (cur.length)
        setDeletedFolders((d) => {
          const next = { ...d }
          for (const f of cur) next[f.id] = now
          return next
        })
      return []
    })
  }, [])

  const applySyncPayload: Ctx['applySyncPayload'] = useCallback((p) => {
    // Logische Uhr nachziehen: spätere Änderungen auf diesem Gerät gelten dann sicher als neuer als alles Übernommene
    observe(maxStamp(p.words, p.deleted, p.settingsUpdatedAt, p.folders, p.deletedFolders))
    setWords(p.words)
    setDeleted(p.deleted)
    setFolders(p.folders ?? [])
    setDeletedFolders(p.deletedFolders ?? {})
    if (p.particles) setParticles(p.particles)
    setActivity(p.activity)
    setSettings((s) => {
      const incoming: Partial<Settings> = { ...p.settings }
      for (const k of LOCAL_ONLY_SETTINGS) delete incoming[k]
      // Der API-Key kommt nur mit, wenn er beim Hochladen ausdrücklich mitgegeben wurde
      if (!incoming.geminiApiKey) delete incoming.geminiApiKey
      return {
        ...s,
        ...incoming,
        checkOrder: incoming.checkOrder ? normalizeOrder(incoming.checkOrder) : s.checkOrder,
        settingsUpdatedAt: p.settingsUpdatedAt,
      }
    })
  }, [])

  const exportBackup: Ctx['exportBackup'] = useCallback(
    (includeApiKey) => {
      const { geminiApiKey, ...rest } = settings
      const backup: BackupFile = {
        app: 'hangul-studio',
        version: 1,
        exportedAt: new Date().toISOString(),
        words,
        settings: includeApiKey ? { ...rest, geminiApiKey } : rest,
        activity,
        folders,
        particles,
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hangul-studio-backup-${dateKey()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    [settings, words, activity, folders, particles],
  )

  const importBackup: Ctx['importBackup'] = useCallback((json, mode) => {
    const data = JSON.parse(json) as Partial<BackupFile>
    if (data?.app !== 'hangul-studio' || !Array.isArray(data.words)) {
      throw new Error('Das ist keine gültige Hangul-Studio-Sicherung.')
    }
    const incoming = data.words.map(sanitizeWord).filter((w): w is WordItem => !!w)
    const inAct = data.activity && typeof data.activity === 'object' ? data.activity : {}
    const now = stamp()
    const inFolders: Folder[] = Array.isArray(data.folders)
      ? data.folders
          .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
          .map((f) => ({ id: f.id, name: f.name, parentId: typeof f.parentId === 'string' ? f.parentId : null, createdAt: Number(f.createdAt) || now, updatedAt: now }))
      : []
    if (mode === 'replace') {
      setFolders((cur) => {
        const keep = new Set(inFolders.map((f) => f.id))
        const gone = cur.filter((f) => !keep.has(f.id))
        if (gone.length)
          setDeletedFolders((d) => {
            const next = { ...d }
            for (const f of gone) next[f.id] = now
            return next
          })
        return inFolders
      })
    } else if (inFolders.length) {
      setFolders((cur) => {
        const ids = new Set(cur.map((f) => f.id))
        return [...cur, ...inFolders.filter((f) => !ids.has(f.id))]
      })
    }
    if (mode === 'replace') {
      setWords((cur) => {
        // Nicht mehr vorhandene Wörter als gelöscht markieren, damit die Synchronisation das mitnimmt
        const keep = new Set(incoming.map((w) => w.korean))
        setDeleted((d) => {
          const next = { ...d }
          for (const w of cur) if (!keep.has(w.korean)) next[w.korean] = now
          for (const k of keep) delete next[k]
          return next
        })
        return incoming.map((w) => ({ ...w, updatedAt: now }))
      })
      setActivity(inAct)
    } else {
      setWords((cur) => {
        const map = new Map(cur.map((w) => [w.korean, w]))
        for (const w of incoming) {
          const ex = map.get(w.korean)
          // Bei Konflikt gewinnt das Wort mit mehr Lernhistorie
          const exTotal = ex ? ex.stats.correctCount + ex.stats.wrongCount : -1
          if (!ex || w.stats.correctCount + w.stats.wrongCount > exTotal) map.set(w.korean, { ...w, id: ex?.id ?? w.id, updatedAt: now })
        }
        return [...map.values()]
      })
      clearTombstones(incoming.map((w) => w.korean))
      setActivity((cur) => {
        const out = { ...cur }
        for (const [k, v] of Object.entries(inAct)) out[k] = Math.max(out[k] ?? 0, Number(v) || 0)
        return out
      })
    }
    if (data.settings && typeof data.settings === 'object') {
      const { geminiApiKey, ...rest } = data.settings
      const incomingSettings: Partial<Settings> = { ...rest }
      for (const k of LOCAL_ONLY_SETTINGS) delete incomingSettings[k]
      setSettings((s) => ({
        ...s,
        ...incomingSettings,
        checkOrder: rest.checkOrder ? normalizeOrder(rest.checkOrder) : s.checkOrder,
        ...(geminiApiKey ? { geminiApiKey } : {}),
        settingsUpdatedAt: now,
      }))
    }
    if (data.particles) {
      const inP = sanitizeParticleState(data.particles)
      setParticles((cur) => (mode === 'replace' ? inP : mergeParticleStates(cur, inP)))
    }
    return { words: incoming.length }
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      words, settings, activity, deleted, applySyncPayload, updateSettings, addWord, addWords, updateWord, deleteWord,
      recordReview, reviseReview, resetStats, restoreDemo, clearAll, exportBackup, importBackup,
      folders, deletedFolders, addFolder, renameFolder, deleteFolder, moveWords, addTagToWords, convertChapterTags, reviewLog, retention,
      particles, updateParticles,
    }),
    [particles, updateParticles, reviewLog, retention, folders, deletedFolders, addFolder, renameFolder, deleteFolder, moveWords, addTagToWords, convertChapterTags, words, settings, activity, deleted, applySyncPayload, updateSettings, addWord, addWords, updateWord, deleteWord, recordReview, reviseReview, resetStats, restoreDemo, clearAll, exportBackup, importBackup],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
