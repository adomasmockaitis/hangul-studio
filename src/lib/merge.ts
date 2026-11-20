import type { Activity, Folder, Settings, WordItem } from '../types'
import { newerCard } from './fsrs'
import { emptyParticleState, mergeParticleStates, sanitizeParticleState, type ParticleState } from './particles/engine'
import type { ReviewLogEntry } from './fsrs'

/** Einstellungen, die nur auf dem jeweiligen Gerät bleiben und nie synchronisiert werden */
export const LOCAL_ONLY_SETTINGS = ['googleClientId', 'syncApiKey', 'systemVoiceKo', 'systemVoiceDe'] as const

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
  /** Ordner (ab App-Version 2; ältere Stände haben keine) */
  folders?: Folder[]
  /** Gelöschte Ordner (Schlüssel = Ordner-ID, Wert = Zeitpunkt) */
  deletedFolders?: Record<string, number>
  /** Partikel-Trainer (ab Etappe 5) */
  particles?: ParticleState
  /** Protokoll der Quiz-Antworten (für Gelernt, Erfolgsquote, Stufe, persönliche Abstände) */
  reviewLog?: ReviewLogEntry[]
}

/** So viele Quiz-Antworten werden höchstens aufbewahrt (die ältesten fallen weg) */
export const REVIEW_LOG_MAX = 5000

/** Protokolle zweier Geräte vereinigen: gleiche Antwort (Wort, Richtung, Zeitpunkt) nur einmal, nach Zeit sortiert */
export function mergeReviewLogs(a: ReviewLogEntry[], b: ReviewLogEntry[], max = REVIEW_LOG_MAX): ReviewLogEntry[] {
  const map = new Map<string, ReviewLogEntry>()
  // erst das andere Gerät, dann dieses: eine hier nachträglich korrigierte Bewertung gewinnt
  for (const e of [...b, ...a]) map.set(`${e.w}|${e.d}|${e.t}`, e)
  return [...map.values()].sort((x, y) => x.t - y.t).slice(-max)
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
    // Wiederholungsplanung: je Richtung die zuletzt geübte Karte
    srs: a.srs || b.srs ? { deko: newerCard(a.srs?.deko, b.srs?.deko), kode: newerCard(a.srs?.kode, b.srs?.kode) } : undefined,
    // fehlende Felder aus dem anderen Stand ergänzen
    pronunciation: newer.pronunciation ?? older.pronunciation,
    note: newer.note ?? older.note,
    examples: newer.examples ?? older.examples,
    conjugations: newer.conjugations ?? older.conjugations,
  }
}

/**
 * Ordner zusammenführen: Vereinigung nach ID, bei gleicher ID gewinnt die neuere Änderung.
 * Löschmarken gelten nur, wenn der Ordner danach nicht mehr geändert wurde.
 */
export function mergeFolders(
  local: Folder[], remote: Folder[], localDel: Record<string, number>, remoteDel: Record<string, number>, now = Date.now(),
): { folders: Folder[]; deletedFolders: Record<string, number> } {
  const deletedFolders: Record<string, number> = { ...remoteDel }
  for (const [k, t] of Object.entries(localDel)) deletedFolders[k] = Math.max(deletedFolders[k] ?? 0, t)
  const map = new Map<string, Folder>()
  for (const f of [...local, ...remote]) {
    const ex = map.get(f.id)
    map.set(f.id, !ex || f.updatedAt > ex.updatedAt ? f : ex)
  }
  for (const [id, t] of Object.entries(deletedFolders)) {
    const f = map.get(id)
    if (f) {
      if (t >= f.updatedAt) map.delete(id)
      else delete deletedFolders[id]
    }
    if (now - t > TOMBSTONE_TTL) delete deletedFolders[id]
  }
  const folders = [...map.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return { folders, deletedFolders }
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

  // 6) Ordner
  const { folders, deletedFolders } = mergeFolders(local.folders ?? [], remote.folders ?? [], local.deletedFolders ?? {}, remote.deletedFolders ?? {}, now)

  return {
    app: 'hangul-studio',
    kind: 'sync',
    version: 2,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    folders,
    deletedFolders,
    reviewLog: local.reviewLog || remote.reviewLog ? mergeReviewLogs(local.reviewLog ?? [], remote.reviewLog ?? []) : undefined,
    particles: local.particles || remote.particles ? mergeParticleStates(local.particles ?? emptyParticleState(), remote.particles ?? emptyParticleState()) : undefined,
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
    f: [...(p.folders ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    fd: sortKeys(p.deletedFolders ?? {}),
    pa: p.particles ? particleFingerprint(p.particles) : null,
    rl: p.reviewLog ? [p.reviewLog.length, p.reviewLog[p.reviewLog.length - 1]?.t ?? 0, p.reviewLog.reduce((n, e) => n + e.g, 0)] : null,
  })
}

function particleFingerprint(s: ParticleState) {
  const sort = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  return { ...s, progress: sort(s.progress as Record<string, unknown>), stats: sort(s.stats), ai: s.ai.map((x) => x.id).sort() }
}

/** Größter Zeitstempel in einem Stand (für die logische Uhr) */
export function maxStamp(words: WordItem[], deleted: Record<string, number>, settingsUpdatedAt = 0, folders: Folder[] = [], deletedFolders: Record<string, number> = {}): number {
  let m = settingsUpdatedAt
  for (const f of folders) if (f.updatedAt > m) m = f.updatedAt
  for (const t of Object.values(deletedFolders)) if (t > m) m = t
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
    folders: Array.isArray(r.folders) ? (r.folders as Folder[]).filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string') : [],
    deletedFolders: r.deletedFolders && typeof r.deletedFolders === 'object' ? r.deletedFolders : {},
    particles: r.particles ? sanitizeParticleState(r.particles) : undefined,
    reviewLog: Array.isArray(r.reviewLog)
      ? (r.reviewLog as ReviewLogEntry[]).filter((e) => e && typeof e.w === 'string' && (e.d === 'deko' || e.d === 'kode') && typeof e.t === 'number' && typeof e.g === 'number')
      : undefined,
  }
}
