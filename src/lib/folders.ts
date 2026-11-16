/** Reine Hilfsfunktionen rund um Ordner (ohne Oberfläche, gut testbar) */
import { MAX_FOLDER_DEPTH, type Folder, type WordItem } from '../types'

/** Ebene eines Ordners: 1 = oberste Ebene. Unbekannte Ordner zählen als 0. */
export function folderDepth(folders: Folder[], id: string | null): number {
  const byId = new Map(folders.map((f) => [f.id, f]))
  let d = 0
  let cur = id ? byId.get(id) : undefined
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    d++
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return d
}

export const canAddSubfolder = (folders: Folder[], parentId: string | null) => folderDepth(folders, parentId) < MAX_FOLDER_DEPTH

/** Der Ordner und alle seine Unterordner */
export function descendantIds(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/** Pfad von oben bis zum Ordner, z. B. [Kurs, Lektion 3] */
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const out: Folder[] = []
  let cur = id ? byId.get(id) : undefined
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return out
}

/** Ordner-ID eines Worts, die tatsächlich existiert (sonst null = „Ohne Ordner“) */
export function effectiveFolder(w: WordItem, folderIds: Set<string>): string | null {
  return w.folderId && folderIds.has(w.folderId) ? w.folderId : null
}

/** Anzahl der Wörter je Ordner, inklusive Unterordner */
export function countWords(folders: Folder[], words: WordItem[]): Map<string, number> {
  const ids = new Set(folders.map((f) => f.id))
  const direct = new Map<string, number>()
  for (const w of words) {
    const f = effectiveFolder(w, ids)
    if (f) direct.set(f, (direct.get(f) ?? 0) + 1)
  }
  const out = new Map<string, number>()
  for (const f of folders) {
    let n = 0
    for (const d of descendantIds(folders, f.id)) n += direct.get(d) ?? 0
    out.set(f.id, n)
  }
  return out
}

/** Ordner sortiert nach Name (natürliche Zahlenfolge: „Kapitel 2“ vor „Kapitel 10“) */
export const sortFolders = (list: Folder[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))

// ---------- Kapitel-/Lektions-Tags in Ordner umwandeln ----------

const CHAPTER_TAG = /^#?\s*(kapitel|lektion|lesson|chapter|unit|einheit|teil)[\s_-]*(\d+)$/i

/** Erkennt Tags wie „#Kapitel1“ und liefert einen schönen Ordnernamen („Kapitel 1“) */
export function chapterFolderName(tag: string): string | null {
  const m = CHAPTER_TAG.exec(tag.trim())
  if (!m) return null
  const word = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
  return `${word} ${Number(m[2])}`
}

/** Welche Kapitel-Tags gibt es bei Wörtern ohne Ordner? (Name -> Anzahl Wörter) */
export function chapterTagSuggestions(words: WordItem[], folderIds: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  for (const w of words) {
    if (effectiveFolder(w, folderIds)) continue
    const name = w.tags.map(chapterFolderName).find((n): n is string => !!n)
    if (name) out.set(name, (out.get(name) ?? 0) + 1)
  }
  return out
}

/**
 * Plant die Umwandlung: neue Ordner (bestehende gleichen Namens auf oberster Ebene werden wiederverwendet)
 * und pro Wort Zielordner plus Tags ohne den Kapitel-Tag. Wörter, die schon in einem Ordner liegen, bleiben unberührt.
 */
export function planChapterConversion(
  words: WordItem[],
  folders: Folder[],
  newId: () => string,
  now: number,
): { newFolders: Folder[]; moves: { id: string; folderId: string; tags: string[] }[] } {
  const ids = new Set(folders.map((f) => f.id))
  const byName = new Map(folders.filter((f) => f.parentId === null).map((f) => [f.name.toLowerCase(), f.id]))
  const newFolders: Folder[] = []
  const moves: { id: string; folderId: string; tags: string[] }[] = []
  for (const w of words) {
    if (effectiveFolder(w, ids)) continue
    const tag = w.tags.find((t) => chapterFolderName(t))
    if (!tag) continue
    const name = chapterFolderName(tag)!
    let fid = byName.get(name.toLowerCase())
    if (!fid) {
      fid = newId()
      byName.set(name.toLowerCase(), fid)
      newFolders.push({ id: fid, name, parentId: null, createdAt: now, updatedAt: now })
    }
    moves.push({ id: w.id, folderId: fid, tags: w.tags.filter((t) => t !== tag) })
  }
  return { newFolders, moves }
}
