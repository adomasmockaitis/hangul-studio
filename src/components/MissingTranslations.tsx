/**
 * Hinweisfenster „Übersetzung fehlt“: erscheint bei jedem App-Start, solange Wörter ohne deutsche Übersetzung da sind.
 * Direkt eintragen, nochmal automatisch übersetzen, löschen oder „Später“.
 */
import { useMemo, useState } from 'react'
import { Languages, Loader2, Trash2 } from 'lucide-react'
import { callGeminiWithFallback } from '../lib/gemini'
import { fillTranslations, translateGoogle } from '../lib/importer'
import { useApp } from '../store'
import { Sheet } from './ui'
import { useToast } from './Toasts'

const K_LATER = 'hangul-studio:missing-later'

export function MissingTranslations({ suppressed }: { suppressed: boolean }) {
  const { words, settings, updateWord, deleteWord } = useApp()
  const toast = useToast()
  const missing = useMemo(() => words.filter((w) => w.korean.trim() && !w.german.trim()), [words])
  // „Später“ gilt für diesen Besuch – beim nächsten App-Start erscheint das Fenster wieder
  const [later, setLater] = useState(() => {
    try {
      return sessionStorage.getItem(K_LATER) === '1'
    } catch {
      return false
    }
  })
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  if (suppressed || later || !missing.length) return null

  const close = () => {
    try { sessionStorage.setItem(K_LATER, '1') } catch { /* ignore */ }
    setLater(true)
  }
  const saveAll = () => {
    let n = 0
    for (const w of missing) {
      const t = draft[w.id]?.trim()
      if (t) {
        updateWord(w.id, { german: t, needsReview: undefined })
        n++
      }
    }
    setDraft({})
    if (n) toast.show({ kind: 'success', key: 'missing', title: `${n} Übersetzungen gespeichert`, duration: 2500 })
  }
  const auto = async () => {
    setBusy(true)
    const key = settings.geminiApiKey.trim()
    const r = await fillTranslations(missing.map((w) => ({ id: w.id, korean: w.korean, german: '' })), {
      gemini: key ? async (p) => (await callGeminiWithFallback(key, settings.geminiModel, [{ text: p }], undefined, { timeoutMs: 25_000 })).text : undefined,
      google: (t, from) => translateGoogle(t, from),
    }).catch(() => null)
    setBusy(false)
    if (!r) return toast.show({ kind: 'error', key: 'missing', title: 'Übersetzen gerade nicht möglich', text: 'Bitte später noch einmal versuchen oder selbst eintragen.' })
    let n = 0
    for (const it of r.items) if (it.german) { updateWord(it.id, { german: it.german, needsReview: true }); n++ }
    toast.show({ kind: n ? 'success' : 'info', key: 'missing', title: n ? `${n} Wörter übersetzt` : 'Keine Übersetzung gefunden', text: n ? 'Sie sind gelb markiert – bitte kurz prüfen.' : undefined })
  }

  return (
    <Sheet open onClose={close} title="Übersetzung fehlt">
      <div className="space-y-4">
        <p className="text-sm text-label-2">
          {missing.length === 1 ? 'Ein Wort hat' : `${missing.length} Wörter haben`} noch keine deutsche Übersetzung. Ohne Übersetzung werden sie in Richtung Deutsch nicht abgefragt.
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {missing.map((w) => (
            <div key={w.id} className="flex items-center gap-2">
              <span lang="ko" className="w-28 shrink-0 truncate text-lg font-semibold">{w.korean}</span>
              <input
                className="input min-w-0 flex-1"
                placeholder="Deutsche Bedeutung"
                value={draft[w.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [w.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAll() }}
                aria-label={`Übersetzung für ${w.korean}`}
              />
              <button className="btn-soft !min-h-9 !px-2 !text-red" onClick={() => deleteWord(w.id)} aria-label={`${w.korean} löschen`} title="Wort löschen">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-soft" onClick={close}>Später</button>
          <button className="btn-soft" disabled={busy} onClick={() => void auto()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />} Nochmal automatisch übersetzen
          </button>
          <button className="btn-primary" disabled={!Object.values(draft).some((v) => v.trim())} onClick={saveAll}>Speichern</button>
        </div>
      </div>
    </Sheet>
  )
}
