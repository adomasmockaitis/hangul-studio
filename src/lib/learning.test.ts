import { describe, expect, it } from 'vitest'
import { cardOf, gradeFrom, isDue, personalRetention, retrievability, schedule, seedFromLegacy, type ReviewLogEntry, type SrsCard } from './fsrs'
import { computeLevel, SECURE_DAYS } from './level'
import { mergeWord } from './merge'
import { NO_FOLDER, resolveSelection, smartPick } from './selection'
import { activeOnly } from './folders'
import type { Folder, WordItem } from '../types'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 17)

const word = (id: string, over: Partial<WordItem> = {}): WordItem => ({
  id, korean: '단어' + id, german: 'Wort ' + id, wordType: 'noun', tags: [], createdAt: 1,
  stats: { correctCount: 0, wrongCount: 0, lastReviewed: null, streak: 0, easeFactor: 2.5 },
  ...over,
})
const card = (over: Partial<SrsCard>): SrsCard => ({ due: NOW, stability: 1, difficulty: 5, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last: NOW - DAY, ...over })

describe('Bewertung aus der Antwort', () => {
  it('leitet vier Stufen ab', () => {
    expect(gradeFrom({ correct: false })).toBe(1)
    expect(gradeFrom({ correct: false, uncertain: true })).toBe(2) // unsichere Prüfung zählt schwächer
    expect(gradeFrom({ correct: true, help: true })).toBe(2)
    expect(gradeFrom({ correct: true, ms: 9000, fastMs: 6000 })).toBe(3)
    expect(gradeFrom({ correct: true, ms: 2000, fastMs: 6000 })).toBe(4)
    expect(gradeFrom({ correct: true, ms: 1000, fastMs: 6000, easyFormat: true })).toBe(3) // Multiple Choice nie „leicht“
    expect(gradeFrom({ correct: true, ms: 1000, fastMs: 6000, uncertain: true })).toBe(3)
  })
})

describe('Planung', () => {
  it('verlängert Abstände bei richtig und verkürzt sie bei falsch', () => {
    const c1 = schedule(undefined, 3, NOW)
    expect(c1.due).toBeGreaterThan(NOW)
    const c2 = schedule(c1, 3, c1.due)
    expect(c2.due - c1.due).toBeGreaterThan(c1.due - NOW)
    const c3 = schedule(c2, 1, c2.due)
    expect(c3.lapses).toBe(1)
    expect(c3.stability).toBeLessThan(c2.stability)
  })

  it('übernimmt alte Lernstände als Startwerte', () => {
    expect(seedFromLegacy({ correctCount: 0, wrongCount: 0, lastReviewed: null, streak: 0, easeFactor: 2.5 })).toBeUndefined()
    const s = seedFromLegacy({ correctCount: 4, wrongCount: 1, lastReviewed: NOW - 2 * DAY, streak: 2, easeFactor: 2.5 })!
    expect(s.stability).toBe(5)
    expect(s.due).toBe(NOW + 3 * DAY)
    expect(s.lapses).toBe(1)
    expect(retrievability(s, NOW)).toBeGreaterThan(0.8)
  })

  it('ein Wort ist fällig, wenn eine Richtung fällig ist; ohne Deutsch nie', () => {
    expect(isDue(word('a'), NOW)).toBe(true) // neu
    const w = word('b', { srs: { deko: card({ due: NOW + DAY }), kode: card({ due: NOW + 2 * DAY }) } })
    expect(isDue(w, NOW)).toBe(false)
    expect(isDue({ ...w, srs: { ...w.srs, kode: card({ due: NOW - 1 }) } }, NOW)).toBe(true)
    expect(isDue(word('c', { german: '' }), NOW)).toBe(false)
  })

  it('passt die Ziel-Behaltensquote erst ab 300 Wiederholungen an', () => {
    const many = (g: 1 | 3, r: number, n: number): ReviewLogEntry[] => Array.from({ length: n }, (_, i) => ({ w: String(i), d: 'deko', t: i, g, r }))
    expect(personalRetention(many(3, 0.9, 299)).personal).toBe(false)
    // behält deutlich mehr als vorhergesagt -> niedrigeres Ziel = längere Abstände
    const better = personalRetention(many(3, 0.7, 400))
    expect(better.personal).toBe(true)
    expect(better.retention).toBeLessThan(0.9)
  })
})

