import { describe, expect, it, vi } from 'vitest'

// gemini.ts greift beim Laden auf localStorage zu – für diese reinen Funktionen nicht nötig
vi.mock('./gemini', () => ({ callGeminiWithFallback: vi.fn() }))

import { buildExamplePrompt, levelHint, parseExamples } from './examples'
import { mergeWord } from './merge'
import { matchesGerman } from './german'
import type { WordItem } from '../types'

describe('Beispielsätze', () => {
  it('liest JSON auch mit Codeblock und Text drumherum, höchstens zwei, nur mit Hangul', () => {
    const t = 'Gern!\n```json\n[{"ko":"학교에 가요.","de":"Ich gehe zur Schule."},{"ko":"학교가 커요.","de":"Die Schule ist groß."},{"ko":"drei","de":"x"}]\n```'
    const ex = parseExamples(t)
    expect(ex).toEqual([
      { ko: '학교에 가요.', de: 'Ich gehe zur Schule.', source: 'ai' },
      { ko: '학교가 커요.', de: 'Die Schule ist groß.', source: 'ai' },
    ])
    expect(parseExamples('[{"ko":"hello","de":"x"}]')).toEqual([])
    expect(parseExamples('kein json')).toEqual([])
  })

  it('passt die Schwierigkeit an den Lernstand an', () => {
    expect(levelHint(1)).toContain('sehr einfach')
    expect(levelHint(9)).toContain('fortgeschritten')
    const p = buildExamplePrompt({ korean: '먹다', german: 'essen', wordType: 'verb' }, 3)
    expect(p).toContain('먹다')
    expect(p).toContain('gebeugt')
  })
})

describe('Notiz und Beispiele im Abgleich', () => {
  const base = (over: Partial<WordItem>): WordItem => ({
    id: 'a', korean: '학교', german: 'Schule', wordType: 'noun', tags: [], createdAt: 1,
    stats: { correctCount: 0, wrongCount: 0, lastReviewed: null, streak: 0, easeFactor: 2.5 }, ...over,
  })
  it('neuere Änderung gewinnt, fehlende Felder kommen vom älteren Stand', () => {
    const older = base({ updatedAt: 1, note: 'alt', examples: [{ ko: '학교에 가요.', de: '', source: 'ai' }] })
    const newer = base({ updatedAt: 2, note: 'neu' })
    const m = mergeWord(older, newer)
    expect(m.note).toBe('neu')
    expect(m.examples?.[0].ko).toBe('학교에 가요.')
  })
})

describe('Deutsche Antwort im Hör-Diktat', () => {
  it('toleriert Artikel, Großschreibung und kleine Tippfehler; jede Bedeutung zählt', () => {
    expect(matchesGerman('die schule', 'Schule')).toBe(true)
    expect(matchesGerman('Student', 'Schüler/in, Student/in')).toBe(true)
    expect(matchesGerman('Kreanisch', 'Koreanisch (Sprache)')).toBe(true)
    expect(matchesGerman('Haus', 'Schule')).toBe(false)
  })
})
