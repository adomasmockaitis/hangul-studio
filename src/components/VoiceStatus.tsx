/** Kleine Info je Wort: ist die Gemini-Stimme für Koreanisch und Deutsch fertig, in Arbeit oder (noch) Systemstimme? */
import { useSyncExternalStore } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { ClipLang } from '../lib/audio/clips'
import { clipStatus, clipsVersion, subscribeClips, type ClipStatus } from '../lib/audio/voice'
import { voiceTexts } from '../lib/speech'

export function useClipsVersion(): number {
  return useSyncExternalStore(subscribeClips, clipsVersion)
}

const LABEL: Record<ClipStatus, string> = {
  ready: 'Gemini-Stimme bereit',
  pending: 'Gemini-Stimme wird erstellt …',
  failed: 'Gemini-Stimme gerade nicht möglich – Systemstimme',
  missing: 'Gemini-Stimme folgt – bis dahin Systemstimme',
  off: 'Systemstimme',
}

function Pill({ lang, status }: { lang: ClipLang; status: ClipStatus }) {
  const cls =
    status === 'ready' ? 'bg-green/15 text-green' : status === 'pending' ? 'bg-blue/15 text-blue' : status === 'failed' ? 'bg-orange/15 text-orange' : 'bg-fill-3 text-label-3'
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold ${cls}`} title={`${lang === 'ko' ? 'Koreanisch' : 'Deutsch'}: ${LABEL[status]}`}>
      {status === 'ready' ? <Check size={10} strokeWidth={3} /> : status === 'pending' ? <Loader2 size={10} className="animate-spin" /> : null}
      {lang.toUpperCase()}
    </span>
  )
}

/** Zwei kleine Kennzeichen „KO“ und „DE“; nichts, wenn die Gemini-Stimme aus ist */
export function VoiceStatus({ word, withText = false }: { word: { korean: string; german: string }; withText?: boolean }) {
  useClipsVersion()
  const t = voiceTexts(word)
  const ko = t.ko ? clipStatus(t.ko, 'ko') : null
  const de = t.de ? clipStatus(t.de, 'de') : null
  if ((ko ?? 'off') === 'off' && (de ?? 'off') === 'off') return null
  const all = [ko, de].filter(Boolean) as ClipStatus[]
  const summary = all.every((s) => s === 'ready') ? 'Gemini-Stimme bereit' : all.some((s) => s === 'pending') ? 'Gemini-Stimme wird erstellt' : 'Systemstimme, Gemini folgt'
  return (
    <span className="inline-flex items-center gap-1" aria-label={summary}>
      {ko && <Pill lang="ko" status={ko} />}
      {de && <Pill lang="de" status={de} />}
      {withText && <span className="text-xs text-label-3">{summary}</span>}
    </span>
  )
}
