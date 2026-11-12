import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Volume2, X } from 'lucide-react'
import { speak } from '../lib/speech'
import { playSound } from '../lib/sounds'
import type { WordItem } from '../types'
import { HangulCanvas } from './HangulCanvas'
import type { QResult } from './Runner'

interface Common {
  onResult: (r: QResult) => void
  onRevise?: (correct: boolean) => void
  onNext: () => void
  nextLabel: string
}

/** Antwort wird ins Hangul-Zeichenfeld geschrieben (Deutsch→Koreanisch, Hör-Diktat, Beugung) */
export function WriteQuestion({
  prompt, target, solutionNote, audioPrompt, autoPlay, onResult, onRevise, onNext, nextLabel,
}: Common & {
  prompt: ReactNode
  /** Zu schreibender koreanischer Text */
  target: string
  solutionNote?: string
  /** Hör-Diktat: Text, der vorgelesen wird */
  audioPrompt?: string
  autoPlay?: boolean
}) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (autoPlay && audioPrompt) speak(audioPrompt)
    // nur beim Erscheinen der Karte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-5">
      <div className="card fade-up p-6 text-center">
        {prompt}
        {audioPrompt && (
          <button className="btn-primary mx-auto mt-3 !rounded-full !px-6 !py-3" onClick={() => speak(audioPrompt)}>
            <Volume2 size={20} /> Nochmal anhören
          </button>
        )}
        {done && (
          <div className="fade-up mt-4 border-t border-black/[0.06] pt-4 dark:border-white/10">
            <button className="inline-flex items-center gap-2 text-4xl font-bold" onClick={() => speak(target)}>
              {target} <Volume2 size={18} className="text-black/40 dark:text-white/40" />
            </button>
            {solutionNote && <p className="mt-1 text-black/55 dark:text-white/55">{solutionNote}</p>}
          </div>
        )}
      </div>
      <div className="card p-4 sm:p-5">
        <HangulCanvas
          target={target}
          testMode
          onResult={(correct, info) => { setDone(true); onResult({ correct, image: info?.image, read: info?.read }) }}
          onRevise={onRevise}
          onNext={onNext}
          nextLabel={nextLabel}
        />
      </div>
    </div>
  )
}

// ---------- Deutsch-Vergleich ----------
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/\(.*?\)/g, '')
    .replace(/[.,!?;:"'()]/g, '')
    .replace(/^(der|die|das|ein|eine|zu|to)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export function matchesGerman(input: string, german: string): boolean {
  const x = norm(input)
  if (!x) return false
  const variants = [german, ...german.split(/[,;/]/)].map(norm).filter((v) => v.length >= 3 || v === norm(german))
  return variants.some((v) => v === x || (v.length >= 6 && x.length >= 6 && lev(v, x) <= 1))
}

function KoreanPrompt({ word }: { word: WordItem }) {
  return (
    <>
      <p className="label mb-1">Was bedeutet das?</p>
      <h2 className="text-6xl font-bold tracking-tight">{word.korean}</h2>
      <button className="btn-soft mx-auto mt-3" onClick={() => speak(word.korean)}><Volume2 size={16} /> Anhören</button>
    </>
  )
}

/** Koreanisch → Deutsch, Eingabe per Tastatur */
export function TypeQuestion({ word, onResult, onNext, nextLabel }: Common & { word: WordItem }) {
  const [text, setText] = useState('')
  const [res, setRes] = useState<boolean | null>(null)
  const check = () => {
    if (res !== null || !text.trim()) return
    const ok = matchesGerman(text, word.german)
    setRes(ok)
    playSound(ok ? 'success' : 'error')
    onResult({ correct: ok, read: text.trim() })
  }
  return (
    <div className="card fade-up p-6 text-center">
      <KoreanPrompt word={word} />
      <input
        autoFocus
        className="input mt-5 !py-3.5 text-center !text-xl"
        placeholder="Deutsche Bedeutung…"
        value={text}
        disabled={res !== null}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) res === null ? check() : onNext() }}
      />
      {res !== null && (
        <div className={`fade-up mt-4 flex items-center justify-center gap-2 rounded-2xl p-3 ${res ? 'bg-[#34c759]/15' : 'bg-[#ff3b30]/15'}`}>
          {res ? <Check className="text-[#34c759]" /> : <X className="text-[#ff3b30]" />}
          <span className="text-lg font-semibold">{word.german}</span>
        </div>
      )}
      <div className="mt-5 flex justify-center">
        {res === null ? (
          <button className="btn-primary" onClick={check} disabled={!text.trim()}><Check size={16} /> Prüfen</button>
        ) : (
          <button className="btn-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
        )}
      </div>
    </div>
  )
}

/** Koreanisch → Deutsch, Multiple Choice */
export function ChoiceQuestion({ word, options, onResult, onNext, nextLabel }: Common & { word: WordItem; options: string[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <div className="card fade-up p-6 text-center">
      <KoreanPrompt word={word} />
      <div className="mx-auto mt-5 grid max-w-md gap-2">
        {options.map((o) => {
          const right = o === word.german
          const style =
            picked === null
              ? 'btn-soft'
              : right
                ? 'btn bg-[#34c759] text-white'
                : o === picked
                  ? 'btn bg-[#ff3b30] text-white'
                  : 'btn-soft opacity-50'
          return (
            <button
              key={o}
              disabled={picked !== null && !right && o !== picked}
              className={`${style} !justify-start !py-3 text-left !text-base`}
              onClick={() => {
                if (picked !== null) return
                setPicked(o)
                playSound(right ? 'success' : 'error')
                onResult({ correct: right, read: o })
              }}
            >
              {o}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="mt-5 flex justify-center">
          <button className="btn-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
        </div>
      )}
    </div>
  )
}
