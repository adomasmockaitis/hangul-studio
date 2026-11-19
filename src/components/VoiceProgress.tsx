/** Schwebende Anzeige, solange Gemini-Stimmen im Hintergrund erstellt werden: wie viele übrig, wie lange noch */
import { useEffect, useState } from 'react'
import { Check, ChevronDown, Loader2, Snail, X } from 'lucide-react'
import { clipProgress, type ProgressKind } from '../lib/audio/voice'
import { useRoute } from '../lib/route'
import { useClipsVersion } from './VoiceStatus'

const ROWS: { kind: ProgressKind; label: string }[] = [
  { kind: 'ko', label: 'Koreanische Aussprache' },
  { kind: 'de', label: 'Deutsche Aussprache' },
  { kind: 'slow', label: 'Langsame Aussprache' },
]

/** Ab so vielen Aufnahmen in einer Runde lohnt sich die Anzeige (einzelne beim Abspielen nicht) */
const MIN_JOBS = 3
const SHOW_DONE_MS = 4000

export function formatEta(ms: number | null): string {
  if (ms === null) return 'Zeit wird berechnet …'
  const s = Math.round(ms / 1000)
  if (s < 10) return 'gleich fertig'
  if (s < 60) return `noch ca. ${Math.round(s / 5) * 5} s`
  const m = Math.round(s / 60)
  if (m < 60) return `noch ca. ${m} Min.`
  const h = Math.floor(m / 60)
  return `noch ca. ${h} Std.${m % 60 ? ` ${m % 60} Min.` : ''}`
}

export function VoiceProgress() {
  useClipsVersion()
  const { tab } = useRoute()
  const p = clipProgress()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(0)
  const [, tick] = useState(0)

  // Nach dem Ende kurz „fertig“ zeigen, dann ausblenden
  useEffect(() => {
    if (p.running || !p.finishedAt) return
    const id = setTimeout(() => tick((n) => n + 1), SHOW_DONE_MS + 50)
    return () => clearTimeout(id)
  }, [p.running, p.finishedAt])

  const total = p.total.ko + p.total.de + p.total.slow
  const done = p.done.ko + p.done.de + p.done.slow
  const recentlyDone = !p.running && p.finishedAt > 0 && Date.now() - p.finishedAt < SHOW_DONE_MS
  const visible = total >= MIN_JOBS && (p.running || recentlyDone) && dismissed !== p.startedAt && (tab !== 'ueben' || open)
  if (!visible) return null

  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass sheet-up fixed right-3 bottom-[calc(var(--tabbar-space)+0.5rem)] z-30 w-[min(20rem,calc(100vw-1.5rem))] rounded-[22px] md:bottom-4 md:right-4"
    >
      <div className="flex items-center gap-1 p-1.5 pl-3">
        <button className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${p.running ? 'bg-blue/15 text-blue' : 'bg-green/15 text-green'}`}>
            {p.running ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{p.running ? 'Stimmen werden erstellt' : 'Alle Stimmen fertig'}</span>
            <span className="block truncate text-xs text-label-2">
              {p.running ? `${p.remaining} übrig · ${formatEta(p.etaMs)}` : `${done} Aufnahmen erstellt`}
            </span>
          </span>
          <ChevronDown size={18} className={`shrink-0 text-label-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-label-3 transition hover:bg-fill-3" onClick={() => setDismissed(p.startedAt)} aria-label="Anzeige ausblenden">
          <X size={16} />
        </button>
      </div>

      {/* Gesamtbalken */}
      <div className="mx-3 mb-2 h-1 overflow-hidden rounded-full bg-fill-3">
        <div className={`h-full rounded-full transition-[width] duration-500 ${p.running ? 'bg-blue' : 'bg-green'}`} style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <div className="space-y-2.5 border-t border-separator px-3 pb-3 pt-2.5">
          {ROWS.filter((r) => p.total[r.kind] > 0).map((r) => {
            const t = p.total[r.kind]
            const d = Math.min(p.done[r.kind], t)
            return (
              <div key={r.kind}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    {r.kind === 'slow' ? <Snail size={14} className="text-label-2" /> : <span className="w-6 text-[11px] font-bold text-label-2">{r.kind.toUpperCase()}</span>}
                    {r.label}
                  </span>
                  <span className="tabular-nums text-label-2">{d} / {t}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-fill-3">
                  <div className={`h-full rounded-full transition-[width] duration-500 ${d >= t ? 'bg-green' : 'bg-blue'}`} style={{ width: `${(d / t) * 100}%` }} />
                </div>
              </div>
            )
          })}
          <p className="text-xs text-label-2">
            {p.running
              ? 'Läuft im Hintergrund weiter. Bis eine Aufnahme fertig ist, spricht die Systemstimme.'
              : 'Alle Aufnahmen sind gespeichert und spielen sofort.'}
          </p>
        </div>
      )}
    </div>
  )
}
