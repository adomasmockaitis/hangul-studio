import { useState } from 'react'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { distinguishPrompt, parseDistinguish, type DupEntry, type DupGroup } from '../lib/scanDuplicates'
import { callGeminiWithFallback } from '../lib/gemini'

/**
 * Wörter mit gleicher Bedeutung nebeneinander: eins behalten, beide behalten oder Gemini unterscheiden lassen.
 * Wird im Scanner (neue Wörter) und im Wörterbuch (bestehende Wörter) verwendet.
 * Nichts passiert ohne Bestätigung: Gemini macht nur Vorschläge, die man ansieht, anpasst und dann übernimmt.
 */
export function DuplicateGroups({ groups, apiKey, model, onKeepOnly, onKeepBoth, onApply, sourceLabel }: {
  groups: DupGroup[]
  /** leer = kein Gemini */
  apiKey: string
  model: string
  onKeepOnly: (g: DupGroup, e: DupEntry) => void
  onKeepBoth: (g: DupGroup) => void
  /** Bestätigte neue Übersetzungen (Eintrag-ID → Deutsch) */
  onApply: (g: DupGroup, changes: Map<string, string>) => void
  sourceLabel?: (e: DupEntry) => string
}) {
  const hasKey = !!apiKey.trim()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** Vorschläge je Gruppe (Eintrag-ID → neue Übersetzung), noch nicht übernommen */
  const [proposals, setProposals] = useState<Record<string, Record<string, string>>>({})

  const ask = async (g: DupGroup) => {
    setBusy(g.key)
    setError('')
    try {
      const changes = await sharpenTranslations(apiKey.trim(), model, g.entries)
      if (!changes.size) throw new Error('Gemini hat keine andere Übersetzung vorgeschlagen')
      setProposals((p) => ({ ...p, [g.key]: Object.fromEntries(g.entries.map((e) => [e.id, changes.get(e.id) ?? e.german])) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setBusy(null)
    }
  }
  const drop = (key: string) => setProposals((p) => {
    const n = { ...p }
    delete n[key]
    return n
  })
  const apply = (g: DupGroup) => {
    const prop = proposals[g.key]
    const changes = new Map<string, string>()
    for (const e of g.entries) {
      const v = prop?.[e.id]?.trim()
      if (v && v !== e.german) changes.set(e.id, v)
    }
    drop(g.key)
    onApply(g, changes)
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const prop = proposals[g.key]
        return (
          <div key={g.key} className="space-y-2 rounded-xl bg-surface p-3">
            <p className="text-xs text-label-2">
              {g.kind === 'german'
                ? <>Gleiche Bedeutung: <span className="font-semibold text-label">„{g.entries[0].german}“</span></>
                : <>Gleiches Wort: <span lang="ko" className="font-semibold text-label">{g.shared}</span></>}
            </p>
            {prop ? (
              // Vorschlag von Gemini: vorher → nachher, anpassbar; erst „Übernehmen“ ändert etwas
              <div className="space-y-2 rounded-xl border border-blue/30 bg-blue/5 p-2.5">
                <p className="text-xs font-medium text-blue">Vorschlag von Gemini – noch nichts geändert</p>
                {g.entries.map((e) => (
                  <div key={e.id} className="grid items-center gap-1.5 sm:grid-cols-[6rem_1fr_1fr]">
                    <span lang="ko" className="text-lg font-semibold">{e.korean}</span>
                    <span className="truncate text-sm text-label-3 line-through decoration-label-4">{e.german || '–'}</span>
                    <input
                      className="input !py-1.5 text-sm"
                      value={prop[e.id] ?? ''}
                      onChange={(ev) => setProposals((p) => ({ ...p, [g.key]: { ...p[g.key], [e.id]: ev.target.value } }))}
                      aria-label={`Neue Übersetzung für ${e.korean}`}
                    />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button className="btn-primary text-sm" onClick={() => apply(g)}><Check size={15} /> Übernehmen</button>
                  <button className="btn-soft text-sm" onClick={() => drop(g.key)}><X size={15} /> Verwerfen</button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-xl border border-separator p-2.5">
                      <div className="min-w-0 flex-1">
                        <p lang="ko" className="text-lg font-semibold leading-tight">{e.korean}</p>
                        <p className="truncate text-sm text-label-2">{e.german || '–'}</p>
                        {sourceLabel && <p className="text-[11px] text-label-3">{sourceLabel(e)}</p>}
                      </div>
                      <button className="btn-soft shrink-0 !px-3 text-sm" onClick={() => onKeepOnly(g, e)} title="Nur dieses behalten">
                        <Check size={15} /> Nur das
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasKey && (
                    <button className="btn-soft text-sm" onClick={() => void ask(g)} disabled={busy !== null}>
                      {busy === g.key ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Unterschiede vorschlagen
                    </button>
                  )}
                  <button className="btn-soft text-sm" onClick={() => onKeepBoth(g)}>Beide behalten</button>
                </div>
              </>
            )}
          </div>
        )
      })}
      {error && <p className="text-sm text-red">Gemini konnte keine Unterscheidung vorschlagen: {error}</p>}
      {!hasKey && <p className="text-xs text-label-3">Mit Gemini-Key kann die App vorschlagen, wie sich die Übersetzungen unterscheiden lassen.</p>}
    </div>
  )
}

/** Gemini schärft die deutschen Übersetzungen einer Gruppe: Ergebnis je Eintrag-ID (nur geänderte) */
export async function sharpenTranslations(apiKey: string, model: string, entries: DupEntry[]): Promise<Map<string, string>> {
  const r = await callGeminiWithFallback(apiKey, model, [{ text: distinguishPrompt(entries) }], undefined, { timeoutMs: 25_000 })
  const out = parseDistinguish(r.text)
  if (!out.length) throw new Error('Keine verwertbare Antwort')
  const norm = (s: string) => s.replace(/\s+/g, '')
  const changes = new Map<string, string>()
  entries.forEach((e, i) => {
    const hit = out.find((o) => norm(o.korean) === norm(e.korean)) ?? out[i]
    if (hit && hit.german !== e.german) changes.set(e.id, hit.german)
  })
  return changes
}
