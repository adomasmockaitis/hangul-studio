import { useSyncExternalStore } from 'react'
import { getAiStatus, subscribeAiStatus, warmup } from '../lib/gemini'
import { useApp } from '../store'

/** KI-Status. `compact` (Handy): nur Punkt + Kurztext, damit oben Platz für den Seitentitel bleibt. */
export function AiStatusPill({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const s = useSyncExternalStore(subscribeAiStatus, getAiStatus)
  const { settings } = useApp()

  const dot =
    s.state === 'connecting' ? 'bg-yellow animate-pulse' : s.state === 'ready' ? 'bg-green' : s.state === 'offline' && settings.geminiApiKey.trim() ? 'bg-red' : 'bg-label-3'
  const label =
    s.state === 'connecting'
      ? 'KI wird verbunden…'
      : s.state === 'ready'
        ? `KI bereit (${s.model})${s.ms ? ` · ${s.ms} ms` : ''}`
        : settings.geminiApiKey.trim()
          ? `Offline / Selbst-Check${s.note ? ` · ${s.note}` : ''}`
          : 'Offline / Selbst-Check'
  const short = s.state === 'connecting' ? 'Verbinde…' : s.state === 'ready' ? 'KI bereit' : 'Offline'

  return (
    <button
      onClick={() => void warmup(settings.geminiApiKey, true)}
      title={`${label} – klicken für neuen Speed-Check`}
      aria-label={`KI-Status: ${label}. Neu prüfen`}
      className={`flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-left text-xs font-medium transition active:scale-[0.97] ${compact ? '' : 'bg-fill-4'} ${className}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 break-words">{compact ? short : label}</span>
    </button>
  )
}
