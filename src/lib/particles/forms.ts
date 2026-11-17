/**
 * Partikel-Formen und Lücken: welche Form nach welchem Wort, Satz-Markierung, Prüfung, Ablenker.
 * Reine Funktionen ohne Oberfläche (getestet in particles.test.ts).
 */

export type ParticleId = 'ga' | 'reul' | 'neun' | 'gwa' | 'do' | 'man' | 'ui' | 'ege' | 'e' | 'eseo'

export const PARTICLE_IDS: ParticleId[] = ['ga', 'reul', 'neun', 'gwa', 'do', 'man', 'ui', 'ege', 'e', 'eseo']

/** Formen je Partikel; bei zwei Formen gilt [nach Endkonsonant, nach Vokal] */
const FORMS: Record<ParticleId, string[]> = {
  ga: ['이', '가'],
  reul: ['을', '를'],
  neun: ['은', '는'],
  gwa: ['과', '와', '하고'],
  do: ['도'],
  man: ['만'],
  ui: ['의'],
  ege: ['에게', '한테', '께'],
  e: ['에'],
  eseo: ['에서'],
}

/** Partikeln mit Form nach Endkonsonant / Vokal */
const ALTERNATING: ParticleId[] = ['ga', 'reul', 'neun', 'gwa']

export function isHangulSyllable(ch: string): boolean {
  const c = ch.charCodeAt(0)
  return c >= 0xac00 && c <= 0xd7a3
}

/** Endet die Silbe auf einen Konsonanten (받침)? */
export function hasBatchim(syllable: string): boolean {
  if (!isHangulSyllable(syllable)) return false
  return (syllable.charCodeAt(0) - 0xac00) % 28 !== 0
}

/** Letztes Zeichen eines Wortes, das für die Form zählt (Hangul; sonst Ziffer/Buchstabe) */
export function lastChar(word: string): string {
  const t = word.replace(/[\s)\]」』"'’”.,!?…]+$/u, '')
  return t.slice(-1)
}

/** Lateinische Buchstaben/Zahlen grob nach Aussprache (K-Pop → 팝: Endkonsonant) */
function latinEndsInConsonant(ch: string): boolean {
  if (/[0-9]/.test(ch)) return '013678'.includes(ch) // 영 일 삼 육 칠 팔 – 이 사 오 구 enden auf Vokal
  // Pop → 팝, Golf → 골프 (Vokal!), TV → 티비, BTS → 비티에스: nur m, n, l, p, b, k, t, g zählen als Endkonsonant
  return /[mnlpbktg]/i.test(ch)
}

/** Endet das Wort (gesprochen) auf einen Konsonanten? */
export function endsInConsonant(word: string): boolean {
  const ch = lastChar(word)
  if (isHangulSyllable(ch)) return hasBatchim(ch)
  return latinEndsInConsonant(ch)
}

export function familyOf(form: string): ParticleId | null {
  for (const id of PARTICLE_IDS) if (FORMS[id].includes(form)) return id
  return null
}

/** Richtige Form der Partikel für dieses Wort (gwa → 과/와, ege → 에게) */
export function formFor(p: ParticleId, noun: string): string {
  const f = FORMS[p]
  if (ALTERNATING.includes(p)) return endsInConsonant(noun) ? f[0] : f[1]
  return f[0]
}

/** Die jeweils falsche Form derselben Partikel (z. B. 가 statt 이), oder null */
export function wrongForm(p: ParticleId, noun: string): string | null {
  if (!ALTERNATING.includes(p)) return null
  const f = FORMS[p]
  return endsInConsonant(noun) ? f[1] : f[0]
}

export function isAlternating(p: ParticleId): boolean {
  return ALTERNATING.includes(p)
}

// ---------- Satz-Markierung ----------
// {가}        Lücke, Lösung 가
// {는|가}      Lücke mit mehreren richtigen Lösungen (die erste ist die Hauptlösung)
// {저+가=제가}  Sonderform: Wort und Partikel verschmelzen (Lücke ersetzt das ganze Wort)

export interface Gap {
  /** Hauptlösung, wie sie im Satz steht */
  answer: string
  /** Alle richtigen Antworten */
  accept: string[]
  particle: ParticleId
  /** Wort vor der Lücke (für Formregel und Tipps) */
  noun: string
  /** Sonderform: Grundwort (저, 나, 너) – die Lücke ersetzt dann das ganze Wort */
  base?: string
}