describe('Auswahl', () => {
  const folders: Folder[] = [
    { id: 'k', name: 'Kurs', parentId: null, createdAt: 1, updatedAt: 1 },
    { id: 'l', name: 'Lektion', parentId: 'k', createdAt: 1, updatedAt: 1 },
  ]
  const ws = [word('1', { folderId: 'k' }), word('2', { folderId: 'l' }), word('3'), word('4', { tags: ['#Essen'] })]

  it('Ordner schließen Unterordner ein, „ohne“ meint Wörter ohne Ordner', () => {
    expect(resolveSelection({ mode: 'folders', ids: ['k'] }, ws, folders).map((w) => w.id)).toEqual(['1', '2'])
    expect(resolveSelection({ mode: 'folders', ids: [NO_FOLDER] }, ws, folders).map((w) => w.id)).toEqual(['3', '4'])
    expect(resolveSelection({ mode: 'tags', tags: ['#Essen'] }, ws, folders).map((w) => w.id)).toEqual(['4'])
    expect(resolveSelection({ mode: 'words', ids: ['2', '3'] }, ws, folders).map((w) => w.id)).toEqual(['2', '3'])
  })

  it('Smart: fällige zuerst nach Vergessensrisiko, dann begrenzt neue', () => {
    const due1 = word('d1', { srs: { deko: card({ due: NOW - DAY, last: NOW - 20 * DAY, stability: 2 }) } }) // fast vergessen
    const due2 = word('d2', { srs: { deko: card({ due: NOW - DAY, last: NOW - 3 * DAY, stability: 2 }) } })
    const later = word('x', { srs: { deko: card({ due: NOW + 9 * DAY, last: NOW - DAY, stability: 10 }) } })
    const fresh = Array.from({ length: 8 }, (_, i) => word('n' + i, { createdAt: i }))
    const picks = smartPick([later, due2, due1, ...fresh], 'deko', 10, NOW, 3)
    expect(picks.map((p) => p.word.id)).toEqual(['d1', 'd2', 'n0', 'n1', 'n2'])
    expect(picks.every((p) => p.dir === 'deko')).toBe(true)
  })

  it('Smart „beide“: je Wort die dringendere Richtung', () => {
    const w = word('w', { srs: { deko: card({ due: NOW + 5 * DAY, last: NOW - DAY, stability: 9 }), kode: card({ due: NOW - DAY, last: NOW - 9 * DAY }) } })
    expect(smartPick([w], 'both', 5, NOW)[0].dir).toBe('kode')
  })
})

describe('Smart: bereite Wörter', () => {
  const notDue = { due: NOW + 9 * DAY, last: NOW - 2 * DAY, stability: 10 }
  it('nimmt oft falsch gemachte und lange nicht geübte Wörter, auch wenn nicht fällig', () => {
    const errors = word('e', { stats: { correctCount: 1, wrongCount: 3, lastReviewed: NOW - 2 * DAY, streak: 0, easeFactor: 2.5 }, srs: { deko: card(notDue) } })
    const old = word('o', { srs: { deko: card({ due: NOW + 9 * DAY, last: NOW - 30 * DAY, stability: 60 }) } })
    const fine = word('f', { stats: { correctCount: 5, wrongCount: 0, lastReviewed: NOW - 2 * DAY, streak: 5, easeFactor: 2.5 }, srs: { deko: card(notDue) } })
    const picks = smartPick([fine, old, errors], 'deko', 40, NOW)
    expect(picks.map((p) => [p.word.id, p.reason])).toEqual([['e', 'errors'], ['o', 'old']])
  })
  it('nur aktiv gelernte Ordner', () => {
    const folders: Folder[] = [{ id: 'p', name: 'Neu', parentId: null, createdAt: 1, updatedAt: 1, paused: true }, { id: 'c', name: 'Unter', parentId: 'p', createdAt: 1, updatedAt: 1 }]
    const ws = [word('a', { folderId: 'p' }), word('b', { folderId: 'c' }), word('z')]
    expect(smartPick(activeOnly(ws, folders), 'deko', 40, NOW).map((p) => p.word.id)).toEqual(['z'])
  })
})

describe('Lernstand', () => {
  it('Stufe nach sicheren Wort-Richtungen, Abzug bei vielen Fehlern', () => {
    const secure = (n: number) => Array.from({ length: n }, (_, i) => word('s' + i, { srs: { deko: card({ stability: SECURE_DAYS }), kode: card({ stability: SECURE_DAYS }) } }))
    expect(computeLevel([], []).level).toBe(1)
    const l = computeLevel(secure(13), []) // 26 sichere Richtungen
    expect(l.level).toBe(3)
    expect(l.toNext).toBe(24)
    const bad: ReviewLogEntry[] = Array.from({ length: 20 }, (_, i) => ({ w: 'x', d: 'deko', t: i, g: 1, r: 0.5 }))
    expect(computeLevel(secure(13), bad).level).toBe(2)
  })
})

describe('Abgleich der Wiederholungsplanung', () => {
  it('nimmt je Richtung die zuletzt geübte Karte', () => {
    const a = word('1', { updatedAt: 5, srs: { deko: card({ last: 10, stability: 3 }), kode: card({ last: 1, stability: 1 }) } })
    const b = word('1', { updatedAt: 9, srs: { kode: card({ last: 20, stability: 8 }) } })
    const m = mergeWord(a, b)
    expect(m.srs?.deko?.stability).toBe(3)
    expect(m.srs?.kode?.stability).toBe(8)
    expect(cardOf(m, 'kode')?.last).toBe(20)
  })
})
