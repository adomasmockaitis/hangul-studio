/**
 * Partikel-Trainer mit KI: Übungssätze aus dem eigenen Wortschatz (gebündelt in einer Anfrage)
 * und gesammelte Bewertung von Übersetzungen am Ende einer Runde (eine Anfrage).
 */
import { callGeminiWithFallback, DEFAULT_MODEL } from '../gemini'
import { chapterOf, LEVEL_NAMES, type Level } from './content'
import { validateSentence } from './engine'
import { PARTICLE_IDS, type ParticleId } from './forms'
import type { PoolSentence } from './pool'
import type { WordItem } from '../../types'

/** Wie viele neue Wörter die KI einbauen darf (nach Lernstand 1–10) */
export function newWordLimits(learnLevel: number, vocabSize: number): { perSentence: number; perRound: number } {
  if (learnLevel <= 3) return { perSentence: 1, perRound: vocabSize >= 40 ? 0 : 3 } // nur bei Bedarf
  if (learnLevel <= 7) return { perSentence: 1, perRound: 5 }
  return { perSentence: 2, perRound: 8 }
}

const LEVEL_DESC: Record<Level, string> = {
  1: '3–4 Wörter, eine Lücke, Präsens höflich (-아요/어요), Grundwortschatz',
  2: 'kurze Sätze, eine Lücke, Präsens höflich',
  3: 'etwas längere Sätze, auch Vergangenheit, typische Verwechslungen (z. B. 에/에서)',
  4: 'zwei Lücken mit verschiedenen Partikeln, auch Nebensätze (-아서, -고, -지만)',
  5: 'mehrere Lücken, Höflichkeitsformen, feine Bedeutungsunterschiede',
}

/** Wörter, aus denen die Sätze gebaut werden sollen: zuletzt geübte zuerst, dann zufällig */
export function pickVocab(words: WordItem[], n = 40): WordItem[] {
  const usable = words.filter((w) => w.german && /[가-힣]/.test(w.korean))
  const sorted = [...usable].sort((a, b) => (b.stats.lastReviewed ?? 0) - (a.stats.lastReviewed ?? 0))
  return sorted.slice(0, n)
}

export function buildGeneratePrompt(opts: {
  particles: ParticleId[]
  level: Level
  count: number
  vocab: Pick<WordItem, 'korean' | 'german'>[]
  newWords: { perSentence: number; perRound: number }
}): string {
  const lines = opts.particles.map((p) => {
    const c = chapterOf(p)
    return `- ${p}: ${c.forms} (${c.name}); Lektionen: ${c.lessons.map((l) => `${l.id} = ${l.title}`).join(', ')}`
  })
  const vocab = opts.vocab.map((w) => `${w.korean}=${w.german}`).join('; ')
  return [
    `Du erstellst Übungssätze für einen Koreanisch-Partikel-Trainer (Lernende sprechen Deutsch).`,
    `Erstelle genau ${opts.count} verschiedene, natürliche, grammatisch einwandfreie koreanische Sätze, gleichmäßig verteilt auf diese Partikeln:`,
    ...lines,
    `Schwierigkeit: Stufe ${opts.level} (${LEVEL_NAMES[opts.level - 1]}): ${LEVEL_DESC[opts.level]}.`,
    `Baue die Sätze vor allem aus diesen Wörtern der Lernenden: ${vocab || '(keine – nutze Grundwortschatz)'}.`,
    opts.newWords.perRound > 0
      ? `Du darfst insgesamt höchstens ${opts.newWords.perRound} Wörter verwenden, die nicht in der Liste stehen (höchstens ${opts.newWords.perSentence} pro Satz); gib sie in "vocab" mit deutscher Bedeutung an. Grundwörter wie 저, 이, 그, 있다, 가다, 하다 zählen nicht.`
      : `Verwende nur Wörter aus der Liste und absoluten Grundwortschatz (저, 이, 그, 있다, 가다, 하다 …); "vocab" bleibt leer.`,
    `Markiere jede abgefragte Partikel mit geschweiften Klammern direkt am Wort, z. B. 친구{가} 와요. Bei mehreren richtigen Lösungen: 오늘{은|도} (nur wenn die deutsche Übersetzung beide erlaubt – besser vermeiden).`,
    `Sonderformen schreibst du so: {저+가=제가}, {나+의=내}.`,
    `Wichtig: Die Form muss zum letzten Laut passen (이/을/은/과 nach Konsonant, 가/를/는/와 nach Vokal). Kein 에 nach 어제, 오늘, 내일, 모레, 지금.`,
    `Die deutsche Übersetzung muss die Bedeutung eindeutig machen (도 = „auch“, 만 = „nur“), damit nur eine Partikel passt.`,
    `Antworte nur als JSON-Array: [{"ko":"…","de":"…","particle":"<${PARTICLE_IDS.join('|')}>","lesson":"<Lektions-ID>","tip":"<kurzer Tipp auf Deutsch, ohne die Lösung zu verraten>","vocab":[{"ko":"…","de":"…"}]}]`,
  ].join('\n')
}

