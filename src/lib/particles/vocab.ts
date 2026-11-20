/**
 * Partikel-Trainer: Welche Wörter eines Satzes kennt die lernende Person schon?
 * Ein Satz wird in Wortgruppen (어절) zerlegt; jede Gruppe muss von einem bekannten Grundwort „gedeckt“ sein:
 *  - Nomen u. Ä.: die Gruppe beginnt mit dem Wort (학교에서 ← 학교, 학생이에요 ← 학생)
 *  - Verben/Adjektive (…다): alle Silben des Stamms bis auf die letzte stimmen, die letzte hat denselben
 *    Anlaut (마셔요 ← 마시다, 와요 ← 오다, 들어요 ← 듣다, 공부해요 ← 공부하다)
 * Das ist eine Annäherung – sie lässt lieber einen Satz zu wenig als ein unbekanntes Wort durch.
 */
import type { WordItem } from '../../types'

export type LemmaKind = 'noun' | 'verb' | 'other'

export interface Lemma {
  ko: string
  kind: LemmaKind
}

/** Wortgruppen eines Satzes: Lücken entfernt (Sonderform → Grundwort), ohne Satzzeichen */
export function tokensOf(ko: string): string[] {
  const plain = ko
    .replace(/\{([가-힣]+)\+[가-힣]+=[가-힣]+\}/g, '$1')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[.,!?…·"“”„'()~\-]/g, ' ')
  return plain.split(/\s+/).map((t) => t.trim()).filter((t) => /[가-힣]/.test(t))
}

/** Silbe zerlegen: Anlaut, Vokal, Auslaut (Indizes nach Unicode); null für Nicht-Hangul */
function jamo(ch: string): { cho: number; jung: number; jong: number } | null {
  const c = ch.charCodeAt(0) - 0xac00
  if (c < 0 || c >= 11172) return null
  return { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 }
}

// Vokal-Indizes
const V = { a: 0, ae: 1, eo: 4, yeo: 6, o: 8, wa: 9, wae: 10, oe: 11, u: 13, wo: 14, wi: 16, eu: 18, i: 20 }
/** Vokal der letzten Stammsilbe → Vokale, die beim Beugen daraus werden dürfen (가요, 와요, 줘요, 마셔요, 써요, 해요, 돼요) */
const VOWEL_VARIANTS: Record<number, number[]> = {
  [V.a]: [V.a, V.ae], // 하 → 해
  [V.o]: [V.o, V.wa],
  [V.u]: [V.u, V.wo],
  [V.i]: [V.i, V.yeo],
  [V.eu]: [V.eu, V.eo, V.a],
  [V.oe]: [V.oe, V.wae],
  [V.eo]: [V.eo, V.ae], // ㅎ-unregelmäßig: 어떻다 → 어때, 그렇다 → 그래
}
// Auslaute, die Endungen anhängen: ㄴ(4) ㄹ(8) ㅁ(16) ㅂ(17) ㅆ(20)
const ENDING_JONG = [0, 4, 8, 16, 17, 20]
/** Silben, mit denen eine Verbendung beginnen kann (먹어요, 가고, 갔지만, 추워요 …) */
const VERB_ENDING_START = new Set([...'아어여요고서지는니면세시셔셨습겠기게도며러려자죠네나던든라냐다야거걸까께은을음군구래대잖워와우줘주봐보있놓버십신실의았었였웠운울으읍냈길쇼느'])
/** Silben, mit denen nach einem Nomen eine Partikel, Kopula oder Endung beginnen kann (학교에서, 학생이에요, 친구들과, 공부해요) */
const NOUN_SUFFIX_START = new Set([...'이가은는을를에의도만와과랑께들처보부까마로으예입였야아요씩쯤님한밖조뿐나든라하해했할합되돼됐시적스인일'])

/** Ist `syl` eine Beugungsform der Stammsilbe `stem` (gleicher Anlaut, passender Vokal und Auslaut)? */
function inflects(syl: string, stem: string): boolean {
  if (syl === stem) return true
  const a = jamo(syl)
  const b = jamo(stem)
  if (!a || !b || a.cho !== b.cho) return false
  const vowelOk = a.jung === b.jung || (VOWEL_VARIANTS[b.jung] ?? []).includes(a.jung)
  // ㄷ-unregelmäßig (듣다 → 들어요), ㅂ/ㅅ-unregelmäßig (춥다 → 추워요, 낫다 → 나아요): Auslaut fällt weg oder wird ㄹ
  const jongOk = a.jong === b.jong || ENDING_JONG.includes(a.jong)
  return vowelOk && jongOk
}

/** Grundformen eines Wörterbuch-Eintrags (ohne Klammern, Varianten mit / oder , getrennt) */
export function lemmasOfEntry(korean: string, wordType?: WordItem['wordType']): Lemma[] {
  const clean = korean.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  const out: Lemma[] = []
  for (const part of clean.split(/[/,;]/)) {
    for (const w of part.trim().split(/\s+/)) {
      if (!/^[가-힣]+$/.test(w)) continue
      const kind: LemmaKind =
        wordType === 'noun' ? 'noun' : wordType === 'verb' || wordType === 'adjective' ? 'verb' : /다$/.test(w) && w.length >= 2 ? 'verb' : 'noun'
      out.push({ ko: w, kind })
    }
  }
  return out
}

/**
 * Deckt das Grundwort diese Wortgruppe ab? Streng: nach einem Nomen muss eine Partikel/Endung folgen,
 * ein Verb muss als echte Beugung erkennbar sein (sonst wären 학교 ← 하다 oder 이름 ← 이 „bekannt“).
 */
export function covers(token: string, lemma: Lemma): boolean {
  if (lemma.kind !== 'verb' || !/다$/.test(lemma.ko) || lemma.ko.length < 2) {
    if (!token.startsWith(lemma.ko)) return false
    const rest = token.slice(lemma.ko.length)
    return !rest || NOUN_SUFFIX_START.has(rest[0])
  }
  const stem = lemma.ko.slice(0, -1)
  const head = stem.slice(0, -1)
  const last = stem.slice(-1)
  if (token.length <= head.length) return false
  // 르-unregelmäßig: 모르다 → 몰라요 (vorletzte Silbe bekommt ㄹ)
  const headOk = token.startsWith(head) || (head.length > 0 && token.slice(0, head.length - 1) === head.slice(0, -1) && inflects(token[head.length - 1], head.slice(-1)))
  if (!headOk) return false
  const syl = token[head.length]
  if (!inflects(syl, last)) return false
  const rest = token.slice(head.length + 1)
  return !rest || VERB_ENDING_START.has(rest[0])
}

/** Bestes (längstes) passendes Grundwort für eine Wortgruppe */
export function coveringLemma(token: string, lemmas: Lemma[]): Lemma | null {
  let best: Lemma | null = null
  for (const l of lemmas) if (covers(token, l) && (!best || l.ko.length > best.ko.length)) best = l
  return best
}

export interface VocabCheck {
  /** Grundwörter, die nicht im Wörterbuch stehen (in Satzreihenfolge, ohne Doppelte) */
  newWords: string[]
  /** Wortgruppen, die weder bekannt noch erklärt sind – dann ist der Satz nicht verwendbar */
  unknown: string[]
}

/** Prüft einen Satz: `known` = eigenes Wörterbuch, `extra` = erklärte neue Wörter (KI-Angabe oder Wortliste) */
export function checkVocab(ko: string, known: Lemma[], extra: Lemma[]): VocabCheck {
  const newWords: string[] = []
  const unknown: string[] = []
  for (const t of tokensOf(ko)) {
    if (coveringLemma(t, known)) continue
    const l = coveringLemma(t, extra)
    if (l) {
      if (!newWords.includes(l.ko)) newWords.push(l.ko)
    } else unknown.push(t)
  }
  return { newWords, unknown }
}

export function knownLemmas(words: Pick<WordItem, 'korean' | 'wordType'>[]): Lemma[] {
  return words.flatMap((w) => lemmasOfEntry(w.korean, w.wordType))
}

// ---------- Grenzen und Aufbau ----------

/** Neue Wörter pro Runde (10 Aufgaben) je Stufe; pro Satz höchstens 1, auf Profi 2 */
export const NEW_PER_ROUND: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 2, 4: 4, 5: 6 }
export const newPerSentence = (level: number) => (level >= 5 ? 2 : 1)

