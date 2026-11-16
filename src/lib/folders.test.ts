import { describe, expect, it } from 'vitest'
import { canAddSubfolder, chapterFolderName, countWords, descendantIds, folderDepth, planChapterConversion } from './folders'
import { mergeFolders, mergePayloads, emptyPayload, fingerprint } from './merge'
import type { Folder, WordItem } from '../types'

const f = (id: string, parentId: string | null, updatedAt = 1, name = id): Folder => ({ id, name, parentId, createdAt: 1, updatedAt })
const w = (id: string, korean: string, folderId?: string, tags: string[] = []): WordItem => ({
  id, korean, german: '', wordType: 'noun', tags, createdAt: 1, folderId,
  stats: { correctCount: 0, wrongCount: 0, lastReviewed: null, streak: 0, easeFactor: 2.5 },
})

describe('Ordner', () => {
  const tree = [f('kurs', null), f('l1', 'kurs'), f('teil', 'l1')]

  it('begrenzt die Tiefe auf 3 Ebenen', () => {
    expect(folderDepth(tree, 'teil')).toBe(3)
    expect(canAddSubfolder(tree, 'l1')).toBe(true)
    expect(canAddSubfolder(tree, 'teil')).toBe(false)
    expect(canAddSubfolder(tree, null)).toBe(true)
  })

  it('zählt Wörter inklusive Unterordnern; Wörter in unbekannten Ordnern zählen nicht', () => {
    const counts = countWords(tree, [w('1', '가', 'kurs'), w('2', '나', 'teil'), w('3', '다', 'weg')])
    expect(counts.get('kurs')).toBe(2)
    expect(counts.get('teil')).toBe(1)
    expect([...descendantIds(tree, 'kurs')].sort()).toEqual(['kurs', 'l1', 'teil'])
  })

  it('erkennt Kapitel-Tags und plant die Umwandlung ohne doppelte Ordner', () => {
    expect(chapterFolderName('#Kapitel1')).toBe('Kapitel 1')
    expect(chapterFolderName('#lektion_12')).toBe('Lektion 12')
    expect(chapterFolderName('#Alltag')).toBeNull()
    let n = 0
    const plan = planChapterConversion(
      [w('1', '가', undefined, ['#Kapitel1', '#Nomen']), w('2', '나', undefined, ['#Kapitel1']), w('3', '다', undefined, ['#Kapitel2']), w('4', '라', 'kurs', ['#Kapitel1'])],
      [f('kurs', null)],
      () => `neu${++n}`,
      9,
    )
    expect(plan.newFolders.map((x) => x.name)).toEqual(['Kapitel 1', 'Kapitel 2'])
    expect(plan.moves).toEqual([
      { id: '1', folderId: 'neu1', tags: ['#Nomen'] },
      { id: '2', folderId: 'neu1', tags: [] },
      { id: '3', folderId: 'neu2', tags: [] },
    ])
  })
})

describe('Abgleich mit Ordnern', () => {
  it('vereinigt Ordner, neuere Änderung gewinnt, Löschung gilt nur ohne spätere Änderung', () => {
    const now = 1_000_000
    const r = mergeFolders(
      [f('a', null, 10, 'A alt'), f('b', null, 10)],
      [f('a', null, 20, 'A neu'), f('c', null, 30)],
      { c: 25 }, // lokal gelöscht, aber remote danach geändert -> bleibt
      { b: 15 }, // remote gelöscht nach letzter Änderung -> weg
      now,
    )
    expect(r.folders.map((x) => [x.id, x.name])).toEqual([['a', 'A neu'], ['c', 'c']])
    expect(r.deletedFolders).toEqual({ b: 15 })
  })

  it('ist kommutativ und nimmt Ordner in den Fingerabdruck auf', () => {
    const a = { ...emptyPayload(), folders: [f('x', null, 5)], words: [w('1', '가', 'x')] }
    const b = { ...emptyPayload(), folders: [f('y', null, 6)], deletedFolders: { x: 4 } }
    expect(fingerprint(mergePayloads(a, b, 100))).toBe(fingerprint(mergePayloads(b, a, 100)))
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, folders: [] }))
  })

  it('verträgt alte Stände ohne Ordnerfelder', () => {
    const old = emptyPayload()
    const merged = mergePayloads(old, { ...emptyPayload(), folders: [f('x', null)] }, 100)
    expect(merged.folders?.map((x) => x.id)).toEqual(['x'])
  })
})
