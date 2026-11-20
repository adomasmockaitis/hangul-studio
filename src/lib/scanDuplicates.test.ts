import { describe, expect, it } from 'vitest'
import { findDictDuplicates, findDuplicates, germanMeanings, parseDistinguish, type DupEntry } from './scanDuplicates'

const s = (id: string, korean: string, german: string): DupEntry => ({ id, source: 'scan', korean, german })
const d = (id: string, korean: string, german: string): DupEntry => ({ id, source: 'dict', korean, german })

describe('scanDuplicates', () => {
  it('zerlegt deutsche Bedeutungen ohne Artikel', () => {
    expect(germanMeanings('das Haus, Zuhause')).toEqual(['haus', 'zuhause'])
  })

  it('findet gleiches Deutsch mit verschiedenem Koreanisch im Scan', () => {
    const g = findDuplicates([s('1', '집', 'Haus'), s('2', '가옥', 'das Haus'), s('3', '물', 'Wasser')], [])
    expect(g).toHaveLength(1)
    expect(g[0].kind).toBe('german')
    expect(g[0].entries.map((e) => e.korean)).toEqual(['집', '가옥'])
  })

  it('vergleicht mit dem Wörterbuch, meldet aber nichts nur im Wörterbuch', () => {
    expect(findDuplicates([s('1', '가옥', 'Haus')], [d('a', '집', 'Haus')])).toHaveLength(1)
    expect(findDuplicates([s('1', '물', 'Wasser')], [d('a', '집', 'Haus'), d('b', '가옥', 'Haus')])).toHaveLength(0)
  })

  it('Klammerzusätze unterscheiden', () => {
    expect(findDuplicates([s('1', '집', 'Haus (Gebäude)'), s('2', '가정', 'Haus (Familie)')], [])).toHaveLength(0)
  })

  it('findet gleiches Koreanisch mit anderer Bedeutung', () => {
    const g = findDuplicates([s('1', '배', 'Bauch')], [d('a', '배', 'Schiff')])
    expect(g).toHaveLength(1)
    expect(g[0].kind).toBe('korean')
  })

  it('gleiches Wort mit gleicher Bedeutung ist kein Konflikt', () => {
    expect(findDuplicates([s('1', '집', 'Haus')], [d('a', '집', 'Haus')])).toHaveLength(0)
  })

  it('prüft auch das bestehende Wörterbuch allein', () => {
    expect(findDictDuplicates([d('a', '집', 'Haus'), d('b', '가옥', 'Haus'), d('c', '물', 'Wasser')])).toHaveLength(1)
  })

  it('liest die Gemini-Antwort', () => {
    expect(parseDistinguish('```json\n[{"korean":"집","german":"Haus (Gebäude)"}]\n```')).toEqual([{ korean: '집', german: 'Haus (Gebäude)' }])
  })
})