export type Part = { text: string } | { gap: number }

export interface Parsed {
  parts: Part[]
  gaps: Gap[]
}

/** Weitere richtige Antworten, die immer gelten (과/와 ↔ 하고, 에게 ↔ 한테) */
function equivalents(answer: string, p: ParticleId, noun: string): string[] {
  if (p === 'gwa') return answer === '하고' ? ['하고', formFor('gwa', noun)] : [answer, '하고']
  if (answer === '에게') return ['에게', '한테']
  if (answer === '한테') return ['한테', '에게']
  return [answer]
}

export function parseSentence(ko: string): Parsed {
  const parts: Part[] = []
  const gaps: Gap[] = []
  const re = /\{([^}]+)\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(ko))) {
    let before = ko.slice(last, m.index)
    const inner = m[1]
    const special = inner.match(/^([가-힣]+)\+([가-힣]+)=([가-힣]+)$/)
    let gap: Gap
    if (special) {
      const [, base, form, answer] = special
      const p = familyOf(form)
      if (!p) throw new Error(`Unbekannte Partikel in ${ko}`)
      gap = { answer, accept: [answer], particle: p, noun: base, base }
    } else {
      const alts = inner.split('|').map((s) => s.trim()).filter(Boolean)
      const p = familyOf(alts[0])
      if (!p) throw new Error(`Unbekannte Partikel „${alts[0]}“ in ${ko}`)
      const noun = (before.match(/(\S+)$/)?.[1] ?? '').trim()
      const accept = new Set<string>()
      for (const a of alts) {
        const fam = familyOf(a)
        for (const e of equivalents(a, fam ?? p, noun)) accept.add(e)
      }
      gap = { answer: alts[0], accept: [...accept], particle: p, noun }
    }
    if (before) parts.push({ text: before })
    before = ''
    parts.push({ gap: gaps.length })
    gaps.push(gap)
    last = m.index + m[0].length
  }
  if (last < ko.length) parts.push({ text: ko.slice(last) })
  return { parts, gaps }
}

/** Satz mit eingesetzten Lösungen (für Anzeige und Vorlesen) */
export function fillSentence(ko: string): string {
  return ko.replace(/\{([^}]+)\}/g, (_, inner: string) => {
    const sp = inner.match(/=([가-힣]+)$/)
    return sp ? sp[1] : inner.split('|')[0]
  })
}

/** Sonderformen: das Wort selbst wird ersetzt – im angezeigten Satz fehlt dann das Grundwort */
export function textBeforeGap(parsed: Parsed, gapIndex: number): string {
  const idx = parsed.parts.findIndex((p) => 'gap' in p && p.gap === gapIndex)
  const prev = parsed.parts[idx - 1]
  return prev && 'text' in prev ? prev.text : ''
}

const normalize = (s: string) => s.normalize('NFC').replace(/[\s.,!?·]/g, '').trim()

export function checkGap(answer: string, gap: Gap): boolean {
  const a = normalize(answer)
  return gap.accept.some((x) => normalize(x) === a)
}

/** Leicht verwechselbare Partikeln (für Ablenker und gemischtes Üben) */
export const CONFUSIONS: Record<ParticleId, ParticleId[]> = {
  ga: ['reul', 'do', 'e'],
  reul: ['ga', 'do', 'e'],
  neun: ['do', 'man', 'ui'],
  gwa: ['ui', 'do', 'reul'],
  do: ['man', 'reul', 'ga'],
  man: ['do', 'reul', 'ui'],
  ui: ['e', 'gwa', 'reul'],
  ege: ['e', 'eseo', 'ui'],
  e: ['eseo', 'ege', 'ui'],
  eseo: ['e', 'ege', 'ui'],
}

/**
 * Partikeln, die an derselben Stelle oft ebenfalls grammatisch richtig wären (nur die Nuance ändert sich):
 * 은/는 kann 이/가 und 을/를 ersetzen, und im Gespräch steht 을 가요 neben 에 가요. Sie sind deshalb keine Ablenker –
 * außer der Satz macht den Unterschied eindeutig (`contrast`, z. B. Antwort auf „누가?“: nur 이/가).
 */
