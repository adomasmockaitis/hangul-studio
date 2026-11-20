import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Copy, FileUp, Loader2, Save, Sparkles, Trash2, Download } from 'lucide-react'
import { callGeminiWithFallback, extractVocabulary, type ExtractedWord } from '../lib/gemini'
import { fillTranslations, guessWordType, parseLooseText, translateGoogle } from '../lib/importer'
import { ocrDataLoaded, ocrImage, pdfToText } from '../lib/ocr'
import { useConfirm } from './ui'
import { newStats } from '../data/demo'
import { sanitizeWord, useApp } from '../store'
import { CONJUGATION_KEYS, CONJUGATION_LABELS, WORD_TYPE_LABELS, type Conjugations, type WordItem, type WordType } from '../types'
import { canAddSubfolder, folderPath, sortFolders } from '../lib/folders'
import type { Folder } from '../types'
import { findDuplicates, type DupEntry, type DupGroup } from '../lib/scanDuplicates'
import { DuplicateGroups, sharpenTranslations } from './DuplicateGroups'

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
  /** Übersetzung automatisch ergänzt – bitte prüfen */
  review: boolean
}

type Scanned = ExtractedWord & { review?: boolean }

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
  // Ohne Trennzeichen ist es keine Tabelle – dann zerlegt parseLooseText die Zeilen (z. B. „학교 Schule“)
  if (!lines[0].includes(sep)) return []
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, '')))
  if (/^korean(isch)?$/i.test(rows[0][0].replace(/^﻿/, ''))) rows.shift()
  return rows
    .filter((r) => r[0] && (r[1] || r.length === 1 || /[가-힣]/.test(r[0])))
    .filter((r) => r.length > 1 || r[0].length <= 30)
    .map((r) => ({
      korean: r[0], german: r[1] ?? '', pronunciation: r[2], wordType: r[3]?.toLowerCase() || guessWordType(r[0], r[1] ?? ''),
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

const NEW_FOLDER = '__neu__'

/** Ordner als eingerückte Liste in Baumreihenfolge */
function folderTree(folders: Folder[]): { f: Folder; depth: number }[] {
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

/** Dateiname ohne Endung, als Vorschlag für einen neuen Ordner */
const baseName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 60)

export function UploadScanner({ defaultFolderId = null, onBusy, onPending, onDone, background = false }: {
  defaultFolderId?: string | null
  /** Rückmeldungen für den Hintergrund-Scan (ScanHost) */
  onBusy?: (busy: boolean) => void
  onPending?: (rows: number) => void
  onDone?: (found: number) => void
  /** Hinweis anzeigen, dass man das Fenster während des Scans schließen kann */
  background?: boolean
}) {
  const { words, settings, addWords, updateWord, folders, addFolder } = useApp()
  /** Zielordner: '' = ohne Ordner, Ordner-ID oder NEW_FOLDER */
  const [target, setTarget] = useState<string>(defaultFolderId ?? '')
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [uploadTags, setUploadTags] = useState('')
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => onBusy?.(busy), [busy, onBusy])
  useEffect(() => onPending?.(rows.length), [rows.length, onPending])
  // Neuer Zielordner beim Öffnen aus einem anderen Ordner – nur solange nichts wartet
  useEffect(() => {
    if (!rows.length && !busy) setTarget(defaultFolderId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFolderId])
  const hasKey = !!settings.geminiApiKey.trim()
  const confirm = useConfirm()

  /** Fehlende Übersetzungen ergänzen: Gemini (mit Key, eine Anfrage), sonst Google Translate */
  const complete = async (items: Scanned[]) => {
    if (!items.some((w) => !w.german?.trim() || !w.korean?.trim())) return { items: items.map((w) => ({ ...w, review: !!w.review })), missing: 0 }
    setStatus('Fehlende Übersetzungen werden ergänzt …')
    const r = await fillTranslations(items.map((w) => ({ ...w, korean: w.korean ?? '', german: w.german ?? '' })), {
      gemini: hasKey ? async (prompt) => (await callGeminiWithFallback(settings.geminiApiKey, settings.geminiModel, [{ text: prompt }], undefined, { timeoutMs: 25_000 })).text : undefined,
      google: (t, from) => translateGoogle(t, from),
    })
    return r
  }

  /** Ohne Key: Bilder und PDFs offline erkennen (beim ersten Mal Hinweis auf die Sprachdaten) */
  const offlineText = async (f: File, isPdf: boolean): Promise<string | null> => {
    if (!isPdf && !ocrDataLoaded()) {
      const ok = await confirm({
        title: 'Texterkennung ohne Key einrichten?',
        message: 'Für Bilder lädt die App einmalig ca. 10–15 MB Sprachdaten (Koreanisch und Deutsch) und speichert sie im Browser. Danach geht es auch offline. Am besten klappt es mit sauber gedruckten Listen; handschriftliche oder unordentliche Notizen liest Gemini besser.',
        confirmLabel: 'Laden und erkennen',
      })
      if (!ok) return null
    }
    return isPdf ? pdfToText(f, setStatus) : ocrImage(f, setStatus)
  }

  const toRows = (items: Scanned[]): Row[] => {
    const known = new Set(words.map((w) => w.korean))
    const out: Row[] = []
    for (const it of items) {
      const w = sanitizeWord(it)
      if (!w) continue
      const dup = known.has(w.korean) || out.some((r) => r.korean === w.korean)
      // Ohne Angabe der Wortart (Offline-Scan, Tabellen) aus Wort und Übersetzung raten
      const wordType = it.wordType ? w.wordType : guessWordType(w.korean, w.german)
      out.push({
        id: crypto.randomUUID(), selected: !dup, korean: w.korean, german: w.german, pronunciation: w.pronunciation ?? '',
        wordType, tags: w.tags.join(' '), conj: w.conjugations ?? {}, open: false, duplicate: dup, review: !!it.review,
      })
    }
    return out
  }

  const handleFiles = async (files: File[]) => {
    setMsg(null)
    // Vorschlag: neuer Ordner mit dem Dateinamen („Lektion 5.pdf“ → „Lektion 5“), außer man ist schon in einem Ordner
    if (files[0] && !defaultFolderId && !rows.length) {
      setTarget(NEW_FOLDER)
      setNewName(baseName(files[0].name))
      setNewParent('')
    }
    setBusy(true)
    const found: Scanned[] = []
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
          } else {
            const table = parseTable(t)
            found.push(...(table.length ? table : parseLooseText(t)))
          }
        } else if ((e === 'pdf' || e in IMAGE_TYPES) && !hasKey) {
          // Ohne Key: Offline-Texterkennung, dann Zeilen in Wortpaare zerlegen
          const text = await offlineText(f, e === 'pdf')
          if (text === null) throw new Error('Texterkennung abgebrochen')
          const loose = parseLooseText(text)
          if (!loose.length) throw new Error('kein Text erkannt – bei Handschrift oder unordentlichen Notizen hilft ein Gemini-Key')
          found.push(...loose)
        } else if (e === 'pdf' || e in IMAGE_TYPES) {
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
    const filled = await complete(found).catch(() => ({ items: found.map((w) => ({ ...w, review: false })), missing: 0 }))
    setBusy(false)
    setStatus('')
    const newRows = toRows(filled.items)
    setRows((r) => [...r, ...newRows])
    onDone?.(newRows.length)
    const extra = translationNote(filled.items.length - newRows.length, newRows)
    setMsg(
      problems.length
        ? { ok: false, text: problems.join(' · ') + (newRows.length ? ` — ${newRows.length} Wörter erkannt.${extra}` : '') }
        : { ok: newRows.length > 0, text: newRows.length ? `${newRows.length} Wörter erkannt – bitte unten prüfen.${extra}` : 'Keine Vokabeln gefunden.' },
    )
  }

  /** Hinweis zu ergänzten / fehlenden Übersetzungen */
  const translationNote = (dropped: number, rs: Row[]) => {
    const review = rs.filter((r) => r.review).length
    const missing = rs.filter((r) => !r.german.trim()).length
    return [
      review ? ` ${review === 1 ? "Eine Übersetzung" : `${review} Übersetzungen`} automatisch ergänzt (gelb: bitte prüfen).` : '',
      missing ? ` ${missing === 1 ? "Ein Wort" : `${missing} Wörter`} ohne Übersetzung – ${missing === 1 ? "wird" : "werden"} trotzdem gespeichert und später nachgefragt.` : '',
      dropped > 0 ? ` ${dropped === 1 ? "Ein deutscher Eintrag ließ" : `${dropped} deutsche Einträge ließen`} sich nicht ins Koreanische übersetzen und ${dropped === 1 ? "fehlt" : "fehlen"}.` : '',
    ].join('')
  }

  const handlePaste = async () => {
    if (!paste.trim()) return
    setMsg(null)
    setBusy(true)
    try {
      let truncated = false
      let items: Scanned[]
      if (hasKey) {
        const r = await extractVocabulary(settings.geminiApiKey, settings.geminiModel, { text: paste }, setStatus)
        items = r.words
        truncated = r.truncated
      } else {
        const table = parseTable(paste)
        items = table.length ? table : parseLooseText(paste)
      }
      const filled = await complete(items).catch(() => ({ items: items.map((w) => ({ ...w, review: false })), missing: 0 }))
      const newRows = toRows(filled.items)
      setRows((r) => [...r, ...newRows])
      onDone?.(newRows.length)
      setMsg({
        ok: newRows.length > 0 && !truncated,
        text: newRows.length
          ? `${newRows.length} Wörter erkannt – bitte unten prüfen.${translationNote(filled.items.length - newRows.length, newRows)}${truncated ? ' ⚠ Die Antwort war zu lang, einige Wörter am Ende fehlen evtl. – Text in kleinere Teile aufteilen.' : ''}`
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

  // ---------- Gleiche Bedeutung doppelt? ----------
  const [keepBoth, setKeepBoth] = useState<Set<string>>(new Set())
  const [sharpening, setSharpening] = useState<string | null>(null)
  const [sharpenError, setSharpenError] = useState('')
  const dupGroups = useMemo(() => {
    const scan: DupEntry[] = rows.filter((r) => r.selected && r.korean.trim()).map((r) => ({ id: r.id, source: 'scan', korean: r.korean, german: r.german }))
    const dict: DupEntry[] = words.map((w) => ({ id: w.id, source: 'dict', korean: w.korean, german: w.german }))
    return findDuplicates(scan, dict).filter((g) => !keepBoth.has(g.key))
  }, [rows, words, keepBoth])
  const dupIds = useMemo(() => new Set(dupGroups.flatMap((g) => g.entries.map((e) => e.id))), [dupGroups])

  /** Nur dieses behalten: die anderen Scan-Einträge der Gruppe abwählen (Wörterbuch bleibt unverändert) */
  const keepOnly = (g: DupGroup, e: DupEntry) =>
    setRows((rs) => rs.map((r) => (g.entries.some((x) => x.source === 'scan' && x.id === r.id && x.id !== e.id) ? { ...r, selected: false } : r)))

  /** Gemini schärft die deutschen Übersetzungen, damit man die Wörter auseinanderhalten kann */
  const sharpen = async (g: DupGroup) => {
    setSharpening(g.key)
    setSharpenError('')
    try {
      const changes = await sharpenTranslations(settings.geminiApiKey, settings.geminiModel, g.entries)
      for (const e of g.entries) {
        const german = changes.get(e.id)
        if (!german) continue
        if (e.source === 'scan') patch(e.id, { german, review: true })
        else updateWord(e.id, { german, needsReview: true })
      }
      // geschärft = erledigt, auch wenn die Bedeutungen noch ähnlich klingen
      setKeepBoth((k) => new Set(k).add(g.key))
    } catch (err) {
      setSharpenError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSharpening(null)
    }
  }
  const selected = rows.filter((r) => r.selected && r.korean.trim())

  const saveAll = () => {
    let folderId: string | undefined = target && target !== NEW_FOLDER ? target : undefined
    if (target === NEW_FOLDER) {
      const id = addFolder(newName.trim() || 'Neuer Ordner', newParent || null)
      if (!id) {
        setMsg({ ok: false, text: 'Der Ordner konnte nicht angelegt werden (höchstens 3 Ebenen).' })
        return
      }
      folderId = id
    }
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
        needsReview: r.review && r.german.trim() ? true : undefined,
        tags: [...new Set([...parseTags(r.tags), ...extra])],
        createdAt: Date.now() + i,
        conjugations: isConj && Object.keys(conj).length ? (conj as Conjugations) : undefined,
        stats: newStats(),
        folderId,
      }
    })
    const n = addWords(items)
    const where = target === NEW_FOLDER ? ` im neuen Ordner „${newName.trim() || 'Neuer Ordner'}“` : folderId ? ` in „${folderPath(folders, folderId).map((f) => f.name).join(' › ')}“` : ''
    setRows([])
    setUploadTags('')
    setTarget(defaultFolderId ?? '')
    setNewName('')
    setMsg({ ok: true, text: `${n} Wörter gespeichert${where}${items.length - n ? ` (${items.length - n} bereits vorhanden, übersprungen)` : ''}.` })
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
        <Sparkles size={18} className="text-blue" />
        <h3 className="font-semibold">Intelligenter Datei- & Übungsblatt-Scanner</h3>
        <button className="btn-soft ml-auto !py-1 text-xs" onClick={downloadTemplate}><Download size={14} /> CSV-Vorlage</button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) void handleFiles([...e.dataTransfer.files]) }}
        onClick={() => !busy && fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-blue bg-blue/10' : 'border-separator hover:bg-fill-4'}`}
      >
        {busy ? <Loader2 className="animate-spin text-blue" size={28} /> : <FileUp className="text-blue" size={28} />}
        <p className="font-medium">{busy ? status || 'Analysiere …' : 'Dateien hierher ziehen oder klicken'}</p>
        <p className="text-xs text-label-2">PDF, PNG/JPG, TXT, CSV, JSON {hasKey ? '' : '· ohne Key: PDF/Bilder per Offline-Texterkennung (am besten sauber gedruckt)'}</p>
        <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.tsv,.json" className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) void handleFiles(f); e.target.value = '' }} />
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea className="input min-h-20 flex-1" placeholder="…oder Text direkt einfügen (Vokabelliste, Kursfolie, Lektionstext)" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn-primary sm:self-end" onClick={() => void handlePaste()} disabled={busy || !paste.trim()}>
          <Sparkles size={16} /> {hasKey ? 'Mit KI analysieren' : 'Einlesen'}
        </button>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-green' : 'text-red'}`}>{msg.text}</p>}

      {background && busy && (
        <p className="mt-3 rounded-xl bg-fill-4 px-3 py-2 text-sm text-label-2">Du kannst dieses Fenster schließen – der Scan läuft im Hintergrund weiter, und du bekommst eine Meldung, sobald er fertig ist.</p>
      )}
      {rows.length > 0 && dupGroups.length > 0 && (
        <div className="fade-up mt-5 space-y-3 rounded-2xl border border-orange/40 bg-orange/10 p-3">
          <p className="flex items-center gap-2 font-semibold"><Copy size={17} className="text-orange" /> {dupGroups.length === 1 ? 'Eine Bedeutung kommt' : `${dupGroups.length} Bedeutungen kommen`} doppelt vor</p>
          <p className="text-sm text-label-2">Wähle, welches Wort du behalten willst, behalte beide – oder lass Gemini die Übersetzungen so schärfen, dass du sie auseinanderhalten kannst.</p>
          <DuplicateGroups
            groups={dupGroups}
            hasKey={hasKey}
            sharpening={sharpening}
            error={sharpenError}
            onKeepOnly={keepOnly}
            onKeepBoth={(g) => setKeepBoth((k) => new Set(k).add(g.key))}
            onSharpen={(g) => void sharpen(g)}
            sourceLabel={(e) => (e.source === 'scan' ? 'neu im Scan' : 'schon im Wörterbuch')}
          />
        </div>
      )}
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

          <div className="overflow-x-auto rounded-2xl border border-separator">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-fill-4 text-left text-xs uppercase tracking-wide text-label-2">
                <tr>
                  <th className="w-10 p-2" /><th className="p-2">Koreanisch</th><th className="p-2">Deutsch</th>
                  <th className="p-2">Aussprache</th><th className="p-2">Art</th><th className="p-2">Tags</th><th className="w-20 p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isConj = r.wordType === 'verb' || r.wordType === 'adjective'
                  const cell = 'w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 outline-none focus:border-blue focus:bg-surface'
                  return (
                    <Fragment key={r.id}>
                      <tr className={`border-t border-separator ${r.selected ? '' : 'opacity-50'}`}>
                        <td className="p-2 text-center"><input type="checkbox" className="accent-blue" checked={r.selected} onChange={(e) => patch(r.id, { selected: e.target.checked })} /></td>
                        <td className="p-1">
                          <input className={`${cell} text-base font-semibold`} lang="ko" value={r.korean} onChange={(e) => patch(r.id, { korean: e.target.value })} />
                          {r.duplicate && <span className="px-2 text-[10px] font-medium text-orange">bereits vorhanden</span>}
                          {!r.duplicate && dupIds.has(r.id) && <span className="px-2 text-[10px] font-medium text-orange">ähnliche Bedeutung – siehe oben</span>}
                        </td>
                        <td className="p-1">
                          <input className={`${cell} ${r.review ? 'bg-yellow/15' : ''}`} value={r.german} placeholder="Übersetzung fehlt" onChange={(e) => patch(r.id, { german: e.target.value, review: false })} />
                          {r.review && <span className="px-2 text-[10px] font-medium text-orange">automatisch übersetzt – bitte prüfen</span>}
                          {!r.german.trim() && <span className="px-2 text-[10px] font-medium text-red">Übersetzung fehlt</span>}
                        </td>
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
                          <button className="btn-soft ml-1 !p-1.5 !text-red" title="Zeile entfernen" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                      {r.open && isConj && (
                        <tr key={`${r.id}-c`} className="bg-fill-4">
                          <td />
                          <td colSpan={6} className="p-2">
                            <div className="grid gap-2 sm:grid-cols-4">
                              {CONJUGATION_KEYS.map((k) => (
                                <div key={k}>
                                  <p className="mb-0.5 text-[10px] text-label-2">{CONJUGATION_LABELS[k].label}</p>
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

          {/* Zielordner */}
          <div className="space-y-2 rounded-2xl bg-fill-4 p-3">
            <label className="label block" htmlFor="scan-target">In Ordner speichern</label>
            <select id="scan-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Ohne Ordner</option>
              {folderTree(folders).map(({ f, depth }) => <option key={f.id} value={f.id}>{'\u00a0\u00a0'.repeat(depth * 2)}{f.name}</option>)}
              <option value={NEW_FOLDER}>+ Neuer Ordner …</option>
            </select>
            {target === NEW_FOLDER && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input" placeholder="Name des neuen Ordners" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Name des neuen Ordners" />
                <select className="input" value={newParent} onChange={(e) => setNewParent(e.target.value)} aria-label="Neuer Ordner liegt in">
                  <option value="">Oberste Ebene</option>
                  {folderTree(folders).filter(({ f }) => canAddSubfolder(folders, f.id)).map(({ f, depth }) => <option key={f.id} value={f.id}>{'\u00a0\u00a0'.repeat(depth * 2)}in „{f.name}“</option>)}
                </select>
              </div>
            )}
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
