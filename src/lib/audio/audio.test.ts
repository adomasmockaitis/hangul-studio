import { describe, expect, it } from 'vitest'
import {
  ClipQueue, TTS_BACKGROUND_LIMIT, TTS_DAILY_LIMIT, canUseTts, clipKey, countTts, memoryClipStore, pickSystemVoice, pickVoiceModels,
  produceClip, type Clip, type Generator, type Raw,
} from './clips'
import { isWordLike, shortGerman } from '../speech'

const RATE = 24000
/** Ton, der sauber ausklingt (letzte 50 ms Stille) */
const clean = (): Raw => {
  const n = RATE / 2
  const a = new Int16Array(n)
  for (let i = 0; i < n - RATE * 0.05; i++) a[i] = Math.round(Math.sin(i / 8) * 12000)
  return { pcm: [a], rate: RATE }
}
/** Ton, der mitten im Klang aufhört */
const cut = (): Raw => {
  const n = RATE / 2
  const a = new Int16Array(n)
  for (let i = 0; i < n; i++) a[i] = Math.round(Math.sin(i / 8) * 12000)
  return { pcm: [a], rate: RATE }
}

function fake(seq: (Raw | null)[], heard: (string | null)[] = [], tts?: (Raw & { model?: string }) | null): Generator & { liveCalls: number; ttsCalls: number } {
  const g = {
    voice: 'Charon',
    liveCalls: 0,
    ttsCalls: 0,
    async live() { return seq[g.liveCalls++] ?? null },
    async heard() { return heard.shift() ?? null },
    tts: tts === undefined ? undefined : async () => { g.ttsCalls++; return tts },
  }
  return g
}

describe('Erzeugungs-Kette', () => {
  it('nimmt die erste saubere Aufnahme', async () => {
    const g = fake([clean()], ['감사합니다'])
    const r = await produceClip('감사합니다', g, { now: 5 })
    expect(r.clip?.via).toBe('live')
    expect(r.tries).toBe(1)
    expect(r.clip?.createdAt).toBe(5)
  })
  it('verwirft abgeschnittene und falsch gehörte Aufnahmen und versucht es erneut', async () => {
    const g = fake([cut(), clean(), clean()], ['학교에', '학교에 가요'])
    const r = await produceClip('학교에 가요', g)
    expect(r.clip?.via).toBe('live')
    expect(r.tries).toBe(3)
    expect(r.rejected).toEqual(['Ende abgeschnitten', 'gehört: 학교에'])
  })
  it('ohne Gegenprüfung zählt die Endprüfung allein', async () => {
    const r = await produceClip('물', fake([clean()], [null]))
    expect(r.clip).not.toBeNull()
  })
  it('nach 3 Fehlversuchen das TTS-Modell (gleiche Stimme), sonst nichts', async () => {
    const g = fake([cut(), cut(), cut()], [], { ...clean(), model: 'gemini-3.8-pro-tts' })
    const r = await produceClip('감사합니다', g)
    expect(r.clip?.via).toBe('tts')
    expect(r.clip?.voice).toBe('Charon')
    expect(r.clip?.model).toBe('gemini-3.8-pro-tts')
    expect(g.liveCalls).toBe(3)
    const none = await produceClip('감사합니다', fake([null, null, null], [], null))
    expect(none.clip).toBeNull()
    expect(none.rejected.at(-1)).toBe('TTS-Modell nicht verfügbar')
  })
})

describe('Modellwahl', () => {
  it('findet Live-, Prüf- und TTS-Modell in der Modellliste', () => {
    const m = pickVoiceModels([
      { id: 'gemini-3.1-flash-lite', methods: ['generateContent'] },
      { id: 'gemini-3.5-live', methods: ['bidiGenerateContent'] },
      { id: 'gemini-3.8-live', methods: ['bidiGenerateContent'] },
      { id: 'gemini-3.8-live-translate', methods: ['bidiGenerateContent'] },
      { id: 'gemini-3.5-transcribe-live', methods: ['bidiGenerateContent'] },
      { id: 'gemini-3.8-flash-lite-tts', methods: ['generateContent'] },
      { id: 'gemini-3.8-pro-tts', methods: ['generateContent'] },
      { id: 'gemini-3.5-flash-lite-tts', methods: ['generateContent'] },
      { id: 'gemini-3.5-flash-tts', methods: ['generateContent'] },
    ])
    // alle TTS-Modelle, bestes zuerst: pro vor flash vor flash-lite, neuere Version zuerst
    expect(m).toEqual({ live: 'gemini-3.8-live', check: 'gemini-3.5-transcribe-live', tts: ['gemini-3.8-pro-tts', 'gemini-3.5-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.5-flash-lite-tts'] })
    expect(pickVoiceModels([{ id: 'gemini-3.1-flash-lite', methods: ['generateContent'] }])).toBeNull()
  })
})

