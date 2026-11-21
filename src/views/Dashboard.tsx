import { BookCheck, Flame, Gauge, Play, Plus, RotateCcw, Target } from 'lucide-react'
import { List, ListRow, PageHeader, Sheet } from '../components/ui'
import { navigate } from '../lib/route'
import { useMemo, useState } from 'react'
import { currentStreak, dateKey, LEARNED_DAYS, quizBreakdown, quizStats, type QuizWordStat } from '../lib/srs'
import { activeOnly } from '../lib/folders'
import { smartPick, smartSummary, SMART_MAX } from '../lib/selection'
import { computeLevel, LEVEL_STEPS } from '../lib/level'
import { useApp } from '../store'

export function Dashboard() {
  const { words, folders, activity, reviewLog, retention } = useApp()
  const lv = computeLevel(words, reviewLog)
  const stepFrom = LEVEL_STEPS[Math.min(lv.level, LEVEL_STEPS.length) - 1]
  const stepTo = lv.toNext === null ? null : lv.secure + lv.toNext
  const progress = stepTo === null ? 1 : Math.min(1, Math.max(0, (lv.secure - stepFrom) / Math.max(1, stepTo - stepFrom)))
  const { days, doneToday } = currentStreak(activity)
  // Nur Abfragen zählen (im Lernmodus ist die Lösung sichtbar)
  const { learned, rate } = useMemo(() => quizStats(reviewLog, words), [reviewLog, words])
  // Genau das, was das Smart-Quiz (Deutsch → Koreanisch) jetzt laden würde – ohne Obergrenze gezählt
  const ready = useMemo(() => smartPick(activeOnly(words, folders), 'deko', Infinity, Date.now()), [words, folders])
  const due = ready.length
  // Je Wort aus dem Quiz-Protokoll (wie Gelernt und Erfolgsquote – der Lernmodus zählt nicht)
  const perWord = useMemo(() => quizBreakdown(reviewLog, words), [reviewLog, words])
  const errorsAll = useMemo(() => perWord.filter((x) => x.wrong > 0).sort((a, b) => b.wrong - a.wrong || a.ok / a.total - b.ok / b.total), [perWord])
  const topErrors = errorsAll.slice(0, 5)
  const [detail, setDetail] = useState<'learned' | 'rate' | 'errors' | null>(null)

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
    { icon: BookCheck, color: 'var(--color-green)', value: String(learned), unit: `von ${words.length}`, label: 'Gelernt', note: `Quiz: an ${LEARNED_DAYS} Tagen richtig` },
    { icon: Target, color: 'var(--color-blue)', value: rate === null ? '–' : `${rate} %`, unit: '', label: 'Erfolgsquote', note: 'alle Quiz-Antworten' },
  ]

  return (
    <div className="mx-auto w-full max-w-3xl">
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
              {due === 0 ? 'Alles wiederholt' : due === 1 ? '1 Wort ist bereit' : `${due} Wörter sind bereit`}
            </h2>
            <p className="mt-1 max-w-md text-sm text-label-2">
              {due === 0
                ? 'Gerade ist nichts dran. Mit „Nochmal wiederholen“ übst du die Wörter, die du am häufigsten falsch machst.'
                : <>{smartSummary(ready)}{due > SMART_MAX ? ` – das Smart-Quiz nimmt die ${SMART_MAX} dringendsten zuerst.` : '.'} Nur Ordner, die du aktiv lernst.</>}
            </p>
            {due === 0 ? (
              <button className="btn-primary mt-5 !px-6 !text-base" onClick={() => navigate('/ueben/quiz/extra')}>
                <RotateCcw size={18} /> Nochmal wiederholen
              </button>
            ) : (
              <button className="btn-primary mt-5 !px-6 !text-base" onClick={() => navigate('/ueben/quiz')}>
                <Play size={18} fill="currentColor" /> Test starten
              </button>
            )}
          </>
        )}
      </section>

      {/* Lernstand: steuert Smart-Auswahl und später Schwierigkeit und neue Wörter */}
      {words.length > 0 && (
        <section aria-labelledby="level-title" className="card fade-up mb-5 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo text-white" aria-hidden><Gauge size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="label">Lernstand</p>
              <h2 id="level-title" className="text-xl font-bold">Stufe {lv.level} <span className="text-sm font-medium text-label-2">von 10</span></h2>
            </div>
            <p className="text-right text-sm text-label-2"><span className="text-xl font-bold tabular-nums text-label">{lv.secure}</span><br />sicher</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-fill-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Fortschritt zur nächsten Stufe">
            <div className="ease-spring h-full rounded-full bg-indigo transition-all duration-700" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-label-2">
            {lv.toNext === null ? 'Höchste Stufe erreicht.' : `Noch ${lv.toNext} sicher gelernte ${lv.toNext === 1 ? 'Abfrage' : 'Abfragen'} bis Stufe ${lv.level + (lv.penalty ? 2 : 1)}.`}
            {' '}„Sicher“ heißt: ein Wort in einer Richtung sitzt mindestens 7 Tage.
            {lv.penalty && ' Zuletzt viele Fehler – vorübergehend eine Stufe tiefer.'}
            {retention.personal && ` Wiederholungen sind an dich angepasst (Ziel ${Math.round(retention.retention * 100)} % behalten).`}
          </p>
        </section>
      )}

      <div className="mb-5 grid grid-cols-3 gap-3 sm:gap-4">
        {stats.map((s, i) => {
          const open = s.label === 'Gelernt' ? 'learned' : s.label === 'Erfolgsquote' ? 'rate' : null
          const Tag = open ? 'button' : 'div'
          return (
          <Tag
            key={s.label}
            {...(open ? { type: 'button' as const, onClick: () => setDetail(open), 'aria-label': `${s.label}: Liste anzeigen` } : {})}
            className={`card fade-up p-3.5 text-left sm:p-5 ${open ? 'transition hover:bg-fill-4 active:scale-[0.98]' : ''}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="mb-2.5 grid h-8 w-8 place-items-center rounded-[10px] text-white" style={{ background: s.color }} aria-hidden>
              <s.icon size={18} />
            </div>
            <p className="text-xl font-bold tracking-tight tabular-nums sm:text-3xl">
              {s.value} {s.unit && <span className="text-xs font-medium text-label-2 sm:text-sm">{s.unit}</span>}
            </p>
            <p className="text-xs font-semibold sm:text-sm">{s.label}</p>
            <p className="text-caption text-label-2 sm:text-xs">{s.note}</p>
          </Tag>
          )
        })}
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <List title="Häufigste Fehler">
          {topErrors.length === 0 ? (
            <ListRow title={<span className="text-label-2">Noch keine Fehler – weiter so!</span>} />
          ) : (
            topErrors.map(({ word: w, wrong }) => (
              <ListRow
                key={w.id}
                title={<span lang="ko" className="text-lg font-semibold">{w.korean}</span>}
                subtitle={w.german}
                right={<span className="shrink-0 rounded-full bg-red/15 px-2.5 py-0.5 text-xs font-semibold text-red">{wrong}× falsch</span>}
              />
            ))
          )}
          {errorsAll.length > 0 && (
            <ListRow title={<span className="text-blue">Alle {errorsAll.length} {errorsAll.length === 1 ? 'Wort' : 'Wörter'} mit Fehlern</span>} onClick={() => setDetail('errors')} />
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
      <Sheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail === 'learned' ? 'Gelernte Wörter' : detail === 'rate' ? 'Erfolgsquote je Wort' : 'Wörter mit Fehlern'}
      >
        <StatsDetail kind={detail} perWord={perWord} errors={errorsAll} />
      </Sheet>
    </div>
  )
}

/** Liste hinter einer Kennzahl der Startseite (nur Quiz-Antworten) */
function StatsDetail({ kind, perWord, errors }: { kind: 'learned' | 'rate' | 'errors' | null; perWord: QuizWordStat[]; errors: QuizWordStat[] }) {
  if (!kind) return null
  const learned = perWord.filter((x) => x.days >= LEARNED_DAYS).sort((a, b) => a.word.korean.localeCompare(b.word.korean, 'ko'))
  const byRate = [...perWord].sort((a, b) => a.ok / a.total - b.ok / b.total || b.total - a.total)
  const list = kind === 'learned' ? learned : kind === 'rate' ? byRate : errors
  const ok = perWord.reduce((n, x) => n + x.ok, 0)
  const total = perWord.reduce((n, x) => n + x.total, 0)
  const intro =
    kind === 'learned'
      ? `Deutsch → Koreanisch an ${LEARNED_DAYS} verschiedenen Tagen ohne Hilfe richtig – ${learned.length} ${learned.length === 1 ? 'Wort' : 'Wörter'}.`
      : kind === 'rate'
        ? `${ok} von ${total} Quiz-Antworten richtig${total ? ` (${Math.round((ok / total) * 100)} %)` : ''}. Schwächste zuerst.`
        : 'Alle Wörter, die du im Quiz mindestens einmal falsch hattest – die häufigsten zuerst.'
  return (
    <div>
      <p className="mb-3 text-sm text-label-2">{intro}</p>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-label-2">
          {kind === 'learned' ? 'Noch keins – mach ein paar Quizze an verschiedenen Tagen.' : kind === 'rate' ? 'Noch keine Quiz-Antworten.' : 'Noch keine Fehler – weiter so!'}
        </p>
      ) : (
        <List>
          {list.map((x) => {
            const pct = Math.round((x.ok / x.total) * 100)
            const badge =
              kind === 'learned'
                ? <span className="shrink-0 rounded-full bg-green/15 px-2.5 py-0.5 text-xs font-semibold text-green">{x.days} Tage</span>
                : kind === 'rate'
                  ? <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${pct >= 80 ? 'bg-green/15 text-green' : pct >= 50 ? 'bg-orange/15 text-orange' : 'bg-red/15 text-red'}`}>{x.ok}/{x.total} · {pct} %</span>
                  : <span className="shrink-0 rounded-full bg-red/15 px-2.5 py-0.5 text-xs font-semibold text-red">{x.wrong}× falsch</span>
            return (
              <ListRow
                key={x.word.id}
                title={<span lang="ko" className="text-lg font-semibold">{x.word.korean}</span>}
                subtitle={x.word.german}
                right={badge}
              />
            )
          })}
        </List>
      )}
    </div>
  )
}
