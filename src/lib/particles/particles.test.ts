import { describe, expect, it } from 'vitest'
import { CHAPTERS } from './content'
import {
  buildCheck, buildMiniTest, buildRound, buildWarmup, emptyParticleState, gapsToAsk, mergeParticleStates, recordResults,
  sanitizeParticleState, validateSentence, type ParticleState,
} from './engine'
import { PARTICLE_IDS, checkGap, choiceOptions, endsInConsonant, fillSentence, formFor, parseSentence, specialForm } from './forms'
import { POOL } from './pool'
import { newWordLimits, parseGenerated, parseGrades } from './ai'

/** Fester Zufall für reproduzierbare Tests */
function seeded(seed = 42) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('Partikel-Formen', () => {
  it('wählt die Form nach dem letzten Laut', () => {
    expect(formFor('ga', '학생')).toBe('이')
    expect(formFor('ga', '친구')).toBe('가')
    expect(formFor('reul', '물')).toBe('을')
    expect(formFor('reul', '바나나')).toBe('를')
    expect(formFor('neun', '텔레비전')).toBe('은')
    expect(formFor('gwa', '빵')).toBe('과')
    expect(formFor('gwa', '우유')).toBe('와')
    expect(formFor('e', '집')).toBe('에')
  })
  it('kennt Lehnwörter und Zahlen', () => {
    expect(endsInConsonant('K-Pop')).toBe(true) // 팝
    expect(endsInConsonant('TV')).toBe(false) // 티비
    expect(endsInConsonant('골프')).toBe(false)
    expect(endsInConsonant('2층')).toBe(true)
  })
  it('Sonderformen 제가, 내, 네가', () => {
    expect(specialForm('저', '가')).toBe('제가')
    expect(specialForm('나', '의')).toBe('내')
    expect(specialForm('너', '가')).toBe('네가')
  })
})

describe('Lücken', () => {
  it('liest Lücken, Sonderformen und Alternativen', () => {
    const p = parseSentence('{저+가=제가} 친구{와} 같이 학교{에} 가요.')
    expect(p.gaps.map((g) => g.answer)).toEqual(['제가', '와', '에'])
    expect(p.gaps[0].base).toBe('저')
    expect(p.gaps[1].accept.sort()).toEqual(['와', '하고'].sort())
    expect(fillSentence('{저+가=제가} 친구{와} 가요.')).toBe('제가 친구와 가요.')
    expect(parseSentence('오늘{은|도} 좋아요.').gaps[0].accept).toEqual(['은', '도'])
  })
  it('prüft Antworten und akzeptiert gleichwertige Partikeln', () => {
    const g = parseSentence('친구{에게} 줘요.').gaps[0]
    expect(checkGap('에게', g)).toBe(true)
    expect(checkGap('한테', g)).toBe(true)
    expect(checkGap('에', g)).toBe(false)
    const h = parseSentence('엄마{하고} 가요.').gaps[0]
    expect(checkGap('와', h)).toBe(true)
    expect(checkGap('과', h)).toBe(false)
  })
  it('Antwortmöglichkeiten enthalten genau eine richtige Antwort', () => {
    const rnd = seeded()
    for (const s of POOL) {
      for (const g of parseSentence(s.ko).gaps) {
        const opts = choiceOptions(g, 4, { contrast: s.contrast, rnd })
        expect(opts.filter((o) => g.accept.includes(o)), s.ko).toHaveLength(1)
        expect(new Set(opts).size, s.ko).toBe(opts.length)
        expect(opts.length, s.ko).toBeGreaterThanOrEqual(2)
      }
    }
  })
  it('은/는 und 이/가 erscheinen nur in eindeutigen Sätzen gegeneinander', () => {
    const rnd = seeded(7)
    const g = parseSentence('저{는} 학생이에요.').gaps[0]
    for (let i = 0; i < 30; i++) expect(choiceOptions(g, 4, { rnd })).not.toContain('가')
    const c = parseSentence('누가 왔어요? – 동생{이} 왔어요.').gaps[0]
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) choiceOptions(c, 4, { contrast: true, rnd }).forEach((o) => seen.add(o))
    expect(seen.has('은')).toBe(true)
  })
})

