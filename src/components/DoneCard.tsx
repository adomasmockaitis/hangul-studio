import { useEffect } from 'react'
import { Check, Home, Repeat } from 'lucide-react'
import { playSound } from '../lib/sounds'

/** Abschluss-Karte, wenn man alle Karten/Formen durch hat: zurück zum Dashboard oder noch einmal von vorn */
export function DoneCard({
  title = 'Geschafft!',
  text,
  onDashboard,
  onRepeat,
  repeatLabel = 'Wiederholen',
}: {
  title?: string
  text: string
  onDashboard: () => void
  onRepeat: () => void
  repeatLabel?: string
}) {
  useEffect(() => {
    playSound('complete')
  }, [])

  return (
    <div className="card fade-up p-8 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-[#34c759] text-white shadow-lg">
        <Check size={34} strokeWidth={3} />
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-black/55 dark:text-white/55">{text}</p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <button className="btn-soft !py-3" onClick={onDashboard}><Home size={16} /> Zurück zum Dashboard</button>
        <button className="btn-primary !py-3" onClick={onRepeat}><Repeat size={16} /> {repeatLabel}</button>
      </div>
    </div>
  )
}
