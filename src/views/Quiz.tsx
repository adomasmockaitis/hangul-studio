import { useMemo, useState, type ReactNode } from 'react'
import { Play } from 'lucide-react'
import { ChoiceQuestion, TypeQuestion, WriteQuestion } from '../components/questions'
import { Runner, type Q } from '../components/Runner'
import { Segmented } from '../components/ui'
import { buildSmartTest, DAY } from '../lib/srs'
import { useApp } from '../store'
import type { WordItem } from '../types'

type Selection = 'smart' | 'custom'
type Direction = 'de-ko' | 'ko-de' | 'mixed' | 'dictation'
type AnswerType = 'type' | 'choice'
type Kind = 'de-ko' | 'ko-de' | 'dictation'

const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function makeQuestion(word: WordItem, kind: Kind, answerType: AnswerType, all: WordItem[], n: number): Q {
  const key = `${word.id}-${n}`
  if (kind === 'ko-de') {
    const others = shuffle(all.filter((w) => w.id !== word.id && w.german !== word.german)).slice(0, 3).map((w) => w.german)
    const options = shuffle([word.german, ...others])
    const choice = answerType === 'choice' && options.length >= 2
    return {
      key, wordId: word.id, prompt: word.korean, solution: word.german,
      render: (a) => choice ? <ChoiceQuestion word={word} options={options} {...a} /> : <TypeQuestion word={word} {...a} />,
    }
  }
  if (kind === 'dictation') {
    return {
      key, wordId: word.id, prompt: `Hör-Diktat (${word.german})`, solution: word.korean,
      render: (a) => (
        <WriteQuestion
          {...a}
          target={word.korean}
          audioPrompt={word.korean}
          autoPlay
          solutionNote={word.german}
          prompt={<><p className="label mb-1">Hör-Diktat</p><p className="text-xl font-semibold">Höre zu und schreibe das Wort auf Koreanisch</p></>}
        />
      ),
    }
  }
  return {
    key, wordId: word.id, prompt: word.german, solution: word.korean,
    render: (a) => (
      <WriteQuestion
        {...a}
        target={word.korean}
        prompt={<><p className="label mb-1">Schreibe auf Koreanisch</p><h2 className="text-4xl font-bold tracking-tight">{word.german}</h2></>}
      />
    ),
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="label mb-2">{title}</p>
      {children}
    </div>
  )
}

export function QuizSetup({ onDashboard }: { onDashboard: () => void }) {
  const { words } = useApp()
  const [selection, setSelection] = useState<Selection>('smart')
  const [tags, setTags] = useState<string[]>([])
  const [since, setSince] = useState<'all' | '7' | '30'>('all')
  const [count, setCount] = useState(10)
  const [direction, setDirection] = useState<Direction>('de-ko')
  const [answerType, setAnswerType] = useState<AnswerType>('type')
  const [questions, setQuestions] = useState<Q[] | null>(null)

  const allTags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words])

  const pool = useMemo(() => {
    if (selection === 'smart') return buildSmartTest(words, 15)
    const cutoff = since === 'all' ? 0 : Date.now() - Number(since) * DAY
    return words.filter((w) => (!tags.length || w.tags.some((t) => tags.includes(t))) && w.createdAt >= cutoff)
  }, [words, selection, tags, since])

  const start = () => {
    const chosen = selection === 'smart' ? shuffle(pool) : shuffle(pool).slice(0, count || pool.length)
    setQuestions(
      chosen.map((w, n) => {
        const kind: Kind = direction === 'mixed' ? (Math.random() < 0.5 ? 'de-ko' : 'ko-de') : direction
        return makeQuestion(w, kind, answerType, words, n)
      }),
    )
  }

  if (questions) {
    return <Runner questions={questions} onDashboard={onDashboard} onBack={() => setQuestions(null)} backLabel="Neue Konfiguration" />
  }

  const usesChoice = direction === 'ko-de' || direction === 'mixed'
  return (
    <div className="space-y-4">
      <Section title="Wort-Auswahl">
        <Segmented<Selection>
          value={selection}
          onChange={setSelection}
          options={[{ value: 'smart', label: 'Daily Smart Test' }, { value: 'custom', label: 'Eigene Auswahl' }]}
        />
        {selection === 'smart' ? (
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">
            15 Wörter: hohe Fehlerquote, noch nie geübt oder lange nicht wiederholt.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button key={t} className={`${tags.includes(t) ? 'btn-primary' : 'btn-soft'} !px-2.5 !py-1 text-xs`}
                  onClick={() => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>{t}</button>
              ))}
              {!allTags.length && <p className="text-sm text-black/50">Keine Tags vorhanden.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Segmented<'all' | '7' | '30'>
                value={since}
                onChange={setSince}
                options={[{ value: 'all', label: 'Alle' }, { value: '7', label: 'Letzte 7 Tage' }, { value: '30', label: 'Letzte 30 Tage' }]}
              />
              <Segmented<string>
                value={String(count)}
                onChange={(v) => setCount(Number(v))}
                options={[{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '0', label: 'Alle' }]}
              />
            </div>
            <p className="text-sm text-black/55 dark:text-white/55">{pool.length} Wörter passen zum Filter.</p>
          </div>
        )}
      </Section>

      <Section title="Abfragerichtung">
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['de-ko', 'Deutsch → Koreanisch', 'Schreiben im Zeichenfeld'],
            ['ko-de', 'Koreanisch → Deutsch', 'Tippen oder Multiple Choice'],
            ['mixed', 'Gemischt', 'Beide Richtungen zufällig'],
            ['dictation', 'Hör-Diktat', 'Nur Audio → Koreanisch schreiben'],
          ] as [Direction, string, string][]).map(([v, t, d]) => (
            <button key={v} onClick={() => setDirection(v)}
              className={`rounded-xl border p-3 text-left transition ${direction === v ? 'border-[#007aff] bg-[#007aff]/10' : 'border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/5'}`}>
              <p className="font-medium">{t}</p>
              <p className="text-xs text-black/50 dark:text-white/50">{d}</p>
            </button>
          ))}
        </div>
        {usesChoice && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm text-black/60 dark:text-white/60">Antwort bei Koreanisch → Deutsch:</span>
            <Segmented<AnswerType>
              value={answerType}
              onChange={setAnswerType}
              options={[{ value: 'type', label: 'Eintippen' }, { value: 'choice', label: 'Multiple Choice' }]}
            />
          </div>
        )}
      </Section>

      <button className="btn-primary w-full !py-3.5 !text-base" disabled={!pool.length} onClick={start}>
        <Play size={18} fill="currentColor" /> Quiz starten ({selection === 'smart' ? pool.length : Math.min(pool.length, count || pool.length)} Fragen)
      </button>
    </div>
  )
}