describe('Satz-Pool', () => {
  it('50 Sätze je Partikel, 10 je Stufe', () => {
    for (const p of PARTICLE_IDS) {
      const mine = POOL.filter((s) => s.particle === p)
      expect(mine.length, p).toBe(50)
      for (const lvl of [1, 2, 3, 4, 5]) expect(mine.filter((s) => s.level === lvl).length, `${p} Stufe ${lvl}`).toBe(10)
    }
  })
  it('jeder Satz besteht die automatische Prüfung', () => {
    const problems = POOL.map((s) => [s.ko, validateSentence(s)] as const).filter(([, e]) => e)
    expect(problems).toEqual([])
  })
  it('keine doppelten Sätze, jede Lektion existiert und hat Sätze', () => {
    expect(new Set(POOL.map((s) => s.ko)).size).toBe(POOL.length)
    for (const c of CHAPTERS) {
      for (const l of c.lessons) expect(POOL.some((s) => s.particle === c.id && s.lesson === l.id), `${c.id}/${l.id}`).toBe(true)
      for (const s of POOL.filter((x) => x.particle === c.id)) expect(c.lessons.map((l) => l.id), s.ko).toContain(s.lesson)
    }
  })
  it('Einsteiger-Sätze sind kurz und haben eine Lücke', () => {
    for (const s of POOL.filter((x) => x.level === 1)) {
      expect(parseSentence(s.ko).gaps.length, s.ko).toBe(1)
      expect(fillSentence(s.ko).split(/\s+/).length, s.ko).toBeLessThanOrEqual(4)
    }
  })
  it('erkennt fehlerhafte Sätze', () => {
    expect(validateSentence({ ko: '친구{이} 와요.', de: 'x', particle: 'ga', lesson: 'basis' })).toMatch(/falsche Form/)
    expect(validateSentence({ ko: '내일{에} 만나요.', de: 'x', particle: 'e', lesson: 'zeit' })).toMatch(/kein 에/)
    expect(validateSentence({ ko: '친구가 와요.', de: 'x', particle: 'ga', lesson: 'basis' })).toBe('keine Lücke')
  })
})

describe('Runden und Fortschritt', () => {
  it('Runde mischt mehrere Partikeln fair', () => {
    const tasks = buildRound(emptyParticleState(), ['e', 'eseo'], { n: 10, level: 2, rnd: seeded(3) })
    expect(tasks).toHaveLength(10)
    const e = tasks.filter((t) => t.sentence.particle === 'e').length
    expect(e).toBe(5)
    for (const t of tasks) if (t.kind === 'choice' || t.kind === 'form') expect(t.options.length).toBe(t.ask.length)
  })
  it('bis Stufe 3 nur Lücken der geübten Partikel, ab Stufe 4 alle', () => {
    const s = POOL.find((x) => x.ko.startsWith('저{는} 아침마다 신문'))!
    expect(gapsToAsk(s, 3)).toEqual([1])
    expect(gapsToAsk(s, 4)).toEqual([0, 1])
  })
  it('Übersetzen nur mit Key und ab Stufe 3', () => {
    const st = emptyParticleState()
    expect(buildRound(st, ['ga'], { level: 3, hasKey: false, rnd: seeded() }).some((t) => t.kind === 'translate')).toBe(false)
    expect(buildRound(st, ['ga'], { level: 2, hasKey: true, rnd: seeded() }).some((t) => t.kind === 'translate')).toBe(false)
    expect(buildRound(st, ['ga'], { level: 4, hasKey: true, rnd: seeded() }).filter((t) => t.kind === 'translate')).toHaveLength(2)
  })
  it('Check, Aufwärmen und Mini-Test haben die richtige Länge', () => {
    const st = emptyParticleState()
    expect(buildCheck(st, 'neun', seeded())).toHaveLength(5)
    const w = buildWarmup(st, 'e', seeded())
    expect(w).toHaveLength(3)
    expect(new Set(w.map((t) => t.sentence.lesson)).size).toBe(3)
    expect(w.every((t) => t.showTip)).toBe(true)
    expect(buildMiniTest(st, 'do', seeded())).toHaveLength(5)
  })
  it('Auto-Stufe steigt über 85 % und sinkt unter 60 %', () => {
    const s0: ParticleState = { ...emptyParticleState(), autoLevel: 2 }
    const sent = POOL[0]
    let up = s0
    for (let i = 0; i < 12; i++) up = recordResults(up, [{ sentence: sent, ok: true, level: 2 }], 1000 + i)
    expect(up.autoLevel).toBe(3)
    let down = s0
    for (let i = 0; i < 12; i++) down = recordResults(down, [{ sentence: sent, ok: i % 3 === 0, level: 2 }], 1000 + i)
    expect(down.autoLevel).toBe(1)
  })
  it('Fortschritt zählt je Lektion', () => {
    const s = recordResults(emptyParticleState(), [
      { sentence: POOL.find((x) => x.particle === 'e' && x.lesson === 'zeit')!, ok: true, level: 1 },
      { sentence: POOL.find((x) => x.particle === 'e' && x.lesson === 'ort')!, ok: false, level: 1 },
    ], 5)
    expect(s.progress.e?.lessons).toEqual({ zeit: { right: 1, wrong: 0 }, ort: { right: 0, wrong: 1 } })
  })
})

