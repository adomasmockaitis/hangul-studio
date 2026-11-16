import { beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_KEY, META_MIGRATED, createMemoryBackend, flush, getItem, initStorage, kvStorage, resetStorageForTests, setItem } from './storage'

/** Ersatz für das alte localStorage */
const legacy = (data: Record<string, string>) => ({ getItem: (k: string) => (k in data ? data[k] : null) })

const oldWords = [{ id: 'a', korean: '학생', german: 'Schüler', wordType: 'noun', tags: ['#Kapitel1'], createdAt: 1, stats: { correctCount: 2, wrongCount: 1, lastReviewed: 5, streak: 1, easeFactor: 2.5 } }]

describe('Speicher: Umzug aus localStorage', () => {
  beforeEach(() => resetStorageForTests())

  it('übernimmt alte Daten, legt vorher eine Sicherungskopie an und markiert den Umzug', async () => {
    const b = createMemoryBackend()
    const old = { 'hangul-studio:words': JSON.stringify(oldWords), 'hangul-studio:settings': JSON.stringify({ theme: 'dark' }), 'hangul-studio:onboarded': '1' }
    const r = await initStorage(b, legacy(old))

    expect(r.migrated).toBe(true)
    expect(getItem('hangul-studio:words', [])).toEqual(oldWords)
    expect(getItem('hangul-studio:settings', {})).toEqual({ theme: 'dark' })
    // Gerätevorlieben bleiben in localStorage
    expect(b.data['hangul-studio:onboarded']).toBeUndefined()
    // Sicherungskopie enthält die unveränderten Rohdaten
    expect((b.data[BACKUP_KEY] as { data: Record<string, string> }).data['hangul-studio:words']).toBe(old['hangul-studio:words'])
    expect(b.data[META_MIGRATED]).toBeTruthy()
  })

  it('zieht nur einmal um und überschreibt danach nichts', async () => {
    const b = createMemoryBackend()
    await initStorage(b, legacy({ 'hangul-studio:words': JSON.stringify(oldWords) }))
    setItem('hangul-studio:words', [])
    await flush()

    resetStorageForTests()
    await initStorage(b, legacy({ 'hangul-studio:words': JSON.stringify(oldWords) }))
    expect(getItem('hangul-studio:words', null)).toEqual([])
  })

  it('übersteht kaputte alte Einträge (bleiben in der Sicherungskopie)', async () => {
    const b = createMemoryBackend()
    const r = await initStorage(b, legacy({ 'hangul-studio:words': '{kaputt', 'hangul-studio:activity': '{"2026-11-16":3}' }))
    expect(r.migratedKeys).toEqual(['hangul-studio:activity'])
    expect(getItem('hangul-studio:words', 'leer')).toBe('leer')
    expect((b.data[BACKUP_KEY] as { data: Record<string, string> }).data['hangul-studio:words']).toBe('{kaputt')
  })

  it('schreibt Änderungen gebündelt und dauerhaft', async () => {
    const b = createMemoryBackend()
    await initStorage(b, null)
    setItem('x', { a: 1 })
    setItem('x', { a: 2 })
    expect(b.data.x).toBeUndefined() // noch nicht geschrieben
    await flush()
    expect(b.data.x).toEqual({ a: 2 })
  })

  it('bietet eine localStorage-ähnliche Fassade für ältere Module', async () => {
    await initStorage(createMemoryBackend(), null)
    kvStorage.setItem('k', JSON.stringify([1, 2]))
    expect(JSON.parse(kvStorage.getItem('k')!)).toEqual([1, 2])
    kvStorage.removeItem('k')
    expect(kvStorage.getItem('k')).toBeNull()
  })
})