function interchangeable(p: ParticleId, c: ParticleId, contrast: boolean): boolean {
  const pair = (a: ParticleId, b: ParticleId) => (p === a && c === b) || (p === b && c === a)
  if (pair('ga', 'neun')) return !contrast
  if (pair('reul', 'neun')) return true
  if (pair('e', 'reul')) return true
  return false
}

/**
 * Antwortmöglichkeiten für eine Lücke: richtige Form, falsche Form derselben Partikel und
 * verwechselbare Partikeln in passender Form. Keine Option ist zugleich eine richtige Antwort.
 * Die deutsche Übersetzung legt die Bedeutung fest (도 = auch, 만 = nur).
 */
export function choiceOptions(gap: Gap, n: number, opts: { contrast?: boolean; rnd?: () => number } = {}): string[] {
  const rnd = opts.rnd ?? Math.random
  if (gap.base) return specialOptions(gap, n, rnd)
  const out: string[] = []
  const add = (f: string | null) => {
    if (f && !out.includes(f) && !gap.accept.includes(f)) out.push(f)
  }
  add(wrongForm(gap.particle, gap.noun))
  const extra: ParticleId[] = opts.contrast && gap.particle === 'ga' ? ['neun'] : opts.contrast && gap.particle === 'neun' ? ['ga'] : []
  for (const c of [...extra, ...CONFUSIONS[gap.particle]]) {
    if (interchangeable(gap.particle, c, !!opts.contrast)) continue
    add(formFor(c, gap.noun))
  }
  // Auffüllen mit weiteren Partikeln
  for (const c of PARTICLE_IDS) {
    if (c === gap.particle || interchangeable(gap.particle, c, !!opts.contrast)) continue
    add(formFor(c, gap.noun))
  }
  // Die falsche Form zuerst behalten (häufigster Fehler), dann mischen
  const head = out.slice(0, 1)
  const rest = shuffle(out.slice(1), rnd)
  const picked = [...head, ...rest].slice(0, Math.max(1, n - 1))
  return shuffle([gap.answer, ...picked], rnd)
}

/** Sonderformen 내가/제가/네가, 내/제/네 */
const SPECIAL: Record<string, Record<string, string>> = {
  나: { 가: '내가', 의: '내' },
  저: { 가: '제가', 의: '제' },
  너: { 가: '네가', 의: '네' },
}
export function specialForm(base: string, form: string): string | null {
  return SPECIAL[base]?.[form] ?? null
}

function specialOptions(gap: Gap, n: number, rnd: () => number): string[] {
  const base = gap.base!
  const form = gap.particle === 'ga' ? '가' : '의'
  const cand = [`${base}${form}`, ...Object.keys(SPECIAL).map((b) => SPECIAL[b][form]), `${base}${gap.particle === 'ga' ? '는' : '를'}`]
  const out = [...new Set(cand)].filter((x) => x !== gap.answer)
  return shuffle([gap.answer, ...shuffle(out, rnd).slice(0, n - 1)], rnd)
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Kurzer Tipp zur Form. Vor der Antwort (reveal = false) nur der Hinweis auf den Endlaut,
 * nach der Antwort mit der richtigen Form.
 */
export function formTip(gap: Gap, reveal = true): string {
  if (gap.base) {
    const form = gap.particle === 'ga' ? '가' : '의'
    return reveal ? `Sonderform: ${gap.base} + ${form} wird zu ${specialForm(gap.base, form)}.` : `Achtung: ${gap.base} + ${form} hat eine Sonderform.`
  }
  if (!isAlternating(gap.particle)) return ''
  const ch = lastChar(gap.noun)
  const forms = FORMS[gap.particle]
  const cons = endsInConsonant(gap.noun)
  if (!reveal) return cons ? `„${ch}“ endet auf einen Konsonanten (받침).` : `„${ch}“ endet auf einen Vokal (kein 받침).`
  return cons ? `„${ch}“ endet auf einen Konsonanten (받침) → ${forms[0]}.` : `„${ch}“ endet auf einen Vokal → ${forms[1]}.`
}

/** Zeitwörter, an die nie 에 kommt */
export const NO_E_TIME_WORDS = ['어제', '오늘', '내일', '모레', '지금', '언제']
