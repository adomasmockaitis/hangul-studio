import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Flame, GraduationCap, HelpCircle, Home, Repeat, SkipForward, Volume2, X } from 'lucide-react'
import { navigate } from '../lib/route'
import { setPendingLearn } from '../lib/selection'
import { speak, speakGerman } from '../lib/speech'
import { playSound } from '../lib/sounds'
import { currentStreak } from '../lib/srs'
import { gradeFrom, type Dir } from '../lib/fsrs'
import { useApp } from '../store'
import { QuestionAside } from './questionAside'
import { prepareSentences, prepareUpcomingWords } from '../lib/speech'
import { SessionBar } from './ui'
import { useActiveTest } from '../lib/activeTest'

export interface QResult {
  correct: boolean
  image?: string
  read?: string
  /** Prüfung unsicher (z. B. Input Tools) */
  uncertain?: boolean
  /** Vorlage/Strichreihenfolge war sichtbar */
  help?: boolean
  /** Multiple Choice: leichter als frei antworten */
  easyFormat?: boolean
}

export interface Q {
  key: string
  wordId: string
  /** Kurzform der Frage für die Auswertung */
  prompt: string
  /** Richtige Lösung für die Auswertung */
  solution: string
  /** Weitere Texte, die vorgelesen werden (z. B. die Beugungsform) – werden vorab erzeugt, nur lokal */
  audio?: string[]
  /** Abgefragte Richtung für die Wiederholungsplanung */
  dir?: Dir
  /** Unter dieser Antwortzeit (ms) gilt die Antwort als schnell */
  fastMs?: number
  render: (a: { onResult: (r: QResult) => void; onRevise: (correct: boolean) => void; onNext: () => void; nextLabel: string }) => ReactNode
}

/** Spielt beim Erscheinen der Auswertung einmal den Geschafft-Klang */
function CompleteSound() {
  useEffect(() => {
    playSound('complete')
  }, [])
  return null
}

interface Done extends QResult {
  q: Q
}

interface Props {
  questions: Q[]
  onDashboard: () => void
  onBack: () => void
  backLabel: string
  /** Als laufender Test anmelden (Quiz/Diktat): Wechsel ins Wörterbuch fragt dann nach */
  test?: string
}

