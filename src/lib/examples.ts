/** Beispielsätze zu einem Wort (per Gemini erzeugt, gespeichert und mit dem Wort synchronisiert) */
import { callGeminiWithFallback } from './gemini'
import { MAX_EXAMPLES, type Example, type WordItem } from '../types'

/** Was die Stufe für die Sätze bedeutet */
export function levelHint(level: number): string {
  if (level <= 2) return 'sehr einfach: 3–5 Wörter, Präsens, höfliche Form -아요/어요, nur Grundwortschatz'
  if (level <= 4) return 'einfach: kurze Sätze, Präsens oder Vergangenheit, höfliche Form -아요/어요'
  if (level <= 7) return 'mittel: ein Nebensatz erlaubt, verschiedene Zeiten, Alltagswortschatz'
  return 'fortgeschritten: natürliche Sätze, auch formelle Formen und Verbindungen'
}

export function buildExamplePrompt(w: Pick<WordItem, 'korean' | 'german' | 'wordType'>, level: number): string {
  return (
    `Schreibe ${MAX_EXAMPLES} natürliche koreanische Beispielsätze mit dem Wort „${w.korean}“ (Bedeutung: ${w.german || 'unbekannt'}) ` +
    `für deutschsprachige Lernende. Schwierigkeit: ${levelHint(level)}. ` +
    (w.wordType === 'verb' || w.wordType === 'adjective' ? 'Das Wort darf gebeugt vorkommen. ' : '') +
    'Die beiden Sätze sollen verschiedene Situationen zeigen. ' +
    'Antworte nur als JSON-Array: [{"ko":"<koreanischer Satz>","de":"<natürliche deutsche Übersetzung>"}].'
  )
}

/** Antwort einlesen; verträgt Codeblöcke und Text drumherum */
export function parseExamples(text: string): Example[] {
  const t = text.replace(/```(?:json)?/gi, '').trim()
  let data: unknown
  try {
    data = JSON.parse(t)
  } catch {
    const m = t.match(/\[[\s\S]*\]/)
    if (!m) return []
    try {
      data = JSON.parse(m[0])
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  return data
    .filter((e): e is { ko: unknown; de?: unknown } => !!e && typeof e === 'object' && typeof (e as { ko?: unknown }).ko === 'string')
    .map((e) => ({ ko: String(e.ko).trim(), de: typeof e.de === 'string' ? e.de.trim() : '', source: 'ai' as const }))
    .filter((e) => /[가-힣]/.test(e.ko))
    .slice(0, MAX_EXAMPLES)
}

export async function generateExamples(apiKey: string, model: string, w: WordItem, level: number): Promise<Example[]> {
  const { text } = await callGeminiWithFallback(apiKey, model, [{ text: buildExamplePrompt(w, level) }], undefined, { timeoutMs: 15_000 })
  const ex = parseExamples(text)
  if (!ex.length) throw new Error('Keine verwertbaren Sätze erhalten')
  return ex
}
