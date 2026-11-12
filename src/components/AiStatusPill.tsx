import { useSyncExternalStore } from 'react'
import { getAiStatus, subscribeAiStatus, warmup } from '../lib/gemini'
import { useApp } from '../store'

export function AiStatusPill({ className = '' }: { className?: string }) {
  const s = useSyncExternalStore(subscribeAiStatus, getAiStatus)
  const { settings } = useApp()

  const dot =
    s.state === 'connecting' ? 'bg-[#ffcc00] animate-pulse' : s.state === 'ready' ? 'bg-[#34c759]' : s.state === 'offline' && settings.geminiApiKey.trim() ? 'bg-[#ff3b30]' : 'bg-black/25 dark:bg-white/30'
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
      className={`flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/70 px-3 py-1.5 text-left text-xs font-medium backdrop-blur-md transition active:scale-[0.97] dark:border-white/10 dark:bg-white/10 ${className}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 break-words">{label}</span>
    </button>
  )
}
