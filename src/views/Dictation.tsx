import { useMemo, useState, type ReactNode } from 'react'
import { Ear, PenLine, Play, Type } from 'lucide-react'
import { ListenTypeQuestion, WriteQuestion } from '../components/questions'
import { Runner, type Q } from '../components/Runner'
import { SelectionPicker } from '../components/SelectionPicker'
import { Group, Segmented } from '../components/ui'
import { askable, fastLimit, type Dir } from '../lib/fsrs'
import { resolveSelection, smartPick, smartSummary, SMART, SMART_MAX, type Selection } from '../lib/selection'
import { activeOnly } from '../lib/folders'
import { useApp } from '../store'
import type { WordItem } from '../types'

/** ko = Koreanisch hören → Koreanisch schreiben; de = Koreanisch hören → Deutsch tippen */
type Variant = 'ko' | 'de'

/** Schreiben zählt für Deutsch→Koreanisch (aktives Schreiben), Verstehen für Koreanisch→Deutsch */
const DIR_OF: Record<Variant, Dir> = { ko: 'deko', de: 'kode' }

const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function makeQuestion(word: WordItem, variant: Variant, n: number): Q {
  const key = `${word.id}-${n}`
  if (variant === 'de') {
    return {
      key, wordId: word.id, prompt: `Gehört: ${word.korean}`, solution: word.german, dir: 'kode', fastMs: fastLimit('type', word.german) + 2000,
      render: (a) => <ListenTypeQuestion word={word} {...a} />,
    }
  }
  return {
    key, wordId: word.id, prompt: `Hör-Diktat (${word.german})`, solution: word.korean, dir: 'deko', fastMs: fastLimit('write', word.korean) + 2000,
    render: (a) => (
      <WriteQuestion
        {...a}
        target={word.korean}
        audioPrompt={word.korean}
        autoPlay
        solutionNote={word.german}
        prompt={<><p className="label mb-1">Hör-Diktat</p><p className="text-xl font-semibold">Höre zu und schreibe das Wort auf Koreanisch</p><p className="mt-1 text-sm text-label-2">Von Hand oder per Tastatur („Tastatur statt Zeichnen“)</p></>}
      />
    ),
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Group title={title}>{children}</Group>
}

/** Diktat: Koreanisch hören und aufschreiben bzw. die Bedeutung tippen */
export function DictationSetup({ onDashboard }: { onDashboard: () => void }) {
  const { words, folders } = useApp()
  const [variant, setVariant] = useState<Variant>('ko')
  const [selection, setSelection] = useState<Selection>(SMART)
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<Q[] | null>(null)
  const dir = DIR_OF[variant]

  // Smart: alle bereiten Wörter (ohne Obergrenze gezählt, pro Runde höchstens SMART_MAX)
  const ready = useMemo(() => (selection.mode === 'smart' ? smartPick(activeOnly(words, folders), dir, Infinity, Date.now()) : []), [words, folders, selection, dir])
  const pool: WordItem[] = useMemo(() => {
    if (selection.mode === 'smart') return ready.slice(0, SMART_MAX).map((p) => p.word)
    return resolveSelection(selection, words, folders).filter(askable)
  }, [words, folders, selection, ready])
  const total = selection.mode === 'smart' ? pool.length : Math.min(pool.length, count || pool.length)

  const start = () => {
    const chosen = selection.mode === 'smart' ? shuffle(pool) : shuffle(pool).slice(0, count || pool.length)
    setQuestions(chosen.map((w, n) => makeQuestion(w, variant, n)))
  }

  if (questions) return <Runner questions={questions} onDashboard={onDashboard} onBack={() => setQuestions(null)} backLabel="Neue Auswahl" test="Diktat" />

  return (
    <div className="space-y-6">
      <Section title="Was möchtest du üben?">
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ['ko', PenLine, 'Hören → Koreanisch schreiben', 'Das gehörte Wort von Hand oder per Tastatur aufschreiben'],
            ['de', Type, 'Hören → Bedeutung tippen', 'Hörverstehen: die deutsche Bedeutung eintippen'],
          ] as [Variant, typeof PenLine, string, string][]).map(([v, Icon, t, d]) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              aria-pressed={variant === v}
              className={`flex gap-3 rounded-xl border p-3 text-left transition ${variant === v ? 'border-blue bg-blue/10' : 'border-separator hover:bg-fill-4'}`}
            >
              <Icon size={20} className="mt-0.5 shrink-0 text-blue" />
              <span>
                <span className="block font-medium">{t}</span>
                <span className="block text-xs text-label-2">{d}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>

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

      <button className="btn-primary w-full !py-3.5 !text-base" disabled={!total} onClick={start}>
        <Play size={18} fill="currentColor" /> Diktat starten ({total} {total === 1 ? 'Wort' : 'Wörter'})
      </button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-label-2"><Ear size={14} /> Tipp: Kopfhörer helfen, die Endungen genau zu hören.</p>
    </div>
  )
}
