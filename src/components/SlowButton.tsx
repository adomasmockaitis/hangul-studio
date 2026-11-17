/** „Langsam“: natürliche langsame Aufnahme, bis dahin die normale mit 75 % Tempo */
import { Snail } from 'lucide-react'
import { speakSlow } from '../lib/speech'

export function SlowButton({ text, className = 'btn-soft', label = true }: { text: string; className?: string; label?: boolean }) {
  return (
    <button type="button" className={className} onClick={() => speakSlow(text)} aria-label={`${text} langsam anhören`} title="Langsam anhören">
      <Snail size={16} /> {label && 'Langsam'}
    </button>
  )
}