function parseJsonArray(text: string): unknown[] {
  const t = text.replace(/```(?:json)?/gi, '').trim()
  try {
    const d = JSON.parse(t)
    return Array.isArray(d) ? d : []
  } catch {
    const m = t.match(/\[[\s\S]*\]/)
    if (!m) return []
    try {
      const d = JSON.parse(m[0])
      return Array.isArray(d) ? d : []
    } catch {
      return []
    }
  }
}

/** Antwort einlesen; ungültige Sätze (falsche Form, keine Lücke …) werden verworfen */
export function parseGenerated(text: string, particles: ParticleId[], level: Level, now = Date.now()): { sentences: PoolSentence[]; rejected: number } {
  const raw = parseJsonArray(text)
  const out: PoolSentence[] = []
  let rejected = 0
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return void rejected++
    const o = r as Record<string, unknown>
    const particle = String(o.particle ?? '') as ParticleId
    const lessons = PARTICLE_IDS.includes(particle) ? chapterOf(particle).lessons.map((l) => l.id) : []
    const lesson = lessons.includes(String(o.lesson)) ? String(o.lesson) : lessons[0]
    const s: PoolSentence = {
      id: `ai-${now.toString(36)}-${i}`,
      particle,
      lesson,
      level,
      ko: String(o.ko ?? '').trim(),
      de: String(o.de ?? '').trim(),
      source: 'ai',
      tip: typeof o.tip === 'string' ? o.tip.trim().slice(0, 200) : undefined,
      vocab: Array.isArray(o.vocab)
        ? (o.vocab as Record<string, unknown>[])
            .filter((v) => v && typeof v.ko === 'string' && /[가-힣]/.test(v.ko) && typeof v.de === 'string')
            .map((v) => ({ ko: String(v.ko).trim(), de: String(v.de).trim() }))
            .slice(0, 3)
        : undefined,
      createdAt: now,
    }
    if (!particles.includes(particle) || validateSentence(s)) return void rejected++
    out.push(s)
  })
  return { sentences: out, rejected }
}

export async function generateSentences(apiKey: string, opts: Parameters<typeof buildGeneratePrompt>[0]): Promise<{ sentences: PoolSentence[]; rejected: number }> {
  const { text } = await callGeminiWithFallback(apiKey, DEFAULT_MODEL, [{ text: buildGeneratePrompt(opts) }], undefined, { timeoutMs: 30_000 })
  return parseGenerated(text, opts.particles, opts.level)
}

// ---------- Übersetzungen gesammelt bewerten ----------

export interface TranslationItem {
  de: string
  /** Mustersatz */
  expected: string
  answer: string
}

export interface TranslationGrade {
  ok: boolean
  feedback: string
  /** Verbesserte Fassung der Antwort */
  corrected?: string
}

export function buildGradePrompt(items: TranslationItem[]): string {
  return [
    'Bewerte Übersetzungen deutschsprachiger Koreanisch-Lernender (Schwerpunkt: Partikeln).',
    'Eine Antwort ist richtig, wenn sie grammatisch korrekt ist, die Bedeutung trifft und die Partikeln stimmen – sie muss nicht wörtlich dem Mustersatz entsprechen. Kleine Tippfehler ohne Bedeutungsänderung zählen nicht.',
    'Gib zu jeder Antwort ein kurzes Feedback auf Deutsch (ein Satz; bei Fehlern: was an welcher Partikel falsch ist) und bei Fehlern eine verbesserte Fassung.',
    'Aufgaben:',
    ...items.map((it, i) => `${i + 1}. Deutsch: ${it.de} | Muster: ${it.expected} | Antwort: ${it.answer || '(leer)'}`),
    `Antworte nur als JSON-Array mit genau ${items.length} Einträgen in derselben Reihenfolge: [{"ok":true|false,"feedback":"…","corrected":"…"}]`,
  ].join('\n')
}

export function parseGrades(text: string, n: number): TranslationGrade[] | null {
  const raw = parseJsonArray(text)
  if (raw.length !== n) return null
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    return { ok: o.ok === true, feedback: typeof o.feedback === 'string' ? o.feedback : '', corrected: typeof o.corrected === 'string' && o.corrected.trim() ? o.corrected.trim() : undefined }
  })
}

export async function gradeTranslations(apiKey: string, items: TranslationItem[]): Promise<TranslationGrade[]> {
  const { text } = await callGeminiWithFallback(apiKey, DEFAULT_MODEL, [{ text: buildGradePrompt(items) }], undefined, { timeoutMs: 30_000 })
  const g = parseGrades(text, items.length)
  if (!g) throw new Error('Die Bewertung konnte nicht gelesen werden.')
  return g
}
