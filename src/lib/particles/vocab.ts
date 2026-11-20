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

const CHO = (ch: string): number => {
  const c = ch.charCodeAt(0) - 0xac00
  return c >= 0 && c < 11172 ? Math.floor(c / 588) : -1
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

/** Deckt das Grundwort diese Wortgruppe ab? */
export function covers(token: string, lemma: Lemma): boolean {
  if (lemma.kind !== 'verb' || !/다$/.test(lemma.ko) || lemma.ko.length < 2) return token.startsWith(lemma.ko)
  const stem = lemma.ko.slice(0, -1)
  const head = stem.slice(0, -1)
  const last = stem.slice(-1)
  if (!token.startsWith(head) || token.length <= head.length) return false
  const next = token[head.length]
  return next === last || (CHO(next) >= 0 && CHO(next) === CHO(last))
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
