import { describe, expect, it } from 'vitest'
import { emptyPayload, fingerprint, mergePayloads, mergeReviewLogs, parsePayload } from './merge'
import type { ReviewLogEntry } from './fsrs'

const e = (w: string, t: number, g: 1 | 2 | 3 | 4 = 3): ReviewLogEntry => ({ w, d: 'deko', t, g, r: 0.5 })

describe('Quiz-Protokoll im Abgleich', () => {
  it('vereinigt zwei Geräte ohne Doppelte, nach Zeit sortiert', () => {
    const merged = mergeReviewLogs([e('a', 1), e('b', 3)], [e('a', 1), e('c', 2)])
    expect(merged.map((x) => x.w + x.t)).toEqual(['a1', 'c2', 'b3'])
  })

  it('eine hier korrigierte Bewertung gewinnt', () => {
    expect(mergeReviewLogs([e('a', 1, 4)], [e('a', 1, 1)])[0].g).toBe(4)
  })

  it('behält höchstens die neuesten Einträge', () => {
    expect(mergeReviewLogs([e('a', 1), e('a', 2), e('a', 3)], [], 2).map((x) => x.t)).toEqual([2, 3])
  })

  it('läuft durch mergePayloads, parsePayload und den Fingerabdruck', () => {
    const local = { ...emptyPayload(), reviewLog: [e('a', 1)] }
    const remote = { ...emptyPayload(), reviewLog: [e('b', 2)] }
    const m = mergePayloads(local, remote)
    expect(m.reviewLog).toHaveLength(2)
    expect(parsePayload(JSON.parse(JSON.stringify(m)))?.reviewLog).toHaveLength(2)
    expect(fingerprint(m)).not.toBe(fingerprint(local))
    // ältere Stände ohne Protokoll: nichts geht verloren
    expect(mergePayloads(local, emptyPayload()).reviewLog).toHaveLength(1)
  })
})
