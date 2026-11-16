import { useMemo, useState } from 'react'
import { Check, CircleDashed, Folder as FolderIcon, Search, Sparkles } from 'lucide-react'
import { countWords, effectiveFolder, sortFolders } from '../lib/folders'
import { NO_FOLDER, type Selection } from '../lib/selection'
import type { Folder, WordItem } from '../types'
import { Segmented } from './ui'

type Mode = Selection['mode']

function tree(folders: Folder[]): { f: Folder; depth: number }[] {
  const out: { f: Folder; depth: number }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const f of sortFolders(folders.filter((x) => x.parentId === parent))) {
      out.push({ f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

function CheckRow({ on, onClick, children, depth = 0 }: { on: boolean; onClick: () => void; children: React.ReactNode; depth?: number }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-fill-4 ${on ? 'bg-blue/10' : ''}`}
      style={{ paddingLeft: 16 + depth * 18 }}
    >
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${on ? 'border-blue bg-blue text-white' : 'border-label-3'}`} aria-hidden>
        {on && <Check size={14} strokeWidth={3} />}
      </span>
      {children}
    </button>
  )
}

/**
 * Gemeinsame Wortauswahl für Lernen, Test und Diktat:
 * Smart (fällige und schwache Wörter), Ordner, Tags oder einzelne Wörter.
 */
export function SelectionPicker({
  value, onChange, words, folders, smartNote,
}: {
  value: Selection
  onChange: (s: Selection) => void
  words: WordItem[]
  folders: Folder[]
  /** Text unter „Smart“ (z. B. wie viele fällig sind) */
  smartNote?: string
}) {
  const [q, setQ] = useState('')
  const counts = useMemo(() => countWords(folders, words), [folders, words])
  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders])
  const noFolder = useMemo(() => words.filter((w) => !effectiveFolder(w, folderIds)).length, [words, folderIds])
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of words) for (const t of w.tags) m.set(t, (m.get(t) ?? 0) + 1)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'de', { numeric: true }))
  }, [words])
  const found = useMemo(() => {
    const s = q.trim().toLowerCase()
    return [...words].filter((w) => !s || w.korean.includes(s) || w.german.toLowerCase().includes(s)).sort((a, b) => a.korean.localeCompare(b.korean, 'ko'))
  }, [words, q])

  const setMode = (m: Mode) => {
    if (m === value.mode) return
    onChange(m === 'smart' ? { mode: 'smart' } : m === 'folders' ? { mode: 'folders', ids: [] } : m === 'tags' ? { mode: 'tags', tags: [] } : { mode: 'words', ids: [] })
  }
  const toggleIn = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])

  return (
    <div>
      <Segmented<Mode>
        label="Auswahl"
        value={value.mode}
        onChange={setMode}
        options={[
          { value: 'smart', label: <><Sparkles size={14} /> Smart</> },
          { value: 'folders', label: 'Ordner' },
          { value: 'tags', label: 'Tags' },
          { value: 'words', label: 'Einzeln' },
        ]}
      />

      {value.mode === 'smart' && (
        <p className="mt-3 text-sm text-label-2">
          {smartNote ?? 'Die App wählt selbst: zuerst fällige Wörter, die du am ehesten vergisst, dann ein paar neue.'}
        </p>
      )}

      {value.mode === 'folders' && (
        <div className="card mt-3 max-h-80 divide-y divide-separator overflow-y-auto">
          {tree(folders).map(({ f, depth }) => (
            <CheckRow key={f.id} depth={depth} on={value.ids.includes(f.id)} onClick={() => onChange({ mode: 'folders', ids: toggleIn(value.ids, f.id) })}>
              <FolderIcon size={16} className="shrink-0 text-blue" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-sm text-label-2">{counts.get(f.id) ?? 0}</span>
            </CheckRow>
          ))}
          <CheckRow on={value.ids.includes(NO_FOLDER)} onClick={() => onChange({ mode: 'folders', ids: toggleIn(value.ids, NO_FOLDER) })}>
            <CircleDashed size={16} className="shrink-0 text-label-3" />
            <span className="flex-1">Ohne Ordner</span>
            <span className="text-sm text-label-2">{noFolder}</span>
          </CheckRow>
        </div>
      )}

      {value.mode === 'tags' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map(([t, n]) => {
            const on = value.tags.includes(t)
            return (
              <button key={t} type="button" aria-pressed={on} className={`${on ? 'btn-primary' : 'btn-soft'} !min-h-9 !px-3 !py-1 text-xs`} onClick={() => onChange({ mode: 'tags', tags: toggleIn(value.tags, t) })}>
                {t} <span className="opacity-70">{n}</span>
              </button>
            )
          })}
          {!tags.length && <p className="text-sm text-label-2">Keine Tags vorhanden.</p>}
        </div>
      )}

      {value.mode === 'words' && (
        <div className="mt-3">
          <div className="relative mb-2">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-2" />
            <input type="search" aria-label="Wörter suchen" className="min-h-11 w-full rounded-xl bg-fill-3 pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-blue/40" placeholder="Suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mb-2 flex gap-2">
            <button type="button" className="btn-soft !min-h-9 !py-1 text-xs" onClick={() => onChange({ mode: 'words', ids: [...new Set([...value.ids, ...found.map((w) => w.id)])] })}>Alle angezeigten</button>
            <button type="button" className="btn-soft !min-h-9 !py-1 text-xs" disabled={!value.ids.length} onClick={() => onChange({ mode: 'words', ids: [] })}>Keine</button>
          </div>
          <div className="card max-h-72 divide-y divide-separator overflow-y-auto">
            {found.map((w) => (
              <CheckRow key={w.id} on={value.ids.includes(w.id)} onClick={() => onChange({ mode: 'words', ids: toggleIn(value.ids, w.id) })}>
                <span lang="ko" className="font-semibold">{w.korean}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-label-2">{w.german}</span>
              </CheckRow>
            ))}
            {!found.length && <p className="p-4 text-sm text-label-2">Keine Treffer.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
