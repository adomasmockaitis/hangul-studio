import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { ChoiceQuestion, TypeQuestion, WriteQuestion } from '../components/questions'
import { Runner, type Q } from '../components/Runner'
import { SelectionPicker } from '../components/SelectionPicker'
import { Group, Segmented } from '../components/ui'
import { askable, fastLimit, type Dir } from '../lib/fsrs'
import { EXTRA_SIZE, resolveSelection, smartPick, smartSummary, SMART, SMART_MAX, weakestPick, type Pick, type Selection } from '../lib/selection'
import { navigate } from '../lib/route'
import { activeOnly } from '../lib/folders'
import { useApp } from '../store'
import type { WordItem } from '../types'

type Direction = 'de-ko' | 'ko-de' | 'mixed'
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
const kindOfDir = (d: Dir): Kind => (d === 'kode' ? 'ko-de' : 'de-ko')

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
        speakPrompt={word.german}
        prompt={<><p className="label mb-1">Schreibe auf Koreanisch</p><h2 className="text-4xl font-bold tracking-tight">{word.german}</h2></>}
      />
    ),
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Group title={title}>{children}</Group>
}

export function QuizSetup({ onDashboard, extra = false }: { onDashboard: () => void; /** von der Startseite: gleich eine Extra-Runde starten */ extra?: boolean }) {
  const { words, folders } = useApp()
  const [selection, setSelection] = useState<Selection>(SMART)
  const [count, setCount] = useState(10)
  const [direction, setDirection] = useState<Direction>('de-ko')
  const [answerType, setAnswerType] = useState<AnswerType>('type')
  const [questions, setQuestions] = useState<Q[] | null>(null)

  const smartDir: Dir | 'both' = direction === 'mixed' ? 'both' : direction === 'ko-de' ? 'kode' : 'deko'
  const now = Date.now()
  // Smart: alle bereiten Wörter (ohne Obergrenze gezählt, pro Runde höchstens SMART_MAX)
  const ready = useMemo(() => (selection.mode === 'smart' ? smartPick(activeOnly(words, folders), smartDir, Infinity, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, folders, selection, smartDir])
  // Für Smart: was die App jetzt abfragen würde; sonst die feste Auswahl
  const picks: Pick[] = useMemo(() => {
    if (selection.mode === 'smart') return ready.slice(0, SMART_MAX)
    const list = resolveSelection(selection, words, folders).filter(askable)
    return list.map((w) => ({ word: w, dir: smartDir === 'both' ? (Math.random() < 0.5 ? 'deko' : 'kode') : smartDir }) as Pick)
    // now bewusst nicht als Abhängigkeit: die Vorschau soll nicht ständig springen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, folders, selection, smartDir, ready])

  const total = selection.mode === 'smart' ? picks.length : Math.min(picks.length, count || picks.length)

  const start = () => {
    const chosen = selection.mode === 'smart' ? shuffle(picks) : shuffle(picks).slice(0, count || picks.length)
    setQuestions(chosen.map((p, n) => makeQuestion(p.word, kindOfDir(p.dir), answerType, words, n)))
  }
  /** Nichts dran: Extra-Runde mit den Wörtern, die du am schlechtesten kannst */
  const startExtra = () => {
    const chosen = shuffle(weakestPick(activeOnly(words, folders), smartDir, EXTRA_SIZE, Date.now()))
    if (chosen.length) setQuestions(chosen.map((p, n) => makeQuestion(p.word, kindOfDir(p.dir), answerType, words, n)))
  }
  const smartEmpty = selection.mode === 'smart' && ready.length === 0
  useEffect(() => {
    if (!extra) return
    navigate('/ueben/quiz', true)
    if (!questions) startExtra()
    // nur beim Aufruf von der Startseite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra])

  if (questions) {
    return <Runner questions={questions} onDashboard={onDashboard} onBack={() => setQuestions(null)} backLabel="Neue Auswahl" test="Quiz" />
  }

  const usesChoice = direction === 'ko-de' || direction === 'mixed'
  return (
    <div className="space-y-6">
      <Section title="Welche Wörter?">
        <SelectionPicker
          value={selection}
          onChange={setSelection}
          words={words}
          folders={folders}
          smartNote={ready.length ? `${ready.length} bereit: ${smartSummary(ready)}.${ready.length > SMART_MAX ? ` Diese Runde: die ${SMART_MAX} dringendsten.` : ''} Smart lädt alle Wörter, die gerade dran sind – fällig, oft falsch oder lange nicht geübt –, dazu bis zu 5 neue. Nur Ordner, die du aktiv lernst.` : `Gerade ist nichts dran. Smart lädt alle Wörter, die gerade dran sind – fällig, oft falsch oder lange nicht geübt –, dazu bis zu 5 neue. Nur Ordner, die du aktiv lernst.`}
        />
        {selection.mode !== 'smart' && <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-label-2">Anzahl</span>
          <Segmented<string>
            label="Anzahl"
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            options={[{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '0', label: 'Alle' }]}
          />
        </div>}
      </Section>

      <Section title="Abfragerichtung">
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['de-ko', 'Deutsch → Koreanisch', 'Schreiben im Zeichenfeld'],
            ['ko-de', 'Koreanisch → Deutsch', 'Tippen oder Multiple Choice'],
            ['mixed', 'Gemischt', 'Smart: je Wort die dringendere Richtung'],
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

      {smartEmpty ? (
        <>
          <button className="btn-primary w-full !py-3.5 !text-base" onClick={startExtra} disabled={!activeOnly(words, folders).some(askable)}>
            <RotateCcw size={18} /> Nochmal wiederholen ({Math.min(EXTRA_SIZE, activeOnly(words, folders).filter(askable).length)} schwächste)
          </button>
          <p className="text-center text-xs text-label-2">Alles wiederholt – die Extra-Runde nimmt die Wörter, die du am häufigsten falsch machst.</p>
        </>
      ) : (
        <button className="btn-primary w-full !py-3.5 !text-base" disabled={!total} onClick={start}>
          <Play size={18} fill="currentColor" /> Quiz starten ({total} {total === 1 ? 'Frage' : 'Fragen'})
        </button>
      )}
    </div>
  )
}
