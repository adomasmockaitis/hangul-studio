import type { WordItem, WordStats } from '../types'
import type { ReviewLogEntry } from './fsrs'

export const DAY = 86_400_000

export function dateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function applyReview(stats: WordStats, correct: boolean): WordStats {
  return correct
    ? {
        ...stats,
        correctCount: stats.correctCount + 1,
        streak: stats.streak + 1,
        easeFactor: Math.min(3, +(stats.easeFactor + 0.1).toFixed(2)),
        lastReviewed: Date.now(),
      }
    : {
        ...stats,
        wrongCount: stats.wrongCount + 1,
        streak: 0,
        easeFactor: Math.max(1.3, +(stats.easeFactor - 0.2).toFixed(2)),
        lastReviewed: Date.now(),
      }
}

export function successRate(words: WordItem[]): number | null {
  let c = 0
  let t = 0
  for (const w of words) {
    c += w.stats.correctCount
    t += w.stats.correctCount + w.stats.wrongCount
  }
  return t ? Math.round((c / t) * 100) : null
}

export function currentStreak(activity: Record<string, number>): { days: number; doneToday: boolean } {
  const now = new Date()
  const doneToday = (activity[dateKey(now)] ?? 0) > 0
  const d = new Date(now)
  if (!doneToday) d.setDate(d.getDate() - 1)
  let days = 0
  while ((activity[dateKey(d)] ?? 0) > 0) {
    days++
    d.setDate(d.getDate() - 1)
  }
  return { days, doneToday }
}

/** „Gelernt“ = so oft richtig Deutsch → Koreanisch im Quiz, an so vielen verschiedenen Tagen (Glückstreffer zählen nicht) */
export const LEARNED_DAYS = 3

/**
 * Kennzahlen nur aus Abfragen (Quiz/Diktat), nicht aus dem Lernmodus – dort ist die Lösung sichtbar.
 * gelernt: Wörter, die du Deutsch → Koreanisch an mindestens LEARNED_DAYS verschiedenen Tagen ohne Hilfe richtig hattest.
 * Erfolgsquote: Anteil richtiger Antworten an allen Abfragen (beide Richtungen).
 */
export function quizStats(log: ReviewLogEntry[], words: WordItem[]): { learned: number; rate: number | null } {
  const ids = new Set(words.map((w) => w.id))
  const days = new Map<string, Set<string>>()
  let ok = 0
  let total = 0
  for (const e of log) {
    if (!ids.has(e.w)) continue
    total++
    if (e.g >= 2) ok++
    if (e.d === 'deko' && e.g >= 3) {
      const d = new Date(e.t)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!days.has(e.w)) days.set(e.w, new Set())
      days.get(e.w)!.add(key)
    }
  }
  const learned = [...days.values()].filter((s) => s.size >= LEARNED_DAYS).length
  return { learned, rate: total ? Math.round((ok / total) * 100) : null }
}

/** Kennung des automatischen Ordners „Noch unsicher“ (kein echter Ordner, wird aus dem Quiz-Protokoll abgeleitet) */
export const WEAK_FOLDER = 'unsicher'
export const WEAK_FOLDER_NAME = 'Noch unsicher'

const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * „Noch unsicher“: Wörter, die du im Quiz falsch hattest und seitdem noch nicht an LEARNED_DAYS
 * verschiedenen Tagen Deutsch → Koreanisch ohne Hilfe richtig hattest. Ein neuer Fehler setzt das Zählen zurück.
 * Das Wort bleibt dabei in seinem eigentlichen Ordner.
 */
export function weakWordIds(log: ReviewLogEntry[], words: WordItem[]): Set<string> {
  const ids = new Set(words.map((w) => w.id))
  const sorted = [...log].sort((a, b) => a.t - b.t)
  const sinceWrong = new Map<string, Set<string>>()
  for (const e of sorted) {
    if (!ids.has(e.w)) continue
    if (e.g === 1) sinceWrong.set(e.w, new Set())
    else if (e.d === 'deko' && e.g >= 3) sinceWrong.get(e.w)?.add(dayKey(e.t))
  }
  const out = new Set<string>()
  for (const [w, days] of sinceWrong) if (days.size < LEARNED_DAYS) out.add(w)
  return out
}

export interface QuizWordStat {
  word: WordItem
  /** richtige Antworten (beide Richtungen) */
  ok: number
  total: number
  wrong: number
  /** Tage mit richtiger Antwort Deutsch → Koreanisch ohne Hilfe */
  days: number
}

/** Quiz-Kennzahlen je Wort (nur Abfragen) – für die Listen hinter Gelernt, Erfolgsquote und Fehlern */
export function quizBreakdown(log: ReviewLogEntry[], words: WordItem[]): QuizWordStat[] {
  const byId = new Map(words.map((w) => [w.id, w]))
  const m = new Map<string, { ok: number; total: number; wrong: number; days: Set<string> }>()
  for (const e of log) {
    if (!byId.has(e.w)) continue
    const s = m.get(e.w) ?? { ok: 0, total: 0, wrong: 0, days: new Set<string>() }
    s.total++
    if (e.g >= 2) s.ok++
    if (e.g === 1) s.wrong++
    if (e.d === 'deko' && e.g >= 3) s.days.add(dayKey(e.t))
    m.set(e.w, s)
  }
  return [...m.entries()].map(([id, s]) => ({ word: byId.get(id)!, ok: s.ok, total: s.total, wrong: s.wrong, days: s.days.size }))
}
