/**
 * Gemeinsamer Abgleich für alle entfernten Speicherorte (Google Drive, Hangul-Studio-Konto).
 * Ein Speicherort muss nur laden und speichern können; Zusammenführen und Hochladen ist hier.
 */
import { emptyPayload, fingerprint, mergePayloads, type SyncPayload } from './merge'

export interface RemoteStore {
  /** Gespeicherter Stand oder null, wenn noch nichts da ist */
  load(): Promise<SyncPayload | null>
  save(payload: SyncPayload): Promise<void>
}

export interface SyncResult {
  /** true, wenn der entfernte Stand aktualisiert wurde */
  uploaded: boolean
  /** true, wenn lokal etwas übernommen wurde */
  changedLocal: boolean
  merged: SyncPayload
  /** Zeitstempel des hochgeladenen Stands (um eigene Änderungen beim Live-Abgleich zu erkennen) */
  savedAt?: number
}

/**
 * Ein Abgleich: entfernten Stand laden → mit dem lokalen zusammenführen → Lokales aktualisieren → bei Bedarf hochladen.
 * `applyLocal` wird nur aufgerufen, wenn sich lokal etwas ändert.
 */
export async function syncWithRemote(opts: {
  remote: RemoteStore
  /** API-Key mit synchronisieren (sonst wird er aus dem entfernten Stand entfernt) */
  includeApiKey?: boolean
  getLocal: () => SyncPayload
  applyLocal: (merged: SyncPayload) => void
}): Promise<SyncResult> {
  const remote = await opts.remote.load()
  if (remote && !opts.includeApiKey) delete remote.settings.geminiApiKey
  const local = opts.getLocal()
  const merged = remote ? mergePayloads(local, remote) : { ...emptyPayload(), ...local }

  const changedLocal = fingerprint(merged) !== fingerprint(local)
  if (changedLocal) opts.applyLocal(merged)

  const uploaded = !remote || fingerprint(merged) !== fingerprint(remote)
  const savedAt = uploaded ? Date.now() : undefined
  if (savedAt) await opts.remote.save({ ...merged, updatedAt: savedAt })
  return { uploaded, changedLocal, merged, savedAt }
}

/** Zum Testen: entfernter Speicher im Arbeitsspeicher */
export function memoryRemote(initial: SyncPayload | null = null): RemoteStore & { data: SyncPayload | null; saves: number } {
  const r = {
    data: initial ? structuredClone(initial) : null,
    saves: 0,
    async load() {
      return r.data ? structuredClone(r.data) : null
    },
    async save(p: SyncPayload) {
      r.saves++
      r.data = structuredClone(p)
    },
  }
  return r
}

/** Großen Text in Stücke teilen (Firestore erlaubt höchstens 1 MiB pro Dokument; Hangul braucht 3 Byte je Zeichen) */
export const CHUNK_CHARS = 250_000
export function splitChunks(text: string, size = CHUNK_CHARS): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out.length ? out : ['']
}