describe('Tageszähler TTS-Modelle', () => {
  it('zählt je Modell, lässt im Hintergrund Reserve und beginnt jeden Tag neu', () => {
    const day1 = Date.UTC(2026, 10, 17, 10)
    const A = 'gemini-3.8-pro-tts'
    let q = null as ReturnType<typeof countTts> | null
    for (let i = 0; i < TTS_BACKGROUND_LIMIT; i++) q = countTts(q, A, day1)
    expect(canUseTts(q, A, true, day1)).toBe(false)
    expect(canUseTts(q, A, false, day1)).toBe(true)
    expect(canUseTts(q, 'gemini-3.8-flash-tts', true, day1)).toBe(true) // anderes Modell, eigenes Kontingent
    for (let i = TTS_BACKGROUND_LIMIT; i < TTS_DAILY_LIMIT; i++) q = countTts(q, A, day1)
    expect(canUseTts(q, A, false, day1)).toBe(false)
    expect(canUseTts(q, A, false, day1 + 86_400_000)).toBe(true)
  })
})

describe('Warteschlange', () => {
  it('legt doppelte Anfragen zusammen und zieht dringende vor', async () => {
    const q = new ClipQueue()
    const order: string[] = []
    const clip = (k: string): Clip => ({ pcm: new Int16Array(1), rate: 1, via: 'live', createdAt: k.length })
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const job = (k: string, wait = false) => async () => { if (wait) await gate; order.push(k); return clip(k) }
    const a = q.add('a', 'background', job('a', true))
    const b = q.add('b', 'background', job('b'))
    const c = q.add('c', 'now', job('c'))
    const c2 = q.add('c', 'now', job('c-doppelt'))
    release()
    await Promise.all([a, b, c, c2])
    expect(order).toEqual(['a', 'c', 'b'])
    expect(await c2).toEqual(await c)
  })
})

describe('Speicher und Stimmen', () => {
  it('Schlüssel je Stimme, Sprache und Text', async () => {
    expect(clipKey('Kore', 'ko', ' 학교 ')).toBe('gemini|Kore|ko|학교')
    expect(clipKey('Puck', 'ko', '학교')).not.toBe(clipKey('Kore', 'ko', '학교'))
    const s = memoryClipStore()
    await s.put('k', { pcm: new Int16Array(10), rate: 1, via: 'live', createdAt: 1 })
    expect(await s.stats()).toEqual({ count: 1, bytes: 20 })
  })
  it('wählt die natürlichste Systemstimme, außer man hat eine ausgewählt', () => {
    const voices = [
      { name: 'Microsoft Heami - Korean', lang: 'ko-KR' },
      { name: 'Microsoft SunHi Online (Natural) - Korean', lang: 'ko-KR' },
      { name: 'Google 한국의', lang: 'ko_KR' },
      { name: 'Anna', lang: 'de-DE' },
    ]
    expect(pickSystemVoice(voices, 'ko')?.name).toMatch(/SunHi/)
    expect(pickSystemVoice(voices, 'ko', 'Google 한국의')?.name).toBe('Google 한국의')
    expect(pickSystemVoice(voices, 'de')?.name).toBe('Anna')
    expect(pickSystemVoice(voices, 'ko', 'gibt es nicht')?.name).toMatch(/SunHi/)
  })
  it('Sätze bekommen die Systemstimme, Wörter die Gemini-Stimme', () => {
    expect(isWordLike('학교')).toBe(true)
    expect(isWordLike('학교에 가요')).toBe(true)
    expect(isWordLike('저는 학교에 가요.')).toBe(false)
    expect(isWordLike(shortGerman('Schüler/in, Student/in'))).toBe(true)
  })
})
