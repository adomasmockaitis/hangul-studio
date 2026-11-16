import { useEffect, useState } from 'react'
import { KeyRound, Loader2, NotebookPen, RefreshCw, Sparkles, Volume2 } from 'lucide-react'
import { generateExamples } from '../lib/examples'
import { computeLevel } from '../lib/level'
import { navigate } from '../lib/route'
import { speak } from '../lib/speech'
import { useApp } from '../store'
import type { WordItem } from '../types'

/** Wörter, für die in dieser Sitzung schon automatisch Sätze angefragt wurden (keine Endlos-Anfragen bei Fehlern) */
const autoTried = new Set<string>()

/** Notiz und Beispielsätze zu einem Wort (Lernmodus) */
export function WordExtras({ word }: { word: WordItem }) {
  const { settings, updateWord, words, reviewLog } = useApp()
  const key = settings.geminiApiKey.trim()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editNote, setEditNote] = useState(false)
  const [note, setNote] = useState(word.note ?? '')
  const examples = word.examples ?? []

  const create = async () => {
    if (!key) return
    setBusy(true)
    setErr('')
    try {
      const level = computeLevel(words, reviewLog).level
      const ex = await generateExamples(key, settings.geminiModel, word, level)
      updateWord(word.id, { examples: ex })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  // Fehlende Sätze automatisch erzeugen (einstellbar, nur mit Key, einmal pro Wort und Sitzung)
  useEffect(() => {
    if (!key || !settings.autoExamples || examples.length || autoTried.has(word.id) || !word.german.trim()) return
    autoTried.add(word.id)
    void create()
    // nur beim Erscheinen eines Worts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  return (
    <div className="mt-5 space-y-4 border-t border-separator pt-4 text-left">
      {/* Notiz */}
      {editNote ? (
        <div>
          <textarea
            className="input min-h-20"
            autoFocus
            placeholder="Eselsbrücke, Hinweis, Verwechslungsgefahr …"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Notiz"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button className="btn-soft" onClick={() => { setNote(word.note ?? ''); setEditNote(false) }}>Abbrechen</button>
            <button className="btn-primary" onClick={() => { updateWord(word.id, { note: note.trim() || undefined }); setEditNote(false) }}>Speichern</button>
          </div>
        </div>
      ) : word.note ? (
        <button className="flex w-full items-start gap-2 rounded-2xl bg-yellow/15 p-3 text-left text-sm transition hover:bg-yellow/25" onClick={() => setEditNote(true)} aria-label="Notiz bearbeiten">
          <NotebookPen size={16} className="mt-0.5 shrink-0 text-orange" />
          <span className="whitespace-pre-wrap">{word.note}</span>
        </button>
      ) : (
        <button className="btn-soft !min-h-9 !py-1 text-xs" onClick={() => setEditNote(true)}><NotebookPen size={14} /> Notiz hinzufügen</button>
      )}

      {/* Beispielsätze */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="label">Beispielsätze</p>
          {key && examples.length > 0 && (
            <button className="flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-medium text-blue transition hover:bg-fill-4 disabled:opacity-40" disabled={busy} onClick={() => void create()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Neue Sätze
            </button>
          )}
        </div>
        {examples.length > 0 ? (
          <ul className="space-y-2">
            {examples.map((e, i) => (
              <li key={i} className="flex items-start gap-2 rounded-2xl bg-fill-4 p-3">
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-blue transition hover:bg-fill-3" onClick={() => speak(e.ko)} aria-label={`Satz vorlesen: ${e.ko}`}>
                  <Volume2 size={17} />
                </button>
                <span className="min-w-0">
                  <span lang="ko" className="block text-lg font-medium">{e.ko}</span>
                  {e.de && <span className="block text-sm text-label-2">{e.de}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : key ? (
          <button className="btn-soft" disabled={busy} onClick={() => void create()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy ? 'Gemini schreibt Sätze …' : 'Beispielsätze erzeugen'}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-fill-4 p-3 text-sm text-label-2">
            <span className="flex-1">Beispielsätze erzeugt Gemini – nur mit API-Key verfügbar.</span>
            <button className="btn-soft !min-h-9 !py-1 text-xs" onClick={() => navigate('/einstellungen/ki')}><KeyRound size={14} /> Key hinzufügen</button>
          </div>
        )}
        {err && <p className="mt-2 text-xs text-red">Beispielsätze fehlgeschlagen: {err}</p>}
      </div>
    </div>
  )
}
