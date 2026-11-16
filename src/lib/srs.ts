import type { WordItem, WordStats } from '../types'

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