/** Ab hier gilt der Wortschatz als groß genug, um Sätze zu bilden */
export const ENOUGH = { total: 40, nouns: 15, verbs: 10 }
/** Im Aufbau-Modus mindestens so viele neue Wörter pro Runde */
export const BUILD_UP_MIN = 3

export interface VocabSize {
  total: number
  nouns: number
  verbs: number
  enough: boolean
  /** Was am meisten fehlt (für die Auswahl neuer Wörter) */
  need: 'noun' | 'verb' | null
}

export function vocabSize(words: Pick<WordItem, 'korean' | 'wordType'>[]): VocabSize {
  const usable = words.filter((w) => /[가-힣]/.test(w.korean))
  const nouns = usable.filter((w) => w.wordType === 'noun').length
  const verbs = usable.filter((w) => w.wordType === 'verb' || w.wordType === 'adjective').length
  const enough = usable.length >= ENOUGH.total && nouns >= ENOUGH.nouns && verbs >= ENOUGH.verbs
  const nounGap = ENOUGH.nouns - nouns
  const verbGap = ENOUGH.verbs - verbs
  const need = enough ? null : verbGap > 0 && verbGap >= nounGap ? 'verb' : nounGap > 0 ? 'noun' : verbGap > 0 ? 'verb' : null
  return { total: usable.length, nouns, verbs, enough, need }
}

