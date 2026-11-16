import { useMemo, useState, type ReactNode } from 'react'
import { Play } from 'lucide-react'
import { ChoiceQuestion, TypeQuestion, WriteQuestion } from '../components/questions'
import { Runner, type Q } from '../components/Runner'
import { SelectionPicker } from '../components/SelectionPicker'
import { Segmented } from '../components/ui'
import { askable, fastLimit, isDueDir, type Dir } from '../lib/fsrs'
import { resolveSelection, smartPick, SMART, type Pick, type Selection } from '../lib/selection'
import { useApp } from '../store'
import type { WordItem } from '../types'

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

/** Hör-Diktat schreibt Koreanisch → zählt für die Richtung Deutsch→Koreanisch (aktives Schreiben) */
const dirOfKind = (k: Kind): Dir => (k === 'ko-de' ? 'kode' : 'deko')
const kindOfDir = (d: Dir, direction: Direction): Kind => (direction === 'dictation' ? 'dictation' : d === 'kode' ? 'ko-de' : 'de-ko')

function makeQuestion(word: WordItem, kind: Kind, answerType: AnswerType, all: WordItem[], n: number): Q {
  const key = `${word.id}-${n}`
  const dir = dirOfKind(kind)
  if (kind === 'ko-de') {
    const others = shuffle(all.filter((w) => w.id !== word.id && w.german && w.german !== word.german)).slice(0, 3).map((w) => w.german)
    const options = shuffle([word.german, ...others])
    const choice = answerType === 'choice' && options.length >= 2
    return {
      key, wordId: word.id, prompt: word.korean, solution: word.german, dir, fastMs: fastLimit('type', word.german),
      render: (a) => choice ? <ChoiceQuestion word={word} options={options} {...a} /> : <TypeQuestion word={word} {...a} />,
    }
  }
  if (kind === 'dictation') {
    return {
      key, wordId: word.id, prompt: `Hör-Diktat (${word.german})`, solution: word.korean, dir, fastMs: fastLimit('write', word.korean) + 2000,
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
    key, wordId: word.id, prompt: word.german, solution: word.korean, dir, fastMs: fastLimit('write', word.korean),
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
  const { words, folders } = useApp()
  const [selection, setSelection] = useState<Selection>(SMART)
  const [count, setCount] = useState(10)
  const [direction, setDirection] = useState<Direction>('de-ko')
  const [answerType, setAnswerType] = useState<AnswerType>('type')
  const [questions, setQuestions] = useState<Q[] | null>(null)

  const smartDir: Dir | 'both' = direction === 'mixed' ? 'both' : direction === 'ko-de' ? 'kode' : 'deko'
  const now = Date.now()
  // Für Smart: was die App jetzt abfragen würde; sonst die feste Auswahl
  const picks: Pick[] = useMemo(() => {
    if (selection.mode === 'smart') return smartPick(words, smartDir, count || 50, now)
    const list = resolveSelection(selection, words, folders).filter(askable)
    return list.map((w) => ({ word: w, dir: smartDir === 'both' ? (Math.random() < 0.5 ? 'deko' : 'kode') : smartDir }) as Pick)
    // now bewusst nicht als Abhängigkeit: die Vorschau soll nicht ständig springen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, folders, selection, smartDir, count])
  const dueCount = useMemo(() => words.filter((w) => askable(w) && (smartDir === 'both' ? isDueDir(w, 'deko', now) || isDueDir(w, 'kode', now) : isDueDir(w, smartDir, now))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, smartDir])

  const total = selection.mode === 'smart' ? picks.length : Math.min(picks.length, count || picks.length)

  const start = () => {
    const chosen = selection.mode === 'smart' ? shuffle(picks) : shuffle(picks).slice(0, count || picks.length)
    setQuestions(chosen.map((p, n) => makeQuestion(p.word, kindOfDir(p.dir, direction), answerType, words, n)))
  }

  if (questions) {
    return <Runner questions={questions} onDashboard={onDashboard} onBack={() => setQuestions(null)} backLabel="Neue Auswahl" />
  }

  const usesChoice = direction === 'ko-de' || direction === 'mixed'
  return (
    <div className="space-y-4">
      <Section title="Welche Wörter?">
        <SelectionPicker
          value={selection}
          onChange={setSelection}
          words={words}
          folders={folders}
          smartNote={`${dueCount} ${dueCount === 1 ? 'Wort ist' : 'Wörter sind'} in dieser Richtung fällig. Die App fragt zuerst die ab, die du am ehesten vergisst, dazu bis zu 5 neue.`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-label-2">Anzahl</span>
          <Segmented<string>
            label="Anzahl"
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            options={[{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '0', label: 'Alle' }]}
          />
        </div>
      </Section>

      <Section title="Abfragerichtung">
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['de-ko', 'Deutsch → Koreanisch', 'Schreiben im Zeichenfeld'],
            ['ko-de', 'Koreanisch → Deutsch', 'Tippen oder Multiple Choice'],
            ['mixed', 'Gemischt', 'Smart: je Wort die dringendere Richtung'],
            ['dictation', 'Hör-Diktat', 'Nur Audio → Koreanisch schreiben'],
          ] as [Direction, string, string][]).map(([v, t, d]) => (
            <button key={v} onClick={() => setDirection(v)}
              className={`rounded-xl border p-3 text-left transition ${direction === v ? 'border-blue bg-blue/10' : 'border-separator hover:bg-fill-4'}`}>
              <p className="font-medium">{t}</p>
              <p className="text-xs text-label-2">{d}</p>
            </button>
          ))}
        </div>
        {usesChoice && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-label-2">Antwort bei Koreanisch → Deutsch:</span>
            <Segmented<AnswerType>
              label="Antwortart"
              value={answerType}
              onChange={setAnswerType}
              options={[{ value: 'type', label: 'Eintippen' }, { value: 'choice', label: 'Multiple Choice' }]}
            />
          </div>
        )}
      </Section>

      <button className="btn-primary w-full !py-3.5 !text-base" disabled={!total} onClick={start}>
        <Play size={18} fill="currentColor" /> Quiz starten ({total} {total === 1 ? 'Frage' : 'Fragen'})
      </button>
    </div>
  )
}