describe('KI-Sätze und Bewertung', () => {
  it('übernimmt nur gültige Sätze der gewünschten Partikeln', () => {
    const text = '```json\n' + JSON.stringify([
      { ko: '친구{가} 학교{에} 가요.', de: 'Ein Freund geht zur Schule.', particle: 'ga', lesson: 'basis', tip: 'Wer geht?', vocab: [{ ko: '학교', de: 'Schule' }] },
      { ko: '친구{이} 와요.', de: 'x', particle: 'ga', lesson: 'basis' }, // falsche Form
      { ko: '집{에서} 쉬어요.', de: 'Ich ruhe mich zu Hause aus.', particle: 'eseo', lesson: 'handlung' }, // nicht gewünscht
      { ko: '물{을} 마셔요.', de: 'Ich trinke Wasser.', particle: 'reul', lesson: 'gibtsnicht' },
    ]) + '\n```'
    const r = parseGenerated(text, ['ga', 'reul'], 2, 100)
    expect(r.sentences.map((s) => s.ko)).toEqual(['친구{가} 학교{에} 가요.', '물{을} 마셔요.'])
    expect(r.sentences[1].lesson).toBe('basis') // unbekannte Lektion → erste
    expect(r.sentences[0].vocab).toEqual([{ ko: '학교', de: 'Schule' }])
    expect(r.rejected).toBe(2)
  })
  it('liest die gesammelte Bewertung nur bei passender Anzahl', () => {
    expect(parseGrades('[{"ok":true,"feedback":"Gut"},{"ok":false,"feedback":"에서 statt 에","corrected":"집에서 쉬어요."}]', 2)).toEqual([
      { ok: true, feedback: 'Gut', corrected: undefined },
      { ok: false, feedback: '에서 statt 에', corrected: '집에서 쉬어요.' },
    ])
    expect(parseGrades('[{"ok":true}]', 2)).toBeNull()
  })
  it('neue Wörter: wenige bei niedrigem Lernstand', () => {
    expect(newWordLimits(2, 100).perRound).toBe(0)
    expect(newWordLimits(2, 10).perRound).toBe(3)
    expect(newWordLimits(9, 10)).toEqual({ perSentence: 2, perRound: 8 })
  })
})

describe('Abgleich des Partikel-Fortschritts', () => {
  it('führt zwei Geräte zusammen: neuere Kapitel gewinnen, KI-Sätze werden vereinigt', () => {
    const a: ParticleState = {
      ...emptyParticleState(),
      progress: { ga: { status: 'passed', updatedAt: 10, lessons: {} }, e: { status: 'learning', updatedAt: 5, lessons: {} } },
      ai: [{ ...POOL[0], id: 'ai-1', source: 'ai', createdAt: 1 }],
      level: 3, metaUpdatedAt: 1,
    }
    const b: ParticleState = {
      ...emptyParticleState(),
      progress: { e: { status: 'passed', updatedAt: 9, lessons: {} } },
      ai: [{ ...POOL[1], id: 'ai-2', source: 'ai', createdAt: 2 }],
      level: 'auto', metaUpdatedAt: 2,
    }
    const m = mergeParticleStates(a, b)
    expect(m.progress.ga?.status).toBe('passed')
    expect(m.progress.e?.status).toBe('passed')
    expect(m.ai.map((s) => s.id)).toEqual(['ai-1', 'ai-2'])
    expect(m.level).toBe('auto')
    expect(mergeParticleStates(b, a)).toEqual(m)
  })
  it('verwirft kaputte gespeicherte Daten', () => {
    expect(sanitizeParticleState(null)).toEqual(emptyParticleState())
    const s = sanitizeParticleState({ level: 9, ai: [{ id: 'x', ko: '친구{이} 와요.', de: 'x', particle: 'ga', lesson: 'basis' }] })
    expect(s.level).toBe('auto')
    expect(s.ai).toEqual([])
  })
})
