import { useMemo, useState } from 'react'
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, CircleDashed, Copy, Folder as FolderIcon, FolderInput, FolderPlus, GraduationCap, Loader2, Pencil, Plus, ScanText, Search, Sparkles, Tag, Trash2, Volume2,
} from 'lucide-react'
import { List, ListRow, PageHeader, Sheet, Toggle, useConfirm } from '../components/ui'
import { parseTags } from '../components/UploadScanner'
import { openScanner, useScanState } from '../components/ScanHost'
import { DuplicateGroups } from '../components/DuplicateGroups'
import { WordVoiceRows } from '../components/WordVoiceRows'
import { setPendingLearn } from '../lib/selection'
import { WEAK_FOLDER, WEAK_FOLDER_NAME, weakWordIds } from '../lib/srs'
import { findDictDuplicates, type DupEntry, type DupGroup } from '../lib/scanDuplicates'
import { canAddSubfolder, chapterTagSuggestions, countWords, effectiveFolder, folderPath, pausedFolderIds, sortFolders } from '../lib/folders'
import { completeWord } from '../lib/gemini'
import { navigate, useRoute } from '../lib/route'
import { playSound } from '../lib/sounds'
import { speakWord } from '../lib/speech'
import { getItem, setItem } from '../lib/storage'
import { useApp } from '../store'
import { CONJUGATION_KEYS, CONJUGATION_LABELS, MAX_EXAMPLES, WORD_TYPE_LABELS, type Conjugations, type Example, type Folder, type WordItem, type WordType } from '../types'
import { VoiceStatus } from '../components/VoiceStatus'

interface Draft {
  korean: string
  german: string
  pronunciation: string
  wordType: WordType
  tags: string
  conj: Conjugations
  folderId: string
  note: string
  examples: Example[]
}

const emptyDraft = (folderId: string | null): Draft => ({ korean: '', german: '', pronunciation: '', wordType: 'noun', tags: '', conj: {}, folderId: folderId ?? '', note: '', examples: [] })

function toDraft(w: WordItem, folderIds: Set<string>): Draft {
  return {
    korean: w.korean, german: w.german, pronunciation: w.pronunciation ?? '', wordType: w.wordType,
    tags: w.tags.join(' '), conj: w.conjugations ?? {}, folderId: effectiveFolder(w, folderIds) ?? '',
    note: w.note ?? '', examples: w.examples ?? [],
  }
}

type Sort = 'new' | 'old' | 'errors'

const errorRate = (w: WordItem) => {
  const t = w.stats.correctCount + w.stats.wrongCount
  return t ? w.stats.wrongCount / t : -1
}

const NO_FOLDER = 'ohne'
const K_CHAPTER_OFFER = 'hangul-studio:chapter-offer-done'

