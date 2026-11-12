import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, GraduationCap, Play, Volume2 } from 'lucide-react'
import { HangulCanvas } from '../components/HangulCanvas'
import { DoneCard } from '../components/DoneCard'
import { WriteQuestion } from '../components/questions'
import { Runner, type Q } from '../components/Runner'
import { PageHeader, Segmented } from '../components/ui'
import { speak } from '../lib/speech'
import { useApp } from '../store'
import { CONJUGATION_KEYS, CONJUGATION_LABELS, type ConjugationKey, type WordItem } from '../types'

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
      {show === 'both' && <span className="mx-2 text-black/30 dark:text-white/30">·</span>}
      {show !== 'ko' && <span className={show === 'both' ? 'text-black/60 dark:text-white/60' : ''}>{word.german}</span>}
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
        render: (a) => (
          <WriteQuestion
            {...a}
            target={p.answer}
            prompt={
              <>
                <p className="label mb-2">Bilde die Form</p>
                <div className="mx-auto mb-3 inline-block rounded-2xl bg-[#007aff]/10 px-4 py-2">
                  <p className="font-semibold text-[#007aff]">{CONJUGATION_LABELS[p.form].label}</p>
                  <p className="text-xs text-[#007aff]/80">{CONJUGATION_LABELS[p.form].hint}</p>
                </div>
                <p className="text-sm text-black/50 dark:text-white/50">von</p>
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
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Beugungs-Test" />
        <Runner questions={questions} onDashboard={onDashboard} onBack={() => setQuestions(null)} backLabel="Neue Konfiguration" />
      </div>
    )
  }

  // ---------- Lernmodus ----------
  if (learn) {
    const p = learn[Math.min(idx, learn.length - 1)]
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Beugungen lernen"
          right={<button className="btn-soft" onClick={() => setLearn(null)}><ArrowLeft size={16} /> Konfiguration</button>}
        />
        <div className="mb-4 flex items-center justify-between">
          <button className="btn-soft" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ArrowLeft size={16} /></button>
          <span className="text-sm tabular-nums text-black/55 dark:text-white/55">{idx + 1} / {learn.length}</span>
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
            <div className="mx-auto my-3 inline-block rounded-2xl bg-[#007aff]/10 px-4 py-2">
              <p className="font-semibold text-[#007aff]">{CONJUGATION_LABELS[p.form].label}</p>
              <p className="text-xs text-[#007aff]/80">{CONJUGATION_LABELS[p.form].hint}</p>
            </div>
            <button className="mx-auto flex items-center gap-2 text-5xl font-bold" onClick={() => speak(p.answer)}>
              {p.answer} <Volume2 size={20} className="text-black/40 dark:text-white/40" />
            </button>
            <p className="mt-2 text-xs text-black/45 dark:text-white/45">Schreibe die Form unten zum Üben nach.</p>
          </div>
          <div className="card p-4 sm:p-5">
            <HangulCanvas
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
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Beugungs-Trainer" subtitle="Verben & Adjektive per Hand in die gefragte Form bringen" />
      <div className="space-y-4">
        <div className="card p-4">
          <p className="label mb-2">Modus</p>
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[{ value: 'test', label: <><Play size={14} /> Testmodus</> }, { value: 'learn', label: <><GraduationCap size={14} /> Lernmodus</> }]}
          />
        </div>
        <div className="card p-4">
          <p className="label mb-2">Beugungsformen</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONJUGATION_KEYS.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl bg-black/[0.04] px-3 py-2.5 dark:bg-white/5">
                <input type="checkbox" className="accent-[#007aff]" checked={forms.includes(k)} onChange={() => toggle(k)} />
                <span className="text-sm">
                  <span className="font-medium">{CONJUGATION_LABELS[k].label}</span>
                  <span className="block text-xs text-black/50 dark:text-white/50">{CONJUGATION_LABELS[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <p className="label mb-2">Grundwort in der Frage</p>
          <Segmented<Show>
            value={show}
            onChange={setShow}
            options={[{ value: 'de', label: 'Deutsch' }, { value: 'ko', label: 'Koreanisch' }, { value: 'both', label: 'Beides' }]}
          />
          {mode === 'test' && (
            <>
              <p className="label mb-2 mt-4">Anzahl Aufgaben</p>
              <Segmented<string>
                value={String(count)}
                onChange={(v) => setCount(Number(v))}
                options={[{ value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' }, { value: '0', label: 'Alle' }]}
              />
            </>
          )}
        </div>

        {pool.length === 0 ? (
          <div className="card p-5 text-center text-sm text-black/55 dark:text-white/55">
            Keine passenden Verben/Adjektive mit den gewählten Beugungen. Ergänze sie im Wörterbuch.
          </div>
        ) : (
          <button className="btn-primary w-full !py-3.5 !text-base" onClick={start}>
            <Play size={18} fill="currentColor" /> {mode === 'test' ? 'Test starten' : 'Lernen starten'} ({mode === 'test' ? Math.min(pool.length, count || pool.length) : pool.length} Aufgaben)
          </button>
        )}
      </div>
    </div>
  )
}
