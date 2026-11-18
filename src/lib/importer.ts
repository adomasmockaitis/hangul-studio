/**
 * Import ohne KI: Wortart raten, frei geschriebene Zeilen (z. B. aus der Texterkennung) in Wortpaare zerlegen,
 * fehlende Übersetzungen ergänzen (Gemini, sonst inoffizielles Google Translate).
 * Reine Funktionen bis auf die Netzwerkaufrufe am Ende (getestet in importer.test.ts).
 */
import type { WordType } from '../types'

const HANGUL = /[가-힣]/
const LATIN = /[A-Za-zÄÖÜäöüß]/

/** Nomen, die auf -다 enden (sonst gilt -다 als Verb/Adjektiv) */
const DA_NOUNS = new Set(['바다', '판다', '소다', '사이다', '오다리', '라다', '다다'])

const ADJECTIVES_DE = /^(groß|klein|gut|schlecht|schön|hübsch|teuer|billig|günstig|kalt|warm|heiß|kühl|viel|wenig|lecker|schwer|schwierig|leicht|einfach|neu|alt|jung|lang|kurz|hoch|niedrig|nah|weit|fern|schnell|langsam|müde|traurig|froh|glücklich|fröhlich|krank|gesund|hell|dunkel|laut|leise|sauber|schmutzig|voll|leer|richtig|falsch|wichtig|interessant|langweilig|lustig|freundlich|nett|scharf|süß|salzig|sauer|bitter)(?![a-zäöüß])/i

/**
 * Wortart grob bestimmen. Früher galt alles auf -다 als Verb – so wurde 바다 (Meer) zum Verb.
 * Jetzt zählt zuerst die deutsche Übersetzung: groß geschrieben → Nomen, „… sein“ oder Adjektiv → Adjektiv, sonst Verb.
 */
export function guessWordType(korean: string, german = ''): WordType {
  const k = korean.trim()
  if (!k.endsWith('다')) return /\s/.test(k) || /요$/.test(k) ? 'other' : 'noun'
  if (DA_NOUNS.has(k)) return 'noun'
  if (/(니다|세요)$/.test(k)) return 'other' // Höflichkeitsform wie 감사합니다
  const g = german.trim().replace(/^\(?(sich|etw\.?|jdn\.?|jdm\.?)\)?\s+/i, '')
  const first = g.split(/[\s,;/]+/)[0] ?? ''
  if (g) {
    if (/(^|\s)sein($|[\s,;])/i.test(g) || ADJECTIVES_DE.test(first)) return 'adjective'
    if (/^[A-ZÄÖÜ]/.test(first)) return 'noun' // deutsches Nomen, z. B. „Meer“
  }
  return 'verb'
}

export interface LooseWord {
  korean: string
  german: string
}