/** Ordner als eingerückte Liste in Baumreihenfolge */
function flatTree(folders: Folder[]): { f: Folder; depth: number }[] {
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

export function Dictionary() {
  const {
    words, settings, folders, reviewLog, addWord, updateWord, deleteWord, addFolder, renameFolder, setFolderPaused, deleteFolder, moveWords, addTagToWords, convertChapterTags,
  } = useApp()
  const confirm = useConfirm()

  // ---------- Einmalige Prüfung: gleiche Bedeutung doppelt im Wörterbuch? ----------
  const KEPT = 'hangul-studio:dup-kept'
  const [kept, setKept] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(KEPT) ?? '[]') as string[]) } catch { return new Set() }
  })
  const keep = (keys: string[]) => setKept((k) => {
    const n = new Set([...k, ...keys])
    try { localStorage.setItem(KEPT, JSON.stringify([...n])) } catch { /* privat */ }
    return n
  })
  const [dupOpen, setDupOpen] = useState(false)
  const dupGroups = useMemo(
    () => findDictDuplicates(words.map((w) => ({ id: w.id, source: 'dict' as const, korean: w.korean, german: w.german }))).filter((g) => !kept.has(g.key)),
    [words, kept],
  )
  const keepOnlyDict = async (g: DupGroup, e: DupEntry) => {
    const others = g.entries.filter((x) => x.id !== e.id)
    const ok = await confirm({
      title: others.length === 1 ? `„${others[0].korean}“ löschen?` : `${others.length} Wörter löschen?`,
      message: `Behalten wird ${e.korean} (${e.german}). Gelöscht ${others.length === 1 ? 'wird' : 'werden'}: ${others.map((x) => `${x.korean} (${x.german})`).join(', ')} – samt Lernstand.`,
      confirmLabel: 'Löschen',
      destructive: true,
    })
    if (ok) others.forEach((x) => deleteWord(x.id))
  }
  /** Bestätigte Gemini-Vorschläge übernehmen */
  const applyDict = (g: DupGroup, changes: Map<string, string>) => {
    changes.forEach((german, id) => updateWord(id, { german }))
    keep([g.key])
  }
  const { sub } = useRoute()
  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders])
  // Ort: '' = Übersicht, 'ohne' = ohne Ordner, sonst Ordner-ID
  const place = sub === NO_FOLDER ? NO_FOLDER : sub === WEAK_FOLDER ? WEAK_FOLDER : sub && folderIds.has(sub) ? sub : ''
  const current = place && place !== NO_FOLDER && place !== WEAK_FOLDER ? folders.find((f) => f.id === place)! : null
  // Automatischer Ordner: im Quiz falsch, noch nicht an 3 Tagen richtig (Wörter bleiben zusätzlich in ihrem Ordner)
  const weak = useMemo(() => weakWordIds(reviewLog, words), [reviewLog, words])
  const path = useMemo(() => folderPath(folders, current?.id ?? null), [folders, current])

  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const scan = useScanState()
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [nameSheet, setNameSheet] = useState<{ mode: 'new' | 'rename'; parentId: string | null; id?: string; name: string } | null>(null)
  const [moveSheet, setMoveSheet] = useState(false)
  const [tagSheet, setTagSheet] = useState<string | null>(null)
  const [deleteSheet, setDeleteSheet] = useState<Folder | null>(null)
  const [offerDone, setOfferDone] = useState(() => getItem<boolean>(K_CHAPTER_OFFER, false))
  const [notice, setNotice] = useState('')

  const counts = useMemo(() => countWords(folders, words), [folders, words])
  const paused = useMemo(() => pausedFolderIds(folders), [folders])
  const noFolderCount = useMemo(() => words.filter((w) => !effectiveFolder(w, folderIds)).length, [words, folderIds])
  const childFolders = useMemo(() => (place === NO_FOLDER || place === WEAK_FOLDER ? [] : sortFolders(folders.filter((f) => f.parentId === (current?.id ?? null)))), [folders, current, place])
  const chapterTags = useMemo(() => chapterTagSuggestions(words, folderIds), [words, folderIds])

  const tags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const inPlace = (w: WordItem) => {
      const f = effectiveFolder(w, folderIds)
      if (place === '') return true
      if (place === NO_FOLDER) return f === null
      if (place === WEAK_FOLDER) return weak.has(w.id)
      return f === place
    }
    const f = words.filter((w) => inPlace(w) && (!tag || w.tags.includes(tag)) && (!s || w.korean.includes(s) || w.german.toLowerCase().includes(s)))
    return f.sort((a, b) =>
      sort === 'new' ? b.createdAt - a.createdAt : sort === 'old' ? a.createdAt - b.createdAt : errorRate(b) - errorRate(a) || b.stats.wrongCount - a.stats.wrongCount,
    )
  }, [words, q, tag, sort, place, folderIds, weak])
  const folderName = (w: WordItem) => {
    const id = effectiveFolder(w, folderIds)
    return id ? folderPath(folders, id).map((f) => f.name).join(' › ') : ''
  }

  const go = (to: string) => {
    setSelecting(false)
    setSelected(new Set())
    setQ('')
    navigate(to ? `/woerter/${to}` : '/woerter')
  }

  // ---------- Wort bearbeiten ----------
  const draft = editing?.draft
  const setDraft = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))
  const isConj = draft?.wordType === 'verb' || draft?.wordType === 'adjective'

  const save = () => {
    if (!editing || !draft || !draft.korean.trim()) return
    const conj = Object.fromEntries(Object.entries(draft.conj).filter(([, v]) => v && v.trim()))
    const base = {
      korean: draft.korean.trim(),
      german: draft.german.trim(),
      pronunciation: draft.pronunciation.trim() || undefined,
      wordType: draft.wordType,
      tags: parseTags(draft.tags),
      conjugations: isConj && Object.keys(conj).length ? (conj as Conjugations) : undefined,
      folderId: draft.folderId || undefined,
      note: draft.note.trim() || undefined,
      needsReview: undefined,
      examples: (() => {
        const ex = draft.examples.map((e) => ({ ...e, ko: e.ko.trim(), de: e.de.trim() })).filter((e) => e.ko)
        return ex.length ? ex : undefined
      })(),
    }
    if (editing.id) updateWord(editing.id, base)
    else addWord(base)
    setEditing(null)
  }

  const fillWithAi = async () => {
    if (!draft?.korean.trim()) return
    setAiBusy(true)
    setAiMsg('')
    try {
      const r = await completeWord(settings.geminiApiKey.trim(), settings.geminiModel, draft.korean.trim(), setAiMsg)
      setDraft({
        german: draft.german || r.german || '',
        pronunciation: draft.pronunciation || r.pronunciation || '',
        wordType: r.wordType && ['verb', 'adjective', 'noun', 'other'].includes(r.wordType) ? r.wordType : draft.wordType,
        conj: r.conjugations ? { ...r.conjugations, ...draft.conj } : draft.conj,
      })
      setAiMsg('')
    } catch (e) {
      setAiMsg(`KI-Ergänzung fehlgeschlagen: ${e instanceof Error ? e.message : 'Fehler'}`)
    } finally {
      setAiBusy(false)
    }
  }

  // ---------- Auswahl ----------
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const allSelected = list.length > 0 && list.every((w) => selected.has(w.id))

  // ---------- Ordner ----------
  const submitName = () => {
    if (!nameSheet || !nameSheet.name.trim()) return
    if (nameSheet.mode === 'rename' && nameSheet.id) renameFolder(nameSheet.id, nameSheet.name)
    else addFolder(nameSheet.name, nameSheet.parentId)
    setNameSheet(null)
  }

  const askDelete = async (f: Folder) => {
    if ((counts.get(f.id) ?? 0) === 0) {
      const sub = folders.some((x) => x.parentId === f.id)
      if (await confirm({ title: `„${f.name}“ löschen?`, message: sub ? 'Der Ordner und seine leeren Unterordner werden gelöscht.' : 'Der Ordner ist leer.', confirmLabel: 'Löschen', destructive: true })) {
        deleteFolder(f.id, 'move')
        go(f.parentId ?? '')
      }
    } else setDeleteSheet(f)
  }

  const convert = () => {
    const n = convertChapterTags()
    setItem(K_CHAPTER_OFFER, true)
    setOfferDone(true)
    setNotice(`${n} Wörter in ${chapterTags.size} Ordner einsortiert.`)
    playSound('success')
  }

  const canSub = current ? canAddSubfolder(folders, current.id) : place === ''
  const title = place === NO_FOLDER ? 'Ohne Ordner' : place === WEAK_FOLDER ? WEAK_FOLDER_NAME : current ? current.name : 'Wörter'
  const backTo = path.length > 1 ? path[path.length - 2] : null

  return (
    <div className="mx-auto w-full max-w-3xl pb-24">
      {place !== '' && (
        <button className="-ml-2 mb-1 flex min-h-11 items-center gap-0.5 rounded-full px-2 text-base font-medium text-blue transition hover:bg-fill-4" onClick={() => go(backTo?.id ?? '')}>
          <ChevronLeft size={22} /> {backTo?.name ?? 'Wörter'}
        </button>
      )}
      <PageHeader
        title={title}
        subtitle={`${list.length} ${list.length === 1 ? 'Wort' : 'Wörter'}${place === '' && folders.length ? ` · ${folders.length} ${folders.length === 1 ? 'Ordner' : 'Ordner'}` : ''}`}
        right={
          <div className="flex flex-nowrap gap-2">
            {/* Auf dem Handy nur Symbole – sonst brechen die Knöpfe in zwei Zeilen um */}
            {place === '' && <button className="btn-soft max-sm:!px-3" aria-label="Datei scannen" title="Datei scannen" onClick={() => openScanner(current?.id ?? null)}><ScanText size={16} /> <span className="hidden sm:inline">Datei scannen</span></button>}
            {canSub && (
              <button className="btn-soft max-sm:!px-3" aria-label={current ? 'Unterordner anlegen' : 'Neuer Ordner'} title={current ? 'Unterordner' : 'Neuer Ordner'} onClick={() => setNameSheet({ mode: 'new', parentId: current?.id ?? null, name: '' })}>
                <FolderPlus size={16} /> <span className="hidden sm:inline">{current ? 'Unterordner' : 'Neuer Ordner'}</span>
              </button>
            )}
            {current && (
              <>
                <button className="btn-soft !px-3" aria-label="Ordner umbenennen" title="Umbenennen" onClick={() => setNameSheet({ mode: 'rename', parentId: current.parentId, id: current.id, name: current.name })}><Pencil size={16} /></button>
                <button className="btn-soft !px-3 !text-red" aria-label="Ordner löschen" title="Löschen" onClick={() => void askDelete(current)}><Trash2 size={16} /></button>
              </>
            )}
            <button className="btn-primary" onClick={() => setEditing({ id: null, draft: emptyDraft(current?.id ?? null) })}><Plus size={16} /> Neues Wort</button>
          </div>
        }
      />

      {/* Scan im Hintergrund: Hinweis, bis die erkannten Wörter geprüft sind */}
      {!scan.open && (scan.busy || scan.pending > 0) && (
        <button className="fade-up mb-4 flex w-full items-center gap-3 rounded-2xl border border-blue/30 bg-blue/10 px-4 py-3 text-left" onClick={() => openScanner()}>
          {scan.busy ? <Loader2 size={18} className="shrink-0 animate-spin text-blue" /> : <ScanText size={18} className="shrink-0 text-blue" />}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{scan.busy ? 'Datei wird gescannt …' : 'Neu eingescannt'}</span>
            <span className="block text-sm text-label-2">{scan.busy ? 'Läuft im Hintergrund – du kannst weiterarbeiten.' : `${scan.pending} ${scan.pending === 1 ? 'Wort wartet' : 'Wörter warten'} auf deine Prüfung.`}</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-blue">Ansehen</span>
        </button>
      )}

      {/* Einmalige Prüfung: Wörter mit gleicher Bedeutung */}
      {place === '' && dupGroups.length > 0 && (
        <div className="card fade-up mb-6 p-5">
          <p className="flex items-center gap-2 font-semibold"><Copy size={18} className="text-orange" /> {dupGroups.length === 1 ? 'Eine Bedeutung kommt' : `${dupGroups.length} Bedeutungen kommen`} doppelt vor</p>
          <p className="mt-1 text-sm text-label-2">
            Ich habe dein Wörterbuch durchgesehen. Manche Wörter haben dieselbe deutsche Übersetzung (oder dasselbe koreanische Wort steht mit verschiedenen Bedeutungen da), z. B.{' '}
            {dupGroups.slice(0, 2).map((g) => g.entries.map((e) => e.korean).join(' / ')).join(', ')}. Im Quiz ist dann unklar, welches gemeint ist.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setDupOpen(true)}>Ansehen</button>
            <button className="btn-soft" onClick={() => keep(dupGroups.map((g) => g.key))}>Alle so lassen</button>
          </div>
        </div>
      )}
      <Sheet open={dupOpen && dupGroups.length > 0} onClose={() => setDupOpen(false)} title="Doppelte Bedeutungen" wide>
        <p className="mb-3 text-sm text-label-2">Behalte eins (vor dem Löschen wirst du gefragt), behalte beide – oder lass dir von Gemini Unterschiede vorschlagen. Geändert wird erst, wenn du zustimmst.</p>
        <DuplicateGroups
          groups={dupGroups}
          apiKey={settings.geminiApiKey}
          model={settings.geminiModel}
          onKeepOnly={(g, e) => void keepOnlyDict(g, e)}
          onKeepBoth={(g) => keep([g.key])}
          onApply={applyDict}
          sourceLabel={(e) => folderName(words.find((w) => w.id === e.id)!) || 'Ohne Ordner'}
        />
      </Sheet>

      {/* Einmaliges Angebot: Kapitel-Tags in Ordner umwandeln */}
      {place === '' && !offerDone && chapterTags.size > 0 && (
        <div className="card fade-up mb-6 p-5">
          <p className="flex items-center gap-2 font-semibold"><FolderInput size={18} className="text-blue" /> Kapitel als Ordner?</p>
          <p className="mt-1 text-sm text-label-2">
            Deine Wörter haben Kapitel-Tags. Daraus können Ordner werden:{' '}
            {[...chapterTags.entries()].sort(([a], [b]) => a.localeCompare(b, 'de', { numeric: true })).map(([n, c]) => `${n} (${c})`).join(', ')}. Der Kapitel-Tag wird dabei entfernt, alle anderen Tags bleiben.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={convert}>In Ordner umwandeln</button>
            <button className="btn-soft" onClick={() => { setItem(K_CHAPTER_OFFER, true); setOfferDone(true) }}>Nein, danke</button>
          </div>
        </div>
      )}
      {notice && <p className="fade-up mb-4 px-4 text-sm text-green">{notice}</p>}

      {/* Aktiv lernen: pausierte Ordner nimmt der Smart-Modus nicht */}
      {current && (
        <List footer={
          current.paused
            ? 'Pausiert: Smart-Modus beim Lernen, im Quiz und im Diktat lässt diese Wörter aus. Gezielt auswählen kannst du sie weiterhin.'
            : paused.has(current.id)
              ? 'Ein übergeordneter Ordner ist pausiert – dessen Schalter gilt auch hier.'
              : 'Smart-Modus wählt Wörter aus diesem Ordner aus. Schalte ihn aus, solange du die Wörter noch nicht lernen willst.'
        }>
          <ListRow
            icon={<GraduationCap size={17} />}
            iconColor={paused.has(current.id) ? '#8e8e93' : 'var(--color-green)'}
            title="Aktiv lernen"
            right={<Toggle checked={!paused.has(current.id)} onChange={(on) => setFolderPaused(current.id, !on)} label="Aktiv lernen" />}
          />
        </List>
      )}

      {/* Automatischer Ordner „Noch unsicher“: Erklärung und direkt lernen */}
      {place === WEAK_FOLDER && (
        <div className="card fade-up mb-6 p-5">
          <p className="text-sm text-label-2">
            Hier landen automatisch die Wörter, die du im Quiz falsch hattest. Sobald du eins danach an 3 verschiedenen Tagen
            richtig hattest (Deutsch → Koreanisch, ohne Hilfe), verschwindet es wieder. Die Wörter bleiben dabei in ihrem eigenen Ordner.
          </p>
          {list.length > 0 && (
            <button className="btn-primary mt-4" onClick={() => { setPendingLearn(list.map((w) => w.id)); navigate('/ueben') }}>
              <GraduationCap size={16} /> {list.length} {list.length === 1 ? 'Wort' : 'Wörter'} lernen
            </button>
          )}
        </div>
      )}

      {/* Ordner */}
      {(childFolders.length > 0 || (place === '' && (folders.length > 0 || weak.size > 0))) && (
        <List title={current ? 'Unterordner' : 'Ordner'}>
          {place === '' && weak.size > 0 && (
            <ListRow
              icon={<AlertCircle size={17} />}
              iconColor="var(--color-orange)"
              title={WEAK_FOLDER_NAME}
              subtitle="Automatisch: im Quiz falsch, noch nicht sicher"
              value={weak.size}
              onClick={() => go(WEAK_FOLDER)}
            />
          )}
          {childFolders.map((f) => (
            <ListRow
              key={f.id}
              icon={<FolderIcon size={17} />}
              iconColor={paused.has(f.id) ? '#8e8e93' : 'var(--color-blue)'}
              title={f.name}
              subtitle={paused.has(f.id) ? 'Pausiert – nicht im Smart-Modus' : undefined}
              value={counts.get(f.id) ?? 0}
              onClick={() => go(f.id)}
            />
          ))}
          {place === '' && (
            <ListRow icon={<CircleDashed size={17} />} iconColor="#8e8e93" title="Ohne Ordner" value={noFolderCount} onClick={() => go(NO_FOLDER)} />
          )}
        </List>
      )}

      {/* Suche und Filter */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex">
        <div className="relative col-span-2 sm:flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-2" />
          <input
            type="search"
            aria-label="Wörter durchsuchen"
            className="min-h-11 w-full rounded-xl bg-fill-3 pl-9 pr-3 text-base outline-none transition placeholder:text-label-2 focus:ring-2 focus:ring-blue/40"
            placeholder={place === '' ? 'In allen Wörtern suchen' : 'In diesem Ordner suchen'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select aria-label="Nach Tag filtern" className="input min-w-0 sm:!w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Alle Tags</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select aria-label="Sortierung" className="input min-w-0 sm:!w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="new">Neueste zuerst</option>
          <option value="old">Älteste zuerst</option>
          <option value="errors">Höchste Fehlerquote</option>
        </select>
      </div>

      <div className="mb-1.5 flex items-center justify-between px-4">
        <h2 className="text-xs font-medium text-label-2">{place === '' ? 'Alle Wörter' : 'Wörter'}</h2>
        {list.length > 0 && (
          <button
            className="min-h-9 rounded-full px-3 text-sm font-medium text-blue transition hover:bg-fill-4"
            onClick={() => { setSelecting((s) => !s); setSelected(new Set()) }}
          >
            {selecting ? 'Fertig' : 'Auswählen'}
          </button>
        )}
      </div>
      <div className="stagger card divide-y divide-separator overflow-hidden">
        {list.length === 0 && <p className="p-6 text-center text-sm text-label-2">{q || tag ? 'Keine Wörter gefunden.' : 'Hier liegen noch keine Wörter.'}</p>}
        {list.map((w) => {
          const rate = errorRate(w)
          const on = selected.has(w.id)
          const fname = place === '' ? folderName(w) : ''
          return (
            <div key={w.id} className={`flex items-center ${on ? 'bg-blue/10' : ''}`}>
              <button
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition hover:bg-fill-4 active:bg-fill-3"
                onClick={() => (selecting ? toggle(w.id) : setEditing({ id: w.id, draft: toDraft(w, folderIds) }))}
                aria-label={selecting ? `${w.korean} ${on ? 'abwählen' : 'auswählen'}` : `${w.korean}, ${w.german} – bearbeiten`}
                aria-pressed={selecting ? on : undefined}
              >
                {selecting && (
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${on ? 'border-blue bg-blue text-white' : 'border-label-3'}`} aria-hidden>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span lang="ko" className="text-xl font-semibold">{w.korean}</span>
                    {w.pronunciation && <span lang="ko" className="text-sm text-blue">{w.pronunciation}</span>}
                    <span className="text-label-2">{w.german}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-label-2">
                    <span className="font-medium">{WORD_TYPE_LABELS[w.wordType]}</span>
                    {fname && <span className="inline-flex items-center gap-1"><FolderIcon size={11} /> {fname}</span>}
                    {w.tags.map((t) => <span key={t}>{t}</span>)}
                    {rate >= 0 && <span className={rate > 0.4 ? 'font-medium text-red' : ''}>· {Math.round(rate * 100)} % Fehler</span>}
                    {!w.german.trim() && <span className="rounded-full bg-red/15 px-1.5 py-px text-[10px] font-semibold text-red">Übersetzung fehlt</span>}
                    {w.needsReview && w.german.trim() && <span className="rounded-full bg-yellow/20 px-1.5 py-px text-[10px] font-semibold text-orange" title="Automatisch übersetzt – beim Bearbeiten verschwindet die Markierung">bitte prüfen</span>}
                    <VoiceStatus word={w} slow />
                  </span>
                </span>
                {!selecting && <ChevronRight size={18} className="shrink-0 text-label-3" />}
              </button>
              {!selecting && (
                <button className="mx-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-blue transition hover:bg-fill-3" onClick={() => speakWord(w, settings.speechMode)} aria-label={`${w.korean} vorlesen`}><Volume2 size={20} /></button>
              )}
            </div>
          )
        })}
      </div>

      {/* Aktionsleiste im Auswahlmodus */}
      {selecting && (
        <div className="glass sheet-up fixed inset-x-3 bottom-[calc(var(--tabbar-space)+0.5rem)] z-40 mx-auto flex max-w-xl items-center gap-2 rounded-full p-1.5 md:bottom-4">
          <button className="btn-soft" onClick={() => setSelected(allSelected ? new Set() : new Set(list.map((w) => w.id)))}>{allSelected ? 'Keine' : 'Alle'}</button>
          <span className="flex-1 px-1 text-sm font-medium" aria-live="polite">{selected.size} ausgewählt</span>
          <button className="btn-soft" disabled={!selected.size} onClick={() => setMoveSheet(true)} aria-label="Verschieben"><FolderInput size={16} /> <span className="hidden sm:inline">Verschieben</span></button>
          <button className="btn-soft" disabled={!selected.size} onClick={() => setTagSheet('')} aria-label="Tag hinzufügen"><Tag size={16} /> <span className="hidden sm:inline">Tag</span></button>
        </div>
      )}

      {/* Verschieben */}
      <Sheet open={moveSheet} onClose={() => setMoveSheet(false)} title={`${selected.size} ${selected.size === 1 ? 'Wort' : 'Wörter'} verschieben`}>
        <List>
          <ListRow icon={<CircleDashed size={17} />} iconColor="#8e8e93" title="Ohne Ordner" onClick={() => { moveWords([...selected], null); setMoveSheet(false); setSelecting(false); setSelected(new Set()); playSound('success') }} />
          {flatTree(folders).map(({ f, depth }) => (
            <ListRow
              key={f.id}
              icon={<FolderIcon size={17} />}
              iconColor="var(--color-blue)"
              title={<span style={{ paddingLeft: depth * 16 }}>{f.name}</span>}
              value={counts.get(f.id) ?? 0}
              onClick={() => { moveWords([...selected], f.id); setMoveSheet(false); setSelecting(false); setSelected(new Set()); playSound('success') }}
            />
          ))}
        </List>
        {folders.length === 0 && <p className="px-4 text-sm text-label-2">Noch keine Ordner – lege oben unter „Wörter“ einen an.</p>}
      </Sheet>

      {/* Tag hinzufügen */}
      <Sheet open={tagSheet !== null} onClose={() => setTagSheet(null)} title={`Tag für ${selected.size} ${selected.size === 1 ? 'Wort' : 'Wörter'}`}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!tagSheet?.trim()) return
            addTagToWords([...selected], tagSheet)
            setTagSheet(null)
            setSelecting(false)
            setSelected(new Set())
            playSound('success')
          }}
        >
          <input className="input" autoFocus placeholder="#Alltag" value={tagSheet ?? ''} onChange={(e) => setTagSheet(e.target.value)} aria-label="Tag" list="known-tags" />
          <datalist id="known-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-soft" onClick={() => setTagSheet(null)}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={!tagSheet?.trim()}>Hinzufügen</button>
          </div>
        </form>
      </Sheet>

      {/* Ordner anlegen / umbenennen */}
      <Sheet open={!!nameSheet} onClose={() => setNameSheet(null)} title={nameSheet?.mode === 'rename' ? 'Ordner umbenennen' : nameSheet?.parentId ? 'Neuer Unterordner' : 'Neuer Ordner'}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submitName() }}>
          <input className="input" autoFocus placeholder="z. B. Lektion 3" value={nameSheet?.name ?? ''} onChange={(e) => setNameSheet((s) => (s ? { ...s, name: e.target.value } : s))} aria-label="Ordnername" />
          {nameSheet?.parentId && <p className="text-xs text-label-2">In: {folderPath(folders, nameSheet.parentId).map((f) => f.name).join(' › ')}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-soft" onClick={() => setNameSheet(null)}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={!nameSheet?.name.trim()}>{nameSheet?.mode === 'rename' ? 'Umbenennen' : 'Anlegen'}</button>
          </div>
        </form>
      </Sheet>

      {/* Ordner mit Wörtern löschen */}
      <Sheet open={!!deleteSheet} onClose={() => setDeleteSheet(null)} title={`„${deleteSheet?.name ?? ''}“ löschen?`}>
        {deleteSheet && (
          <div className="space-y-3">
            <p className="text-sm text-label-2">
              Darin liegen {counts.get(deleteSheet.id) ?? 0} Wörter (inklusive Unterordner). Was soll mit ihnen passieren?
            </p>
            <button className="btn-primary w-full" onClick={() => { deleteFolder(deleteSheet.id, 'move'); const p = deleteSheet.parentId; setDeleteSheet(null); go(p ?? '') }}>
              Wörter nach „Ohne Ordner“ verschieben
            </button>
            <button
              className="btn-red w-full"
              onClick={async () => {
                const f = deleteSheet
                if (await confirm({ title: 'Wörter wirklich löschen?', message: `${counts.get(f.id) ?? 0} Wörter und ihr Lernstand werden gelöscht.`, confirmLabel: 'Alles löschen', destructive: true })) {
                  deleteFolder(f.id, 'delete')
                  setDeleteSheet(null)
                  go(f.parentId ?? '')
                }
              }}
            >
              Wörter mitlöschen
            </button>
            <button className="btn-soft w-full" onClick={() => setDeleteSheet(null)}>Abbrechen</button>
          </div>
        )}
      </Sheet>

      {/* Wort bearbeiten */}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Wort bearbeiten' : 'Neues Wort'}>
        {draft && (
          <div className="space-y-3">
            <div>
              <p className="label mb-1">Koreanisch (Verben/Adjektive in Grundform auf -다)</p>
              <div className="flex gap-2">
                <input className="input" lang="ko" value={draft.korean} onChange={(e) => setDraft({ korean: e.target.value })} autoFocus />
                {settings.geminiApiKey.trim() && (
                  <button className="btn-soft shrink-0" onClick={() => void fillWithAi()} disabled={aiBusy || !draft.korean.trim()} title="Mit KI ergänzen">
                    {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} KI
                  </button>
                )}
              </div>
              {aiMsg && <p className="mt-1 text-xs text-label-2">{aiMsg}</p>}
            </div>
            <div><p className="label mb-1">Deutsch</p><input className="input" value={draft.german} onChange={(e) => setDraft({ german: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="label mb-1">Aussprache (nur Hangul)</p><input className="input" lang="ko" placeholder="[학꾜]" value={draft.pronunciation} onChange={(e) => setDraft({ pronunciation: e.target.value })} /></div>
              <div>
                <p className="label mb-1">Wortart</p>
                <select className="input" value={draft.wordType} onChange={(e) => setDraft({ wordType: e.target.value as WordType })}>
                  {Object.entries(WORD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <p className="label mb-1">Ordner</p>
              <select className="input" value={draft.folderId} onChange={(e) => setDraft({ folderId: e.target.value })} aria-label="Ordner">
                <option value="">Ohne Ordner</option>
                {flatTree(folders).map(({ f, depth }) => <option key={f.id} value={f.id}>{'  '.repeat(depth * 2)}{f.name}</option>)}
              </select>
            </div>
            <div><p className="label mb-1">Tags (mit Leerzeichen getrennt)</p><input className="input" placeholder="#Verb #Alltag" value={draft.tags} onChange={(e) => setDraft({ tags: e.target.value })} /></div>
            <div><p className="label mb-1">Notiz</p><textarea className="input min-h-16" placeholder="Eselsbrücke, Hinweis …" value={draft.note} onChange={(e) => setDraft({ note: e.target.value })} /></div>
            <div className="space-y-2">
              <p className="label">Beispielsätze</p>
              {Array.from({ length: MAX_EXAMPLES }, (_, i) => {
                const ex = draft.examples[i] ?? { ko: '', de: '', source: 'user' as const }
                const setEx = (patch: Partial<Example>) => {
                  const list = [...draft.examples]
                  while (list.length <= i) list.push({ ko: '', de: '', source: 'user' })
                  list[i] = { ...list[i], ...patch, source: 'user' }
                  setDraft({ examples: list })
                }
                return (
                  <div key={i} className="grid gap-1.5 rounded-2xl bg-fill-4 p-2 sm:grid-cols-2">
                    <input className="input" lang="ko" placeholder={`Satz ${i + 1} auf Koreanisch`} value={ex.ko} onChange={(e) => setEx({ ko: e.target.value })} aria-label={`Beispielsatz ${i + 1} Koreanisch`} />
                    <input className="input" placeholder="Übersetzung" value={ex.de} onChange={(e) => setEx({ de: e.target.value })} aria-label={`Beispielsatz ${i + 1} Deutsch`} />
                  </div>
                )
              })}
            </div>
            {isConj && (
              <div className="space-y-2 rounded-2xl bg-fill-4 p-3">
                <p className="label">Beugungen</p>
                {CONJUGATION_KEYS.map((k) => (
                  <div key={k}>
                    <p className="mb-0.5 text-xs text-label-2">{CONJUGATION_LABELS[k].label} ({CONJUGATION_LABELS[k].hint})</p>
                    <input className="input" lang="ko" value={draft.conj[k] ?? ''} onChange={(e) => setDraft({ conj: { ...draft.conj, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
            )}
            {/* Aussprache anhören und einzelne Aufnahmen neu erzeugen (gespeicherter Stand) */}
            {editing?.id && (() => {
              const saved = words.find((w) => w.id === editing.id)
              return saved ? <WordVoiceRows word={saved} /> : null
            })()}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {editing?.id && (
                <button
                  className="btn-soft mr-auto !text-red"
                  onClick={async () => {
                    const id = editing.id
                    if (id && (await confirm({ title: `„${draft.korean}“ löschen?`, message: 'Das Wort und sein Lernstand werden entfernt.', confirmLabel: 'Löschen', destructive: true }))) {
                      deleteWord(id)
                      setEditing(null)
                    }
                  }}
                >
                  <Trash2 size={16} /> Löschen
                </button>
              )}
              <button className="btn-soft" onClick={() => setEditing(null)}>Abbrechen</button>
              <button className="btn-primary" onClick={save} disabled={!draft.korean.trim()}>Speichern</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
