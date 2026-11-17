/**
 * Partikel-Trainer: Übersicht der 10 Partikeln (Kapitel), Lernpfad je Partikel
 * (Check → Erklärung → Aufwärmen → Mini-Test) und Trainingsrunden mit Auto-Stufe.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Circle, KeyRound, Lightbulb, Loader2, Play,
  RotateCcw, Shuffle, Sparkles, Volume2, X,
} from 'lucide-react'
import { HangulCanvas } from '../components/HangulCanvas'
import { Segmented } from '../components/ui'
import { useToast } from '../components/Toasts'
import { newStats } from '../data/demo'
import { computeLevel } from '../lib/level'
import { navigate } from '../lib/route'
import { playSound } from '../lib/sounds'
import { prepareSentences, speak, speakGerman } from '../lib/speech'
import { generateSentences, gradeTranslations, newWordLimits, pickVocab, type TranslationGrade } from '../lib/particles/ai'
import { CHAPTERS, LEVEL_NAMES, chapterOf, type Level, type ParticleChapter } from '../lib/particles/content'
import {
  MAX_AI, PASS_MARK, accuracy, buildCheck, buildMiniTest, buildRound, buildWarmup, chapterProgress, effectiveLevel, isLearned,
  levelFromLearnLevel, recordResults, setStatus, type ChapterStatus, type Task, type TaskResult,
} from '../lib/particles/engine'
import { PARTICLE_IDS, checkGap, familyOf, fillSentence, formTip, parseSentence, type Gap, type ParticleId } from '../lib/particles/forms'
import type { PoolSentence } from '../lib/particles/pool'
import { useApp } from '../store'
import type { WordItem } from '../types'

const STATUS_LABEL: Record<ChapterStatus, string> = { new: 'Neu', known: 'Bekannt', learning: 'In Arbeit', passed: 'Gelernt' }

export function ParticleTrainer({ chapter }: { chapter: string }) {
  const id = (PARTICLE_IDS as string[]).includes(chapter) ? (chapter as ParticleId) : null
  useInitialAutoLevel()
  return id ? <ChapterView key={id} p={id} /> : <Hub />
}

/** Beim ersten Öffnen: Auto-Stufe aus dem allgemeinen Lernstand ableiten */
function useInitialAutoLevel() {
  const { particles, updateParticles, words, reviewLog } = useApp()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    if (particles.metaUpdatedAt || particles.recent.length) return
    const l = levelFromLearnLevel(computeLevel(words, reviewLog).level)
    updateParticles((s) => ({ ...s, autoLevel: l, metaUpdatedAt: Date.now() }))
    // nur einmal beim ersten Öffnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// ---------- Übersicht ----------

function Hub() {
  const { particles } = useApp()
  const [sel, setSel] = useState<ParticleId[]>([])
  const [session, setSession] = useState<ParticleId[] | null>(null)
  const learned = PARTICLE_IDS.filter((p) => isLearned(chapterProgress(particles, p).status))

  if (session) return <TrainSession particles={session} onExit={() => setSession(null)} />

  const toggle = (p: ParticleId) => setSel((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
  return (
    <div className="space-y-5">
      <LevelCard />

      <div className="card space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple/15 text-purple"><Shuffle size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Gemischt üben</p>
            <p className="text-sm text-label-2">
              Wähle unten mehrere Partikeln aus (Kreis antippen) oder mische alle gelernten. Schwache Partikeln und Verwechslungen kommen öfter.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!sel.length} onClick={() => setSession(sel)}>
            <Play size={16} /> {sel.length ? `${sel.length} ausgewählte üben` : 'Partikeln auswählen'}
          </button>
          <button className="btn-soft" disabled={!learned.length} onClick={() => setSession(learned)}>
            <Shuffle size={16} /> Alle gelernten mischen{learned.length ? ` (${learned.length})` : ''}
          </button>
          {sel.length > 0 && <button className="btn-soft" onClick={() => setSel([])}>Auswahl aufheben</button>}
        </div>
      </div>

      <div>
        <p className="label mb-2 px-1">Kapitel · empfohlene Reihenfolge</p>
        <div className="stagger space-y-2">
          {CHAPTERS.map((c) => {
            const cp = chapterProgress(particles, c.id)
            const acc = accuracy(cp)
            const on = sel.includes(c.id)
            return (
              <div key={c.id} className="card flex items-stretch overflow-hidden">
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition-colors hover:bg-fill-4"
                  onClick={() => navigate(`/ueben/partikel/${c.id}`)}
                >
                  <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl text-white" style={{ background: c.color }}>
                    <span className="text-[10px] font-semibold opacity-80">{c.order}</span>
                    <span lang="ko" className="-mt-0.5 text-sm font-bold leading-none">{c.forms.split(/[ /·]+/)[0]}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span lang="ko" className="font-semibold">{c.forms}</span>
                      <span className="text-sm text-label-2">{c.name}</span>
                    </span>
                    <span className="block truncate text-xs text-label-3">{c.short}</span>
                    {acc !== null && (
                      <span className="mt-1.5 block h-1 w-full max-w-40 overflow-hidden rounded-full bg-fill-2" title={`${Math.round(acc * 100)} % richtig`}>
                        <span className="block h-full rounded-full bg-green" style={{ width: `${Math.round(acc * 100)}%` }} />
                      </span>
                    )}
                  </span>
                  <StatusPill status={cp.status} />
                  <ChevronRight size={18} className="shrink-0 text-label-3" />
                </button>
                <button
                  className={`flex w-12 shrink-0 items-center justify-center border-l border-separator transition-colors ${on ? 'bg-blue/10 text-blue' : 'text-label-3 hover:bg-fill-4'}`}
                  onClick={() => toggle(c.id)}
                  aria-pressed={on}
                  aria-label={`${c.forms} für gemischtes Üben auswählen`}
                >
                  {on ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: ChapterStatus }) {
  const cls = status === 'passed' || status === 'known' ? 'bg-green/15 text-green' : status === 'learning' ? 'bg-orange/15 text-orange' : 'bg-fill-3 text-label-2'
  return <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline ${cls}`}>{STATUS_LABEL[status]}</span>
}

function LevelCard() {
  const { particles, updateParticles } = useApp()
  const lvl = effectiveLevel(particles)
  const win = particles.recent.slice(-20)
  const rate = win.length ? Math.round((win.filter((r) => r.ok).length / win.length) * 100) : null
  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Schwierigkeit</p>
          <p className="text-sm text-label-2">
            {particles.level === 'auto' ? `Auto · zurzeit Stufe ${lvl} (${LEVEL_NAMES[lvl - 1]})` : `Stufe ${lvl} (${LEVEL_NAMES[lvl - 1]})`}
            {rate !== null && ` · zuletzt ${rate} % richtig`}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Segmented<string>
          label="Schwierigkeit"
          value={String(particles.level)}
          onChange={(v) => updateParticles((s) => ({ ...s, level: v === 'auto' ? 'auto' : (Number(v) as Level), metaUpdatedAt: Date.now() }))}
          options={[{ value: 'auto', label: 'Auto' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))]}
        />
      </div>
      <p className="text-xs text-label-3">
        1 Einsteiger · 2 Anfänger · 3 Mittel · 4 Fortgeschritten · 5 Profi. Auto steigt bei über 85 % richtig und sinkt unter 60 % (letzte 20 Aufgaben).
      </p>
    </div>
  )
}

// ---------- Kapitel ----------

type Stage = 'intro' | 'check' | 'checkDone' | 'explain' | 'warmup' | 'mini' | 'miniDone' | 'overview' | 'train'

function ChapterView({ p }: { p: ParticleId }) {
  const { particles, updateParticles } = useApp()
  const c = chapterOf(p)
  const cp = chapterProgress(particles, p)
  const [stage, setStage] = useState<Stage>(cp.status === 'new' ? 'intro' : 'overview')
  const [score, setScore] = useState(0)
  // Aufgaben je Durchgang einmal festlegen
  const [tasks, setTasks] = useState<Task[]>([])

  const start = (s: Stage) => {
    if (s === 'check') setTasks(buildCheck(particles, p))
    if (s === 'warmup') setTasks(buildWarmup(particles, p))
    if (s === 'mini') setTasks(buildMiniTest(particles, p))
    if (s === 'explain' && cp.status === 'new') updateParticles((st) => setStatus(st, p, 'learning'))
    setStage(s)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const finishGraded = (results: TaskResult[], next: 'checkDone' | 'miniDone') => {
    const ok = results.filter((r) => r.ok).length
    setScore(ok)
    updateParticles((st) => {
      let s = recordResults(st, results)
      if (ok >= PASS_MARK) s = setStatus(s, p, next === 'checkDone' ? (chapterProgress(s, p).status === 'passed' ? 'passed' : 'known') : 'passed')
      return s
    })
    playSound(ok >= PASS_MARK ? 'success' : 'error')
    setStage(next)
  }

  return (
    <div className="space-y-4">
      <button className="btn-soft !min-h-9 !py-1 text-sm" onClick={() => (stage === 'overview' || stage === 'intro' ? navigate('/ueben/partikel') : setStage(cp.status === 'new' ? 'intro' : 'overview'))}>
        <ArrowLeft size={16} /> {stage === 'overview' || stage === 'intro' ? 'Alle Partikeln' : `Zurück zu ${c.forms}`}
      </button>

      {stage !== 'train' && stage !== 'check' && stage !== 'warmup' && stage !== 'mini' && <ChapterHead c={c} status={cp.status} />}

      {stage === 'intro' && (
        <div className="card fade-up space-y-4 p-5 text-center">
          <p className="text-lg font-semibold">Kennst du <span lang="ko">{c.forms}</span> schon?</p>
          <p className="text-sm text-label-2">Mit einem kurzen Check aus 5 Aufgaben kannst du die Erklärung überspringen.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn-soft" onClick={() => start('check')}><Check size={16} /> Ja, kurz prüfen</button>
            <button className="btn-primary" onClick={() => start('explain')}><BookOpen size={16} /> Nein, erklär es mir</button>
          </div>
        </div>
      )}

      {stage === 'check' && <Session key="check" tasks={tasks} title={`Check · ${c.forms}`} onFinish={(r) => finishGraded(r, 'checkDone')} onCancel={() => setStage('intro')} />}

      {stage === 'checkDone' && (
        <ResultCard ok={score >= PASS_MARK} score={score} total={5}
          title={score >= PASS_MARK ? 'Bestanden – du kennst die Partikel!' : 'Noch nicht ganz sicher'}
          text={score >= PASS_MARK ? 'Du kannst direkt trainieren. Die Erklärung bleibt jederzeit abrufbar.' : 'Wir empfehlen die Erklärung mit Aufwärmen und Mini-Test. Du kannst aber auch gleich trainieren.'}
        >
          {score >= PASS_MARK ? (
            <>
              <button className="btn-primary" onClick={() => setStage('train')}><Play size={16} /> Training starten</button>
              <button className="btn-soft" onClick={() => start('explain')}><BookOpen size={16} /> Erklärung ansehen</button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={() => start('explain')}><BookOpen size={16} /> Zur Erklärung</button>
              <button className="btn-soft" onClick={() => { updateParticles((st) => setStatus(st, p, 'learning')); setStage('train') }}>Trotzdem trainieren</button>
            </>
          )}
        </ResultCard>
      )}

      {stage === 'explain' && (
        <>
          <Explanation c={c} />
          <div className="flex flex-wrap justify-end gap-2">
            {cp.status !== 'new' && cp.status !== 'learning' && <button className="btn-soft" onClick={() => setStage('overview')}>Fertig</button>}
            <button className="btn-primary" onClick={() => start('warmup')}>Weiter zum Aufwärmen <ArrowRight size={16} /></button>
          </div>
        </>
      )}

      {stage === 'warmup' && (
        <Session key="warmup" tasks={tasks} title={`Aufwärmen · ${c.forms}`} subtitle="Mit Tipps – zählt nicht" onFinish={() => start('mini')} finishLabel="Zum Mini-Test" onCancel={() => setStage('explain')} />
      )}

      {stage === 'mini' && <Session key="mini" tasks={tasks} title={`Mini-Test · ${c.forms}`} onFinish={(r) => finishGraded(r, 'miniDone')} onCancel={() => setStage('explain')} />}

      {stage === 'miniDone' && (
        <ResultCard ok={score >= PASS_MARK} score={score} total={5}
          title={score >= PASS_MARK ? 'Mini-Test bestanden!' : 'Fast geschafft'}
          text={score >= PASS_MARK ? `${c.forms} ist freigeschaltet und kommt jetzt auch beim gemischten Üben dran.` : `Für das Bestehen brauchst du ${PASS_MARK} von 5. Schau dir die Erklärung noch einmal an oder versuch es gleich nochmal.`}
        >
          {score >= PASS_MARK ? (
            <button className="btn-primary" onClick={() => setStage('train')}><Play size={16} /> Training starten</button>
          ) : (
            <>
              <button className="btn-primary" onClick={() => start('mini')}><RotateCcw size={16} /> Mini-Test wiederholen</button>
              <button className="btn-soft" onClick={() => start('explain')}><BookOpen size={16} /> Erklärung</button>
            </>
          )}
          <button className="btn-soft" onClick={() => setStage('overview')}>Zur Übersicht</button>
        </ResultCard>
      )}

      {stage === 'overview' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setStage('train')}><Play size={16} /> Training starten</button>
            <button className="btn-soft" onClick={() => start('explain')}><BookOpen size={16} /> Erklärung</button>
            <button className="btn-soft" onClick={() => start('mini')}><RotateCcw size={16} /> Mini-Test</button>
          </div>
          <div className="card divide-y divide-separator">
            {c.lessons.map((l) => {
              const acc = accuracy(cp, l.id, 1)
              const n = (cp.lessons[l.id]?.right ?? 0) + (cp.lessons[l.id]?.wrong ?? 0)
              return (
                <div key={l.id} className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.title}</p>
                    <p className="text-sm text-label-2">{l.rule}</p>
                  </div>
                  <span className="shrink-0 text-right text-sm tabular-nums text-label-2">
                    {acc === null ? '–' : `${Math.round(acc * 100)} %`}
                    <span className="block text-xs text-label-3">{n} Aufgaben</span>
                  </span>
                </div>
              )
            })}
          </div>
          <LevelCard />
        </div>
      )}

      {stage === 'train' && <TrainSession particles={[p]} onExit={() => setStage('overview')} />}
    </div>
  )
}

function ChapterHead({ c, status }: { c: ParticleChapter; status: ChapterStatus }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex size-16 shrink-0 items-center justify-center rounded-3xl text-white shadow-sm" style={{ background: c.color }}>
        <span lang="ko" className="text-xl font-bold">{c.forms.split(/[ /·]+/)[0]}</span>
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-label-3">Kapitel {c.order} · {STATUS_LABEL[status]}</p>
        <h2 className="text-2xl font-bold tracking-tight"><span lang="ko">{c.forms}</span></h2>
        <p className="text-sm text-label-2">{c.name} – {c.short}</p>
      </div>
    </div>
  )
}

function ResultCard({ ok, score, total, title, text, children }: { ok: boolean; score: number; total: number; title: string; text: string; children: ReactNode }) {
  return (
    <div className="card fade-up space-y-3 p-6 text-center">
      <div className={`pop-in mx-auto flex size-14 items-center justify-center rounded-full ${ok ? 'bg-green/15 text-green' : 'bg-orange/15 text-orange'}`}>
        {ok ? <Check size={28} /> : <RotateCcw size={26} />}
      </div>
      <p className="text-3xl font-bold tabular-nums">{score} / {total}</p>
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-label-2">{text}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">{children}</div>
    </div>
  )
}

function Explanation({ c }: { c: ParticleChapter }) {
  return (
    <div className="fade-up space-y-4">
      <div className="card space-y-3 p-5">
        <p className="label">Regel</p>
        <p className="leading-relaxed">{c.rule}</p>
        {c.formRule && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl bg-fill-4 p-3 text-sm"><p className="font-semibold">Nach Konsonant (받침)</p><p lang="ko" className="text-label-2">{c.formRule.consonant}</p></div>
            <div className="rounded-2xl bg-fill-4 p-3 text-sm"><p className="font-semibold">Nach Vokal</p><p lang="ko" className="text-label-2">{c.formRule.vowel}</p></div>
          </div>
        )}
        <div className="flex gap-2 rounded-2xl bg-yellow/15 p-3 text-sm">
          <Lightbulb size={18} className="mt-0.5 shrink-0 text-orange" />
          <p><b>Merkhilfe:</b> {c.memory}</p>
        </div>
      </div>

      {c.lessons.length > 1 && (
        <div className="card space-y-2 p-5">
          <p className="label">Verwendungen</p>
          {c.lessons.map((l, i) => (
            <p key={l.id} className="text-sm"><b>{i + 1}. {l.title}:</b> <span className="text-label-2">{l.rule}</span></p>
          ))}
        </div>
      )}

      <div className="card divide-y divide-separator">
        <p className="label px-5 pt-4 pb-2">Beispiele</p>
        {c.examples.map((e) => (
          <button key={e.ko} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-fill-4" onClick={() => speak(e.ko)}>
            <span className="min-w-0 flex-1">
              <span lang="ko" className="block text-lg font-semibold">{e.ko}</span>
              <span className="block text-sm text-label-2">{e.de}</span>
            </span>
            <Volume2 size={18} className="shrink-0 text-label-3" />
          </button>
        ))}
      </div>

      <div className="card space-y-2 p-5">
        <p className="label">Typische Stolperfallen</p>
        <ul className="space-y-1.5 text-sm">
          {c.pitfalls.map((x) => <li key={x} className="flex gap-2"><X size={16} className="mt-0.5 shrink-0 text-red" /><span>{x}</span></li>)}
        </ul>
      </div>
    </div>
  )
}

// ---------- Übungsrunde ----------

interface Answered {
  task: Task
  ok: boolean
  /** Antwort je abgefragter Lücke */
  given: string[]
}

interface TranslationAnswer {
  task: Task
  answer: string
}

/** Eine Folge von Aufgaben. Übersetzungen werden nur gesammelt (Bewertung macht der Aufrufer). */
function Session({
  tasks, title, subtitle, onFinish, onCancel, finishLabel,
}: {
  tasks: Task[]
  title: string
  subtitle?: string
  onFinish: (results: TaskResult[], answered: Answered[], translations: TranslationAnswer[]) => void
  onCancel?: () => void
  finishLabel?: string
}) {
  const [i, setI] = useState(0)
  const [done, setDone] = useState<Answered[]>([])
  const [translations, setTranslations] = useState<TranslationAnswer[]>([])
  const finished = useRef(false)
  // Sätze der Runde schon mit der Gemini-Stimme vorbereiten (spielen dann ohne Wartezeit natürlich)
  useEffect(() => {
    prepareSentences(tasks.map((t) => fillSentence(t.sentence.ko)))
  }, [tasks])

  const next = (a: Answered | null, t?: TranslationAnswer) => {
    const nd = a ? [...done, a] : done
    const nt = t ? [...translations, t] : translations
    setDone(nd)
    setTranslations(nt)
    if (i + 1 >= tasks.length) {
      if (finished.current) return
      finished.current = true
      onFinish(nd.map((x) => ({ sentence: x.task.sentence, ok: x.ok, level: x.task.level })), nd, nt)
    } else setI(i + 1)
  }

  if (!tasks.length) {
    return <div className="card p-6 text-center text-label-2">Für diese Auswahl gibt es gerade keine passenden Sätze.</div>
  }
  const task = tasks[i]
  return (
    <div className="space-y-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-fill-2">
        <div className="h-full rounded-full bg-blue transition-all" style={{ width: `${(i / tasks.length) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-label-3">
          <b className="text-label-2">{title}</b> · Aufgabe {i + 1} von {tasks.length}{subtitle ? ` · ${subtitle}` : ''}
        </p>
        {onCancel && <button className="text-xs font-medium text-label-3 hover:text-label" onClick={onCancel}>Abbrechen</button>}
      </div>
      {task.kind === 'translate' ? (
        <TranslateTask key={task.key} task={task} onDone={(answer) => next(null, { task, answer })} last={i + 1 >= tasks.length} finishLabel={finishLabel} />
      ) : (
        <GapTask key={task.key} task={task} onDone={(a) => next(a)} last={i + 1 >= tasks.length} finishLabel={finishLabel} />
      )}
    </div>
  )
}

const LETTERS = ['1', '2', '3', '4']

function GapTask({ task, onDone, last, finishLabel }: { task: Task; onDone: (a: Answered) => void; last: boolean; finishLabel?: string }) {
  const parsed = useMemo(() => parseSentence(task.sentence.ko), [task.sentence.ko])
  const [step, setStep] = useState(0) // Index in task.ask
  const [given, setGiven] = useState<string[]>([])
  const [okList, setOkList] = useState<boolean[]>([])
  const [showTip, setShowTip] = useState(task.showTip)
  const [writeDone, setWriteDone] = useState(false)
  /** Ergebnis der Handschrift zwischen onResult und „Weiter“ */
  const writeOk = useRef(false)
  const complete = given.length === task.ask.length
  const gapIndex = task.ask[Math.min(step, task.ask.length - 1)]
  const gap = parsed.gaps[gapIndex]
  const allOk = complete && okList.every(Boolean)

  const answer = (value: string, ok?: boolean) => {
    if (complete) return
    const correct = ok ?? checkGap(value, gap)
    const g = [...given, value]
    const o = [...okList, correct]
    setGiven(g)
    setOkList(o)
    if (task.kind !== 'write') playSound(correct ? 'success' : 'error')
    if (g.length < task.ask.length) {
      setStep((s) => s + 1)
      setWriteDone(false)
    } else {
      speak(fillSentence(task.sentence.ko))
    }
  }

  const finish = () => onDone({ task, ok: okList.every(Boolean), given })

  // Tasten: 1–4 wählen, Enter = weiter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (complete && e.key === 'Enter') {
        e.preventDefault()
        finish()
      } else if (!complete && task.kind !== 'write') {
        const n = LETTERS.indexOf(e.key)
        const opts = task.options[step]
        if (n >= 0 && opts?.[n]) answer(opts[n])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const gapChapter = chapterOf(gap.particle)
  const usage = gap.particle === task.sentence.particle ? gapChapter.lessons.find((l) => l.id === task.sentence.lesson)?.rule : undefined
  const tips = [formTip(gap, false), task.sentence.tip, usage ?? `Gesucht: ${gapChapter.name} – ${gapChapter.short}.`].filter((t): t is string => !!t)

  return (
    <div className="space-y-4">
      <div className="card fade-up p-5 sm:p-6">
        <p className="label mb-2 text-center">
          {task.kind === 'form' ? 'Welche Form passt?' : task.kind === 'write' ? 'Schreibe die fehlende Partikel' : 'Welche Partikel gehört in die Lücke?'}
          {task.ask.length > 1 && !complete && ` · Lücke ${step + 1} von ${task.ask.length}`}
        </p>
        <SentenceView parsed={parsed} ask={task.ask} current={complete ? -1 : gapIndex} given={given} okList={okList} complete={complete} />
        <p className="mt-3 text-center text-label-2">{task.sentence.de}</p>
        {task.sentence.vocab?.length ? (
          <p className="mt-2 text-center text-xs text-label-3">
            Neue Wörter: {task.sentence.vocab.map((v) => <span key={v.ko} className="mr-2"><span lang="ko" className="font-medium text-label-2">{v.ko}</span> = {v.de}</span>)}
          </p>
        ) : null}
        {!complete && (
          <div className="mt-3 text-center">
            {showTip ? (
              <div className="fade-up mx-auto max-w-lg space-y-1 rounded-2xl bg-yellow/15 p-3 text-left text-sm">
                {tips.map((t) => <p key={t} className="flex gap-2"><Lightbulb size={15} className="mt-0.5 shrink-0 text-orange" /> {t}</p>)}
              </div>
            ) : (
              <button className="text-sm font-medium text-blue" onClick={() => setShowTip(true)}><Lightbulb size={14} className="inline" /> Tipp anzeigen</button>
            )}
          </div>
        )}
      </div>

      {!complete && task.kind !== 'write' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {task.options[step]?.map((o, n) => (
            <button key={o} className="btn-soft !py-3.5 !text-lg" lang="ko" onClick={() => answer(o)}>
              <span className="mr-1 hidden text-xs text-label-3 sm:inline">{n + 1}</span>
              {gap.base ? o : `${gap.noun.slice(-6)}${o}`}
            </button>
          ))}
        </div>
      )}

      {!complete && task.kind === 'write' && (
        <div className="card p-4 sm:p-5">
          <HangulCanvas
            key={`${task.key}-${step}`}
            target={gap.answer}
            testMode
            onResult={(correct) => { setWriteDone(true); writeOk.current = correct }}
            onNext={() => answer(gap.answer, writeOk.current)}
            nextLabel={step + 1 < task.ask.length ? 'Nächste Lücke' : 'Auswertung'}
          />
          {writeDone && gap.accept.length > 1 && (
            <p className="mt-2 text-center text-xs text-label-2">Auch richtig: <span lang="ko">{gap.accept.filter((a) => a !== gap.answer).join(', ')}</span></p>
          )}
        </div>
      )}

      {complete && (
        <div className={`card fade-up space-y-3 p-5 ${allOk ? '' : 'border border-red/30'}`}>
          <p className={`flex items-center gap-2 font-semibold ${allOk ? 'text-green' : 'text-red'}`}>
            {allOk ? <Check size={18} /> : <X size={18} />} {allOk ? 'Richtig!' : 'Nicht ganz'}
          </p>
          <button className="flex items-center gap-2 text-left text-xl font-semibold" lang="ko" onClick={() => speak(fillSentence(task.sentence.ko))}>
            {fillSentence(task.sentence.ko)} <Volume2 size={16} className="shrink-0 text-label-3" />
          </button>
          {!allOk && (
            <ul className="space-y-1 text-sm text-label-2">
              {task.ask.map((gi, k) => okList[k] ? null : <li key={gi}>• {explainGap(parsed.gaps[gi], given[k])}</li>)}
            </ul>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={finish} autoFocus>{last ? finishLabel ?? 'Auswertung' : 'Weiter'} <ArrowRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

function explainGap(g: Gap, given: string): string {
  const right = g.base ? g.answer : `${g.noun}${g.answer}`
  const tip = formTip(g) || `${chapterOf(g.particle).forms} = ${chapterOf(g.particle).short}.`
  const wrongFam = given && !g.base ? familyOf(given) : null
  const why = wrongFam && wrongFam !== g.particle ? `${chapterOf(wrongFam).forms} = ${chapterOf(wrongFam).short}; hier passt ${chapterOf(g.particle).forms} (${chapterOf(g.particle).short}).` : tip
  return `Richtig ist ${right}${g.accept.length > 1 ? ` (auch: ${g.accept.filter((a) => a !== g.answer).join(', ')})` : ''}. ${why}`
}

function SentenceView({ parsed, ask, current, given, okList, complete }: {
  parsed: ReturnType<typeof parseSentence>; ask: number[]; current: number; given: string[]; okList: boolean[]; complete: boolean
}) {
  return (
    <p lang="ko" className="text-center text-2xl font-semibold leading-[2.6rem] sm:text-3xl sm:leading-[3rem]">
      {parsed.parts.map((part, k) => {
        if ('text' in part) return <span key={k}>{part.text}</span>
        const g = parsed.gaps[part.gap]
        const pos = ask.indexOf(part.gap)
        if (pos < 0) return <span key={k} className="text-label-2">{g.answer}</span>
        const ans = given[pos]
        if (ans !== undefined) {
          const ok = okList[pos]
          return (
            <span key={k} className={`mx-0.5 rounded-lg px-1.5 ${ok ? 'bg-green/15 text-green' : 'bg-red/15 text-red'}`}>
              {ok ? g.answer : <><s className="opacity-60">{ans}</s>{complete && <span className="ml-1 text-green">{g.answer}</span>}</>}
            </span>
          )
        }
        const active = part.gap === current
        return (
          <span key={k} className={`mx-0.5 inline-flex min-w-12 items-center justify-center rounded-lg border-2 border-dashed px-1.5 align-middle text-base leading-8 ${active ? 'border-blue bg-blue/10 text-blue' : 'border-separator text-label-3'}`}>
            {g.base ? `${g.base} + ${g.particle === 'ga' ? '가' : '의'}` : '?'}
          </span>
        )
      })}
    </p>
  )
}

function TranslateTask({ task, onDone, last, finishLabel }: { task: Task; onDone: (answer: string) => void; last: boolean; finishLabel?: string }) {
  const [text, setText] = useState('')
  const [tip, setTip] = useState(false)
  const particles = [...new Set(parseSentence(task.sentence.ko).gaps.map((g) => chapterOf(g.particle).forms))]
  useEffect(() => {
    speakGerman(task.sentence.de)
    // nur beim Erscheinen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="card fade-up space-y-4 p-5 sm:p-6">
      <p className="label text-center">Übersetze ins Koreanische · wird am Ende gesammelt bewertet</p>
      <p className="text-center text-2xl font-semibold">{task.sentence.de}</p>
      {task.sentence.vocab?.length ? (
        <p className="text-center text-xs text-label-3">Wörter: {task.sentence.vocab.map((v) => `${v.ko} = ${v.de}`).join(' · ')}</p>
      ) : null}
      <textarea
        autoFocus
        lang="ko"
        rows={2}
        className="input text-center !text-xl"
        placeholder="한국어로 …"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onDone(text.trim()) } }}
        aria-label="Koreanische Übersetzung"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {tip ? (
          <p className="text-sm text-label-2"><Lightbulb size={14} className="inline text-orange" /> Partikeln im Satz: <span lang="ko">{particles.join(', ')}</span></p>
        ) : (
          <button className="text-sm font-medium text-blue" onClick={() => setTip(true)}><Lightbulb size={14} className="inline" /> Tipp anzeigen</button>
        )}
        <div className="flex gap-2">
          <button className="btn-soft" onClick={() => onDone('')}>Weiß ich nicht</button>
          <button className="btn-primary" onClick={() => onDone(text.trim())} disabled={!text.trim()}>{last ? finishLabel ?? 'Auswertung' : 'Weiter'} <ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

// ---------- Training mit KI-Sätzen, Auswertung, neuen Wörtern ----------

const NEW_WORDS_FOLDER = 'Aus Partikel-Übungen'

function TrainSession({ particles: selection, onExit }: { particles: ParticleId[]; onExit: () => void }) {
  const app = useApp()
  const { particles, updateParticles, settings, words, reviewLog } = app
  const toast = useToast()
  const key = settings.geminiApiKey.trim()
  const level = effectiveLevel(particles)
  const [phase, setPhase] = useState<'prepare' | 'run' | 'done'>('prepare')
  const [tasks, setTasks] = useState<Task[]>([])
  const [round, setRound] = useState(0)
  const [answered, setAnswered] = useState<Answered[]>([])
  const [translations, setTranslations] = useState<TranslationAnswer[]>([])
  const [grades, setGrades] = useState<TranslationGrade[] | null>(null)
  const [grading, setGrading] = useState(false)
  const stateRef = useRef(particles)
  stateRef.current = particles

  // Vorbereiten: mit Key bei Bedarf neue Sätze erzeugen (eine Anfrage), sonst direkt aus dem Pool
  useEffect(() => {
    let alive = true
    const build = (st = stateRef.current) => {
      if (!alive) return
      setTasks(buildRound(st, selection, { n: 10, level, hasKey: !!key }))
      setPhase('run')
    }
    const unseen = stateRef.current.ai.filter((s) => selection.includes(s.particle) && s.level === level && !stateRef.current.stats[s.id]).length
    if (!key || unseen >= 5) {
      build()
      return
    }
    const learnLevel = computeLevel(words, reviewLog).level
    const limits = settings.particleNewWords ? newWordLimits(learnLevel, words.length) : { perSentence: 0, perRound: 0 }
    generateSentences(key, { particles: selection, level, count: 10, vocab: pickVocab(words), newWords: limits })
      .then(({ sentences }) => {
        if (!alive) return
        let next = stateRef.current
        if (sentences.length) {
          next = { ...next, ai: [...next.ai, ...sentences].slice(-MAX_AI) }
          updateParticles((s) => ({ ...s, ai: [...s.ai, ...sentences].slice(-MAX_AI) }))
        }
        build(next)
      })
      .catch(() => {
        if (!alive) return
        toast.show({ kind: 'info', key: 'particle-ai', title: 'Sätze aus dem eingebauten Pool', text: 'Neue KI-Sätze ließen sich gerade nicht erstellen.', duration: 4000 })
        build()
      })
    return () => {
      alive = false
    }
    // eine Vorbereitung je Runde
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  const finish = (results: TaskResult[], ans: Answered[], tr: TranslationAnswer[]) => {
    updateParticles((s) => recordResults(s, results))
    setAnswered(ans)
    setTranslations(tr)
    setGrades(null)
    setPhase('done')
    if (tr.length && key) {
      setGrading(true)
      gradeTranslations(key, tr.map((t) => ({ de: t.task.sentence.de, expected: fillSentence(t.task.sentence.ko), answer: t.answer })))
        .then((g) => {
          setGrades(g)
          updateParticles((s) => recordResults(s, tr.map((t, k) => ({ sentence: t.task.sentence, ok: g[k].ok, level: t.task.level }))))
        })
        .catch(() => toast.show({ kind: 'error', key: 'particle-grade', title: 'Bewertung nicht möglich', text: 'Die Übersetzungen konnten gerade nicht bewertet werden.', duration: 5000 }))
        .finally(() => setGrading(false))
    }
  }

  if (phase === 'prepare') {
    return (
      <div className="card fade-up flex flex-col items-center gap-3 p-8 text-center">
        <Loader2 className="animate-spin text-blue" size={28} />
        <p className="font-semibold">Übungssätze werden erstellt …</p>
        <p className="text-sm text-label-2">Aus deinen eigenen Wörtern, Stufe {level} ({LEVEL_NAMES[level - 1]}).</p>
      </div>
    )
  }

  if (phase === 'run') {
    return (
      <div className="space-y-3">
        {!key && round === 0 && (
          <div className="flex items-center gap-2 rounded-2xl bg-fill-4 px-3 py-2 text-xs text-label-2">
            <KeyRound size={14} className="shrink-0" />
            <span className="flex-1">Sätze aus dem eingebauten Pool. Mit Gemini-Key entstehen Sätze aus deinen eigenen Wörtern und Übersetzungsaufgaben.</span>
            <button className="font-medium text-blue" onClick={() => navigate('/einstellungen/ki')}>Key hinzufügen</button>
          </div>
        )}
        <Session
          key={round}
          tasks={tasks}
          title={selection.length === 1 ? `Training · ${chapterOf(selection[0]).forms}` : `Gemischt · ${selection.length} Partikeln`}
          subtitle={`Stufe ${level}`}
          onFinish={finish}
          onCancel={onExit}
        />
      </div>
    )
  }

  const okCount = answered.filter((a) => a.ok).length + (grades ? grades.filter((g) => g.ok).length : 0)
  const total = answered.length + translations.length
  const wrong = answered.filter((a) => !a.ok)
  return (
    <div className="space-y-4">
      <div className="card fade-up space-y-2 p-6 text-center">
        <div className="pop-in mx-auto flex size-14 items-center justify-center rounded-full bg-blue/15 text-blue"><Sparkles size={26} /></div>
        <p className="text-3xl font-bold tabular-nums">{okCount} / {total}</p>
        <p className="text-sm text-label-2">
          {grading ? 'Übersetzungen werden bewertet …' : translations.length && !grades ? 'Übersetzungen nicht bewertet' : 'richtig'}
          {' · '}Stufe jetzt {effectiveLevel(particles)} ({LEVEL_NAMES[effectiveLevel(particles) - 1]})
          {effectiveLevel(particles) !== level && (effectiveLevel(particles) > level ? ' – aufgestiegen!' : ' – etwas leichter')}
        </p>
      </div>

      {translations.length > 0 && (
        <div className="card divide-y divide-separator">
          <p className="label px-5 pt-4 pb-2">Übersetzungen</p>
          {translations.map((t, k) => {
            const g = grades?.[k]
            return (
              <div key={t.task.key} className="space-y-1 px-5 py-3 text-sm">
                <p className="font-medium">{t.task.sentence.de}</p>
                <p lang="ko" className="flex items-center gap-2">
                  {grading ? <Loader2 size={14} className="animate-spin" /> : g ? (g.ok ? <Check size={14} className="text-green" /> : <X size={14} className="text-red" />) : null}
                  <span className={g && !g.ok ? 'text-red' : ''}>{t.answer || '(keine Antwort)'}</span>
                </p>
                {g?.feedback && <p className="text-label-2">{g.feedback}</p>}
                <p lang="ko" className="text-label-3">Muster: {fillSentence(t.task.sentence.ko)}{g?.corrected && !g.ok && g.corrected !== fillSentence(t.task.sentence.ko) ? ` · Verbessert: ${g.corrected}` : ''}</p>
              </div>
            )
          })}
        </div>
      )}

      {wrong.length > 0 && (
        <div className="card divide-y divide-separator">
          <p className="label px-5 pt-4 pb-2">Zum Merken</p>
          {wrong.map((a) => (
            <button key={a.task.key} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-fill-4" onClick={() => speak(fillSentence(a.task.sentence.ko))}>
              <span className="min-w-0 flex-1">
                <span lang="ko" className="block font-semibold">{fillSentence(a.task.sentence.ko)}</span>
                <span className="block text-sm text-label-2">{a.task.sentence.de}</span>
              </span>
              <Volume2 size={16} className="shrink-0 text-label-3" />
            </button>
          ))}
        </div>
      )}

      <NewWords sentences={[...answered.map((a) => a.task.sentence), ...translations.map((t) => t.task.sentence)]} />

      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn-soft" onClick={onExit}>Fertig</button>
        <button className="btn-primary" onClick={() => { setPhase('prepare'); setRound((r) => r + 1) }}><RotateCcw size={16} /> Nächste Runde</button>
      </div>
    </div>
  )
}

/** Neue Wörter aus KI-Sätzen per Häkchen in den Ordner „Aus Partikel-Übungen“ übernehmen */
function NewWords({ sentences }: { sentences: PoolSentence[] }) {
  const { words, folders, addFolder, addWords } = useApp()
  const known = useMemo(() => new Set(words.map((w) => w.korean)), [words])
  const candidates = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sentences) for (const v of s.vocab ?? []) if (!known.has(v.ko) && !m.has(v.ko)) m.set(v.ko, v.de)
    return [...m.entries()].map(([ko, de]) => ({ ko, de }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentences])
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.map((c) => c.ko)))
  const [saved, setSaved] = useState(0)
  if (!candidates.length) return null
  if (saved) return <div className="card p-4 text-sm text-green"><Check size={16} className="inline" /> {saved} neue Wörter im Ordner „{NEW_WORDS_FOLDER}“ gespeichert.</div>
  const save = () => {
    let folderId = folders.find((f) => f.name === NEW_WORDS_FOLDER && f.parentId === null)?.id ?? null
    if (!folderId) folderId = addFolder(NEW_WORDS_FOLDER, null)
    const now = Date.now()
    const items: WordItem[] = candidates.filter((c) => picked.has(c.ko)).map((c) => ({
      id: crypto.randomUUID(), korean: c.ko, german: c.de, wordType: /다$/.test(c.ko) ? 'verb' : 'noun', tags: ['partikel-übung'],
      createdAt: now, updatedAt: now, stats: newStats(), folderId: folderId ?? undefined,
    }))
    setSaved(addWords(items) || items.length)
  }
  return (
    <div className="card space-y-3 p-5">
      <p className="label">Neue Wörter aus dieser Runde</p>
      <div className="space-y-1">
        {candidates.map((c) => (
          <label key={c.ko} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-fill-4">
            <input type="checkbox" className="size-4 accent-[var(--color-blue)]" checked={picked.has(c.ko)} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(c.ko); else n.delete(c.ko); return n })} />
            <span lang="ko" className="font-semibold">{c.ko}</span>
            <span className="text-sm text-label-2">{c.de}</span>
          </label>
        ))}
      </div>
      <button className="btn-primary" disabled={!picked.size} onClick={save}>In „{NEW_WORDS_FOLDER}“ speichern</button>
    </div>
  )
}
