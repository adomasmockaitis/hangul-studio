/**
 * Gemini-Aufnahmen zwischen Geräten abgleichen (Konto oder Google Drive).
 * Aufnahmen werden als Opus komprimiert und auf 64 Pakete verteilt; ein Inhaltsverzeichnis („manifest“)
 * hält fest, wann welches Paket zuletzt geändert wurde. So lädt ein Gerät nur geänderte Pakete.
 */
import type { Clip, ClipStore } from './clips'

export interface PackEntry {
  /** Opus, Base64 */
  d: string
  /** Abtastrate beim Kodieren */
  r: number
  v: Clip['via']
  vo?: string
  m?: string
  t: number
}
export interface Pack {
  clips: Record<string, PackEntry>
}
export interface Manifest {
  packs: Record<string, number>
}

/** Entfernter Speicher für Pakete (Firestore-Dokumente oder Drive-Dateien) */
export interface AudioRemote {
  /** Kennung, unter der sich ein Gerät merkt, was es schon kennt */
  id: string
  get(name: string): Promise<unknown | null>
  put(name: string, data: unknown): Promise<void>
}

export interface Codec {
  encode(pcm: Int16Array, rate: number): Promise<Uint8Array>
  decode(bytes: Uint8Array, rate: number): Promise<{ pcm: Int16Array; rate: number }>
  toB64(b: Uint8Array): string
  fromB64(s: string): Uint8Array
}

export const PACKS = 64
/** Firestore erlaubt höchstens 1 MiB je Dokument */
export const MAX_PACK_CHARS = 900_000

export function packOf(key: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `p${h % PACKS}`
}

const asPack = (x: unknown): Pack => (x && typeof x === 'object' && (x as Pack).clips && typeof (x as Pack).clips === 'object' ? (x as Pack) : { clips: {} })
const asManifest = (x: unknown): Manifest => (x && typeof x === 'object' && (x as Manifest).packs && typeof (x as Manifest).packs === 'object' ? (x as Manifest) : { packs: {} })

export interface SyncMemory {
  /** Paket-Versionen, die dieses Gerät schon übernommen hat */
  known: Record<string, number>
  /** Aufnahmen, die schon im entfernten Speicher liegen */
  synced: string[]
}

export class AudioSync {
  private readonly remote: AudioRemote
  private readonly store: ClipStore
  private readonly codec: Codec
  private readonly load: () => SyncMemory
  private readonly save: (m: SyncMemory) => void
  private readonly now: () => number
  private readonly filter: (key: string) => boolean

  constructor(opts: { remote: AudioRemote; store: ClipStore; codec: Codec; load: () => SyncMemory; save: (m: SyncMemory) => void; now?: () => number; filter?: (key: string) => boolean }) {
    this.filter = opts.filter ?? (() => true)
    this.remote = opts.remote
    this.store = opts.store
    this.codec = opts.codec
    this.load = opts.load
    this.save = opts.save
    this.now = opts.now ?? Date.now
  }

  /** Neue Aufnahmen anderer Geräte holen; liefert die übernommenen Schlüssel */
  async pull(): Promise<string[]> {
    const mem = this.load()
    const manifest = asManifest(await this.remote.get('manifest'))
    const local = new Set(await this.store.keys())
    const synced = new Set(mem.synced)
    const added: string[] = []
    for (const [name, ver] of Object.entries(manifest.packs)) {
      if (ver <= (mem.known[name] ?? 0)) continue
      const pack = asPack(await this.remote.get(name))
      for (const [key, e] of Object.entries(pack.clips)) {
        synced.add(key)
        if (local.has(key)) {
          // nur ersetzen, wenn die entfernte Aufnahme neuer ist (z. B. auf einem anderen Gerät neu erzeugt)
          const mine = await this.store.get(key)
          if (mine && mine.createdAt >= e.t) continue
        }
        try {
          const { pcm, rate } = await this.codec.decode(this.codec.fromB64(e.d), e.r)
          await this.store.put(key, { pcm, rate, via: e.v, voice: e.vo, model: e.m, createdAt: e.t })
          local.add(key)
          added.push(key)
        } catch {
          /* defekte Aufnahme überspringen */
        }
      }
      mem.known[name] = ver
    }
    this.save({ known: mem.known, synced: [...synced] })
    return added
  }