/** Aufzählungszeichen, Nummern und Trenner am Zeilenanfang/-ende entfernen */
const clean = (s: string) =>
  s
    .replace(/^[\s\d.)\]:•·*\-–—]+/, '')
    .replace(/[\s:;=\-–—|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Freie Zeilen zerlegen: „학교 Schule“, „1. 학교 - Schule“, „Schule = 학교“, Tabellenzeilen.
 * Zeilen mit nur einer Sprache werden mit leerer Übersetzung übernommen (wird danach ergänzt).
 */
export function parseLooseText(text: string): LooseWord[] {
  const out: LooseWord[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[|｜]/g, ' ').trim()
    if (!line || !(HANGUL.test(line) || LATIN.test(line))) continue
    // koreanische und lateinische Teile trennen (Hangul-Blöcke inkl. Leerzeichen dazwischen)
    const koParts = line.match(/[가-힣][가-힣\s~?!.()]*/g)?.map(clean).filter(Boolean) ?? []
    const deParts = line.match(/[A-Za-zÄÖÜäöüß(][A-Za-zÄÖÜäöüß\s,'’()./-]*/g)?.map(clean).filter((p) => LATIN.test(p)) ?? []
    const korean = (koParts[0] ?? '').replace(/[.?!]+$/, '')
    const german = deParts.join(', ').replace(/\s*,\s*,/g, ',').trim()
    if (!korean && !german) continue
    if (korean && korean.length > 30) continue // ganze Sätze/Überschriften überspringen
    const key = korean || `de:${german.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ korean, german })
  }
  return out
}

// ---------- Übersetzung ----------

export interface TranslateJob {
  /** Index in der Liste */
  i: number
  text: string
  from: 'ko' | 'de'
}

/** Was fehlt? (Koreanisch → Deutsch oder umgekehrt) */
export function missingJobs(items: LooseWord[]): TranslateJob[] {
  const jobs: TranslateJob[] = []
  items.forEach((w, i) => {
    if (w.korean && !w.german) jobs.push({ i, text: w.korean, from: 'ko' })
    else if (!w.korean && w.german) jobs.push({ i, text: w.german, from: 'de' })
  })
  return jobs
}

export function buildTranslatePrompt(jobs: TranslateJob[]): string {
  return [
    'Übersetze diese Vokabeln für deutschsprachige Koreanisch-Lernende.',
    'Koreanisch → Deutsch: kurze Wörterbuch-Bedeutung (bei Verben Infinitiv, z. B. „essen“; höchstens zwei Bedeutungen, durch Komma getrennt).',
    'Deutsch → Koreanisch: Grundform (Verben auf -다).',
    ...jobs.map((j, n) => `${n + 1}. [${j.from === 'ko' ? 'ko→de' : 'de→ko'}] ${j.text}`),
    `Antworte nur als JSON-Array mit genau ${jobs.length} Texten in derselben Reihenfolge: ["…", "…"]`,
  ].join('\n')
}

export function parseTranslations(text: string, n: number): string[] | null {
  const t = text.replace(/```(?:json)?/gi, '').trim()
  let data: unknown
  try {
    data = JSON.parse(t)
  } catch {
    const m = t.match(/\[[\s\S]*\]/)
    if (!m) return null
    try {
      data = JSON.parse(m[0])
    } catch {
      return null
    }
  }
  if (!Array.isArray(data) || data.length !== n) return null
  return data.map((x) => (typeof x === 'string' ? x.trim() : ''))
}

/** Antwort des inoffiziellen Google-Endpunkts lesen: [[["Schule","학교",…],…],…] */
export function parseGoogle(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return ''
  return (data[0] as unknown[])
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('')
    .trim()
}

export async function translateGoogle(text: string, from: 'ko' | 'de', fetcher: typeof fetch = fetch): Promise<string> {
  const to = from === 'ko' ? 'de' : 'ko'
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`Google Translate: HTTP ${res.status}`)
  return parseGoogle(await res.json())
}

export interface TranslateResult<T extends LooseWord = LooseWord> {
  items: (T & { review: boolean })[]
  /** Wie viele weiterhin ohne Übersetzung sind */
  missing: number
  via: 'gemini' | 'google' | 'mixed' | 'none'
}

/**
 * Fehlende Übersetzungen ergänzen: zuerst Gemini (eine Anfrage für alle), sonst Google Translate je Wort.
 * Ergänztes ist immer „bitte prüfen“.
 */
export async function fillTranslations<T extends LooseWord>(
  items: T[],
  opts: { gemini?: (prompt: string) => Promise<string>; google?: (text: string, from: 'ko' | 'de') => Promise<string> } = {},
): Promise<TranslateResult<T>> {
  const out = items.map((w) => ({ ...w, review: false }))
  const jobs = missingJobs(items)
  if (!jobs.length) return { items: out, missing: 0, via: 'none' }
  const apply = (j: TranslateJob, t: string) => {
    if (!t) return false
    if (j.from === 'ko') out[j.i].german = t
    else out[j.i].korean = t
    out[j.i].review = true
    return true
  }
  let usedGemini = false
  let usedGoogle = false
  let open = jobs
  if (opts.gemini) {
    try {
      const res = parseTranslations(await opts.gemini(buildTranslatePrompt(jobs)), jobs.length)
      if (res) {
        open = jobs.filter((j, n) => !apply(j, res[n]))
        usedGemini = true
      }
    } catch {
      /* weiter mit Google */
    }
  }
  if (open.length && opts.google) {
    const still: TranslateJob[] = []
    for (const j of open) {
      try {
        if (apply(j, await opts.google(j.text, j.from))) usedGoogle = true
        else still.push(j)
      } catch {
        still.push(j)
      }
    }
    open = still
  }
  return { items: out, missing: open.length, via: usedGemini && usedGoogle ? 'mixed' : usedGemini ? 'gemini' : usedGoogle ? 'google' : 'none' }
}
