import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, SlidersHorizontal } from 'lucide-react'
import { DoneCard } from '../components/DoneCard'
import { SelectionPicker } from '../components/SelectionPicker'
import { Sheet } from '../components/ui'
import { WordCard } from '../components/WordCard'
import { describeSelection, resolveSelection, smartPick, SMART, takePendingLearn, type Selection } from '../lib/selection'
import { useApp } from '../store'
import type { Folder, WordItem } from '../types'
import { prepareSentences, prepareUpcomingWords } from '../lib/speech'

type Sort = 'old' | 'new'

/** Reihenfolge einmal festlegen (sonst würde Smart beim Lernen ständig umsortieren) */
function computeIds(sel: Selection, sort: Sort, words: WordItem[], folders: Folder[]): string[] {
  if (sel.mode === 'smart') return smartPick(words, 'both', 20, Date.now(), 10).map((p) => p.word.id)
  return resolveSelection(sel, words, folders)
    .sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
    .map((w) => w.id)
}

/**
 * Lernmodus: Karten durchgehen und Schreiben üben. Die Lösung ist sichtbar – deshalb zählt das hier
 * nicht für die Wiederholungsplanung (nur Abfragen tun das), wohl aber für Statistik und Tages-Streak.
 */
export function Browse({ onDashboard }: { onDashboard: () => void }) {
  const { words, folders, reviseReview, recordReview } = useApp()
  // Vorauswahl aus dem Quiz („Falsche im Lernmodus üben“), sonst Smart
  const [initialSel] = useState<Selection>(() => takePendingLearn() ?? SMART)
  const [selection, setSelection] = useState<Selection>(initialSel)
  const [draftSel, setDraftSel] = useState<Selection>(initialSel)
  const [picker, setPicker] = useState(false)
  const [sort, setSort] = useState<Sort>('old')
  const [ids, setIds] = useState<string[]>(() => computeIds(initialSel, 'old', words, folders))
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(false)

  const list = useMemo(() => {
    const byId = new Map(words.map((w) => [w.id, w]))
    return ids.map((id) => byId.get(id)).filter((w): w is WordItem => !!w)
  }, [ids, words])

  const apply = (sel: Selection, s: Sort) => {
    setSelection(sel)
    setSort(s)
    setIds(computeIds(sel, s, words, folders))
    setIdx(0)
    setDone(false)
  }

  const i = Math.min(idx, Math.max(0, list.length - 1))
  const word = list[i]
  useEffect(() => {
    const next = list.slice(i, i + 4)
    prepareUpcomingWords(next)
    prepareSentences(next.flatMap((w) => (w.examples ?? []).map((e) => e.ko)))
    // nur beim Weiterblättern
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, list.length])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-soft max-w-full" onClick={() => { setDraftSel(selection); setPicker(true) }}>
          <SlidersHorizontal size={16} /> <span className="truncate">Auswahl: {describeSelection(selection, folders)}</span>
        </button>
        {selection.mode !== 'smart' && (
          <select className="input !w-auto" aria-label="Reihenfolge" value={sort} onChange={(e) => apply(selection, e.target.value as Sort)}>
            <option value="old">Älteste zuerst</option>
            <option value="new">Neueste zuerst</option>
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-soft" aria-label="Vorheriges Wort" disabled={i === 0} onClick={() => setIdx(i - 1)}><ArrowLeft size={16} /></button>
          <span className="min-w-14 text-center text-sm tabular-nums text-label-2">{list.length ? i + 1 : 0} / {list.length}</span>
          <button className="btn-soft" aria-label="Nächstes Wort" disabled={i >= list.length - 1} onClick={() => setIdx(i + 1)}><ArrowRight size={16} /></button>
        </div>
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Was möchtest du lernen?">
        <SelectionPicker
          value={draftSel}
          onChange={setDraftSel}
          words={words}
          folders={folders}
          smartNote="Bis zu 20 Karten: zuerst fällige Wörter, die du am ehesten vergisst, dann neue."
        />
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-soft" onClick={() => setPicker(false)}>Abbrechen</button>
          <button className="btn-primary" onClick={() => { apply(draftSel, sort); setPicker(false) }}>Übernehmen</button>
        </div>
      </Sheet>

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
        <div className="card p-8 text-center text-label-2">
          {selection.mode === 'smart' ? 'Gerade ist nichts fällig – wähle Ordner, Tags oder einzelne Wörter.' : 'Keine Wörter in dieser Auswahl.'}
        </div>
      )}
    </div>
  )
}
