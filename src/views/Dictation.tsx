import { useMemo, useState } from 'react'
import { Ear } from 'lucide-react'
import { ListenTypeQuestion, WriteQuestion } from '../components/questions'
import { Runner, type Q } from '../components/Runner'
import { SelectionPicker } from '../components/SelectionPicker'
import { CountPicker, Group, OptionCards, StartButton } from '../components/ui'
import { askable, fastLimit, type Dir } from '../lib/fsrs'
import { resolveSelection, smartPick, smartSummary, SMART, SMART_MAX, type Selection } from '../lib/selection'
import { activeOnly } from '../lib/folders'
import { weakWordIds } from '../lib/srs'
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

/** Diktat: Koreanisch hören und aufschreiben bzw. die Bedeutung tippen */
export function DictationSetup({ onDashboard }: { onDashboard: () => void }) {
  const { words, folders, reviewLog } = useApp()
  const [variant, setVariant] = useState<Variant>('ko')
  const [selection, setSelection] = useState<Selection>(SMART)
  const [count, setCount] = useState(10)
  const [questions, setQuestions] = useState<Q[] | null>(null)
  const dir = DIR_OF[variant]

  // Smart: alle bereiten Wörter (ohne Obergrenze gezählt, pro Runde höchstens SMART_MAX)
  const ready = useMemo(() => (selection.mode === 'smart' ? smartPick(activeOnly(words, folders), dir, Infinity, Date.now()) : []), [words, folders, selection, dir])
  const pool: WordItem[] = useMemo(() => {
    if (selection.mode === 'smart') return ready.slice(0, SMART_MAX).map((p) => p.word)
    return resolveSelection(selection, words, folders, weakWordIds(reviewLog, words)).filter(askable)
  }, [words, folders, selection, ready, reviewLog])
  const total = selection.mode === 'smart' ? pool.length : Math.min(pool.length, count || pool.length)

  const start = () => {
    const chosen = selection.mode === 'smart' ? shuffle(pool) : shuffle(pool).slice(0, count || pool.length)
    setQuestions(chosen.map((w, n) => makeQuestion(w, variant, n)))
  }

  if (questions) return <Runner questions={questions} onDashboard={onDashboard} onBack={() => setQuestions(null)} backLabel="Neue Auswahl" test="Diktat" />

  return (
    <div className="space-y-6">
      <Group title="Welche Wörter?">
        <SelectionPicker
          value={selection}
          onChange={setSelection}
          words={words}
          folders={folders}
          smartNote={ready.length ? `${ready.length} bereit: ${smartSummary(ready)}.${ready.length > SMART_MAX ? ` Diese Runde: die ${SMART_MAX} dringendsten.` : ''} Smart lädt alle Wörter, die gerade dran sind – fällig, oft falsch oder lange nicht geübt –, dazu bis zu 5 neue. Nur Ordner, die du aktiv lernst.` : `Gerade ist nichts dran. Smart lädt alle Wörter, die gerade dran sind – fällig, oft falsch oder lange nicht geübt –, dazu bis zu 5 neue. Nur Ordner, die du aktiv lernst.`}
        />
        {selection.mode !== 'smart' && <CountPicker value={count} onChange={setCount} />}
      </Group>

      <Group title="Wie üben?">
        <OptionCards<Variant>
          label="Übungsart"
          value={variant}
          onChange={setVariant}
          options={[
            { value: 'ko', title: 'Hören → Koreanisch schreiben', text: 'Das gehörte Wort von Hand oder per Tastatur aufschreiben' },
            { value: 'de', title: 'Hören → Bedeutung tippen', text: 'Hörverstehen: die deutsche Bedeutung eintippen' },
          ]}
        />
      </Group>

      <StartButton onClick={start} disabled={!total}>Diktat starten ({total} {total === 1 ? 'Wort' : 'Wörter'})</StartButton>
      <p className="flex items-center justify-center gap-1.5 text-xs text-label-2"><Ear size={14} /> Tipp: Kopfhörer helfen, die Endungen genau zu hören.</p>
    </div>
  )
}
