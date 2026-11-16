/**
 * Wiederholungsplanung mit FSRS (wie Anki), getrennt nach Richtung:
 *   deko = Deutsch → Koreanisch (schreiben, auch Hör-Diktat)
 *   kode = Koreanisch → Deutsch (verstehen)
 * Reine Logik ohne Oberfläche – gut testbar.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { WordItem, WordStats } from '../types'

export type Dir = 'deko' | 'kode'
export const DIRS: Dir[] = ['deko', 'kode']
export const DIR_LABEL: Record<Dir, string> = { deko: 'Deutsch → Koreanisch', kode: 'Koreanisch → Deutsch' }

/** Gespeicherter Zustand einer Karte (Zeiten als ms, damit er sich als JSON speichern und abgleichen lässt) */
export interface SrsCard {
  due: number
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last?: number
}

export { Rating }
export type Grade4 = 1 | 2 | 3 | 4

const DAY = 86_400_000
export const DEFAULT_RETENTION = 0.9

const schedulers = new Map<number, ReturnType<typeof fsrs>>()
function scheduler(retention = DEFAULT_RETENTION) {
  const key = Math.round(retention * 1000)
  let s = schedulers.get(key)
  if (!s) {
    // Ohne Minuten-Lernschritte: die App plant in Tagen
    s = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: false, enable_short_term: false }))
    schedulers.set(key, s)
  }
  return s
}

const toCard = (c: SrsCard): Card => ({
  due: new Date(c.due),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state as State,
  last_review: c.last ? new Date(c.last) : undefined,
})
const fromCard = (c: Card): SrsCard => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last: c.last_review?.getTime(),
})

/** Neue Bewertung anwenden; ohne Karte beginnt eine neue */
export function schedule(card: SrsCard | undefined, grade: Grade4, now: number, retention = DEFAULT_RETENTION): SrsCard {
  const base = card ? toCard(card) : createEmptyCard(new Date(now))
  return fromCard(scheduler(retention).next(base, new Date(now), grade as Grade).card)
}

/** Wie wahrscheinlich die Person das Wort jetzt noch weiß (0–1); neue Karten: 0 */
export function retrievability(card: SrsCard | undefined, now: number): number {
  if (!card || card.state === State.New || !card.last) return 0
  return scheduler().retrievability(toCard(card), new Date(now))
}

/** Antwortinformationen, aus denen die App selbst die Bewertung ableitet */
export interface AnswerInfo {
  correct: boolean
  /** Antwortzeit in ms */
  ms?: number
  /** Unter dieser Zeit gilt die Antwort als „schnell“ */
  fastMs?: number
  /** Vorlage oder Strichreihenfolge war sichtbar */
  help?: boolean
  /** Prüfung war unsicher (z. B. Input Tools als Ausweichlösung) */
  uncertain?: boolean
  /** Multiple Choice: leichter als frei antworten – höchstens „Gut“ */
  easyFormat?: boolean
}

/**
 * Vier Stufen statt nur richtig/falsch:
 *   falsch → Nochmal (1) · unsicher geprüft falsch → Schwer (2)
 *   richtig mit Hilfe → Schwer (2) · richtig, aber langsam/unsicher/Auswahl → Gut (3) · richtig und schnell → Leicht (4)
 */
export function gradeFrom(a: AnswerInfo): Grade4 {
  if (!a.correct) return a.uncertain ? Rating.Hard : Rating.Again
  if (a.help) return Rating.Hard
  if (a.uncertain || a.easyFormat) return Rating.Good
  if (a.ms !== undefined && a.fastMs !== undefined && a.ms <= a.fastMs) return Rating.Easy
  return Rating.Good
}

/** Zeitgrenze für „schnell“: Schreiben 3 s + 1,5 s je Silbe, Tippen 5 s */
export function fastLimit(kind: 'write' | 'type', text: string): number {
  if (kind === 'type') return 5000
  const syllables = [...text].filter((c) => /[가-힣]/.test(c)).length || 1
  return 3000 + syllables * 1500
}

/**
 * Startwerte aus dem bisherigen Lernstand (vor FSRS): Zuletzt gelernt + bisheriger Abstand wird zur Stabilität,
 * die Fehlerquote zur Schwierigkeit. Nie geübte Wörter bekommen keine Karte (= neu).
 */
export function seedFromLegacy(s: WordStats): SrsCard | undefined {
  const total = s.correctCount + s.wrongCount
  if (!total || !s.lastReviewed) return undefined
  const stability = Math.max(0.5, Math.min(60, s.streak * s.easeFactor || 0.5))
  const errRate = s.wrongCount / total
  return {
    due: s.lastReviewed + stability * DAY,
    stability,
    difficulty: Math.min(10, Math.max(1, 3 + errRate * 7)),
    scheduled_days: Math.round(stability),
    learning_steps: 0,
    reps: total,
    lapses: s.wrongCount,
    state: State.Review,
    last: s.lastReviewed,
  }
}

/** Karte einer Richtung (mit Startwerten aus dem alten Lernstand, falls noch keine FSRS-Karte existiert) */
export function cardOf(w: WordItem, dir: Dir): SrsCard | undefined {
  return w.srs?.[dir] ?? seedFromLegacy(w.stats)
}

export const isDueDir = (w: WordItem, dir: Dir, now: number) => {
  const c = cardOf(w, dir)
  return !c || c.due <= now
}

/** Kann das Wort in dieser Richtung abgefragt werden? (Deutsche Bedeutung nötig) */
export const askable = (w: WordItem) => !!w.german.trim() && !!w.korean.trim()

/** Fällig in mindestens einer Richtung */
export const isDue = (w: WordItem, now = Date.now()) => askable(w) && DIRS.some((d) => isDueDir(w, d, now))

/** Neuere von zwei Karten (für den Geräte-Abgleich) */
export function newerCard(a?: SrsCard, b?: SrsCard): SrsCard | undefined {
  if (!a) return b
  if (!b) return a
  return (a.last ?? 0) >= (b.last ?? 0) ? a : b
}

// ---------- Protokoll und persönliche Anpassung ----------

export interface ReviewLogEntry {
  /** Wort-ID */
  w: string
  d: Dir
  /** Zeitpunkt */
  t: number
  g: Grade4
  /** Vorhergesagte Erinnerungswahrscheinlichkeit vor der Antwort (0 = neue Karte) */
  r: number
}

export const MIN_REVIEWS_FOR_PERSONAL = 300

/**
 * Vereinfachte persönliche Anpassung: Weichen die tatsächlichen Treffer deutlich von der Vorhersage ab,
 * wird die Ziel-Behaltensquote verschoben (wer mehr behält als vorhergesagt, bekommt längere Abstände).
 * Kein vollständiges FSRS-Optimieren der Modellgewichte – das bräuchte deutlich mehr Rechenaufwand.
 */
export function personalRetention(log: ReviewLogEntry[]): { retention: number; personal: boolean; n: number } {
  const known = log.filter((e) => e.r > 0)
  if (known.length < MIN_REVIEWS_FOR_PERSONAL) return { retention: DEFAULT_RETENTION, personal: false, n: known.length }
  const recent = known.slice(-1000)
  const predicted = recent.reduce((a, e) => a + e.r, 0) / recent.length
  const actual = recent.filter((e) => e.g > 1).length / recent.length
  const retention = Math.min(0.95, Math.max(0.8, DEFAULT_RETENTION - (actual - predicted) * 0.5))
  return { retention: Math.round(retention * 1000) / 1000, personal: true, n: known.length }
}
