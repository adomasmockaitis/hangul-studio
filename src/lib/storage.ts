/**
 * Datenspeicher der App.
 *
 * Alle Lerndaten liegen in IndexedDB (deutlich mehr Platz als die ca. 5 MB von localStorage).
 * Beim Start wird alles einmal in den Arbeitsspeicher geladen; danach lesen die Komponenten synchron
 * aus diesem Zwischenspeicher, und Änderungen werden kurz gebündelt im Hintergrund geschrieben.
 *
 * Beim ersten Start nach dem Update werden die alten localStorage-Daten übernommen. Vorher wird eine
 * Sicherungskopie der Rohdaten in IndexedDB abgelegt; die alten Einträge in localStorage bleiben
 * unangetastet, damit nichts verloren gehen kann.
 *
 * Kleine Gerätevorlieben (Onboarding gesehen, Google-Anmeldung, Uhr …) bleiben in localStorage.
 */

/** Ein einfacher Schlüssel-Wert-Speicher (IndexedDB, im Notfall localStorage, in Tests im Speicher) */
export interface KVBackend {
  readonly name: string
  getAll(): Promise<Record<string, unknown>>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

/** Schlüssel, die von localStorage in den neuen Speicher umziehen */
export const MIGRATED_KEYS = [
  'hangul-studio:words',
  'hangul-studio:settings',
  'hangul-studio:activity',
  'hangul-studio:deleted',
  'hangul-studio:order-v2',
  'hangul-studio:inputtools-log',
  'hangul-studio:inputtools-agreement',
  'hangul-studio:inputtools-pending',
  'hangul-studio:gemini-disputes',
] as const

export const META_MIGRATED = 'meta:migrated-from-localstorage'
export const BACKUP_KEY = 'backup:before-indexeddb'

// ---------- Backends ----------

const DB_NAME = 'hangul-studio'
const STORE = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB blockiert'))
  })
}

export async function createIdbBackend(): Promise<KVBackend> {
  const db = await openDb()
  const tx = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) =>
    new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode)
      const req = fn(t.objectStore(STORE))
      t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T))
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  return {
    name: 'indexeddb',
    async getAll() {
      const out: Record<string, unknown> = {}
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORE, 'readonly')
        const req = t.objectStore(STORE).openCursor()
        req.onsuccess = () => {
          const c = req.result
          if (c) {
            out[String(c.key)] = c.value
            c.continue()
          }
        }
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
      })
      return out
    },
    set: (key, value) => tx('readwrite', (s) => s.put(value, key)).then(() => undefined),
    remove: (key) => tx('readwrite', (s) => s.delete(key)).then(() => undefined),
  }
}

/** Ausweichlösung, falls IndexedDB nicht geht (z. B. manche private Fenster) */
export function createLocalStorageBackend(ls: Storage): KVBackend {
  const P = 'hangul-studio:kv:'
  return {
    name: 'localstorage',
    async getAll() {
      const out: Record<string, unknown> = {}
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i)
        if (k?.startsWith(P)) {
          try {
            out[k.slice(P.length)] = JSON.parse(ls.getItem(k) ?? 'null')
          } catch {
            /* defekter Eintrag */
          }
        }
      }
      return out
    },
    async set(key, value) {
      ls.setItem(P + key, JSON.stringify(value))
    },
    async remove(key) {
      ls.removeItem(P + key)
    },
  }
}

/** Für Tests */
export function createMemoryBackend(initial: Record<string, unknown> = {}): KVBackend & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = structuredClone(initial)
  return {
    name: 'memory',
    data,
    async getAll() {
      return structuredClone(data)
    },
    async set(key, value) {
      data[key] = structuredClone(value)
    },
    async remove(key) {
      delete data[key]
    },
  }
}

// ---------- Zwischenspeicher ----------

