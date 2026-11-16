/**
 * Gemeinsamer Lernstand (Stufe 1–10). Steuert später Schwierigkeit, Satzlänge, neue Wörter und Smart-Auswahl.
 * Grundlage: wie viele Wörter sicher sitzen (FSRS-Stabilität) und wie oft zuletzt richtig geantwortet wurde.
 * (Partikel-Beherrschung kommt mit dem Partikel-Trainer dazu.)
 */
import { cardOf, DIRS, type ReviewLogEntry } from './fsrs'
import type { WordItem } from '../types'

/** Ab dieser Stabilität (Tage) gilt ein Wort in einer Richtung als „sicher“ */
export const SECURE_DAYS = 7

/** Sichere Wort-Richtungen, ab denen die Stufen beginnen (Stufe 1 = Anfang) */
export const LEVEL_STEPS = [0, 10, 25, 50, 100, 175, 275, 400, 600, 850] as const

export interface LevelInfo {
  level: number
  /** Sichere Wort-Richtungen */
  secure: number
  /** Trefferquote der letzten bis zu 50 Antworten (null = noch keine) */
  accuracy: number | null
  /** Wie viele sichere Wort-Richtungen bis zur nächsten Stufe fehlen (null = höchste Stufe) */
  toNext: number | null
  /** Abzug wegen vieler Fehler zuletzt */
  penalty: boolean
}

export function countSecure(words: WordItem[]): number {
  let n = 0
  for (const w of words) for (const d of DIRS) if ((cardOf(w, d)?.stability ?? 0) >= SECURE_DAYS) n++
  return n
}

export function computeLevel(words: WordItem[], log: ReviewLogEntry[]): LevelInfo {
  const secure = countSecure(words)
  let base = 1
  for (let i = 0; i < LEVEL_STEPS.length; i++) if (secure >= LEVEL_STEPS[i]) base = i + 1
  const recent = log.slice(-50)
  const accuracy = recent.length >= 10 ? recent.filter((e) => e.g > 1).length / recent.length : null
  // Viele Fehler zuletzt: eine Stufe tiefer, damit Übungen nicht überfordern
  const penalty = accuracy !== null && accuracy < 0.6 && base > 1
  const level = penalty ? base - 1 : base
  const toNext = base < LEVEL_STEPS.length ? LEVEL_STEPS[base] - secure : null
  return { level, secure, accuracy, toNext, penalty }
}
