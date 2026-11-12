import { useState, type ReactNode } from 'react'
import { Check, Flame, Home, Repeat, X } from 'lucide-react'
import { currentStreak } from '../lib/srs'
import { useApp } from '../store'

export interface QResult {
  correct: boolean
  image?: string
  read?: string
}

export interface Q {
  key: string
  wordId: string
  /** Kurzform der Frage für die Auswertung */
  prompt: string
  /** Richtige Lösung für die Auswertung */
  solution: string
  render: (a: { onResult: (r: QResult) => void; onRevise: (correct: boolean) => void; onNext: () => void; nextLabel: string }) => ReactNode
}

interface Done extends QResult {
  q: Q
}

interface Props {
  questions: Q[]
  onDashboard: () => void
  onBack: () => void
  backLabel: string
}

export function Runner({ questions, onDashboard, onBack, backLabel }: Props) {
  const { recordReview, reviseReview, activity } = useApp()
  const [qs, setQs] = useState(questions)
  const [round, setRound] = useState(0)
  const [i, setI] = useState(0)
  const [done, setDone] = useState<Done[]>([])

  if (i >= qs.length) {
    const ok = done.filter((d) => d.correct).length
    const pct = done.length ? Math.round((ok / done.length) * 100) : 0
    const wrong = done.filter((d) => !d.correct)
    const { days } = currentStreak(activity)
    const tone = pct >= 80 ? '#34c759' : pct >= 50 ? '#ff9500' : '#ff3b30'
    return (
      <div className="fade-up space-y-4">
        <div className="card p-6 text-center">
          <div className="relative mx-auto grid h-36 w-36 place-items-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-black/10 dark:stroke-white/10" />
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round" stroke={tone}
                strokeDasharray={`${(pct / 100) * 326.7} 326.7`} style={{ transition: 'stroke-dasharray .8s ease' }} />
            </svg>
            <div>
              <p className="text-4xl font-bold">{pct}%</p>
              <p className="text-xs text-black/50 dark:text-white/50">Erfolgsquote</p>
            </div>
          </div>
          <p className="mt-3 text-lg font-semibold">{ok} von {done.length} richtig</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#ff9500]/15 px-3 py-1 text-sm font-semibold text-[#ff9500]">
            <Flame size={15} /> Tages-Streak: {days} {days === 1 ? 'Tag' : 'Tage'}
          </p>
        </div>

        <div className="card divide-y divide-black/[0.06] overflow-hidden dark:divide-white/10">
          {done.map((d, n) => (
            <div key={n} className="flex items-center gap-3 px-4 py-3">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${d.correct ? 'bg-[#34c759]' : 'bg-[#ff3b30]'}`}>
                {d.correct ? <Check size={15} /> : <X size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-black/55 dark:text-white/55">{d.q.prompt}</p>
                <p className="text-xl font-semibold">{d.q.solution}</p>
                {!d.correct && d.read && !d.image && <p className="text-xs text-[#ff3b30]">Deine Antwort: {d.read}</p>}
              </div>
              {!d.correct && d.image && (
                <div className="shrink-0 text-center">
                  <img src={d.image} alt="Dein Bild" className="h-14 w-24 rounded-lg border border-black/10 bg-white object-contain" />
                  <p className="mt-0.5 text-[10px] text-black/45 dark:text-white/45">
                    {d.read ? `KI: ${d.read}` : 'dein Bild'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary flex-1"
            disabled={!wrong.length}
            onClick={() => {
              setQs(wrong.map((w) => w.q))
              setRound((r) => r + 1)
              setI(0)
              setDone([])
            }}
          >
            <Repeat size={16} /> Nur falsche Wörter sofort wiederholen
          </button>
          <button className="btn-soft" onClick={onBack}>{backLabel}</button>
          <button className="btn-soft" onClick={onDashboard}><Home size={16} /> Zurück zum Dashboard</button>
        </div>
      </div>
    )
  }

  const q = qs[i]
  return (
    <div className="space-y-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className="h-full rounded-full bg-[#007aff] transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>
      <p className="text-center text-xs text-black/45 dark:text-white/45">
        Frage {i + 1} von {qs.length}{round > 0 ? ' · Wiederholung' : ''}
      </p>
      <div key={`${round}-${q.key}`}>
        {q.render({
          onResult: (r) => {
            recordReview(q.wordId, r.correct)
            setDone((d) => [...d, { ...r, q }])
          },
          onRevise: (correct) => {
            reviseReview(q.wordId, correct)
            setDone((d) => d.map((x) => (x.q === q ? { ...x, correct } : x)))
          },
          onNext: () => setI((n) => n + 1),
          nextLabel: i === qs.length - 1 ? 'Auswertung' : 'Weiter',
        })}
      </div>
    </div>
  )
}
