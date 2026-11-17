import { describe, expect, it } from 'vitest'
import { emptyPayload, type SyncPayload } from './merge'
import { memoryRemote, splitChunks, syncWithRemote } from './remoteSync'
import type { WordItem } from '../types'

const w = (korean: string, updatedAt: number, folderId?: string): WordItem => ({
  id: korean, korean, german: 'x', wordType: 'noun', tags: [], createdAt: 1, updatedAt, folderId,
  stats: { correctCount: 0, wrongCount: 0, lastReviewed: null, streak: 0, easeFactor: 2.5 },
})
const payload = (over: Partial<SyncPayload>): SyncPayload => ({ ...emptyPayload(), ...over })

describe('Gemeinsamer Abgleich (Drive und Konto)', () => {
  it('erster Abgleich lädt den lokalen Stand hoch, ohne lokal etwas zu ändern', async () => {
    const remote = memoryRemote()
    let applied = false
    const r = await syncWithRemote({ remote, getLocal: () => payload({ words: [w('가', 1)] }), applyLocal: () => (applied = true) })
    expect(r.uploaded).toBe(true)
    expect(r.savedAt).toBeGreaterThan(0)
    expect(remote.data?.updatedAt).toBe(r.savedAt) // eigener Stand erkennbar (Live-Abgleich)
    expect(r.changedLocal).toBe(false)
    expect(applied).toBe(false)
    expect(remote.data?.words.map((x) => x.korean)).toEqual(['가'])
  })

  it('übernimmt Daten eines anderen Geräts und lädt nur hoch, wenn sich etwas ändert', async () => {
    const remote = memoryRemote(payload({ words: [w('나', 2)], folders: [{ id: 'f', name: 'Kurs', parentId: null, createdAt: 1, updatedAt: 2 }] }))
    let local = payload({ words: [w('가', 1)] })
    const r = await syncWithRemote({ remote, getLocal: () => local, applyLocal: (m) => (local = m) })
    expect(r.changedLocal).toBe(true)
    expect(local.words.map((x) => x.korean).sort()).toEqual(['가', '나'])
    expect(local.folders?.map((f) => f.name)).toEqual(['Kurs'])
    // zweiter Lauf: nichts mehr zu tun
    const saves = remote.saves
    const r2 = await syncWithRemote({ remote, getLocal: () => local, applyLocal: (m) => (local = m) })
    expect(r2.uploaded).toBe(false)
    expect(r2.savedAt).toBeUndefined()
    expect(r2.changedLocal).toBe(false)
    expect(remote.saves).toBe(saves)
  })

  it('Wechsel der Speicherart: der lokale Stand zieht in den neuen Speicher um, ohne Verluste', async () => {
    // Gerät war mit Drive verbunden, wechselt aufs Konto, in dem schon ein älterer Stand liegt
    const account = memoryRemote(payload({ words: [w('가', 1), w('다', 5)], deleted: {} }))
    let local = payload({ words: [w('가', 3), w('나', 4)], deleted: { 다: 6 } })
    await syncWithRemote({ remote: account, getLocal: () => local, applyLocal: (m) => (local = m) })
    const keys = (p: SyncPayload | null) => p?.words.map((x) => `${x.korean}@${x.updatedAt}`).sort()
    expect(keys(local)).toEqual(['가@3', '나@4']) // 다 wurde nach der letzten Änderung gelöscht
    expect(keys(account.data)).toEqual(keys(local))
  })

  it('nimmt den API-Key nur mit, wenn eingeschaltet', async () => {
    const remote = memoryRemote(payload({ settings: { geminiApiKey: 'remote-key' }, settingsUpdatedAt: 9 }))
    let local = payload({ settings: {}, settingsUpdatedAt: 1 })
    await syncWithRemote({ remote, getLocal: () => local, applyLocal: (m) => (local = m) })
    expect(local.settings.geminiApiKey).toBeUndefined()
    await syncWithRemote({ remote: memoryRemote(payload({ settings: { geminiApiKey: 'remote-key' }, settingsUpdatedAt: 9 })), includeApiKey: true, getLocal: () => local, applyLocal: (m) => (local = m) })
    expect(local.settings.geminiApiKey).toBe('remote-key')
  })

  it('teilt große Stände in Stücke und setzt sie verlustfrei zusammen', () => {
    const text = '학'.repeat(600_001)
    const parts = splitChunks(text)
    expect(parts.length).toBe(3)
    expect(parts.join('')).toBe(text)
    expect(splitChunks('')).toEqual([''])
  })
})
