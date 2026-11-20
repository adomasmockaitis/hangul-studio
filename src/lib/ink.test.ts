import { describe, expect, it } from 'vitest'
import { clusterWords, sameSentence, type Stroke } from './ink'

/** Senkrechter Strich bei x (Höhe 60) */
const stroke = (x: number, w = 10): Stroke => [{ x, y: 0, t: 0 }, { x: x + w, y: 60, t: 10 }]

describe('Schreibband: Wörter trennen', () => {
  it('kleine Lücken = Silben eines Worts, große Lücke = neues Wort', () => {
    // Wort 1: drei Striche eng, dann Lücke 60 (> 0,45 × 60), Wort 2: zwei Striche
    const groups = clusterWords([stroke(0), stroke(15), stroke(30), stroke(100), stroke(115)])
    expect(groups.map((g) => g.length)).toEqual([3, 2])
  })
  it('Reihenfolge nach Position, nicht nach Zeitpunkt', () => {
    const groups = clusterWords([stroke(100), stroke(0)])
    expect(groups[0][0][0].x).toBe(0)
  })
  it('vergleicht Sätze ohne Leerzeichen und Satzzeichen', () => {
    expect(sameSentence('친구가 학교에 가요', '친구가 학교에 가요.')).toBe(true)
    expect(sameSentence('친구가학교에가요', '친구가 학교에 가요.')).toBe(true)
    expect(sameSentence('친구는 학교에 가요', '친구가 학교에 가요.')).toBe(false)
    expect(sameSentence('', '')).toBe(false)
  })
})
