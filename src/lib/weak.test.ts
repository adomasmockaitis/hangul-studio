import { describe, expect, it } from 'vitest'
import { weakWordIds } from './srs'
import type { ReviewLogEntry } from './fsrs'
import type { WordItem } from '../types'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 10, 1, 10)
const w = (id: string) => ({ id }) as WordItem
const e = (id: string, day: number, g: 1 | 2 | 3 | 4, d: 'deko' | 'kode' = 'deko'): ReviewLogEntry => ({ w: id, d, t: T0 + day * DAY, g, r: 0.5 })

describe('Noch unsicher', () => {
  it('falsch im Quiz → drin, an 3 Tagen richtig → raus', () => {
    const ws = [w('a'), w('b')]
    expect([...weakWordIds([e('a', 0, 1)], ws)]).toEqual(['a'])
    expect([...weakWordIds([e('a', 0, 1), e('a', 1, 3), e('a', 1, 4), e('a', 2, 3)], ws)]).toEqual(['a']) // erst 2 Tage
    expect([...weakWordIds([e('a', 0, 1), e('a', 1, 3), e('a', 2, 3), e('a', 3, 3)], ws)]).toEqual([])
  })
  it('neuer Fehler setzt zurück, Hilfe und andere Richtung zählen nicht', () => {
    const ws = [w('a')]
    expect([...weakWordIds([e('a', 0, 1), e('a', 1, 3), e('a', 2, 3), e('a', 3, 1), e('a', 4, 3)], ws)]).toEqual(['a'])
    expect([...weakWordIds([e('a', 0, 1), e('a', 1, 2), e('a', 2, 3, 'kode'), e('a', 3, 3)], ws)]).toEqual(['a'])
  })
  it('nie falsch → nicht drin, gelöschte Wörter fallen weg', () => {
    expect([...weakWordIds([e('a', 0, 3)], [w('a')])]).toEqual([])
    expect([...weakWordIds([e('x', 0, 1)], [w('a')])]).toEqual([])
  })
})
