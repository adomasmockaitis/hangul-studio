import { describe, expect, it } from 'vitest'
import { AudioSync, forgetSynced, memoryAudioRemote, packOf, type Codec, type SyncMemory } from './audioSync'
import { memoryClipStore, type Clip } from './clips'

/** Attrappe statt Opus: Bytes = PCM */
const codec: Codec = {
  async encode(pcm) { return new Uint8Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)) },
  async decode(b, rate) { return { pcm: new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), rate } },
  toB64: (b) => Buffer.from(b).toString('base64'),
  fromB64: (s) => new Uint8Array(Buffer.from(s, 'base64')),
}
const clip = (v: number): Clip => ({ pcm: new Int16Array([v, v + 1, v + 2]), rate: 24000, via: 'live', voice: 'Kore', createdAt: v })

function device(remote: ReturnType<typeof memoryAudioRemote>, t = { now: 1000 }) {
  const store = memoryClipStore()
  let mem: SyncMemory = { known: {}, synced: [] }
  const sync = new AudioSync({ remote, store, codec, load: () => structuredClone(mem), save: (m) => (mem = m), now: () => t.now++ })
  return { store, sync, mem: () => mem }
}

describe('Abgleich der Aufnahmen', () => {
  it('Gerät A lädt hoch, Gerät B übernimmt – mit Stimme und gleichem Ton', async () => {
    const remote = memoryAudioRemote()
    const a = device(remote)
    const b = device(remote)
    await a.store.put('gemini|Kore|ko|학교', clip(5))
    await a.store.put('gemini|Kore|de|Schule', clip(9))
    expect(await a.sync.push()).toBe(2)
    expect(await a.sync.push()).toBe(0) // schon oben
    const added = await b.sync.pull()
    expect(added.sort()).toEqual(['gemini|Kore|de|Schule', 'gemini|Kore|ko|학교'])
    const got = await b.store.get('gemini|Kore|ko|학교')
    expect([...got!.pcm]).toEqual([5, 6, 7])
    expect(got!.voice).toBe('Kore')
    // B lädt das Übernommene nicht wieder hoch und holt beim zweiten Mal nichts erneut
    expect(await b.sync.push()).toBe(0)
    const writes = remote.writes
    expect(await b.sync.pull()).toEqual([])
    expect(remote.writes).toBe(writes)
  })

  it('beide Geräte erzeugen gleichzeitig – nichts geht verloren', async () => {
    const remote = memoryAudioRemote()
    const a = device(remote)
    const b = device(remote)
    // gleiche Paket-Zuordnung erzwingen: zwei Schlüssel im selben Paket finden
    const keys: string[] = []
    for (let i = 0; keys.length < 2; i++) {
      const k = `gemini|Kore|ko|w${i}`
      if (!keys.length || packOf(k) === packOf(keys[0])) keys.push(k)
    }
    await a.store.put(keys[0], clip(1))
    await b.store.put(keys[1], clip(2))
    await a.sync.push()
    await b.sync.push()
    await a.sync.pull()
    await b.sync.pull()
    expect((await a.store.keys()).sort()).toEqual([...keys].sort())
    expect((await b.store.keys()).sort()).toEqual([...keys].sort())
  })

  it('neu erzeugte Aufnahme ersetzt die alte auch auf dem anderen Gerät', async () => {
    const remote = memoryAudioRemote()
    let memA: SyncMemory = { known: {}, synced: [] }
    const storeA = memoryClipStore()
    const a = new AudioSync({ remote, store: storeA, codec, load: () => structuredClone(memA), save: (m) => (memA = m), now: () => 100 })
    const b = device(remote, { now: 200 })
    const k = 'gemini|Kore|ko|감사합니다'
    await storeA.put(k, clip(5))
    await a.push()
    await b.sync.pull()
    // A erzeugt neu (neuer Zeitstempel) und markiert sie als nicht hochgeladen
    await storeA.put(k, { ...clip(40), createdAt: 999 })
    memA = forgetSynced(memA, [k])
    expect(await a.push()).toBe(1)
    await b.sync.pull()
    expect([...(await b.store.get(k))!.pcm]).toEqual([40, 41, 42])
  })

  it('verteilt Schlüssel stabil auf 64 Pakete', () => {
    expect(packOf('gemini|Kore|ko|학교')).toBe(packOf('gemini|Kore|ko|학교'))
    const packs = new Set(Array.from({ length: 2000 }, (_, i) => packOf(`gemini|Kore|ko|${i}`)))
    expect(packs.size).toBe(64)
  })
})
