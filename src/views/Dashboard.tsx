import { BookCheck, Flame, Play, Target, TriangleAlert } from 'lucide-react'
import { PageHeader } from '../components/ui'
import { currentStreak, dateKey, successRate } from '../lib/srs'
import { useApp } from '../store'
import type { ViewId } from '../types'

export function Dashboard({ go }: { go: (v: ViewId, opts?: { quiz?: boolean }) => void }) {
  const { words, activity } = useApp()
  const { days, doneToday } = currentStreak(activity)
  const learned = words.filter((w) => w.stats.correctCount > 0).length
  const rate = successRate(words)
  const topErrors = [...words]
    .filter((w) => w.stats.wrongCount > 0)
    .sort((a, b) => b.stats.wrongCount - a.stats.wrongCount)
    .slice(0, 5)

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return { label: d.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2), n: activity[dateKey(d)] ?? 0 }
  })
  const maxN = Math.max(1, ...week.map((d) => d.n))
  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend'

  const stats = [
    { icon: Flame, color: '#ff9500', value: days, unit: days === 1 ? 'Tag' : 'Tage', label: 'Streak', note: doneToday ? 'Heute erledigt ✓' : days ? 'Heute noch offen' : 'Starte heute!' },
    { icon: BookCheck, color: '#34c759', value: learned, unit: `/ ${words.length}`, label: 'Gelernte Wörter', note: 'mindestens 1× richtig' },
    { icon: Target, color: '#007aff', value: rate === null ? '–' : `${rate}%`, unit: '', label: 'Erfolgsquote', note: 'über alle Versuche' },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`${greet} 👋`} subtitle="Dein Lernstand auf einen Blick" />

      <div className="card fade-up relative mb-5 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-6 -top-10 select-none text-[11rem] font-black leading-none text-[#007aff]/10">한</div>
        <p className="label">Daily Smart Test</p>
        <h2 className="mt-1 text-2xl font-bold">Heute gezielt wiederholen</h2>
        <p className="mt-1 max-w-md text-sm text-black/55 dark:text-white/55">
          Bis zu 10 Wörter – priorisiert nach deinen Fehlern und der Zeit seit der letzten Wiederholung.
        </p>
        <button className="btn-primary mt-5 !rounded-2xl !px-6 !py-3 !text-base" disabled={!words.length} onClick={() => go('learn', { quiz: true })}>
          <Play size={18} fill="currentColor" /> Test starten
        </button>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {stats.map((s, i) => (
          <div key={s.label} className="card fade-up p-5" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: s.color }}>
              <s.icon size={19} />
            </div>
            <p className="text-3xl font-bold tracking-tight">
              {s.value} <span className="text-base font-medium text-black/45 dark:text-white/45">{s.unit}</span>
            </p>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-xs text-black/45 dark:text-white/45">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card fade-up p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><TriangleAlert size={17} className="text-[#ff3b30]" /> Top-Fehlerwörter</h3>
          {topErrors.length === 0 ? (
            <p className="text-sm text-black/50 dark:text-white/50">Noch keine Fehler – weiter so!</p>
          ) : (
            <ul className="divide-y divide-black/[0.06] dark:divide-white/10">
              {topErrors.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-lg font-semibold">{w.korean}</span>
                    <span className="ml-2 text-sm text-black/50 dark:text-white/50">{w.german}</span>
                  </div>
                  <span className="rounded-full bg-[#ff3b30]/15 px-2.5 py-0.5 text-xs font-semibold text-[#ff3b30]">{w.stats.wrongCount}× falsch</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card fade-up p-5">
          <h3 className="mb-3 font-semibold">Aktivität (7 Tage)</h3>
          <div className="flex h-32 items-end gap-2">
            {week.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs text-black/45 dark:text-white/45">{d.n || ''}</span>
                <div className="w-full rounded-lg bg-[#007aff] transition-all" style={{ height: `${Math.max(4, (d.n / maxN) * 80)}px`, opacity: d.n ? 1 : 0.15 }} />
                <span className="text-xs text-black/50 dark:text-white/50">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
