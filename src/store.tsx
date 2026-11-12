import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createDemoWords, newStats } from './data/demo'
import { DEFAULT_MODEL, OBSOLETE_MODELS } from './lib/gemini'
import { applyReview, dateKey } from './lib/srs'
import type { Activity, BackupFile, CheckMethod, CheckStep, Settings, WordItem, WordType } from './types'

const K_WORDS = 'hangul-studio:words'
const K_SETTINGS = 'hangul-studio:settings'
const K_ACTIVITY = 'hangul-studio:activity'

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
  activeConjugations: ['presentPolite'],
  strokeWidth: 6,
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Speicher voll / blockiert */
  }
}

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
  updateSettings: (patch: Partial<Settings>) => void
  addWord: (w: Omit<WordItem, 'id' | 'createdAt' | 'stats'>) => void
  addWords: (ws: WordItem[]) => number
  updateWord: (id: string, patch: Partial<WordItem>) => void
  deleteWord: (id: string) => void
  recordReview: (id: string, correct: boolean) => void
  reviseReview: (id: string, nowCorrect: boolean) => void
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

  useEffect(() => save(K_WORDS, words), [words])
  useEffect(() => save(K_SETTINGS, settings), [settings])
  useEffect(() => save(K_ACTIVITY, activity), [activity])

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

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])

  const addWord: Ctx['addWord'] = useCallback((w) => {
    setWords((ws) => [...ws, { ...w, id: crypto.randomUUID(), createdAt: Date.now(), stats: newStats() }])
  }, [])

  const addWords: Ctx['addWords'] = useCallback(
    (list) => {
      const known = new Set(words.map((w) => w.korean))
      const fresh = list.filter((w) => !known.has(w.korean))
      if (fresh.length) setWords((ws) => [...ws, ...fresh])
      return fresh.length
    },
    [words],
  )

  const updateWord: Ctx['updateWord'] = useCallback((id, patch) => {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  }, [])

  const deleteWord = useCallback((id: string) => setWords((ws) => ws.filter((w) => w.id !== id)), [])

  const recordReview = useCallback((id: string, correct: boolean) => {
    setWords((ws) => ws.map((w) => (w.id === id ? { ...w, stats: applyReview(w.stats, correct) } : w)))
    const k = dateKey()
    setActivity((a) => ({ ...a, [k]: (a[k] ?? 0) + 1 }))
  }, [])

  /** Korrigiert die zuletzt gewertete Antwort (z. B. nach einem Widerspruch), ohne eine neue Aktivität zu zählen */
  const reviseReview = useCallback((id: string, nowCorrect: boolean) => {
    setWords((ws) =>
      ws.map((w) => {
        if (w.id !== id) return w
        const s = w.stats
        return {
          ...w,
          stats: nowCorrect
            ? { ...s, wrongCount: Math.max(0, s.wrongCount - 1), correctCount: s.correctCount + 1, streak: Math.max(1, s.streak), easeFactor: Math.min(3, +(s.easeFactor + 0.3).toFixed(2)) }
            : { ...s, correctCount: Math.max(0, s.correctCount - 1), wrongCount: s.wrongCount + 1, streak: 0, easeFactor: Math.max(1.3, +(s.easeFactor - 0.3).toFixed(2)) },
        }
      }),
    )
  }, [])

  const resetStats = useCallback(() => {
    setWords((ws) => ws.map((w) => ({ ...w, stats: newStats() })))
    setActivity({})
  }, [])

  const restoreDemo = useCallback(() => setWords(createDemoWords()), [])
  const clearAll = useCallback(() => {
    setWords([])
    setActivity({})
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
    [settings, words, activity],
  )

  const importBackup: Ctx['importBackup'] = useCallback((json, mode) => {
    const data = JSON.parse(json) as Partial<BackupFile>
    if (data?.app !== 'hangul-studio' || !Array.isArray(data.words)) {
      throw new Error('Das ist keine gültige Hangul-Studio-Sicherung.')
    }
    const incoming = data.words.map(sanitizeWord).filter((w): w is WordItem => !!w)
    const inAct = data.activity && typeof data.activity === 'object' ? data.activity : {}
    if (mode === 'replace') {
      setWords(incoming)
      setActivity(inAct)
    } else {
      setWords((cur) => {
        const map = new Map(cur.map((w) => [w.korean, w]))
        for (const w of incoming) {
          const ex = map.get(w.korean)
          // Bei Konflikt gewinnt das Wort mit mehr Lernhistorie
          const exTotal = ex ? ex.stats.correctCount + ex.stats.wrongCount : -1
          if (!ex || w.stats.correctCount + w.stats.wrongCount > exTotal) map.set(w.korean, { ...w, id: ex?.id ?? w.id })
        }
        return [...map.values()]
      })
      setActivity((cur) => {
        const out = { ...cur }
        for (const [k, v] of Object.entries(inAct)) out[k] = Math.max(out[k] ?? 0, Number(v) || 0)
        return out
      })
    }
    if (data.settings && typeof data.settings === 'object') {
      const { geminiApiKey, ...rest } = data.settings
      setSettings((s) => ({ ...s, ...rest, checkOrder: rest.checkOrder ? normalizeOrder(rest.checkOrder) : s.checkOrder, ...(geminiApiKey ? { geminiApiKey } : {}) }))
    }
    return { words: incoming.length }
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      words, settings, activity, updateSettings, addWord, addWords, updateWord, deleteWord,
      recordReview, reviseReview, resetStats, restoreDemo, clearAll, exportBackup, importBackup,
    }),
    [words, settings, activity, updateSettings, addWord, addWords, updateWord, deleteWord, recordReview, reviseReview, resetStats, restoreDemo, clearAll, exportBackup, importBackup],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
