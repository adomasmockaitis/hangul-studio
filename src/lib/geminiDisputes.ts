/**
 * Sammelt Widersprüche gegen Gemini-Urteile (lokal), damit der Prompt später gezielt verbessert werden kann.
 * Enthält bewusst das Bild: es ist klein (max. 256 px) und die wichtigste Information für die Auswertung.
 */
const KEY = 'hangul-studio:gemini-disputes'
const MAX_ENTRIES = 100

export interface GeminiDispute {
  id: string
  ts: number
  /** Das Wort, das geschrieben werden sollte */
  target: string
  /** Was Gemini gelesen hat */
  geminiReading: string
  /** Wie Gemini die Schrift bewertet hat */
  geminiSaidCorrect: boolean
  /** Dein Urteil: War die Schrift in Wahrheit richtig? */
  actuallyCorrect: boolean
  model?: string
  quality?: number
  tip?: string
  /** Einstellungen, mit denen der Prompt erzeugt wurde */
  promptConfig: { writingTips: boolean; tipThreshold: number }
  /** PNG, Base64 ohne data:-Prefix */
  imagePng?: string
}

export function loadDisputes(): GeminiDispute[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as GeminiDispute[]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function addDispute(d: Omit<GeminiDispute, 'id' | 'ts'>): void {
  const all = loadDisputes()
  all.push({ ...d, id: crypto.randomUUID(), ts: Date.now() })
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_ENTRIES)))
  } catch {
    // Speicher voll: ohne Bilder erneut versuchen
    try {
      localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_ENTRIES).map((x) => ({ ...x, imagePng: undefined }))))
    } catch {
      /* ignore */
    }
  }
}

export function clearDisputes(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function exportDisputes(): void {
  const disputes = loadDisputes()
  const payload = {
    app: 'hangul-studio',
    kind: 'gemini-disputes',
    version: 1,
    exportedAt: new Date().toISOString(),
    summary: {
      total: disputes.length,
      geminiSaidWrongButCorrect: disputes.filter((d) => !d.geminiSaidCorrect && d.actuallyCorrect).length,
      geminiSaidCorrectButWrong: disputes.filter((d) => d.geminiSaidCorrect && !d.actuallyCorrect).length,
    },
    disputes,
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `gemini-widersprueche-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