export function Runner({ questions, onDashboard, onBack, backLabel, test }: Props) {
  const { recordReview, reviseReview, activity, words } = useApp()
  const [qs, setQs] = useState(questions)
  const [round, setRound] = useState(0)
  const [i, setI] = useState(0)
  // Die App weiß, was als Nächstes kommt: aktuelle und die nächsten 3 Wörter schon mit der Gemini-Stimme vorbereiten
  useEffect(() => {
    const next = qs.slice(i, i + 4).map((q) => words.find((w) => w.id === q.wordId)).filter((w): w is NonNullable<typeof w> => !!w)
    prepareUpcomingWords(next)
    prepareSentences(qs.slice(i, i + 4).flatMap((q) => q.audio ?? []))
    // nur beim Weiterblättern
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, qs])
  const [done, setDone] = useState<Done[]>([])
  /** Übersprungene Fragen (kommen am Ende noch einmal) */
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  useActiveTest(!!test && i < qs.length, test ?? '', onBack)
  /** Aktuelle Frage beantwortet bzw. aufgegeben */
  const [answered, setAnswered] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)
  // Antwortzeit: ab Erscheinen der Frage
  const shownAt = useRef(Date.now())
  useEffect(() => {
    shownAt.current = Date.now()
    setAnswered(false)
    setGaveUp(false)
  }, [i, round, qs])

  if (i >= qs.length) {
    const ok = done.filter((d) => d.correct).length
    const pct = done.length ? Math.round((ok / done.length) * 100) : 0
    const wrong = done.filter((d) => !d.correct)
    const { days } = currentStreak(activity)
    const tone = pct >= 80 ? '#34c759' : pct >= 50 ? '#ff9500' : '#ff3b30'
    return (
      <div className="fade-up space-y-4">
        <CompleteSound />
        <div className="card p-6 text-center">
          <div className="relative mx-auto grid h-36 w-36 place-items-center">
            <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-label-4" />
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round" stroke={tone}
                strokeDasharray={`${(pct / 100) * 326.7} 326.7`} style={{ transition: 'stroke-dasharray .8s ease' }} />
            </svg>
            <div>
              <p className="text-4xl font-bold">{pct}%</p>
              <p className="text-xs text-label-2">Erfolgsquote</p>
            </div>
          </div>
          <p className="mt-3 text-lg font-semibold">{ok} von {done.length} richtig</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-orange/15 px-3 py-1 text-sm font-semibold text-orange">
            <Flame size={15} /> Tages-Streak: {days} {days === 1 ? 'Tag' : 'Tage'}
          </p>
        </div>

        <div className="stagger card divide-y divide-separator overflow-hidden">
          {done.map((d, n) => (
            <div key={n} className="flex items-center gap-3 px-4 py-3">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${d.correct ? 'bg-green' : 'bg-red'}`}>
                {d.correct ? <Check size={15} /> : <X size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-label-2">{d.q.prompt}</p>
                <p className="text-xl font-semibold">{d.q.solution}</p>
                {!d.correct && d.read && !d.image && <p className="text-xs text-red">Deine Antwort: {d.read}</p>}
              </div>
              {!d.correct && d.image && (
                <div className="shrink-0 text-center">
                  <img src={d.image} alt="Dein Bild" className="h-14 w-24 rounded-lg border border-separator bg-white object-contain" />
                  <p className="mt-0.5 text-[10px] text-label-3">
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
              setSkipped(new Set())
            }}
          >
            <Repeat size={16} /> Falsche sofort nochmal abfragen
          </button>
          {wrong.length > 0 && (
            <button
              className="btn-soft flex-1"
              onClick={() => {
                setPendingLearn([...new Set(wrong.map((w) => w.q.wordId))])
                navigate('/ueben')
              }}
            >
              <GraduationCap size={16} /> Falsche im Lernmodus üben
            </button>
          )}
          <button className="btn-soft" onClick={onBack}>{backLabel}</button>
          <button className="btn-soft" onClick={onDashboard}><Home size={16} /> Zur Startseite</button>
        </div>
      </div>
    )
  }

  const q = qs[i]
  const isRetry = skipped.has(q.key)
  const skip = () => {
    setSkipped((s) => new Set(s).add(q.key))
    setQs((list) => [...list.slice(0, i), ...list.slice(i + 1), list[i]])
  }
  const giveUp = () => {
    recordReview(q.wordId, false, q.dir && round === 0 ? { dir: q.dir, grade: 1 } : undefined)
    setDone((d) => [...d, { correct: false, q }])
    setAnswered(true)
    setGaveUp(true)
    const ko = /[가-힣]/.test(q.solution)
    if (ko) speak(q.solution)
    else speakGerman(q.solution)
  }
  return (
    <div className="space-y-4">
      <SessionBar current={i} total={qs.length} unit="Frage" extra={round > 0 ? 'Wiederholung' : isRetry && !answered ? 'übersprungen' : undefined} onCancel={onBack} />
      {gaveUp ? (
        <div className="card fade-up p-6 text-center">
          <p className="label mb-1">Lösung</p>
          <p className="text-sm text-label-2">{q.prompt}</p>
          <button className="mx-auto mt-2 inline-flex items-center gap-2 text-4xl font-bold" onClick={() => (/[가-힣]/.test(q.solution) ? speak(q.solution) : speakGerman(q.solution))}>
            {q.solution} <Volume2 size={18} className="text-label-3" />
          </button>
          <p className="mt-2 text-xs text-label-2">Zählt als nicht gewusst – das Wort kommt bald wieder.</p>
          <button className="btn-primary mx-auto mt-5" onClick={() => setI((n) => n + 1)}>{i === qs.length - 1 ? 'Auswertung' : 'Weiter'} <ArrowRight size={16} /></button>
        </div>
      ) : (
      <div key={`${round}-${q.key}`}>
        <QuestionAside.Provider value={answered ? null : isRetry ? (
          <button className="btn-soft !py-3" onClick={giveUp}><HelpCircle size={16} /> Ich weiß es nicht</button>
        ) : i < qs.length - 1 ? (
          <button className="btn-soft !py-3" onClick={skip}><SkipForward size={16} /> Überspringen</button>
        ) : null}>
        {q.render({
          onResult: (r) => {
            const grade = gradeFrom({ correct: r.correct, ms: Date.now() - shownAt.current, fastMs: q.fastMs, help: r.help, uncertain: r.uncertain, easyFormat: r.easyFormat })
            // Sofort-Wiederholung falscher Wörter zählt nicht für die Planung (sonst gälten sie zu früh als gelernt)
            recordReview(q.wordId, r.correct, q.dir && round === 0 ? { dir: q.dir, grade } : undefined)
            setDone((d) => [...d, { ...r, q }])
            setAnswered(true)
          },
          onRevise: (correct) => {
            reviseReview(q.wordId, correct)
            setDone((d) => d.map((x) => (x.q === q ? { ...x, correct } : x)))
          },
          onNext: () => setI((n) => n + 1),
          nextLabel: i === qs.length - 1 ? 'Auswertung' : 'Weiter',
        })}
        </QuestionAside.Provider>
      </div>
      )}
    </div>
  )
}
