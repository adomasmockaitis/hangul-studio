import { describe, expect, it } from 'vitest'
import { CHAPTERS } from './content'
import {
  buildCheck, buildMiniTest, buildRound, buildWarmup, emptyParticleState, gapsToAsk, mergeParticleStates, recordResults,
  sanitizeParticleState, validateSentence, type ParticleState,
} from './engine'
import { PARTICLE_IDS, checkGap, choiceOptions, endsInConsonant, fillSentence, formFor, parseSentence, specialForm } from './forms'
import { POOL } from './pool'
import { parseGenerated, parseGrades } from './ai'
import { GLOSSARY } from './glossary'
import { POOL as POOL_ALL } from './pool'
import { checkVocab, covers, knownLemmas, makeRoundVocab, newWordBudget, tokensOf, vocabSize } from './vocab'
import { restrictGaps, choiceOptions as choiceOpts, parseSentence as parseS } from './forms'
import { buildRound as buildR, emptyParticleState as emptyPS } from './engine'

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
  it('ganze Sätze übersetzen ab Stufe 2, mit der Stufe zunehmend (auch ohne Key)', () => {
    const st = emptyParticleState()
    const count = (level: 1 | 2 | 3 | 4 | 5) => buildRound(st, ['ga'], { level, hasKey: false, rnd: seeded() }).filter((t) => t.kind === 'translate').length
    expect([count(1), count(2), count(3), count(4), count(5)]).toEqual([0, 1, 2, 3, 4])
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
    expect(r.sentences.map((s) => s.ko)).toEqual(['친구{가} 학교에 가요.', '물{을} 마셔요.']) // fremde Lücke {에} wird zu Text
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
})

describe('Nur gewählte Partikeln', () => {
  it('füllt fremde Lücken aus', () => {
    expect(restrictGaps('친구{가} 학교{에서} 공부{를} 해요.', ['ga', 'reul'])).toBe('친구{가} 학교에서 공부{를} 해요.')
    expect(restrictGaps('{저+가=제가} 갈게요.', ['reul'])).toBe('제가 갈게요.')
    expect(restrictGaps('오늘{은|도} 가요.', ['ga'])).toBe('오늘은 가요.')
  })
  it('Ablenker nur aus der Auswahl', () => {
    const gap = parseS('학교{에} 가요.').gaps[0]
    const opts = choiceOpts(gap, 4, { allowed: ['e', 'ga'], rnd: () => 0.3 })
    expect(opts).toContain('에')
    expect(opts.every((o) => ['에', '이', '가'].includes(o))).toBe(true)
  })
  it('eine Runde fragt nie nicht gewählte Partikeln ab', () => {
    const tasks = buildR(emptyPS(), ['ga', 'reul'], { n: 10, level: 5, rnd: () => 0.42 })
    expect(tasks.length).toBeGreaterThan(0)
    for (const t of tasks) {
      const gaps = parseS(t.sentence.ko).gaps
      expect(gaps.every((g) => g.particle === 'ga' || g.particle === 'reul')).toBe(true)
    }
  })
})

