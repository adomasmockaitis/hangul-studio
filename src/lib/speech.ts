/**
 * Sprachausgabe: Wörter mit der natürlichen Gemini-Stimme (sobald eine geprüfte Aufnahme gespeichert ist),
 * bis dahin – und für Sätze immer – mit der besten bzw. gewählten Systemstimme. Nie mit Wartezeit.
 */
import type { SpeechMode } from '../types'
import { pickSystemVoice, voicesFor, type Clip, type ClipLang } from './audio/clips'
import { cachedClip, configureGeminiVoice, geminiVoiceActive, hotClip, prefetchClips, regenerateClips, requestClip } from './audio/voice'

export interface SpeechConfig {
  source: 'gemini' | 'system'
  apiKey: string
  geminiVoice: string
  systemVoiceKo: string
  systemVoiceDe: string
  speechMode: SpeechMode
}
let cfg: SpeechConfig = { source: 'system', apiKey: '', geminiVoice: 'Kore', systemVoiceKo: '', systemVoiceDe: '', speechMode: 'both' }

export function configureSpeech(c: SpeechConfig) {
  cfg = c
  configureGeminiVoice({ enabled: c.source === 'gemini', apiKey: c.apiKey, voice: c.geminiVoice })
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// ---------- Systemstimmen ----------

let voiceList: SpeechSynthesisVoice[] = []
const voiceListeners = new Set<() => void>()
function loadVoices() {
  if (!supported()) return
  voiceList = window.speechSynthesis.getVoices()
  voiceListeners.forEach((f) => f())
}
if (supported()) {
  loadVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
}

/** Installierte Stimmen einer Sprache, beste zuerst */
export function systemVoices(lang: ClipLang): SpeechSynthesisVoice[] {
  if (!voiceList.length) loadVoices()
  return voicesFor(voiceList, lang)
}
export function onVoicesChanged(f: () => void): () => void {
  voiceListeners.add(f)
  return () => voiceListeners.delete(f)
}

function utter(text: string, lang: ClipLang, rate: number, voiceName?: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'ko' ? 'ko-KR' : 'de-DE'
  u.rate = rate
  const v = pickSystemVoice(voiceList.length ? voiceList : window.speechSynthesis.getVoices(), lang, voiceName ?? (lang === 'ko' ? cfg.systemVoiceKo : cfg.systemVoiceDe))
  if (v) u.voice = v
  return u
}

// ---------- Abspielen ----------

let actx: AudioContext | null = null
let current: AudioBufferSourceNode | null = null
let token = 0

function audioCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  actx ??= new AudioContext()
  if (actx.state === 'suspended') void actx.resume()
  return actx
}

function playClip(clip: Clip, my: number): Promise<void> {
  const ctx = audioCtx()
  if (!ctx || my !== token) return Promise.resolve()
  const n = clip.pcm.length
  const buf = ctx.createBuffer(1, n, clip.rate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < n; i++) ch[i] = clip.pcm[i] / 32768
  // 15 ms ein- und ausblenden, damit nichts knackt
  const fade = Math.min(Math.floor(clip.rate * 0.015), Math.floor(n / 4))
  for (let i = 0; i < fade; i++) {
    const g = i / fade
    ch[i] *= g
    ch[n - 1 - i] *= g
  }
  return new Promise((resolve) => {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.onended = () => {
      if (current === src) current = null
      resolve()
    }
    current = src
    src.start()
  })
}

function playSystem(text: string, lang: ClipLang, rate: number, my: number, voiceName?: string): Promise<void> {
  if (!supported() || my !== token) return Promise.resolve()
  return new Promise((resolve) => {
    const u = utter(text, lang, rate, voiceName)
    const done = () => resolve()
    u.onend = done
    u.onerror = done
    // Sicherheitsnetz: manche Browser melden das Ende nicht
    setTimeout(done, 1500 + text.length * 250)
    window.speechSynthesis.speak(u)
  })
}

export function stopSpeech() {
  token++
  try { current?.stop() } catch { /* schon beendet */ }
  current = null
  if (supported()) window.speechSynthesis.cancel()
}

/** Länge, bis zu der die Gemini-Stimme vorliest (im Testlabor geprüft: auch lange Sätze sauber) */
export const MAX_NATURAL_CHARS = 160
export const isSpeakable = (text: string) => !!text.trim() && text.trim().length <= MAX_NATURAL_CHARS

/** Wörter und kurze Wendungen (für die Vorbereitung der Wortliste) */
export function isWordLike(text: string): boolean {
  const t = text.trim()
  return !!t && !/[.!?。]$/.test(t) && t.split(/\s+/).length <= 3 && t.length <= 24
}

interface Item {
  text: string
  lang: ClipLang
  rate: number
}

