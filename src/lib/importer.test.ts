import { describe, expect, it } from 'vitest'
import { buildTranslatePrompt, fillTranslations, guessWordType, missingJobs, parseGoogle, parseLooseText, parseTranslations } from './importer'

describe('Wortart ohne KI', () => {
  it('바다 ist kein Verb mehr', () => {
    expect(guessWordType('바다', 'Meer')).toBe('noun')
    expect(guessWordType('바다')).toBe('noun')
  })
  it('nutzt die deutsche Übersetzung', () => {
    expect(guessWordType('먹다', 'essen')).toBe('verb')
    expect(guessWordType('크다', 'groß sein')).toBe('adjective')
    expect(guessWordType('맛있다', 'lecker')).toBe('adjective')
    expect(guessWordType('사다', 'kaufen')).toBe('verb')
    expect(guessWordType('학교', 'Schule')).toBe('noun')
    expect(guessWordType('안녕하세요', 'Hallo')).toBe('other')
    expect(guessWordType('가다')).toBe('verb')
    expect(guessWordType('감사합니다')).toBe('other')
  })
})

describe('Freie Zeilen (z. B. aus der Texterkennung)', () => {
  it('erkennt verschiedene Schreibweisen', () => {
    const r = parseLooseText(['1. 학교 - Schule', '먹다  essen', 'Meer = 바다', '• 우유: Milch', '감사합니다', 'Danke schön', '', '---'].join('\n'))
    expect(r).toEqual([
      { korean: '학교', german: 'Schule' },
      { korean: '먹다', german: 'essen' },
      { korean: '바다', german: 'Meer' },
      { korean: '우유', german: 'Milch' },
      { korean: '감사합니다', german: '' },
      { korean: '', german: 'Danke schön' },
    ])
  })
  it('überspringt doppelte und überlange Zeilen', () => {
    const r = parseLooseText(['학교 Schule', '학교 Schule', '저는 오늘 친구와 같이 학교에 가서 한국어를 공부했어요 정말 재미있었어요'].join('\n'))
    expect(r).toHaveLength(1)
  })
})

describe('Fehlende Übersetzungen', () => {
  const items = [
    { korean: '학교', german: 'Schule' },
    { korean: '바다', german: '' },
    { korean: '', german: 'Milch' },
  ]
  it('findet, was fehlt', () => {
    expect(missingJobs(items)).toEqual([{ i: 1, text: '바다', from: 'ko' }, { i: 2, text: 'Milch', from: 'de' }])
    expect(buildTranslatePrompt(missingJobs(items))).toContain('2. [de→ko] Milch')
  })
  it('Gemini zuerst (eine Anfrage), Ergänztes ist „bitte prüfen“', async () => {
    let calls = 0
    const r = await fillTranslations(items, { gemini: async () => { calls++; return '["Meer","우유"]' } })
    expect(calls).toBe(1)
    expect(r.items.map((w) => [w.korean, w.german, w.review])).toEqual([['학교', 'Schule', false], ['바다', 'Meer', true], ['우유', 'Milch', true]])
    expect(r.via).toBe('gemini')
    expect(r.missing).toBe(0)
  })
  it('ohne Gemini Google; was scheitert, bleibt offen', async () => {
    const r = await fillTranslations(items, {
      gemini: async () => { throw new Error('kein Kontingent') },
      google: async (t) => (t === '바다' ? 'Meer' : ''),
    })
    expect(r.items[1].german).toBe('Meer')
    expect(r.items[2].korean).toBe('')
    expect(r.missing).toBe(1)
    expect(r.via).toBe('google')
  })
  it('liest die Antworten', () => {
    expect(parseTranslations('```json\n["a","b"]\n```', 2)).toEqual(['a', 'b'])
    expect(parseTranslations('["a"]', 2)).toBeNull()
    expect(parseGoogle([[['Meer', '바다', null], [' groß', ' 크다', null]], null, 'ko'])).toBe('Meer groß')
    expect(parseGoogle(null)).toBe('')
  })
})