/** Erlaubte neue Wörter in dieser Runde (Stufe, im Aufbau-Modus mindestens BUILD_UP_MIN) */
export function newWordBudget(level: 1 | 2 | 3 | 4 | 5, size: VocabSize): { perRound: number; perSentence: number; buildUp: boolean } {
  const base = NEW_PER_ROUND[level]
  if (size.enough) return { perRound: base, perSentence: newPerSentence(level), buildUp: false }
  // Sehr kleiner Wortschatz: ein Satz braucht mindestens Nomen + Verb, daher bis zu 2 neue pro Satz
  // und anfangs etwas mehr pro Runde, damit überhaupt Sätze entstehen
  const perRound = Math.max(base, size.total < 15 ? 6 : BUILD_UP_MIN)
  return { perRound, perSentence: 2, buildUp: true }
}

// ---------- Runde: neue Wörter je Satz ----------

export interface NewWord {
  ko: string
  de: string
  kind: LemmaKind
}

export interface RoundVocab {
  /** Neue Wörter eines Satzes; null = Satz enthält Wörter, die weder bekannt noch erklärt sind */
  newOf(s: { id: string; ko: string; vocab?: { ko: string; de: string }[] }): NewWord[] | null
  perRound: number
  perSentence: number
}

/** Prüfer für eine Runde: eigenes Wörterbuch gegen Satz, Erklärungen aus KI-Angaben oder der Wortliste */
export function makeRoundVocab(
  words: Pick<WordItem, 'korean' | 'wordType'>[],
  glossary: { ko: string; de: string; kind: LemmaKind }[],
  budget: { perRound: number; perSentence: number },
): RoundVocab {
  const known = knownLemmas(words)
  const gloss = glossary.map((g) => ({ ko: g.ko, kind: g.kind }))
  const glossDe = new Map(glossary.map((g) => [g.ko, g]))
  const cache = new Map<string, NewWord[] | null>()
  return {
    perRound: budget.perRound,
    perSentence: budget.perSentence,
    newOf(s) {
      const key = `${s.id}|${s.ko}`
      if (cache.has(key)) return cache.get(key)!
      const aiDe = new Map((s.vocab ?? []).map((v) => [v.ko, v.de]))
      const ai: Lemma[] = (s.vocab ?? []).flatMap((v) => lemmasOfEntry(v.ko))
      const r = checkVocab(s.ko, known, [...ai, ...gloss])
      const out = r.unknown.length
        ? null
        : r.newWords.map((ko) => {
            const g = glossDe.get(ko)
            const kind: LemmaKind = g?.kind ?? (/다$/.test(ko) && ko.length >= 2 ? 'verb' : 'noun')
            return { ko, de: aiDe.get(ko) ?? g?.de ?? '', kind }
          })
      cache.set(key, out)
      return out
    },
  }
}
