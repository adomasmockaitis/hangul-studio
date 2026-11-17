import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Volume2, X } from 'lucide-react'
import { speak, speakGerman } from '../lib/speech'
import { useApp } from '../store'
import { playSound } from '../lib/sounds'
import type { WordItem } from '../types'
import { HangulCanvas } from './HangulCanvas'
import type { QResult } from './Runner'
import { useQuestionAside } from './questionAside'

interface Common {
  onResult: (r: QResult) => void
  onRevise?: (correct: boolean) => void
  onNext: () => void
  nextLabel: string
}

/** Antwort wird ins Hangul-Zeichenfeld geschrieben (Deutsch→Koreanisch, Hör-Diktat, Beugung) */
export function WriteQuestion({
  prompt, target, solutionNote, audioPrompt, autoPlay, speakPrompt, onResult, onRevise, onNext, nextLabel,
}: Common & {
  /** Deutsche Frage: wird bei „automatisch vorlesen“ auf Deutsch gesprochen (nur die Ausgangssprache) */
  speakPrompt?: string
  prompt: ReactNode
  /** Zu schreibender koreanischer Text */
  target: string
  solutionNote?: string
  /** Hör-Diktat: Text, der vorgelesen wird */
  audioPrompt?: string
  autoPlay?: boolean
}) {
  const [done, setDone] = useState(false)
  const { settings } = useApp()
  useEffect(() => {
    if (autoPlay && audioPrompt) speak(audioPrompt)
    else if (speakPrompt && settings.autoSpeak) speakGerman(speakPrompt)
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
          <div className="fade-up mt-4 border-t border-separator pt-4">
            <button className="inline-flex items-center gap-2 text-4xl font-bold" onClick={() => speak(target)}>
              {target} <Volume2 size={18} className="text-label-3" />
            </button>
            {solutionNote && <p className="mt-1 text-label-2">{solutionNote}</p>}
          </div>
        )}
      </div>
      <div className="card p-4 sm:p-5">
        <HangulCanvas
          target={target}
          testMode
          onResult={(correct, info) => { setDone(true); onResult({ correct, image: info?.image, read: info?.read, uncertain: info?.uncertain, help: info?.help }) }}
          onRevise={onRevise}
          onNext={onNext}
          nextLabel={nextLabel}
        />
      </div>
    </div>
  )
}

export { matchesGerman } from '../lib/german'
import { matchesGerman } from '../lib/german'

function KoreanPrompt({ word }: { word: WordItem }) {
  const { settings } = useApp()
  // Im Test nur die Ausgangssprache vorlesen – die deutsche Lösung bleibt verborgen
  useEffect(() => {
    if (settings.autoSpeak) speak(word.korean)
    // nur beim Erscheinen der Karte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
  const aside = useQuestionAside()
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
        <div className={`fade-up mt-4 flex items-center justify-center gap-2 rounded-2xl p-3 ${res ? 'bg-green/15' : 'bg-red/15'}`}>
          {res ? <Check className="text-green" /> : <X className="text-red" />}
          <span className="text-lg font-semibold">{word.german}</span>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {res === null ? (
          <>{aside}<button className="btn-primary" onClick={check} disabled={!text.trim()}><Check size={16} /> Prüfen</button></>
        ) : (
          <button className="btn-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
        )}
      </div>
    </div>
  )
}

/** Hör-Diktat: Koreanisch hören, deutsche Bedeutung tippen (Hörverstehen) */
export function ListenTypeQuestion({ word, onResult, onNext, nextLabel }: Common & { word: WordItem }) {
  const aside = useQuestionAside()
  const [text, setText] = useState('')
  const [res, setRes] = useState<boolean | null>(null)
  useEffect(() => {
    speak(word.korean)
    // nur beim Erscheinen der Karte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const check = () => {
    if (res !== null || !text.trim()) return
    const ok = matchesGerman(text, word.german)
    setRes(ok)
    playSound(ok ? 'success' : 'error')
    onResult({ correct: ok, read: text.trim() })
  }
  return (
    <div className="card fade-up p-6 text-center">
      <p className="label mb-1">Hör-Diktat</p>
      <p className="text-xl font-semibold">Was bedeutet das Gehörte?</p>
      <button className="btn-primary mx-auto mt-3 !px-6 !py-3" onClick={() => speak(word.korean)}>
        <Volume2 size={20} /> Nochmal anhören
      </button>
      <input
        autoFocus
        className="input mt-5 !py-3.5 text-center !text-xl"
        placeholder="Deutsche Bedeutung…"
        value={text}
        disabled={res !== null}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) res === null ? check() : onNext() }}
        aria-label="Deutsche Bedeutung"
      />
      {res !== null && (
        <div className={`fade-up mt-4 rounded-2xl p-3 ${res ? 'bg-green/15' : 'bg-red/15'}`}>
          <p className="flex items-center justify-center gap-2">
            {res ? <Check className="text-green" /> : <X className="text-red" />}
            <span lang="ko" className="text-2xl font-bold">{word.korean}</span>
          </p>
          <p className="text-lg font-semibold">{word.german}</p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {res === null ? (
          <>{aside}<button className="btn-primary" onClick={check} disabled={!text.trim()}><Check size={16} /> Prüfen</button></>
        ) : (
          <button className="btn-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
        )}
      </div>
    </div>
  )
}

/** Koreanisch → Deutsch, Multiple Choice */
export function ChoiceQuestion({ word, options, onResult, onNext, nextLabel }: Common & { word: WordItem; options: string[] }) {
  const aside = useQuestionAside()
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
                ? 'btn bg-green text-white'
                : o === picked
                  ? 'btn bg-red text-white'
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
                onResult({ correct: right, read: o, easyFormat: true })
              }}
            >
              {o}
            </button>
          )
        })}
      </div>
      {picked !== null ? (
        <div className="mt-5 flex justify-center">
          <button className="btn-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
        </div>
      ) : aside && <div className="mt-5 flex justify-center">{aside}</div>}
    </div>
  )
}
