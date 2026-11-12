import { useEffect, useState } from 'react'
import { ChevronDown, Volume2 } from 'lucide-react'
import { speak } from '../lib/speech'
import { useApp } from '../store'
import { CONJUGATION_LABELS, WORD_TYPE_LABELS, type ConjugationKey, type WordItem } from '../types'
import { HangulCanvas } from './HangulCanvas'

interface Props {
  word: WordItem
  /** quiz: deutsches Wort gefragt, Koreanisch erst nach der Prüfung sichtbar */
  mode: 'browse' | 'quiz'
  onResult: (correct: boolean) => void
  onRevise?: (correct: boolean) => void
  onNext?: () => void
  nextLabel?: string
}

export function WordCard({ word, mode, onResult, onRevise, onNext, nextLabel }: Props) {
  const { settings } = useApp()
  const [showPron, setShowPron] = useState(false)
  const [open, setOpen] = useState<ConjugationKey | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (settings.autoSpeak) speak(word.korean)
    // nur bei neuer Karte vorlesen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id])

  const hideKorean = mode === 'quiz' && !done
  const forms = word.conjugations
    ? settings.activeConjugations.filter((k) => word.conjugations?.[k])
    : []

  return (
    <div className="space-y-5">
      <div className="card fade-up p-6 text-center">
        <div className="mb-3 flex items-center justify-center gap-2 text-xs text-black/45 dark:text-white/45">
          <span className="rounded-full bg-black/[0.06] px-2.5 py-0.5 font-medium dark:bg-white/10">{WORD_TYPE_LABELS[word.wordType]}</span>
          {word.tags.slice(0, 3).map((t) => <span key={t}>{t}</span>)}
        </div>

        {hideKorean ? (
          <>
            <p className="label mb-1">Schreibe auf Koreanisch</p>
            <h2 className="text-4xl font-bold tracking-tight">{word.german}</h2>
          </>
        ) : (
          <>
            <h2 className="text-6xl font-bold tracking-tight">{word.korean}</h2>
            <p className="mt-3 text-3xl font-semibold text-black/80 dark:text-white/85">{word.german}</p>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button className="btn-soft" onClick={() => speak(word.korean)}><Volume2 size={16} /> Anhören</button>
          {word.pronunciation && (
            <button className="btn-soft" onClick={() => setShowPron((s) => !s)}>
              {showPron ? 'Aussprachehilfe ausblenden' : 'Aussprachehilfe einblenden'}
            </button>
          )}
        </div>
        {showPron && word.pronunciation && (
          <p className="fade-up mt-3 text-2xl font-medium text-[#007aff]">{word.pronunciation}</p>
        )}

        {forms.length > 0 && !hideKorean && (
          <div className="mt-5 border-t border-black/[0.06] pt-4 dark:border-white/10">
            <div className="flex flex-wrap justify-center gap-2">
              {forms.map((k) => (
                <button key={k} className={open === k ? 'btn-primary' : 'btn-soft'} onClick={() => setOpen(open === k ? null : k)}>
                  {CONJUGATION_LABELS[k].label}
                  <ChevronDown size={14} className={`transition ${open === k ? 'rotate-180' : ''}`} />
                </button>
              ))}
            </div>
            {open && word.conjugations?.[open] && (
              <div className="fade-up mt-3">
                <p className="text-xs text-black/45 dark:text-white/45">{CONJUGATION_LABELS[open].hint}</p>
                <button className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold" onClick={() => speak(word.conjugations![open]!)}>
                  {word.conjugations[open]} <Volume2 size={18} className="text-black/40 dark:text-white/40" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 sm:p-5">
        {/* Wort direkt am Zeichenfeld: Deutsch groß, damit die Bedeutung beim Schreiben im Blick bleibt */}
        <div className="sticky top-2 z-10 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white/85 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-[#2c2c2e]/85">
          <div className="min-w-0">
            <p className="label">Bedeutung</p>
            <p className="truncate text-2xl font-bold leading-tight sm:text-3xl">{word.german}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!hideKorean && <span className="text-3xl font-bold sm:text-4xl">{word.korean}</span>}
            <button className="btn-soft !p-2" onClick={() => speak(word.korean)} aria-label="Anhören"><Volume2 size={18} /></button>
          </div>
        </div>
        <HangulCanvas
          key={word.id}
          target={word.korean}
          onResult={(c) => { setDone(true); onResult(c) }}
          onRevise={onRevise}
          onNext={onNext}
          nextLabel={nextLabel}
        />
      </div>
    </div>
  )
}
