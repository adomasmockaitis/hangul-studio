import type { Activity, Settings, WordItem } from '../types'

/** Einstellungen, die nur auf dem jeweiligen Gerät bleiben und nie synchronisiert werden */
export const LOCAL_ONLY_SETTINGS = ['googleClientId', 'syncApiKey'] as const

/** Inhalt der Sync-Datei in Google Drive */
export interface SyncPayload {
  app: 'hangul-studio'
  kind: 'sync'
  version: 2
  updatedAt: number
  words: WordItem[]
  /** Gelöschte Wörter (Schlüssel = koreanisches Wort, Wert = Zeitpunkt des Löschens) */
  deleted: Record<string, number>
  activity: Activity
  settings: Partial<Settings>
  settingsUpdatedAt: number
}

const DAY = 86_400_000
const TOMBSTONE_TTL = 90 * DAY

const total = (w: WordItem) => w.stats.correctCount + w.stats.wrongCount
const upd = (w: WordItem) => w.updatedAt ?? 0

/** Führt zwei Stände desselben Wortes zusammen */
export function mergeWord(a: WordItem, b: WordItem): WordItem {
  // Neuere Änderung gewinnt bei Inhalt (Übersetzung, Tags, Beugungen …); bei Gleichstand das Wort mit mehr Lernhistorie
  const newer = upd(a) > upd(b) ? a : upd(b) > upd(a) ? b : total(a) >= total(b) ? a : b
  const older = newer === a ? b : a
  // Lernstand: Zähler nie verlieren (Maximum), Reihe/Ease vom zuletzt gelernten Stand
  const lastA = a.stats.lastReviewed ?? 0
  const lastB = b.stats.lastReviewed ?? 0
  const fresher = lastA >= lastB ? a : b
  return {
    ...newer,
    id: a.createdAt <= b.createdAt ? a.id : b.id,
    createdAt: Math.min(a.createdAt, b.createdAt),
    updatedAt: Math.max(upd(a), upd(b)) || undefined,
    stats: {
      correctCount: Math.max(a.stats.correctCount, b.stats.correctCount),
      wrongCount: Math.max(a.stats.wrongCount, b.stats.wrongCount),
      lastReviewed: Math.max(lastA, lastB) || null,
      streak: fresher.stats.streak,
      easeFactor: fresher.stats.easeFactor,
    },
    // fehlende Felder aus dem anderen Stand ergänzen
    pronunciation: newer.pronunciation ?? older.pronunciation,
    conjugations: newer.conjugations ?? older.conjugations,
  }
}

/** Führt lokalen und entfernten Stand zusammen (kommutativ, damit die Reihenfolge der Geräte egal ist) */
export function mergePayloads(local: SyncPayload, remote: SyncPayload, now = Date.now()): SyncPayload {
  // 1) Löschmarken vereinigen
  const deleted: Record<string, number> = { ...remote.deleted }
  for (const [k, t] of Object.entries(local.deleted)) deleted[k] = Math.max(deleted[k] ?? 0, t)

  // 2) Wörter zusammenführen (Schlüssel: koreanisches Wort)
  const map = new Map<string, WordItem>()
  for (const w of [...local.words, ...remote.words]) {
    const ex = map.get(w.korean)
    map.set(w.korean, ex ? mergeWord(ex, w) : w)
  }

  // 3) Löschmarken anwenden: gelöscht gilt nur, wenn das Wort danach nicht mehr geändert wurde
  for (const [korean, t] of Object.entries(deleted)) {
    const w = map.get(korean)
    if (w) {
      if (t >= upd(w)) map.delete(korean)
      else delete deleted[korean] // Wort wurde nach dem Löschen neu angelegt/geändert
    }
    if (now - t > TOMBSTONE_TTL) delete deleted[korean]
  }

  // 4) Aktivität: pro Tag das Maximum
  const activity: Activity = { ...remote.activity }
  for (const [k, v] of Object.entries(local.activity)) activity[k] = Math.max(activity[k] ?? 0, Number(v) || 0)

  // 5) Einstellungen: der zuletzt geänderte Stand gewinnt komplett
  const useRemote = remote.settingsUpdatedAt > local.settingsUpdatedAt
  const settings = useRemote ? { ...local.settings, ...remote.settings } : { ...remote.settings, ...local.settings }

  return {
    app: 'hangul-studio',
    kind: 'sync',
    version: 2,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    words: [...map.values()].sort((x, y) => x.createdAt - y.createdAt || x.korean.localeCompare(y.korean)),
    deleted,
    activity,
    settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
  }
}

/** Stabiler Vergleichswert, um zu erkennen, ob sich zwei Stände unterscheiden */
export function fingerprint(p: SyncPayload): string {
  const sortKeys = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify({
    w: [...p.words].sort((a, b) => a.korean.localeCompare(b.korean)),
    d: sortKeys(p.deleted),
    a: sortKeys(p.activity),
    s: sortKeys(p.settings as Record<string, unknown>),
    t: p.settingsUpdatedAt,
  })
}

/** Größter Zeitstempel in einem Stand (für die logische Uhr) */
export function maxStamp(words: WordItem[], deleted: Record<string, number>, settingsUpdatedAt = 0): number {
  let m = settingsUpdatedAt
  for (const w of words) if ((w.updatedAt ?? 0) > m) m = w.updatedAt!
  for (const t of Object.values(deleted)) if (t > m) m = t
  return m
}

export function emptyPayload(): SyncPayload {
  return { app: 'hangul-studio', kind: 'sync', version: 2, updatedAt: 0, words: [], deleted: {}, activity: {}, settings: {}, settingsUpdatedAt: 0 }
}

/** Prüft/normalisiert eine aus Drive geladene Datei */
export function parsePayload(raw: unknown): SyncPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<SyncPayload>
  if (r.app !== 'hangul-studio' || r.kind !== 'sync' || !Array.isArray(r.words)) return null
  return {
    ...emptyPayload(),
    ...r,
    words: r.words as WordItem[],
    deleted: r.deleted && typeof r.deleted === 'object' ? r.deleted : {},
    activity: r.activity && typeof r.activity === 'object' ? r.activity : {},
    settings: r.settings && typeof r.settings === 'object' ? r.settings : {},
    settingsUpdatedAt: typeof r.settingsUpdatedAt === 'number' ? r.settingsUpdatedAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  }
}
