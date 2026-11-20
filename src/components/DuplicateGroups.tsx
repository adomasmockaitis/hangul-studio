import { Check, Loader2, Sparkles } from 'lucide-react'
import { distinguishPrompt, parseDistinguish, type DupEntry, type DupGroup } from '../lib/scanDuplicates'
import { callGeminiWithFallback } from '../lib/gemini'

/**
 * Wörter mit gleicher Bedeutung nebeneinander: eins behalten, beide behalten oder Gemini unterscheiden lassen.
 * Wird im Scanner (neue Wörter) und im Wörterbuch (bestehende Wörter) verwendet.
 */
export function DuplicateGroups({ groups, hasKey, sharpening, error, onKeepOnly, onKeepBoth, onSharpen, sourceLabel }: {
  groups: DupGroup[]
  hasKey: boolean
  /** Schlüssel der Gruppe, die Gemini gerade bearbeitet */
  sharpening: string | null
  error?: string
  onKeepOnly: (g: DupGroup, e: DupEntry) => void
  onKeepBoth: (g: DupGroup) => void
  onSharpen: (g: DupGroup) => void
  sourceLabel?: (e: DupEntry) => string
}) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.key} className="space-y-2 rounded-xl bg-surface p-3">
          <p className="text-xs text-label-2">
            {g.kind === 'german'
              ? <>Gleiche Bedeutung: <span className="font-semibold text-label">„{g.entries[0].german}“</span></>
              : <>Gleiches Wort: <span lang="ko" className="font-semibold text-label">{g.shared}</span></>}
          </p>
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
              <button className="btn-soft text-sm" onClick={() => onSharpen(g)} disabled={sharpening !== null}>
                {sharpening === g.key ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Übersetzungen unterscheiden
              </button>
            )}
            <button className="btn-soft text-sm" onClick={() => onKeepBoth(g)}>Beide behalten</button>
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red">Gemini konnte die Übersetzungen nicht schärfen: {error}</p>}
      {!hasKey && <p className="text-xs text-label-3">Mit Gemini-Key kann die App die Übersetzungen auch automatisch unterscheiden.</p>}
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
