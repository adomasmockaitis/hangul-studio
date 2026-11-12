import { Fragment, useRef, useState } from 'react'
import { ChevronDown, FileUp, Loader2, Save, Sparkles, Trash2, Download } from 'lucide-react'
import { extractVocabulary, type ExtractedWord } from '../lib/gemini'
import { newStats } from '../data/demo'
import { sanitizeWord, useApp } from '../store'
import { CONJUGATION_KEYS, CONJUGATION_LABELS, WORD_TYPE_LABELS, type Conjugations, type WordItem, type WordType } from '../types'

interface Row {
  id: string
  selected: boolean
  korean: string
  german: string
  pronunciation: string
  wordType: WordType
  tags: string
  conj: Conjugations
  open: boolean
  duplicate: boolean
}

const MAX_BYTES = 15 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

export function parseTags(s: string): string[] {
  return [...new Set(s.split(/[\s,;]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`)))]
}

/** CSV/TSV: korean;german;pronunciation;wordType;tags;presentPolite;presentFormal;pastPolite;futurePolite */
function parseTable(text: string): ExtractedWord[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0]
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')))
  if (/^korean(isch)?$/i.test(rows[0][0].replace(/^﻿/, ''))) rows.shift()
  return rows
    .filter((r) => r[0] && r[1])
    .map((r) => ({
      korean: r[0], german: r[1], pronunciation: r[2], wordType: r[3]?.toLowerCase() || (r[0].endsWith('다') ? 'verb' : 'noun'),
      tags: r[4] ? parseTags(r[4]) : [],
      conjugations: { presentPolite: r[5], presentFormal: r[6], pastPolite: r[7], futurePolite: r[8] },
    }))
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
    fr.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
    fr.readAsDataURL(file)
  })
}

const ext = (f: File) => f.name.split('.').pop()?.toLowerCase() ?? ''

export function UploadScanner() {
  const { words, settings, addWords } = useApp()
  const [rows, setRows] = useState<Row[]>([])
  const [uploadTags, setUploadTags] = useState('')
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const hasKey = !!settings.geminiApiKey.trim()

  const toRows = (items: ExtractedWord[]): Row[] => {
    const known = new Set(words.map((w) => w.korean))
    const out: Row[] = []
    for (const it of items) {
      const w = sanitizeWord(it)
      if (!w) continue
      const dup = known.has(w.korean) || out.some((r) => r.korean === w.korean)
      out.push({
        id: crypto.randomUUID(), selected: !dup, korean: w.korean, german: w.german, pronunciation: w.pronunciation ?? '',
        wordType: w.wordType, tags: w.tags.join(' '), conj: w.conjugations ?? {}, open: false, duplicate: dup,
      })
    }
    return out
  }

  const handleFiles = async (files: File[]) => {
    setMsg(null)
    setBusy(true)
    const found: ExtractedWord[] = []
    const problems: string[] = []
    for (const f of files) {
      const e = ext(f)
      try {
        if (f.size > MAX_BYTES) throw new Error('größer als 15 MB')
        if (e === 'json') {
          const j = JSON.parse(await f.text())
          found.push(...((Array.isArray(j) ? j : Array.isArray(j?.words) ? j.words : []) as ExtractedWord[]))
        } else if (e === 'csv' || e === 'tsv') {
          found.push(...parseTable(await f.text()))
        } else if (e === 'txt') {
          const t = await f.text()
          if (hasKey) {
            setStatus(`Analysiere ${f.name} …`)
            const r = await extractVocabulary(settings.geminiApiKey, settings.geminiModel, { text: t }, setStatus)
            found.push(...r.words)
            if (r.truncated) problems.push(f.name + ': Antwort war zu lang, einige Wörter am Ende fehlen evtl. – Datei in kleinere Teile aufteilen')
          } else found.push(...parseTable(t))
        } else if (e === 'pdf' || e in IMAGE_TYPES) {
          if (!hasKey) throw new Error('für PDF/Bilder wird ein Gemini API-Key benötigt')
          setStatus(`Analysiere ${f.name} …`)
          const base64 = await toBase64(f)
          const r = await extractVocabulary(settings.geminiApiKey, settings.geminiModel, { mimeType: e === 'pdf' ? 'application/pdf' : IMAGE_TYPES[e], base64 }, setStatus)
          found.push(...r.words)
          if (r.truncated) problems.push(f.name + ': Antwort war zu lang, einige Wörter am Ende fehlen evtl. – Datei in kleinere Teile aufteilen')
        } else throw new Error('Dateityp nicht unterstützt')
      } catch (err) {
        problems.push(`${f.name}: ${err instanceof Error ? err.message : 'Fehler'}`)
      }
    }
    setBusy(false)
    setStatus('')
    const newRows = toRows(found)
    setRows((r) => [...r, ...newRows])
    setMsg(
      problems.length
        ? { ok: false, text: problems.join(' · ') + (newRows.length ? ` — ${newRows.length} Wörter erkannt.` : '') }
        : { ok: newRows.length > 0, text: newRows.length ? `${newRows.length} Wörter erkannt – bitte unten prüfen.` : 'Keine Vokabeln gefunden.' },
    )
  }

  const handlePaste = async () => {
    if (!paste.trim()) return
    setMsg(null)
    setBusy(true)
    try {
      let truncated = false
      let items: ExtractedWord[]
      if (hasKey) {
        const r = await extractVocabulary(settings.geminiApiKey, settings.geminiModel, { text: paste }, setStatus)
        items = r.words
        truncated = r.truncated
      } else items = parseTable(paste)
      const newRows = toRows(items)
      setRows((r) => [...r, ...newRows])
      setMsg({
        ok: newRows.length > 0 && !truncated,
        text: newRows.length
          ? `${newRows.length} Wörter erkannt – bitte unten prüfen.${truncated ? ' ⚠ Die Antwort war zu lang, einige Wörter am Ende fehlen evtl. – Text in kleinere Teile aufteilen.' : ''}`
          : 'Keine Vokabeln gefunden.',
      })
      if (newRows.length) setPaste('')
    } catch (err) {
      setMsg({ ok: false, text: `Analyse fehlgeschlagen: ${err instanceof Error ? err.message : 'Fehler'}` })
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const selected = rows.filter((r) => r.selected && r.korean.trim())

  const saveAll = () => {
    const extra = parseTags(uploadTags)
    const items: WordItem[] = selected.map((r, i) => {
      const conj = Object.fromEntries(Object.entries(r.conj).filter(([, v]) => v && v.trim()))
      const isConj = r.wordType === 'verb' || r.wordType === 'adjective'
      return {
        id: crypto.randomUUID(),
        korean: r.korean.trim(),
        german: r.german.trim(),
        pronunciation: r.pronunciation.trim() || undefined,
        wordType: r.wordType,
        tags: [...new Set([...parseTags(r.tags), ...extra])],
        createdAt: Date.now() + i,
        conjugations: isConj && Object.keys(conj).length ? (conj as Conjugations) : undefined,
        stats: newStats(),
      }
    })
    const n = addWords(items)
    setRows([])
    setUploadTags('')
    setMsg({ ok: true, text: `${n} Wörter gespeichert${items.length - n ? ` (${items.length - n} bereits vorhanden, übersprungen)` : ''}.` })
  }

  const downloadTemplate = () => {
    const csv = 'korean;german;pronunciation;wordType;tags;presentPolite;presentFormal;pastPolite;futurePolite\n' +
      '먹다;essen;[먹따];verb;#Verb #Alltag;먹어요;먹습니다;먹었어요;먹을 거예요\n학교;Schule;[학꾜];noun;#Nomen #Ort;;;;\n'
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'vokabel-vorlage.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="card mb-5 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Sparkles size={18} className="text-[#007aff]" />
        <h2 className="font-semibold">Intelligenter Datei- & Übungsblatt-Scanner</h2>
        <button className="btn-soft ml-auto !py-1 text-xs" onClick={downloadTemplate}><Download size={14} /> CSV-Vorlage</button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) void handleFiles([...e.dataTransfer.files]) }}
        onClick={() => !busy && fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-[#007aff] bg-[#007aff]/10' : 'border-black/15 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/5'}`}
      >
        {busy ? <Loader2 className="animate-spin text-[#007aff]" size={28} /> : <FileUp className="text-[#007aff]" size={28} />}
        <p className="font-medium">{busy ? status || 'Analysiere …' : 'Dateien hierher ziehen oder klicken'}</p>
        <p className="text-xs text-black/50 dark:text-white/50">PDF, PNG/JPG, TXT, CSV, JSON {hasKey ? '' : '· PDF/Bilder benötigen einen Gemini API-Key (Einstellungen)'}</p>
        <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.tsv,.json" className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) void handleFiles(f); e.target.value = '' }} />
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea className="input min-h-20 flex-1" placeholder="…oder Text direkt einfügen (Vokabelliste, Kursfolie, Lektionstext)" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn-primary sm:self-end" onClick={() => void handlePaste()} disabled={busy || !paste.trim()}>
          <Sparkles size={16} /> {hasKey ? 'Mit KI analysieren' : 'Einlesen'}
        </button>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>{msg.text}</p>}

      {rows.length > 0 && (
        <div className="fade-up mt-5 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <p className="label mb-1">Eigene Tags für diesen gesamten Upload hinzufügen</p>
              <input className="input" placeholder="#Kapitel1 #Kursblatt" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} />
            </div>
            <button className="btn-soft" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: !rs.every((x) => x.selected) })))}>
              Alle an/abwählen
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-black/[0.04] text-left text-xs uppercase tracking-wide text-black/50 dark:bg-white/5 dark:text-white/50">
                <tr>
                  <th className="w-10 p-2" /><th className="p-2">Koreanisch</th><th className="p-2">Deutsch</th>
                  <th className="p-2">Aussprache</th><th className="p-2">Art</th><th className="p-2">Tags</th><th className="w-20 p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isConj = r.wordType === 'verb' || r.wordType === 'adjective'
                  const cell = 'w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 outline-none focus:border-[#007aff] focus:bg-white/60 dark:focus:bg-white/10'
                  return (
                    <Fragment key={r.id}>
                      <tr className={`border-t border-black/[0.06] dark:border-white/10 ${r.selected ? '' : 'opacity-50'}`}>
                        <td className="p-2 text-center"><input type="checkbox" className="accent-[#007aff]" checked={r.selected} onChange={(e) => patch(r.id, { selected: e.target.checked })} /></td>
                        <td className="p-1">
                          <input className={`${cell} text-base font-semibold`} lang="ko" value={r.korean} onChange={(e) => patch(r.id, { korean: e.target.value })} />
                          {r.duplicate && <span className="px-2 text-[10px] font-medium text-[#ff9500]">bereits vorhanden</span>}
                        </td>
                        <td className="p-1"><input className={cell} value={r.german} onChange={(e) => patch(r.id, { german: e.target.value })} /></td>
                        <td className="p-1"><input className={cell} lang="ko" value={r.pronunciation} onChange={(e) => patch(r.id, { pronunciation: e.target.value })} /></td>
                        <td className="p-1">
                          <select className="rounded-lg px-1.5 py-1.5 text-sm" value={r.wordType} onChange={(e) => patch(r.id, { wordType: e.target.value as WordType })}>
                            {Object.entries(WORD_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </td>
                        <td className="p-1"><input className={cell} value={r.tags} onChange={(e) => patch(r.id, { tags: e.target.value })} /></td>
                        <td className="p-1 text-right">
                          {isConj && (
                            <button className="btn-soft !p-1.5" title="Beugungen" onClick={() => patch(r.id, { open: !r.open })}>
                              <ChevronDown size={15} className={`transition ${r.open ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                          <button className="btn-soft ml-1 !p-1.5 !text-[#ff3b30]" title="Zeile entfernen" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                      {r.open && isConj && (
                        <tr key={`${r.id}-c`} className="bg-black/[0.03] dark:bg-white/[0.04]">
                          <td />
                          <td colSpan={6} className="p-2">
                            <div className="grid gap-2 sm:grid-cols-4">
                              {CONJUGATION_KEYS.map((k) => (
                                <div key={k}>
                                  <p className="mb-0.5 text-[10px] text-black/50 dark:text-white/50">{CONJUGATION_LABELS[k].label}</p>
                                  <input className="input !py-1.5" lang="ko" value={r.conj[k] ?? ''} onChange={(e) => patch(r.id, { conj: { ...r.conj, [k]: e.target.value } })} />
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-soft" onClick={() => setRows([])}>Verwerfen</button>
            <button className="btn-primary" onClick={saveAll} disabled={!selected.length}>
              <Save size={16} /> Alle ausgewählten Wörter speichern ({selected.length})
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
