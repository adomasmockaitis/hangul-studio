import { readHandwritingBatch } from './gemini'
import { addSample, loadSamples, type InputToolsSample } from './inputToolsLog'

/**
 * Warteschlange für die gesammelte Gemini-Nachprüfung der Input-Tools-Ausweichfälle:
 * Erst wenn BATCH_SIZE Fälle vorliegen (oder du manuell startest), geht EIN gemeinsamer Request raus.
 */
const PKEY = 'hangul-studio:inputtools-pending'
const SKEY = 'hangul-studio:inputtools-log'
const MAX_PENDING = 30
export const BATCH_SIZE = 10

export type SampleBase = Omit<
  InputToolsSample,
  'id' | 'ts' | 'recognitionCorrect' | 'actuallyCorrect' | 'labelSource' | 'geminiReading' | 'geminiModel' | 'pendingId'
>

export interface PendingItem {
  id: string
  /** Bild (Base64, ohne data:-Prefix), schwarz auf weiß */
  png: string
  base: SampleBase
}

export function loadPending(): PendingItem[] {
  try {
    const raw = localStorage.getItem(PKEY)
    const arr = raw ? (JSON.parse(raw) as PendingItem[]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function savePending(items: PendingItem[]) {
  try {
    localStorage.setItem(PKEY, JSON.stringify(items.slice(-MAX_PENDING)))
  } catch {
    /* ignore */
  }
}

export function enqueuePending(png: string, base: SampleBase): { id: string; count: number } {
  const items = loadPending()
  const id = crypto.randomUUID()
  items.push({ id, png, base })
  savePending(items)
  return { id, count: Math.min(items.length, MAX_PENDING) }
}

export function clearPending() {
  try {
    localStorage.removeItem(PKEY)
  } catch {
    /* ignore */
  }
}

export function removePending(id: string) {
  savePending(loadPending().filter((i) => i.id !== id))
}

/** Aktualisiert einen automatisch erzeugten Eintrag (falls die Nachprüfung schon lief) */
export function updateByPendingId(pendingId: string, patch: Partial<InputToolsSample>): boolean {
  const all = loadSamples()
  const i = all.findIndex((s) => s.pendingId === pendingId)
  if (i < 0) return false
  all[i] = { ...all[i], ...patch }
  try {
    localStorage.setItem(SKEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
  return true
}

const norm = (s: string) => s.normalize('NFC').replace(/[\s.,!?~\-_()[\]{}·…]/g, '')
let running = false

/**
 * Schickt alle wartenden Fälle in EINEM Gemini-Request ab und speichert daraus automatische Bewertungen.
 * Gibt die Anzahl verarbeiteter Fälle zurück.
 */
export async function processPending(apiKey: string, model: string, onStatus?: (m: string) => void): Promise<number> {
  if (running) return 0
  const items = loadPending()
  if (!items.length || !apiKey.trim()) return 0
  running = true
  try {
    const { readings, model: used } = await readHandwritingBatch(
      apiKey.trim(),
      model,
      items.map((i) => ({ id: i.id, png: i.png, target: i.base.target })),
      onStatus,
      40_000,
    )
    let done = 0
    for (const it of items) {
      const gem = readings[it.id]
      if (gem === undefined) continue // nicht beantwortet: bleibt in der Warteschlange
      const tools = it.base.candidates[0] ?? ''
      addSample({
        ...it.base,
        recognitionCorrect: norm(gem) === norm(tools),
        actuallyCorrect: norm(gem) === norm(it.base.target),
        labelSource: 'gemini-auto',
        geminiReading: gem,
        geminiModel: used,
        pendingId: it.id,
        imagePng: it.png,
      })
      removePending(it.id)
      done++
    }
    return done
  } finally {
    running = false
  }
}
