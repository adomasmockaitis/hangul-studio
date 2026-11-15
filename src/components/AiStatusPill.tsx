import { useSyncExternalStore } from 'react'
import { getAiStatus, subscribeAiStatus, warmup } from '../lib/gemini'
import { useApp } from '../store'

export function AiStatusPill({ className = '' }: { className?: string }) {
  const s = useSyncExternalStore(subscribeAiStatus, getAiStatus)
  const { settings } = useApp()

  const dot =
    s.state === 'connecting' ? 'bg-yellow animate-pulse' : s.state === 'ready' ? 'bg-green' : s.state === 'offline' && settings.geminiApiKey.trim() ? 'bg-red' : 'bg-fill-45'
  const label =
    s.state === 'connecting'
      ? 'KI wird verbunden…'
      : s.state === 'ready'
        ? `KI bereit (${s.model})${s.ms ? ` · ${s.ms} ms` : ''}`
        : settings.geminiApiKey.trim()
          ? `Offline / Selbst-Check${s.note ? ` · ${s.note}` : ''}`
          : 'Offline / Selbst-Check'

  return (
    <button
      onClick={() => void warmup(settings.geminiApiKey, true)}
      title="Klicken für neuen Speed-Check"
      className={`flex items-center gap-2 rounded-full border border-separator bg-surface px-3 py-1.5 text-left text-xs font-medium backdrop-blur-md transition active:scale-[0.97] ${className}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 break-words">{label}</span>
    </button>
  )
}
