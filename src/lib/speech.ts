import type { SpeechMode } from '../types'

const voiceCache: Record<string, SpeechSynthesisVoice | null | undefined> = {}

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Wählt eine Stimme für die Sprache (z. B. "ko" oder "de"); null = Standardstimme des Geräts */
function voiceFor(lang: string): SpeechSynthesisVoice | null {
  if (voiceCache[lang]) return voiceCache[lang]!
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().replace('_', '-').startsWith(lang))
  voiceCache[lang] = v ?? null
  return voiceCache[lang]!
}

if (supported()) {
  window.speechSynthesis.onvoiceschanged = () => {
    for (const k of Object.keys(voiceCache)) delete voiceCache[k]
  }
}

function utter(text: string, lang: 'ko-KR' | 'de-DE', rate: number): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  u.rate = rate
  const v = voiceFor(lang.slice(0, 2))
  if (v) u.voice = v
  return u
}

/** Koreanischen Text vorlesen (z. B. Beugungsformen, Hör-Diktat) */
export function speak(text: string) {
  if (!supported()) return
  const clean = text.replace(/[[\]]/g, '')
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter(clean, 'ko-KR', 0.9))
}

/**
 * Kürzt eine deutsche Übersetzung zum Vorlesen:
 * „Schüler/in, Student/in“ → „Schüler, Student“; „Koreanisch (Sprache)“ → „Koreanisch“; höchstens zwei Varianten.
 */
export function shortGerman(german: string): string {
  const parts = german
    .replace(/\([^)]*\)/g, '') // Klammern wie „(Sprache)“, „(formell)“, „(in)“
    .replace(/(\p{L})\/-?in(nen)?(?![\p{L}])/giu, '$1') // Gender-Endungen „/in“, „/-in“, „/innen“
    .replace(/\//g, ', ') // übrige Schrägstriche als Pause
    .split(/[,;]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return [...new Set(parts)].slice(0, 2).join(', ')
}

/** Wort vorlesen: je nach Einstellung Koreanisch, Deutsch (gekürzt) oder beides nacheinander */
export function speakWord(word: { korean: string; german: string }, mode: SpeechMode) {
  if (!supported()) return
  const synth = window.speechSynthesis
  synth.cancel()
  if (mode !== 'de') synth.speak(utter(word.korean.replace(/[[\]]/g, ''), 'ko-KR', 0.9))
  const de = shortGerman(word.german)
  if (mode !== 'ko' && de) synth.speak(utter(de, 'de-DE', 0.95))
}