describe('Eigene Wörter und neue Wörter', () => {
  it('erkennt Grundformen in gebeugten Wortgruppen', () => {
    expect(tokensOf('친구{가} 학교에서 {저+가=제가} 와요.')).toEqual(['친구', '학교에서', '저', '와요'])
    expect(covers('마셔요', { ko: '마시다', kind: 'verb' })).toBe(true)
    expect(covers('들어요', { ko: '듣다', kind: 'verb' })).toBe(true)
    expect(covers('공부해요', { ko: '공부하다', kind: 'verb' })).toBe(true)
    expect(covers('학생이에요', { ko: '학생', kind: 'noun' })).toBe(true)
    expect(covers('학교에', { ko: '학생', kind: 'noun' })).toBe(false)
    // streng: keine Zufallstreffer über gleichen Anlaut oder Wortanfang
    expect(covers('가방', { ko: '가다', kind: 'verb' })).toBe(false)
    expect(covers('학교에', { ko: '하다', kind: 'verb' })).toBe(false)
    expect(covers('한국어를', { ko: '하다', kind: 'verb' })).toBe(false)
    expect(covers('이름이', { ko: '이', kind: 'noun' })).toBe(false)
    expect(covers('오늘', { ko: '오다', kind: 'verb' })).toBe(false)
    expect(covers('저', { ko: '젖다', kind: 'verb' })).toBe(false)
    // echte Beugungen bleiben erkannt
    for (const [t, l] of [['해요', '하다'], ['했어요', '하다'], ['합니다', '하다'], ['와요', '오다'], ['봐요', '보다'], ['줘요', '주다'], ['써요', '쓰다'],
      ['바빠요', '바쁘다'], ['추워요', '춥다'], ['몰라요', '모르다'], ['돼요', '되다'], ['갔어요', '가다'], ['먹는', '먹다'], ['살아요', '살다']] as const) {
      expect(covers(t, { ko: l, kind: 'verb' }), `${t} ← ${l}`).toBe(true)
    }
    expect(covers('친구들과', { ko: '친구', kind: 'noun' })).toBe(true)
    expect(covers('의사예요', { ko: '의사', kind: 'noun' })).toBe(true)
  })
  it('zählt Wörter, die nicht im Wörterbuch stehen', () => {
    const known = knownLemmas([{ korean: '친구', wordType: 'noun' }, { korean: '오다', wordType: 'verb' }])
    expect(checkVocab('친구{가} 와요.', known, [])).toEqual({ newWords: [], unknown: [] })
    expect(checkVocab('친구{가} 학교에 와요.', known, [{ ko: '학교', kind: 'noun' }])).toEqual({ newWords: ['학교'], unknown: [] })
    expect(checkVocab('친구{가} 학교에 와요.', known, []).unknown).toEqual(['학교에'])
  })
  it('Grenzen je Stufe und Aufbau-Modus', () => {
    const big = vocabSize(Array.from({ length: 40 }, (_, i) => ({ korean: `가${i}`, wordType: i < 20 ? 'noun' as const : 'verb' as const })))
    expect(big.enough).toBe(true)
    expect(newWordBudget(1, big).perRound).toBe(0)
    expect(newWordBudget(3, big).perRound).toBe(2)
    expect(newWordBudget(5, big)).toEqual({ perRound: 6, perSentence: 2, buildUp: false })
    const small = vocabSize([{ korean: '친구', wordType: 'noun' }])
    expect(small.enough).toBe(false)
    expect(small.need).toBe('noun')
    expect(newWordBudget(1, small).buildUp).toBe(true)
    expect(newWordBudget(1, small).perRound).toBeGreaterThanOrEqual(3)
  })
  it('eine Runde hält die Grenze für neue Wörter ein', () => {
    const v = makeRoundVocab([{ korean: '친구', wordType: 'noun' }], [{ ko: '오다', de: 'kommen', kind: 'verb' }, { ko: '비', de: 'Regen', kind: 'noun' }], { perRound: 1, perSentence: 1 })
    expect(v.newOf({ id: 'a', ko: '친구{가} 와요.' })).toEqual([{ ko: '오다', de: 'kommen', kind: 'verb' }])
    expect(v.newOf({ id: 'b', ko: '비{가} 와요.' })?.length).toBe(2)
    expect(v.newOf({ id: 'c', ko: '고양이{가} 와요.' })).toBeNull()
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

describe('Wortliste der eingebauten Sätze', () => {
  it('deckt jede Wortgruppe aller Pool-Sätze ab', () => {
    const gloss = GLOSSARY.map((g) => ({ ko: g.ko, kind: g.kind }))
    const missing = POOL_ALL.flatMap((s) => checkVocab(s.ko, [], gloss).unknown.map((t) => `${t} (${s.ko})`))
    expect(missing).toEqual([])
  })
  it('hat zu jedem Wort eine deutsche Bedeutung', () => {
    expect(GLOSSARY.filter((g) => !g.de.trim())).toEqual([])
  })
})

describe('Runde mit kleinem Wortschatz (Demo-Wörter)', () => {
  it('nur eigene plus vorgestellte Wörter, Grenzen eingehalten', async () => {
    const { createDemoWords } = await import('../../data/demo')
    const demo = createDemoWords()
    const size = vocabSize(demo)
    for (const level of [1, 3, 5] as const) {
      const budget = newWordBudget(level, size)
      const rv = makeRoundVocab(demo, GLOSSARY, budget)
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      const tasks = buildR(emptyPS(), ['ga', 'reul'], { n: 10, level, rnd, vocab: rv })
      const intro = new Set(tasks.flatMap((t) => (t.newWords ?? []).map((w) => w.ko)))
      expect(intro.size).toBeLessThanOrEqual(budget.perRound)
      const known = [...knownLemmas(demo), ...[...intro].map((ko) => ({ ko, kind: (/다$/.test(ko) ? 'verb' : 'noun') as 'verb' | 'noun' }))]
      for (const t of tasks) {
        expect((t.newWords ?? []).length).toBeLessThanOrEqual(budget.perSentence)
        expect(checkVocab(t.sentence.ko, known, []).unknown).toEqual([])
        expect(parseS(t.sentence.ko).gaps.every((g) => g.particle === 'ga' || g.particle === 'reul')).toBe(true)
      }
    }
  })
})