  /** Eigene Aufnahmen hochladen, die noch nicht im entfernten Speicher liegen; liefert die Anzahl */
  async push(): Promise<number> {
    const mem = this.load()
    const synced = new Set(mem.synced)
    const todo = (await this.store.keys()).filter((k) => !synced.has(k) && this.filter(k))
    if (!todo.length) return 0
    const byPack = new Map<string, string[]>()
    for (const k of todo) byPack.set(packOf(k), [...(byPack.get(packOf(k)) ?? []), k])
    let uploaded = 0
    const changed: string[] = []
    for (const [name, keys] of byPack) {
      const pack = asPack(await this.remote.get(name))
      let size = JSON.stringify(pack).length
      let dirty = false
      for (const k of keys) {
        const clip = await this.store.get(k)
        if (!clip) continue
        if (pack.clips[k] && pack.clips[k].t >= clip.createdAt) {
          synced.add(k)
          continue
        }
        let entry: PackEntry
        try {
          entry = { d: this.codec.toB64(await this.codec.encode(clip.pcm, clip.rate)), r: clip.rate, v: clip.via, vo: clip.voice, m: clip.model, t: clip.createdAt }
        } catch {
          continue
        }
        const add = JSON.stringify(entry).length + k.length + 6 - (pack.clips[k] ? JSON.stringify(pack.clips[k]).length : 0)
        if (size + add > MAX_PACK_CHARS) continue // Paket voll: bleibt nur auf diesem Gerät
        pack.clips[k] = entry
        size += add
        dirty = true
        synced.add(k)
        uploaded++
      }
      if (dirty) {
        await this.remote.put(name, pack)
        changed.push(name)
      }
    }
    if (changed.length) {
      // Inhaltsverzeichnis frisch lesen und nur die eigenen Pakete hochzählen (andere Geräte nicht überschreiben)
      const manifest = asManifest(await this.remote.get('manifest'))
      const t = this.now()
      // Bewusst NICHT als bekannt merken: das Paket kann Aufnahmen anderer Geräte enthalten, die erst pull() holt
      for (const name of changed) manifest.packs[name] = Math.max(t, (manifest.packs[name] ?? 0) + 1)
      await this.remote.put('manifest', manifest)
    }
    this.save({ known: mem.known, synced: [...synced] })
    return uploaded
  }
}

/** Aufnahmen aus dem entfernten Speicher entfernen (Wort gelöscht); liefert die Anzahl */
export async function removeRemote(remote: AudioRemote, keys: string[], now = Date.now()): Promise<number> {
  const byPack = new Map<string, string[]>()
  for (const k of keys) byPack.set(packOf(k), [...(byPack.get(packOf(k)) ?? []), k])
  let removed = 0
  const changed: string[] = []
  for (const [name, ks] of byPack) {
    const pack = asPack(await remote.get(name))
    let dirty = false
    for (const k of ks) {
      if (!pack.clips[k]) continue
      delete pack.clips[k]
      dirty = true
      removed++
    }
    if (dirty) {
      await remote.put(name, pack)
      changed.push(name)
    }
  }
  if (changed.length) {
    const manifest = asManifest(await remote.get('manifest'))
    for (const name of changed) manifest.packs[name] = Math.max(now, (manifest.packs[name] ?? 0) + 1)
    await remote.put('manifest', manifest)
  }
  return removed
}

/** Aufnahmen wieder als „nicht hochgeladen“ markieren (nach dem Neu-Erzeugen) */
export function forgetSynced(m: SyncMemory, keys: string[]): SyncMemory {
  const drop = new Set(keys)
  return { known: m.known, synced: m.synced.filter((k) => !drop.has(k)) }
}

/** Zum Testen: entfernter Speicher im Arbeitsspeicher */
export function memoryAudioRemote(id = 'mem'): AudioRemote & { data: Map<string, unknown>; writes: number } {
  const r = {
    id,
    data: new Map<string, unknown>(),
    writes: 0,
    async get(name: string) {
      const v = r.data.get(name)
      return v === undefined ? null : structuredClone(v)
    },
    async put(name: string, data: unknown) {
      r.writes++
      r.data.set(name, structuredClone(data))
    },
  }
  return r
}
