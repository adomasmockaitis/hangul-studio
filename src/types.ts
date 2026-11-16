export type WordType = 'verb' | 'adjective' | 'noun' | 'other'

export type ConjugationKey = 'presentPolite' | 'presentFormal' | 'pastPolite' | 'futurePolite'

export interface Conjugations {
  presentPolite?: string
  presentFormal?: string
  pastPolite?: string
  futurePolite?: string
}

export interface WordStats {
  correctCount: number
  wrongCount: number
  lastReviewed: number | null
  streak: number
  easeFactor: number
}

export interface WordItem {
  id: string
  korean: string
  german: string
  pronunciation?: string
  wordType: WordType
  tags: string[]
  createdAt: number
  conjugations?: Conjugations
  stats: WordStats
  /** Zeitpunkt der letzten Änderung (für den Geräte-Abgleich) */
  updatedAt?: number
  /** Ordner, in dem das Wort liegt (fehlt = „Ohne Ordner“) */
  folderId?: string
  /** Eigene Notiz (Eselsbrücke o. ä.) */
  note?: string
  /** Bis zu zwei Beispielsätze */
  examples?: Example[]
  /** FSRS-Wiederholungsplanung je Richtung (deko = Deutsch→Koreanisch, kode = Koreanisch→Deutsch) */
  srs?: { deko?: import('./lib/fsrs').SrsCard; kode?: import('./lib/fsrs').SrsCard }
}

/** Beispielsatz zu einem Wort */
export interface Example {
  ko: string
  de: string
  /** Woher der Satz kommt: KI, selbst eingetragen oder aus der Satz-Datenbank */
  source: 'ai' | 'user' | 'pool'
}

export const MAX_EXAMPLES = 2

/** Ordner für Wörter, bis zu 3 Ebenen tief (parentId = null: oberste Ebene) */
export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
}

export const MAX_FOLDER_DEPTH = 3

export type ThemeMode = 'light' | 'dark' | 'system'
export type CanvasBackground = 'blank' | 'grid' | 'lined' | 'hangul'
export type CheckMethod = 'inputtools' | 'gemini' | 'manual'
export interface CheckStep {
  method: CheckMethod
  enabled: boolean
}
export type StrokeStyleMode = 'numbers' | 'animation'
/** Was beim Vorlesen eines Worts gesprochen wird */
export type SpeechMode = 'both' | 'ko' | 'de'

export interface Settings {
  geminiApiKey: string
  geminiModel: string
  /** Zeitlimit für die Gemini-Handschriftprüfung, danach Wechsel zur nächsten Methode */
  geminiTimeoutSec: number
  theme: ThemeMode
  canvasBackground: CanvasBackground
  /** Reihenfolge der Handschrift-Prüfung; erster aktiver Schritt wird zuerst versucht */
  checkOrder: CheckStep[]
  showTemplate: boolean
  /** Gemini gibt Tipps, wenn die Schrift richtig, aber unsauber ist */
  writingTips: boolean
  /** Tipp ab dieser Schriftnote abwärts (2 = nur sehr unsauber, 4 = streng) */
  tipThreshold: number
  /** Nach einem Input-Tools-Ausweichfall im Hintergrund per Gemini nachprüfen und als Trainingsdaten speichern */
  autoLabel: boolean
  showStrokeOrder: boolean
  strokeOrderStyle: StrokeStyleMode
  autoSpeak: boolean
  /** Vorlesen: Koreanisch + Deutsch, nur Koreanisch oder nur Deutsch */
  speechMode: SpeechMode
  /** Fehlende Beispielsätze beim Lernen automatisch von Gemini erzeugen lassen (nur mit API-Key) */
  autoExamples: boolean
  /** Dezente Klänge bei richtig/falsch usw. */
  soundEffects: boolean
  soundVolume: number
  activeConjugations: ConjugationKey[]
  strokeWidth: number
  /** Eigene Google-Client-ID für die Drive-Synchronisation (überschreibt die eingebaute) – bleibt auf dem Gerät */
  googleClientId: string
  /** API-Key bei der Synchronisation mitnehmen (aus Sicherheitsgründen standardmäßig aus) – bleibt auf dem Gerät */
  syncApiKey: boolean
  /** Zeitpunkt der letzten Änderung der (synchronisierten) Einstellungen */
  settingsUpdatedAt?: number
}

/** date (YYYY-MM-DD) -> Anzahl geprüfter Karten */
export type Activity = Record<string, number>

export interface BackupFile {
  app: 'hangul-studio'
  version: 1
  exportedAt: string
  words: WordItem[]
  settings: Partial<Settings>
  activity: Activity
  /** Ab Version 2 der App: Ordner (ältere Sicherungen haben keine) */
  folders?: Folder[]
}


export const CONJUGATION_LABELS: Record<ConjugationKey, { label: string; hint: string }> = {
  presentPolite: { label: 'Präsens – Höflich', hint: '-아요/-어요/-해요' },
  presentFormal: { label: 'Präsens – Formell', hint: '-습니다/-ㅂ니다' },
  pastPolite: { label: 'Vergangenheit', hint: '-았어요/-었어요/-했어요' },
  futurePolite: { label: 'Zukunft', hint: '-(으)ㄹ 거예요' },
}

export const CONJUGATION_KEYS = Object.keys(CONJUGATION_LABELS) as ConjugationKey[]

export const WORD_TYPE_LABELS: Record<WordType, string> = {
  verb: 'Verb',
  adjective: 'Adjektiv',
  noun: 'Nomen',
  other: 'Sonstiges',
}
