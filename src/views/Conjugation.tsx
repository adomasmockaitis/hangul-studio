import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Volume2 } from 'lucide-react'
import { HangulCanvas } from '../components/HangulCanvas'
import { DoneCard } from '../components/DoneCard'
import { WriteQuestion } from '../components/questions'
import { Runner, type Q } from '../components/Runner'
import { CountPicker, Group, OptionCards, Segmented, StartButton, SubOption } from '../components/ui'
import { speak, prepareSentences } from '../lib/speech'
import { useApp } from '../store'
import { CONJUGATION_KEYS, CONJUGATION_LABELS, type ConjugationKey, type WordItem } from '../types'
import { SlowButton } from '../components/SlowButton'

type Show = 'de' | 'ko' | 'both'
type Mode = 'learn' | 'test'

interface Pair {
  word: WordItem
  form: ConjugationKey
  answer: string
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function BaseWord({ word, show, size = 'text-4xl' }: { word: WordItem; show: Show; size?: string }) {
  return (
    <p className={`${size} font-bold tracking-tight`}>
      {show !== 'de' && <span>{word.korean}</span>}
      {show === 'both' && <span className="mx-2 text-label-3">·</span>}
      {show !== 'ko' && <span className={show === 'both' ? 'text-label-2' : ''}>{word.german}</span>}
    </p>
  )
}

export function ConjugationTrainer({ onDashboard }: { onDashboard: () => void }) {
  const { words, settings } = useApp()
  const [forms, setForms] = useState<ConjugationKey[]>(settings.activeConjugations)
  const [show, setShow] = useState<Show>('de')
  const [mode, setMode] = useState<Mode>('test')
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<Q[] | null>(null)
  const [learn, setLearn] = useState<Pair[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [learnDone, setLearnDone] = useState(false)

  const pool = useMemo<Pair[]>(
    () =>
      words
        .filter((w) => w.wordType === 'verb' || w.wordType === 'adjective')
        .flatMap((word) => forms.filter((form) => word.conjugations?.[form]).map((form) => ({ word, form, answer: word.conjugations![form]! }))),
    [words, forms],
  )

  const toggle = (k: ConjugationKey) =>
    setForms((f) => (f.includes(k) ? (f.length > 1 ? f.filter((x) => x !== k) : f) : CONJUGATION_KEYS.filter((x) => x === k || f.includes(x))))

  const start = () => {
    if (mode === 'learn') {
      setLearn(pool)
      setIdx(0)
      setLearnDone(false)
      return
    }
    const picked = shuffle(pool).slice(0, count || pool.length)
    setQuestions(
      picked.map((p, n) => ({
        key: `${p.word.id}-${p.form}-${n}`,
        wordId: p.word.id,
        prompt: `${CONJUGATION_LABELS[p.form].label}: ${p.word.korean} (${p.word.german})`,
        solution: p.answer,
        audio: [p.answer],
        render: (a) => (
          <WriteQuestion
            {...a}
            target={p.answer}
            speakSolution
            prompt={
              <>
                <p className="label mb-2">Bilde die Form</p>
                <div className="mx-auto mb-3 inline-block rounded-2xl bg-blue/10 px-4 py-2">
                  <p className="font-semibold text-blue">{CONJUGATION_LABELS[p.form].label}</p>
                  <p className="text-xs text-blue/80">{CONJUGATION_LABELS[p.form].hint}</p>
                </div>
                <p className="text-sm text-label-2">von</p>
                <BaseWord word={p.word} show={show} />
              </>
            }
          />
        ),
      })),
    )
  }

  // ---------- Test läuft ----------
  if (questions) {
    return (
      <div>
        <Runner questions={questions} onDashboard={onDashboard} onBack={() => setQuestions(null)} backLabel="Neue Konfiguration" />
      </div>
    )
  }

  // ---------- Lernmodus ----------
  if (learn) {
    // aktuelle und die nächsten 3 Formen schon mit der Gemini-Stimme vorbereiten (nur lokal)
    prepareSentences(learn.slice(idx, idx + 4).map((x) => x.answer))
    const p = learn[Math.min(idx, learn.length - 1)]
    return (
      <div>
        <div className="mb-4"><button className="btn-soft" onClick={() => setLearn(null)}><ArrowLeft size={16} /> Konfiguration</button></div>
        <div className="mb-4 flex items-center justify-between">
          <button className="btn-soft" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ArrowLeft size={16} /></button>
          <span className="text-sm tabular-nums text-label-2">{idx + 1} / {learn.length}</span>
          <button className="btn-soft" disabled={idx >= learn.length - 1} onClick={() => setIdx(idx + 1)}><ArrowRight size={16} /></button>
        </div>
        {learnDone ? (
          <DoneCard
            text={`Du bist alle ${learn.length} Formen durchgegangen.`}
            onDashboard={onDashboard}
            onRepeat={() => { setIdx(0); setLearnDone(false) }}
          />
        ) : (
        <div className="space-y-5" key={`${p.word.id}-${p.form}`}>
          <div className="card fade-up p-6 text-center">
            <BaseWord word={p.word} show={show} />
            <div className="mx-auto my-3 inline-block rounded-2xl bg-blue/10 px-4 py-2">
              <p className="font-semibold text-blue">{CONJUGATION_LABELS[p.form].label}</p>
              <p className="text-xs text-blue/80">{CONJUGATION_LABELS[p.form].hint}</p>
            </div>
            <button className="mx-auto flex items-center gap-2 text-5xl font-bold" onClick={() => speak(p.answer)}>
              {p.answer} <Volume2 size={20} className="text-label-3" />
            </button>
            <div className="mt-2 flex justify-center"><SlowButton text={p.answer} className="btn-soft !min-h-9 !px-2.5 !py-1 text-xs" /></div>
            <p className="mt-2 text-xs text-label-3">Schreibe die Form unten zum Üben nach.</p>
          </div>
          <div className="card p-4 sm:p-5 landscape-phone:!p-3">
            {/* Wie bei der Lernkarte: Form und Wort direkt am Zeichenfeld, bleibt beim Scrollen sichtbar */}
            <div className="glass top-2 z-10 mb-4 flex items-center justify-between gap-3 rounded-[22px] px-4 py-3 md:sticky landscape-phone:hidden">
              <div className="min-w-0">
                <p className="label">{CONJUGATION_LABELS[p.form].label}</p>
                <p className="truncate text-2xl font-bold leading-tight sm:text-3xl">{p.word.german}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span lang="ko" className="text-3xl font-bold sm:text-4xl">{p.answer}</span>
                <button className="btn-soft !p-2" onClick={() => speak(p.answer)} aria-label="Anhören"><Volume2 size={18} /></button>
              </div>
            </div>
            {/* Querformat: schmale Leiste oben */}
            <div className="glass mb-2 hidden items-center gap-3 rounded-[20px] py-1.5 pl-4 pr-1.5 landscape-phone:flex">
              <span lang="ko" className="shrink-0 text-3xl font-bold leading-none">{p.answer}</span>
              <span className="min-w-0 truncate text-xl font-semibold text-label-2">{p.word.german} · {CONJUGATION_LABELS[p.form].label}</span>
              <div className="landscape-compact ml-auto flex shrink-0 items-center gap-1.5">
                <button className="btn-soft" onClick={() => speak(p.answer)} aria-label="Anhören" title="Anhören"><Volume2 size={16} /></button>
                <SlowButton text={p.answer} label={false} />
              </div>
            </div>
            <HangulCanvas
              key={`${p.word.id}-${p.form}`}
              practice
              target={p.answer}
              onResult={() => undefined}
              onNext={idx < learn.length - 1 ? () => setIdx(idx + 1) : () => setLearnDone(true)}
              nextLabel={idx < learn.length - 1 ? 'Nächste Form' : 'Abschließen'}
            />
          </div>
        </div>
        )}
      </div>
    )
  }

  // ---------- Konfiguration ----------
  return (
    <div>
      <div className="space-y-6">
        <Group title="Welche Formen?">
          <div className="grid gap-2 sm:grid-cols-2">
            {CONJUGATION_KEYS.map((k) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-fill-4 px-3 py-2.5">
                <input type="checkbox" className="accent-blue" checked={forms.includes(k)} onChange={() => toggle(k)} />
                <span className="text-sm">
                  <span className="font-medium">{CONJUGATION_LABELS[k].label}</span>
                  <span className="block text-xs text-label-2">{CONJUGATION_LABELS[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
          {mode === 'test' && <CountPicker value={count} onChange={setCount} options={[5, 10, 20, 0]} />}
        </Group>

        <Group title="Wie üben?">
          <OptionCards<Mode>
            label="Übungsart"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'test', title: 'Testen', text: 'Formen selbst bilden und schreiben – wird geprüft' },
              { value: 'learn', title: 'Lernen', text: 'Formen ansehen, anhören und nachschreiben' },
            ]}
          />
          <SubOption label="Grundwort in der Frage">
            <Segmented<Show>
              label="Grundwort in der Frage"
              value={show}
              onChange={setShow}
              options={[{ value: 'de', label: 'Deutsch' }, { value: 'ko', label: 'Koreanisch' }, { value: 'both', label: 'Beides' }]}
            />
          </SubOption>
        </Group>

        {pool.length === 0 ? (
          <div className="card p-5 text-center text-sm text-label-2">
            Keine passenden Verben/Adjektive mit den gewählten Beugungen. Ergänze sie im Wörterbuch.
          </div>
        ) : (
          <StartButton onClick={start}>
            {mode === 'test' ? 'Test starten' : 'Lernen starten'} ({mode === 'test' ? Math.min(pool.length, count || pool.length) : pool.length} Aufgaben)
          </StartButton>
        )}
      </div>
    </div>
  )
}
