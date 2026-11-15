import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { DoneCard } from '../components/DoneCard'
import { WordCard } from '../components/WordCard'
import { useApp } from '../store'

export function Browse({ onDashboard }: { onDashboard: () => void }) {
  const { words, reviseReview, recordReview } = useApp()
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
          <button className="btn-soft" aria-label="Vorheriges Wort" disabled={i === 0} onClick={() => setIdx(i - 1)}><ArrowLeft size={16} /></button>
          <span className="min-w-14 text-center text-sm tabular-nums text-label-2">{list.length ? i + 1 : 0} / {list.length}</span>
          <button className="btn-soft" aria-label="Nächstes Wort" disabled={i >= list.length - 1} onClick={() => setIdx(i + 1)}><ArrowRight size={16} /></button>
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
        <div className="card p-8 text-center text-label-2">Keine Wörter mit diesem Tag.</div>
      )}
    </div>
  )
}
