import { BookCheck, Flame, Play, Plus, Target } from 'lucide-react'
import { List, ListRow, PageHeader } from '../components/ui'
import { navigate } from '../lib/route'
import { currentStreak, dateKey, isDue, successRate } from '../lib/srs'
import { useApp } from '../store'

export function Dashboard() {
  const { words, activity } = useApp()
  const { days, doneToday } = currentStreak(activity)
  const learned = words.filter((w) => w.stats.correctCount > 0).length
  const rate = successRate(words)
  const due = words.filter((w) => isDue(w)).length
  const topErrors = [...words]
    .filter((w) => w.stats.wrongCount > 0)
    .sort((a, b) => b.stats.wrongCount - a.stats.wrongCount)
    .slice(0, 5)

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return {
      label: d.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2),
      long: d.toLocaleDateString('de-DE', { weekday: 'long' }),
      n: activity[dateKey(d)] ?? 0,
    }
  })
  const maxN = Math.max(1, ...week.map((d) => d.n))
  const weekTotal = week.reduce((a, d) => a + d.n, 0)
  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend'
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

  const stats = [
    { icon: Flame, color: 'var(--color-orange)', value: String(days), unit: days === 1 ? 'Tag' : 'Tage', label: 'Streak', note: doneToday ? 'Heute erledigt' : days ? 'Heute noch offen' : 'Starte heute' },
    { icon: BookCheck, color: 'var(--color-green)', value: String(learned), unit: `von ${words.length}`, label: 'Gelernt', note: 'mind. 1× richtig' },
    { icon: Target, color: 'var(--color-blue)', value: rate === null ? '–' : `${rate} %`, unit: '', label: 'Erfolgsquote', note: 'alle Versuche' },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={greet} subtitle={today} />

      {/* Heute: die eine Hauptaktion der Seite */}
      <section aria-labelledby="today-title" className="card fade-up relative mb-5 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-6 -top-10 select-none text-[11rem] font-black leading-none text-blue/10" aria-hidden>한</div>
        <p className="label">Heute</p>
        {words.length === 0 ? (
          <>
            <h2 id="today-title" className="mt-1 text-2xl font-bold">Noch keine Wörter</h2>
            <p className="mt-1 max-w-md text-sm text-label-2">Lege dein erstes Wort an oder lies eine Vokabelliste ein.</p>
            <button className="btn-primary mt-5 !px-6 !text-base" onClick={() => navigate('/woerter')}>
              <Plus size={18} /> Wörter hinzufügen
            </button>
          </>
        ) : (
          <>
            <h2 id="today-title" className="mt-1 text-2xl font-bold">
              {due === 0 ? 'Alles wiederholt' : due === 1 ? '1 Wort ist fällig' : `${due} Wörter sind fällig`}
            </h2>
            <p className="mt-1 max-w-md text-sm text-label-2">
              Der Test fragt bis zu 10 Wörter ab – zuerst die mit den meisten Fehlern und der längsten Pause.
            </p>
            <button className="btn-primary mt-5 !px-6 !text-base" onClick={() => navigate('/ueben/quiz')}>
              <Play size={18} fill="currentColor" /> Test starten
            </button>
          </>
        )}
      </section>

      <div className="mb-5 grid grid-cols-3 gap-3 sm:gap-4">
        {stats.map((s, i) => (
          <div key={s.label} className="card fade-up p-3.5 sm:p-5" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="mb-2.5 grid h-8 w-8 place-items-center rounded-[10px] text-white" style={{ background: s.color }} aria-hidden>
              <s.icon size={18} />
            </div>
            <p className="text-xl font-bold tracking-tight tabular-nums sm:text-3xl">
              {s.value} {s.unit && <span className="text-xs font-medium text-label-2 sm:text-sm">{s.unit}</span>}
            </p>
            <p className="text-xs font-semibold sm:text-sm">{s.label}</p>
            <p className="text-caption text-label-2 sm:text-xs">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <List title="Häufigste Fehler">
          {topErrors.length === 0 ? (
            <ListRow title={<span className="text-label-2">Noch keine Fehler – weiter so!</span>} />
          ) : (
            topErrors.map((w) => (
              <ListRow
                key={w.id}
                title={<span lang="ko" className="text-lg font-semibold">{w.korean}</span>}
                subtitle={w.german}
                right={<span className="shrink-0 rounded-full bg-red/15 px-2.5 py-0.5 text-xs font-semibold text-red">{w.stats.wrongCount}× falsch</span>}
              />
            ))
          )}
        </List>

        <section className="mb-6">
          <h2 className="mb-1.5 px-4 text-xs font-medium text-label-2">Aktivität der letzten 7 Tage</h2>
          <div className="card p-5">
            <div
              className="flex h-32 items-end gap-2"
              role="img"
              aria-label={`${weekTotal} Übungen in 7 Tagen. ${week.map((d) => `${d.long}: ${d.n}`).join(', ')}.`}
            >
              {week.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs tabular-nums text-label-2">{d.n || ''}</span>
                  <div className={`w-full rounded-md transition-all ${d.n ? 'bg-blue' : 'bg-fill-2'}`} style={{ height: `${Math.max(4, (d.n / maxN) * 80)}px` }} />
                  <span className="text-xs text-label-2">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