let backend: KVBackend | null = null
let cache: Record<string, unknown> = {}
const pending = new Map<string, unknown>()
let timer: ReturnType<typeof setTimeout> | null = null
const WRITE_DELAY_MS = 250
const DELETE = Symbol('delete')

export interface InitResult {
  backend: string
  migrated: boolean
  migratedKeys: string[]
}

/**
 * Lädt alle Daten. Muss vor dem ersten Rendern fertig sein.
 * `legacy` ist das alte localStorage (in Tests ein Ersatzobjekt).
 */
export async function initStorage(b: KVBackend, legacy: Pick<Storage, 'getItem'> | null): Promise<InitResult> {
  backend = b
  cache = await b.getAll()
  const result: InitResult = { backend: b.name, migrated: false, migratedKeys: [] }
  if (cache[META_MIGRATED] || !legacy) return result

  // Einmalige Übernahme aus localStorage
  const raw: Record<string, string> = {}
  for (const k of MIGRATED_KEYS) {
    const v = legacy.getItem(k)
    if (v !== null) raw[k] = v
  }
  if (Object.keys(raw).length) {
    // Sicherungskopie der unveränderten Rohdaten zuerst
    await b.set(BACKUP_KEY, { at: Date.now(), data: raw })
    cache[BACKUP_KEY] = { at: Date.now(), data: raw }
    for (const [k, v] of Object.entries(raw)) {
      // Bereits im neuen Speicher vorhandene Daten nicht überschreiben
      if (k in cache) continue
      try {
        const parsed = JSON.parse(v)
        cache[k] = parsed
        await b.set(k, parsed)
        result.migratedKeys.push(k)
      } catch {
        /* defekter alter Eintrag: liegt in der Sicherungskopie */
      }
    }
    result.migrated = true
  }
  const stamp = { at: Date.now(), keys: result.migratedKeys }
  cache[META_MIGRATED] = stamp
  await b.set(META_MIGRATED, stamp)
  return result
}

/** Startet die App-Speicherung: IndexedDB, sonst localStorage als Ausweichlösung */
export async function initAppStorage(): Promise<InitResult> {
  let legacy: Storage | null = null
  try {
    legacy = window.localStorage
  } catch {
    legacy = null
  }
  try {
    return await initStorage(await createIdbBackend(), legacy)
  } catch {
    if (legacy) return initStorage(createLocalStorageBackend(legacy), null)
    return initStorage(createMemoryBackend(), null)
  }
}

export function getItem<T>(key: string, fallback: T): T {
  return key in cache ? (cache[key] as T) : fallback
}

export function setItem(key: string, value: unknown): void {
  cache[key] = value
  pending.set(key, value)
  schedule()
}

export function removeItem(key: string): void {
  delete cache[key]
  pending.set(key, DELETE)
  schedule()
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, WRITE_DELAY_MS)
}

/** Schreibt alle offenen Änderungen sofort (z. B. beim Schließen der Seite) */
export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (!backend || !pending.size) return
  const batch = [...pending.entries()]
  pending.clear()
  for (const [k, v] of batch) {
    try {
      if (v === DELETE) await backend.remove(k)
      else await backend.set(k, v)
    } catch {
      // Später erneut versuchen
      if (!pending.has(k)) pending.set(k, v)
    }
  }
}

/**
 * localStorage-ähnliche Fassade über dem neuen Speicher (Werte als JSON-Text),
 * damit ältere Module ohne Umbau weiterarbeiten.
 */
export const kvStorage = {
  getItem(key: string): string | null {
    return key in cache ? JSON.stringify(cache[key]) : null
  },
  setItem(key: string, value: string): void {
    setItem(key, JSON.parse(value))
  },
  removeItem(key: string): void {
    removeItem(key)
  },
}

/** Nur für Tests: Zustand zurücksetzen */
export function resetStorageForTests() {
  backend = null
  cache = {}
  pending.clear()
  if (timer) clearTimeout(timer)
  timer = null
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}
