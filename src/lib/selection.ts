/**
 * Gemeinsame Wortauswahl für Lernen, Test und Diktat: einzeln, Ordner, Tags oder Smart.
 * Reine Logik ohne Oberfläche.
 */
import { descendantIds, effectiveFolder } from './folders'
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
  if (sel.mode === 'smart') return words.filter(askable)
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

export interface Pick {
  word: WordItem
  dir: Dir
}

/**
 * Smart-Auswahl: zuerst fällige Karten mit der geringsten Erinnerungswahrscheinlichkeit,
 * dann neue Wörter (begrenzt), zuletzt – falls noch Platz – die am ehesten vergessenen übrigen.
 * dir = 'both': je Wort die dringendere Richtung.
 */
export function smartPick(words: WordItem[], dir: Dir | 'both', size: number, now: number, maxNew = 5): Pick[] {
  const dirs = dir === 'both' ? DIRS : [dir]
  const cands: { p: Pick; due: boolean; isNew: boolean; r: number }[] = []
  for (const w of words) {
    if (!askable(w)) continue
    // je Wort nur eine Richtung: die mit der geringsten Erinnerungswahrscheinlichkeit
    let best: { p: Pick; due: boolean; isNew: boolean; r: number } | null = null
    for (const d of dirs) {
      const c = cardOf(w, d)
      const item = { p: { word: w, dir: d }, due: isDueDir(w, d, now), isNew: !c, r: retrievability(c, now) }
      if (!best || (item.due && !best.due) || (item.due === best.due && item.r < best.r)) best = item
    }
    if (best) cands.push(best)
  }
  const due = cands.filter((c) => c.due && !c.isNew).sort((a, b) => a.r - b.r)
  const fresh = cands.filter((c) => c.isNew).sort((a, b) => a.p.word.createdAt - b.p.word.createdAt).slice(0, maxNew)
  const out = [...due, ...fresh].slice(0, size)
  if (out.length < Math.min(size, 5)) {
    const used = new Set(out.map((c) => c.p.word.id))
    const rest = cands.filter((c) => !used.has(c.p.word.id)).sort((a, b) => a.r - b.r)
    out.push(...rest.slice(0, Math.min(size, 5) - out.length))
  }
  return out.map((c) => c.p)
}

/** Kurzbeschreibung einer Auswahl für Knöpfe */
export function describeSelection(sel: Selection, folders: Folder[]): string {
  if (sel.mode === 'smart') return 'Smart'
  if (sel.mode === 'words') return `${sel.ids.length} ${sel.ids.length === 1 ? 'Wort' : 'Wörter'}`
  if (sel.mode === 'tags') return sel.tags.join(', ') || 'Keine Tags'
  const names = sel.ids.map((id) => (id === NO_FOLDER ? 'Ohne Ordner' : folders.find((f) => f.id === id)?.name ?? '?'))
  return names.join(', ') || 'Keine Ordner'
}
