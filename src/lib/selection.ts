/**
 * Gemeinsame Wortauswahl für Lernen, Test und Diktat: einzeln, Ordner, Tags oder Smart.
 * Reine Logik ohne Oberfläche.
 */
import { activeOnly, descendantIds, effectiveFolder } from './folders'
import { askable, cardOf, DIRS, isDueDir, retrievability, type Dir } from './fsrs'
import type { Folder, WordItem } from '../types'

export const NO_FOLDER = 'ohne'

export type Selection =
  | { mode: 'smart' }
  | { mode: 'folders'; ids: string[] }
  | { mode: 'tags'; tags: string[] }
  | { mode: 'words'; ids: string[] }

export const SMART: Selection = { mode: 'smart' }

/** Vorauswahl für den Lernmodus (z. B. „Falsche im Lernmodus üben“ nach einem Quiz); wird einmal abgeholt */
let pendingLearn: string[] | null = null
export const setPendingLearn = (ids: string[]) => {
  pendingLearn = ids
}
export function takePendingLearn(): Selection | null {
  const ids = pendingLearn
  // erst kurz danach leeren: React ruft Initialisierer im Entwicklungsmodus doppelt auf
  if (ids) setTimeout(() => { if (pendingLearn === ids) pendingLearn = null }, 1000)
  return ids?.length ? { mode: 'words', ids } : null
}

/** Wörter einer festen Auswahl (Ordner inklusive Unterordner, „ohne“ = ohne Ordner) */
export function resolveSelection(sel: Selection, words: WordItem[], folders: Folder[]): WordItem[] {
  if (sel.mode === 'smart') return activeOnly(words, folders).filter(askable)
  if (sel.mode === 'words') {
    const ids = new Set(sel.ids)
    return words.filter((w) => ids.has(w.id))
  }
  if (sel.mode === 'tags') return words.filter((w) => w.tags.some((t) => sel.tags.includes(t)))
  const folderIds = new Set(folders.map((f) => f.id))
  const wanted = new Set<string>()
  for (const id of sel.ids) {
    if (id === NO_FOLDER) wanted.add(NO_FOLDER)
    else for (const d of descendantIds(folders, id)) wanted.add(d)
  }
  return words.filter((w) => wanted.has(effectiveFolder(w, folderIds) ?? NO_FOLDER))
}

export type SmartReason = 'due' | 'errors' | 'old' | 'new'

export interface Pick {
  word: WordItem
  dir: Dir
  /** Warum Smart das Wort gewählt hat */
  reason?: SmartReason
}

const DAY = 86_400_000
/** So viele Wörter höchstens pro Smart-Runde (der Rest kommt in der nächsten Runde) */
export const SMART_MAX = 40
/** Neue (nie geübte) Wörter pro Smart-Runde */
export const SMART_NEW = 5
/** So lange nicht geübt = auf jeden Fall wieder dran */
const OLD_DAYS = 21

/** Fehlerquote eines Wortes (0–1), erst ab 2 Fehlern aussagekräftig */
function errorRate(w: WordItem): number {
  const { correctCount: c, wrongCount: f } = w.stats
  return f >= 2 ? f / Math.max(1, c + f) : 0
}

/**
 * Smart-Auswahl: alle Wörter, die gerade „bereit“ sind – fällig laut Wiederholungsplan, oft falsch gemacht
 * oder lange nicht geübt –, dazu bis zu `maxNew` neue. Wörter aus pausierten Ordnern vorher mit `activeOnly`
 * herausfiltern. Reihenfolge: zuerst, was du am ehesten vergisst bzw. oft falsch machst.
 * dir = 'both': je Wort die dringendere Richtung.
 */
export function smartPick(words: WordItem[], dir: Dir | 'both', size: number = SMART_MAX, now: number = Date.now(), maxNew = SMART_NEW): Pick[] {
  const dirs = dir === 'both' ? DIRS : [dir]
  const ready: { p: Pick; score: number }[] = []
  const fresh: Pick[] = []
  for (const w of words) {
    if (!askable(w)) continue
    const err = errorRate(w)
    // zuletzt geübt: Statistik oder Wiederholungsplan (je nachdem, was jünger ist)
    const last = Math.max(w.stats.lastReviewed ?? 0, ...DIRS.map((d) => cardOf(w, d)?.last ?? 0))
    const days = last ? (now - last) / DAY : Infinity
    let best: { p: Pick; score: number; ok: boolean } | null = null
    let isNew = true
    for (const d of dirs) {
      const c = cardOf(w, d)
      if (c) isNew = false
      if (!c) continue
      const r = retrievability(c, now)
      const due = isDueDir(w, d, now)
      const reason: SmartReason | null = due ? 'due' : err >= 0.4 && days >= 0.5 ? 'errors' : days >= OLD_DAYS ? 'old' : null
      const lastWrong = w.stats.streak === 0 && w.stats.wrongCount > 0 ? 1 : 0
      const score = 0.5 * (1 - r) + 0.35 * err + 0.15 * Math.min(1, days / 30) + 0.1 * lastWrong
      const item = { p: { word: w, dir: d, reason: reason ?? undefined }, score, ok: !!reason }
      if (!best || (item.ok && !best.ok) || (item.ok === best.ok && item.score > best.score)) best = item
    }
    if (isNew) fresh.push({ word: w, dir: dirs[Math.floor(Math.random() * dirs.length)], reason: 'new' })
    else if (best?.ok) ready.push(best)
  }
  ready.sort((a, b) => b.score - a.score)
  fresh.sort((a, b) => a.word.createdAt - b.word.createdAt)
  return [...ready.map((x) => x.p), ...fresh.slice(0, maxNew)].slice(0, size)
}

/** Was Smart gerade abfragen würde, zusammengefasst (für Startseite und Hinweise) */
export function smartSummary(picks: Pick[]): string {
  const n = (r: SmartReason) => picks.filter((p) => p.reason === r).length
  const parts = [
    n('due') && `${n('due')} fällig`,
    n('errors') && `${n('errors')} oft falsch`,
    n('old') && `${n('old')} lange nicht geübt`,
    n('new') && `${n('new')} neu`,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** Kurzbeschreibung einer Auswahl für Knöpfe */
export function describeSelection(sel: Selection, folders: Folder[]): string {
  if (sel.mode === 'smart') return 'Smart'
  if (sel.mode === 'words') return `${sel.ids.length} ${sel.ids.length === 1 ? 'Wort' : 'Wörter'}`
  if (sel.mode === 'tags') return sel.tags.join(', ') || 'Keine Tags'
  const names = sel.ids.map((id) => (id === NO_FOLDER ? 'Ohne Ordner' : folders.find((f) => f.id === id)?.name ?? '?'))
  return names.join(', ') || 'Keine Ordner'
}