async function playSequence(items: Item[]) {
  stopSpeech()
  const my = token
  audioCtx() // im Klick-Handler entsperren
  for (const it of items) {
    if (my !== token) return
    const natural = geminiVoiceActive() && isSpeakable(it.text)
    let clip = natural ? hotClip(it.text, it.lang) : null
    if (natural && !clip) clip = await cachedClip(it.text, it.lang)
    if (my !== token) return
    if (clip) await playClip(clip, my)
    else {
      // Sofort die Systemstimme – die natürliche Aufnahme entsteht im Hintergrund für das nächste Mal
      if (natural) void requestClip(it.text, it.lang, 'now')
      await playSystem(it.text, it.lang, it.rate, my)
    }
  }
}

const cleanKo = (t: string) => t.replace(/[[\]]/g, '').trim()

/** Koreanischen Text vorlesen (Gemini-Stimme, sobald die Aufnahme bereit ist) */
export function speak(text: string) {
  const t = cleanKo(text)
  if (t) void playSequence([{ text: t, lang: 'ko', rate: 0.9 }])
}

/** Deutschen Text vorlesen (gekürzt), z. B. die Frage im Test Deutsch → Koreanisch */
export function speakGerman(text: string) {
  const t = shortGerman(text)
  if (t) void playSequence([{ text: t, lang: 'de', rate: 0.95 }])
}

/** Ganzen Satz vorlesen (Gemini-Stimme, sobald bereit – sonst Systemstimme) */
export function speakSentence(text: string, lang: ClipLang = 'ko') {
  const t = lang === 'ko' ? cleanKo(text) : text.trim()
  if (t) void playSequence([{ text: t, lang, rate: lang === 'ko' ? 0.9 : 0.95 }])
}

/** Nur die Systemstimme (z. B. Vergleich im Testlabor) */
export function speakSystem(text: string, lang: ClipLang = 'ko') {
  stopSpeech()
  void playSystem(text, lang, lang === 'ko' ? 0.9 : 0.95, token)
}

/** Sätze, die gleich drankommen, schon vorbereiten (z. B. eine Partikel-Runde) */
export function prepareSentences(texts: string[], lang: ClipLang = 'ko') {
  if (geminiVoiceActive()) prefetchClips(texts.filter(isSpeakable).map((text) => ({ text: lang === 'ko' ? cleanKo(text) : text.trim(), lang })), 'now')
}

/** Alle Aufnahmen der Wörter neu erzeugen */
export function regenerateWords(words: { korean: string; german: string }[]) {
  regenerateClips(voiceItems(words))
}

/** Wort vorlesen: je nach Einstellung Koreanisch, Deutsch (gekürzt) oder beides nacheinander */
export function speakWord(word: { korean: string; german: string }, mode: SpeechMode) {
  const items: Item[] = []
  if (mode !== 'de') items.push({ text: cleanKo(word.korean), lang: 'ko', rate: 0.9 })
  const de = shortGerman(word.german)
  if (mode !== 'ko' && de) items.push({ text: de, lang: 'de', rate: 0.95 })
  if (items.length) void playSequence(items)
}

/** Texte, die für ein Wort mit der Gemini-Stimme aufgenommen werden: Koreanisch und Deutsch (gekürzt) */
export function voiceTexts(w: { korean: string; german: string }): { ko: string | null; de: string | null } {
  const ko = cleanKo(w.korean)
  const de = shortGerman(w.german)
  return { ko: isWordLike(ko) ? ko : null, de: de && isWordLike(de) ? de : null }
}

export function voiceItems(words: { korean: string; german: string }[]): { text: string; lang: ClipLang }[] {
  const items: { text: string; lang: ClipLang }[] = []
  for (const w of words) {
    const t = voiceTexts(w)
    if (t.ko) items.push({ text: t.ko, lang: 'ko' })
    if (t.de) items.push({ text: t.de, lang: 'de' })
  }
  return items
}

/** Wörter im Hintergrund für die Gemini-Stimme vorbereiten (nach dem Import und beim Start für fehlende) */
export function prepareWords(words: { korean: string; german: string }[]) {
  if (geminiVoiceActive()) prefetchClips(voiceItems(words))
}

// ---------- Hörproben ----------

export const SAMPLE_KO = '안녕하세요'

/** Systemstimme probehören */
export function previewSystemVoice(lang: ClipLang, voiceName: string) {
  stopSpeech()
  void playSystem(lang === 'ko' ? '안녕하세요. 만나서 반가워요.' : 'Hallo, schön dich kennenzulernen.', lang, lang === 'ko' ? 0.9 : 0.95, token, voiceName)
}

/**
 * Gemini-Stimme probehören: erzeugt die Probe einmal (mit Prüfung) und speichert sie.
 * Liefert false, wenn es nicht geklappt hat (dann klingt die Systemstimme).
 */
export async function previewGeminiVoice(voice: string): Promise<boolean> {
  // Die Stimme gilt nur für diesen einen Auftrag – laufende Aufnahmen behalten ihre Stimme
  const clip = await requestClip(SAMPLE_KO, 'ko', 'now', { voice, force: true })
  stopSpeech()
  if (clip) await playClip(clip, token)
  else await playSystem(SAMPLE_KO, 'ko', 0.9, token)
  return !!clip
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
