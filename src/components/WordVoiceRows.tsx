import { useState } from 'react'
import { Loader2, Play, RefreshCw } from 'lucide-react'
import { canRegeneratePart, playWordPart, regenerateWordPart, type VoicePart } from '../lib/speech'
import { useConfirm } from './ui'

const PARTS: { part: VoicePart; label: string }[] = [
  { part: 'ko', label: 'Koreanisch' },
  { part: 'de', label: 'Deutsch' },
  { part: 'slow', label: 'Koreanisch langsam' },
]

/**
 * Aussprache eines Wortes: anhören und – wenn eine Aufnahme schlecht klingt – nur diese neu erzeugen (mit Rückfrage).
 * Nutzt den gespeicherten Stand des Wortes, nicht ungespeicherte Änderungen im Formular.
 */
export function WordVoiceRows({ word }: { word: { korean: string; german: string } }) {
  const confirm = useConfirm()
  const [busy, setBusy] = useState<VoicePart | null>(null)
  const [msg, setMsg] = useState('')
  const anyRegen = PARTS.some((p) => canRegeneratePart(word, p.part))

  const regen = async (part: VoicePart, label: string) => {
    const ok = await confirm({
      title: `${label} neu erzeugen?`,
      message: `Die Aufnahme „${part === 'de' ? word.german : word.korean}“ (${label}) wird mit der Gemini-Stimme neu erstellt und ersetzt die bisherige – auch auf deinen anderen Geräten. Das verbraucht eine Anfrage deines Tageskontingents.`,
      confirmLabel: 'Neu erzeugen',
    })
    if (!ok) return
    setBusy(part)
    setMsg('')
    const done = await regenerateWordPart(word, part)
    setBusy(null)
    setMsg(done ? `${label}: neue Aufnahme gespeichert.` : `${label}: Neu erzeugen hat nicht geklappt – später nochmal versuchen.`)
  }

  return (
    <div className="space-y-2 rounded-2xl bg-fill-4 p-3">
      <p className="label">Aussprache</p>
      {PARTS.map(({ part, label }) => (
        <div key={part} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm">{label}</span>
          <button type="button" className="btn-soft !px-3" onClick={() => playWordPart(word, part)} aria-label={`${label} anhören`} title="Anhören">
            <Play size={15} />
          </button>
          {canRegeneratePart(word, part) && (
            <button type="button" className="btn-soft text-sm" onClick={() => void regen(part, label)} disabled={busy !== null}>
              {busy === part ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Neu erzeugen
            </button>
          )}
        </div>
      ))}
      {msg && <p className="text-xs text-label-2" aria-live="polite">{msg}</p>}
      {!anyRegen && <p className="text-xs text-label-3">Neu erzeugen geht mit der Gemini-Stimme (Einstellungen → Audio & Lernen, mit API-Key).</p>}
    </div>
  )
}
