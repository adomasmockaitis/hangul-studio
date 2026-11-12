import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Layers, Trophy } from 'lucide-react'
import { PageHeader, Segmented } from '../components/ui'
import { DoneCard } from '../components/DoneCard'
import { WordCard } from '../components/WordCard'
import { useApp } from '../store'
import { QuizSetup } from './Quiz'

type Mode = 'browse' | 'quiz'

export function Learn({ initialQuiz, onDashboard }: { initialQuiz?: boolean; onDashboard: () => void }) {
  const { words, recordReview } = useApp()
  const [mode, setMode] = useState<Mode>(initialQuiz ? 'quiz' : 'browse')

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Lernen & Quiz"
        subtitle={mode === 'browse' ? 'Karteikarten durchgehen und Schreiben üben' : 'Abfragemodus – stelle dein Quiz zusammen'}
        right={
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'browse', label: <><Layers size={15} /> Lernen</> },
              { value: 'quiz', label: <><Trophy size={15} /> Quiz</> },
            ]}
          />
        }
      />
      {words.length === 0 ? (
        <div className="card p-8 text-center text-black/55 dark:text-white/55">Noch keine Vokabeln – füge im Wörterbuch welche hinzu.</div>
      ) : mode === 'browse' ? (
        <Browse recordReview={recordReview} onDashboard={onDashboard} />
      ) : (
        <QuizSetup onDashboard={onDashboard} />
      )}
    </div>
  )
}

function Browse({ recordReview, onDashboard }: { recordReview: (id: string, c: boolean) => void; onDashboard: () => void }) {
  const { words, reviseReview } = useApp()
  const [tag, setTag] = useState<string>('')
  const [sort, setSort] = useState<'new' | 'old'>('old')
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(false)

  const tags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words])
  const list = useMemo(() => {
    const f = tag ? words.filter((w) => w.tags.includes(tag)) : words
    return [...f].sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  }, [words, tag, sort])

  const i = Math.min(idx, Math.max(0, list.length - 1))
  const word = list[i]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={tag} onChange={(e) => { setTag(e.target.value); setIdx(0); setDone(false) }}>
          <option value="">Alle Tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input !w-auto" value={sort} onChange={(e) => { setSort(e.target.value as 'new' | 'old'); setIdx(0); setDone(false) }}>
          <option value="old">Älteste zuerst</option>
          <option value="new">Neueste zuerst</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-soft" disabled={i === 0} onClick={() => setIdx(i - 1)}><ArrowLeft size={16} /></button>
          <span className="min-w-14 text-center text-sm tabular-nums text-black/55 dark:text-white/55">{list.length ? i + 1 : 0} / {list.length}</span>
          <button className="btn-soft" disabled={i >= list.length - 1} onClick={() => setIdx(i + 1)}><ArrowRight size={16} /></button>
        </div>
      </div>
      {done ? (
        <DoneCard
          text={`Du bist alle ${list.length} Karten durchgegangen.`}
          onDashboard={onDashboard}
          onRepeat={() => { setIdx(0); setDone(false) }}
        />
      ) : word ? (
        <WordCard
          key={word.id}
          word={word}
          mode="browse"
          onResult={(c) => recordReview(word.id, c)}
          onRevise={(c) => reviseReview(word.id, c)}
          onNext={i < list.length - 1 ? () => setIdx(i + 1) : () => setDone(true)}
          nextLabel={i < list.length - 1 ? 'Nächstes Wort' : 'Abschließen'}
        />
      ) : (
        <div className="card p-8 text-center text-black/55 dark:text-white/55">Keine Wörter mit diesem Tag.</div>
      )}
    </div>
  )
}
