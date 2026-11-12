import { useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Sparkles, Trash2, Volume2 } from 'lucide-react'
import { Modal, PageHeader } from '../components/ui'
import { parseTags, UploadScanner } from '../components/UploadScanner'
import { completeWord } from '../lib/gemini'
import { speakWord } from '../lib/speech'
import { useApp } from '../store'
import { CONJUGATION_KEYS, CONJUGATION_LABELS, WORD_TYPE_LABELS, type Conjugations, type WordItem, type WordType } from '../types'

interface Draft {
  korean: string
  german: string
  pronunciation: string
  wordType: WordType
  tags: string
  conj: Conjugations
}

const emptyDraft: Draft = { korean: '', german: '', pronunciation: '', wordType: 'noun', tags: '', conj: {} }

function toDraft(w: WordItem): Draft {
  return { korean: w.korean, german: w.german, pronunciation: w.pronunciation ?? '', wordType: w.wordType, tags: w.tags.join(' '), conj: w.conjugations ?? {} }
}

type Sort = 'new' | 'old' | 'errors'

const errorRate = (w: WordItem) => {
  const t = w.stats.correctCount + w.stats.wrongCount
  return t ? w.stats.wrongCount / t : -1
}

export function Dictionary() {
  const { words, settings, addWord, updateWord, deleteWord } = useApp()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<Sort>('new')
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState('')

  const tags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))].sort(), [words])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const f = words.filter((w) => (!tag || w.tags.includes(tag)) && (!s || w.korean.includes(s) || w.german.toLowerCase().includes(s)))
    return f.sort((a, b) =>
      sort === 'new' ? b.createdAt - a.createdAt : sort === 'old' ? a.createdAt - b.createdAt : errorRate(b) - errorRate(a) || b.stats.wrongCount - a.stats.wrongCount,
    )
  }, [words, q, tag, sort])

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

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Wörterbuch & Upload"
        subtitle={`${words.length} Wörter`}
        right={<button className="btn-primary" onClick={() => setEditing({ id: null, draft: emptyDraft })}><Plus size={16} /> Neues Wort</button>}
      />

      <UploadScanner />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 basis-48">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
          <input className="input !pl-9" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input !w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Alle Tags</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="new">Neueste zuerst</option>
          <option value="old">Älteste zuerst</option>
          <option value="errors">Höchste Fehlerquote</option>
        </select>
      </div>

      <div className="card divide-y divide-black/[0.06] overflow-hidden dark:divide-white/10">
        {list.length === 0 && <p className="p-6 text-center text-sm text-black/50 dark:text-white/50">Keine Wörter gefunden.</p>}
        {list.map((w) => {
          const rate = errorRate(w)
          return (
            <div key={w.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xl font-semibold">{w.korean}</span>
                  {w.pronunciation && <span className="text-sm text-[#007aff]">{w.pronunciation}</span>}
                  <span className="text-black/60 dark:text-white/60">{w.german}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-black/40 dark:text-white/40">
                  <span className="font-medium">{WORD_TYPE_LABELS[w.wordType]}</span>
                  {w.tags.map((t) => <span key={t}>{t}</span>)}
                  {rate >= 0 && <span className={rate > 0.4 ? 'font-medium text-[#ff3b30]' : ''}>· {Math.round(rate * 100)}% Fehler</span>}
                </p>
              </div>
              <button className="btn-soft !p-2" onClick={() => speakWord(w, settings.speechMode)} aria-label="Vorlesen"><Volume2 size={16} /></button>
              <button className="btn-soft !p-2" onClick={() => setEditing({ id: w.id, draft: toDraft(w) })} aria-label="Bearbeiten"><Pencil size={16} /></button>
              <button className="btn-soft !p-2 !text-[#ff3b30]" onClick={() => confirm(`„${w.korean}“ löschen?`) && deleteWord(w.id)} aria-label="Löschen"><Trash2 size={16} /></button>
            </div>
          )
        })}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Wort bearbeiten' : 'Neues Wort'}>
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
              {aiMsg && <p className="mt-1 text-xs text-black/55 dark:text-white/55">{aiMsg}</p>}
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
            <div><p className="label mb-1">Tags (mit Leerzeichen getrennt)</p><input className="input" placeholder="#Verb #Alltag #Kapitel1" value={draft.tags} onChange={(e) => setDraft({ tags: e.target.value })} /></div>
            {isConj && (
              <div className="space-y-2 rounded-2xl bg-black/[0.04] p-3 dark:bg-white/5">
                <p className="label">Beugungen</p>
                {CONJUGATION_KEYS.map((k) => (
                  <div key={k}>
                    <p className="mb-0.5 text-xs text-black/50 dark:text-white/50">{CONJUGATION_LABELS[k].label} ({CONJUGATION_LABELS[k].hint})</p>
                    <input className="input" lang="ko" value={draft.conj[k] ?? ''} onChange={(e) => setDraft({ conj: { ...draft.conj, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-soft" onClick={() => setEditing(null)}>Abbrechen</button>
              <button className="btn-primary" onClick={save} disabled={!draft.korean.trim()}>Speichern</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
