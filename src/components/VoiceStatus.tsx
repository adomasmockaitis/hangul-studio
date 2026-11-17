/** Kleine Info je Wort: ist die Gemini-Stimme (Koreanisch, Deutsch, langsam) fertig, in Arbeit oder (noch) Systemstimme? */
import { useSyncExternalStore } from 'react'
import { Check, Loader2, Snail } from 'lucide-react'
import { slowVoice } from '../lib/audio/clips'
import { clipStatus, clipsVersion, currentGeminiVoice, subscribeClips, type ClipStatus } from '../lib/audio/voice'
import { voiceTexts } from '../lib/speech'
import { useApp } from '../store'

export function useClipsVersion(): number {
  return useSyncExternalStore(subscribeClips, clipsVersion)
}

type Kind = 'ko' | 'de' | 'slow'
const KIND_LABEL: Record<Kind, string> = { ko: 'Koreanisch', de: 'Deutsch', slow: 'Langsam (Koreanisch)' }

const LABEL: Record<ClipStatus, string> = {
  ready: 'Gemini-Stimme bereit',
  pending: 'Gemini-Stimme wird erstellt …',
  failed: 'Gemini-Stimme gerade nicht möglich – Systemstimme',
  missing: 'Gemini-Stimme folgt – bis dahin Systemstimme',
  off: 'Systemstimme',
}

const STYLE: Record<ClipStatus, string> = {
  ready: 'bg-green/15 text-green',
  pending: 'bg-blue/15 text-blue',
  failed: 'bg-orange/15 text-orange',
  missing: 'bg-fill-3 text-label-3',
  off: 'bg-fill-3 text-label-3',
}

export function Pill({ kind, status }: { kind: Kind; status: ClipStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold ${STYLE[status]}`}
      title={`${KIND_LABEL[kind]}: ${status === 'missing' && kind === 'slow' ? 'langsame Aufnahme folgt – bis dahin die normale mit 75 % Tempo' : LABEL[status]}`}
    >
      {status === 'ready' ? <Check size={10} strokeWidth={3} /> : status === 'pending' ? <Loader2 size={10} className="animate-spin" /> : null}
      {kind === 'slow' ? <Snail size={11} /> : kind.toUpperCase()}
    </span>
  )
}

/** Kennzeichen „KO“, „DE“ und (bei langsamer Gemini-Fassung) die Schnecke; nichts, wenn die Gemini-Stimme aus ist */
export function VoiceStatus({ word, slow = false, className = '' }: { word: { korean: string; german: string }; slow?: boolean; className?: string }) {
  useClipsVersion()
  const { settings } = useApp()
  const t = voiceTexts(word)
  const ko = t.ko ? clipStatus(t.ko, 'ko') : null
  const de = t.de ? clipStatus(t.de, 'de') : null
  const sl = slow && t.ko && settings.slowMode === 'gemini' ? clipStatus(t.ko, 'ko', slowVoice(currentGeminiVoice())) : null
  if ((ko ?? 'off') === 'off' && (de ?? 'off') === 'off') return null
  const all = [ko, de].filter(Boolean) as ClipStatus[]
  const summary = all.every((s) => s === 'ready') ? 'Gemini-Stimme bereit' : all.some((s) => s === 'pending') ? 'Gemini-Stimme wird erstellt' : 'Systemstimme, Gemini folgt'
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={summary}>
      {ko && <Pill kind="ko" status={ko} />}
      {de && <Pill kind="de" status={de} />}
      {sl && <Pill kind="slow" status={sl} />}
    </span>
  )
}

/** Erklärung der Kennzeichen (Onboarding und Einstellungen) */
export function VoiceLegend() {
  const rows: [Kind, ClipStatus, string][] = [
    ['ko', 'ready', 'Gemini-Aufnahme ist fertig und spielt sofort.'],
    ['ko', 'pending', 'Wird gerade erstellt – bis dahin spricht die Systemstimme.'],
    ['ko', 'missing', 'Folgt bald im Hintergrund – bis dahin Systemstimme.'],
    ['ko', 'failed', 'Gerade nicht möglich (z. B. offline) – wird später erneut versucht.'],
  ]
  return (
    <div className="space-y-1.5 text-sm">
      {rows.map(([k, s, text]) => (
        <p key={s} className="flex items-center gap-2"><span className="w-12 shrink-0"><Pill kind={k} status={s} /></span><span className="text-label-2">{text}</span></p>
      ))}
      <p className="flex items-center gap-2"><span className="flex w-12 shrink-0 gap-0.5"><Pill kind="ko" status="ready" /></span><span className="text-label-2"><b>KO</b> = koreanisches Wort, <b>DE</b> = deutsche Übersetzung.</span></p>
      <p className="flex items-center gap-2"><span className="w-12 shrink-0"><Pill kind="slow" status="ready" /></span><span className="text-label-2">Langsame Fassung (nur bei „Gemini spricht langsam“).</span></p>
    </div>
  )
}
