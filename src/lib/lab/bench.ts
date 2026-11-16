/**
 * Testlabor: vergleicht Modelle für Handschrift und Satzgenerierung mit dem lokal gespeicherten Key.
 * Läuft nur im Browser der Person; Ergebnisse gehen nirgendwohin außer in eine herunterladbare Datei.
 */
import { buildHandwritingPrompt } from '../gemini'
import type { GeminiDispute } from '../geminiDisputes'
import type { InputToolsSample } from '../inputToolsLog'
import { bytesToBase64, readZip } from './zipRead'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export interface LabModel {
  id: string
  /** Anfragen pro Minute im kostenlosen Kontingent (Konsole des Nutzers, Nov. 2026) */
  rpm: number
  /** Anfragen pro Tag */
  rpd: number
}

export const HANDWRITING_CANDIDATES: LabModel[] = [
  { id: 'gemini-3.5-flash-lite', rpm: 15, rpd: 500 },
  { id: 'gemini-3.1-flash-lite', rpm: 15, rpd: 500 },
  { id: 'gemini-3-flash', rpm: 5, rpd: 20 },
  { id: 'gemini-3.6-flash', rpm: 5, rpd: 20 },
  { id: 'gemini-3.8-flash', rpm: 5, rpd: 20 },
]

/** Alle Modelle des Keys mit ihren Methoden (für Gemma- und Live-Modelle) */
export async function listAllModels(apiKey: string): Promise<{ id: string; methods: string[] }[]> {
  const out: { id: string; methods: string[] }[] = []
  let pageToken = ''
  for (let page = 0; page < 6; page++) {
    const res = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey.trim())}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`)
    if (!res.ok) throw new Error(`Modellliste: HTTP ${res.status}`)
    const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string }
    for (const m of j.models ?? []) out.push({ id: m.name.replace(/^models\//, ''), methods: m.supportedGenerationMethods ?? [] })
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
  }
  return out
}

/** Gemma-4-Modelle, die generateContent können */
export function gemmaModels(all: { id: string; methods: string[] }[]): LabModel[] {
  return all
    .filter((m) => /^gemma-4/i.test(m.id) && m.methods.includes('generateContent'))
    .map((m) => ({ id: m.id, rpm: 30, rpd: 14_400 }))
}

// ---------- Rohaufruf ohne Ausweichkette (wir wollen genau dieses Modell messen) ----------

export interface RawResult {
  ok: boolean
  text: string
  ms: number
  status: number
  error?: string
}

export async function callModel(apiKey: string, model: string, parts: unknown[], opts: { json?: boolean; timeoutMs?: number } = {}): Promise<RawResult> {
  const t0 = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000)
  // Gemma kennt kein JSON-Ausgabeformat -> dort nur per Prompt
  const isGemma = /^gemma/i.test(model)
  const generationConfig: Record<string, unknown> = { temperature: 0 }
  if (opts.json && !isGemma) generationConfig.responseMimeType = 'application/json'
  try {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
      signal: ctrl.signal,
    })
    const ms = Math.round(performance.now() - t0)
    const j = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
    if (!res.ok) return { ok: false, text: '', ms, status: res.status, error: j.error?.message ?? `HTTP ${res.status}` }
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    return { ok: true, text, ms, status: res.status }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return { ok: false, text: '', ms, status: aborted ? 408 : 0, error: aborted ? 'Zeitüberschreitung' : 'Netzwerkfehler' }
  } finally {
    clearTimeout(timer)
  }
}

/** Erstes JSON-Objekt bzw. -Array aus einer Antwort holen (auch wenn Text drumherum steht) */
export function looseJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '').trim()
  try {
    return JSON.parse(t)
  } catch {
    const m = t.match(/[[{][\s\S]*[\]}]/)
    if (!m) return null
    try {
      return JSON.parse(m[0])
    } catch {
      return null
    }
  }
}

// ---------- Handschrift-Beispiele ----------

export interface HandSample {
  id: string
  /** Was wirklich geschrieben wurde (Grundwahrheit) */
  truth: string
  /** Zielwort, das der Prompt zur Orientierung bekommt */
  target: string
  png: string
  origin: string
}

/** Striche [x,y,t] schwarz auf weiß rendern, eng zugeschnitten wie in der App (max. 512 px) */
export function renderStrokes(strokes: number[][][]): string {
  const pts = strokes.flat()
  const pad = 14
  const minX = Math.min(...pts.map((p) => p[0])) - pad
  const maxX = Math.max(...pts.map((p) => p[0])) + pad
  const minY = Math.min(...pts.map((p) => p[1])) - pad
  const maxY = Math.max(...pts.map((p) => p[1])) + pad
  const bw = Math.max(maxX - minX, 40)
  const bh = Math.max(maxY - minY, 40)
  const scale = Math.min(2, 512 / Math.max(bw, bh))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bw * scale))
  c.height = Math.max(1, Math.round(bh * scale))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = '#000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 6 * scale
  for (const s of strokes) {
    ctx.beginPath()
    s.forEach((p, i) => {
      const x = (p[0] - minX) * scale
      const y = (p[1] - minY) * scale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (s.length === 1) ctx.lineTo((s[0][0] - minX) * scale + 0.1, (s[0][1] - minY) * scale)
    ctx.stroke()
  }
  return c.toDataURL('image/png').split(',')[1]
}

/** Grundwahrheit nur, wo sie feststeht: richtig geschrieben -> Zielwort; sonst die bestätigte Lesart */
function truthOfInputTools(s: Pick<InputToolsSample, 'target' | 'actuallyCorrect' | 'recognitionCorrect' | 'candidates'>): string | null {
  if (s.actuallyCorrect) return s.target
  if (s.recognitionCorrect && s.candidates[0]) return s.candidates[0]
  return null
}

export function samplesFromLocal(its: InputToolsSample[], disputes: GeminiDispute[]): HandSample[] {
  const out: HandSample[] = []
  for (const s of its) {
    const truth = truthOfInputTools(s)
    if (!truth || !s.strokes?.length) continue
    out.push({ id: 'it-' + s.id, truth, target: s.target, png: s.imagePng ?? renderStrokes(s.strokes), origin: 'Rückmeldung' })
  }
  for (const d of disputes) {
    if (!d.actuallyCorrect || !d.imagePng) continue
    out.push({ id: 'gd-' + d.id, truth: d.target, target: d.target, png: d.imagePng, origin: 'Widerspruch' })
  }
  return out
}

/** Entwickler-Export (.zip) einlesen: data.json + images/ */
export async function samplesFromExport(file: File): Promise<HandSample[]> {
  const files = await readZip(file)
  const raw = files.get('data.json')
  if (!raw) throw new Error('data.json fehlt in der ZIP')
  const data = JSON.parse(new TextDecoder().decode(raw)) as {
    inputToolsSamples?: (InputToolsSample & { image?: string })[]
    geminiDisputes?: (GeminiDispute & { image?: string })[]
  }
  const out: HandSample[] = []
  ;(data.inputToolsSamples ?? []).forEach((s, i) => {
    const truth = truthOfInputTools(s)
    if (!truth) return
    const img = s.image ? files.get(s.image) : undefined
    const png = img ? bytesToBase64(img) : s.strokes?.length ? renderStrokes(s.strokes) : ''
    if (png) out.push({ id: `x-it-${i}`, truth, target: s.target, png, origin: 'Export: Rückmeldung' })
  })
  ;(data.geminiDisputes ?? []).forEach((d, i) => {
    if (!d.actuallyCorrect) return
    const img = d.image ? files.get(d.image) : undefined
    if (img) out.push({ id: `x-gd-${i}`, truth: d.target, target: d.target, png: bytesToBase64(img), origin: 'Export: Widerspruch' })
  })
  return out
}

const norm = (s: string) => s.normalize('NFC').replace(/[\s.,!?·'"„“]/g, '').toLowerCase()

export interface HandResult {
  model: string
  sampleId: string
  truth: string
  read: string
  correct: boolean
  ms: number
  error?: string
}

export async function readOne(apiKey: string, model: string, s: HandSample): Promise<HandResult> {
  const r = await callModel(apiKey, model, [{ text: buildHandwritingPrompt(s.target, false, 4) }, { inlineData: { mimeType: 'image/png', data: s.png } }], { json: true, timeoutMs: 20_000 })
  if (!r.ok) return { model, sampleId: s.id, truth: s.truth, read: '', correct: false, ms: r.ms, error: r.error }
  const j = looseJson(r.text) as { recognizedText?: unknown } | null
  const read = j && typeof j === 'object' && 'recognizedText' in j ? String(j.recognizedText ?? '') : r.text.trim().slice(0, 40)
  return { model, sampleId: s.id, truth: s.truth, read, correct: norm(read) === norm(s.truth), ms: r.ms }
}

// ---------- Satzgenerierung (Partikel) ----------

/** Hat die letzte Silbe einen Endkonsonanten (받침)? */
export function hasBatchim(word: string): boolean {
  const ch = [...word.trim()].pop()
  if (!ch) return false
  const code = ch.charCodeAt(0) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 !== 0
}

export interface SentenceItem {
  sentence: string
  answer: string
  german: string
  tip: string
  /** Automatische Prüfung: Lücke vorhanden, Antwort passt zum 받침 des Wortes davor */
  valid: boolean
  problem?: string
}

export interface SentenceResult {
  model: string
  ms: number
  items: SentenceItem[]
  parsed: boolean
  error?: string
}

const PAIR: Record<string, [string, string]> = { '이/가': ['이', '가'], '을/를': ['을', '를'] }

export function buildSentencePrompt(particle: '이/가' | '을/를', words: string[], level: string): string {
  return (
    `Erzeuge 5 koreanische Übungssätze für die Partikel ${particle} auf Stufe "${level}" für deutschsprachige Lernende. ` +
    `Nutze vorrangig diese Wörter der Lernenden: ${words.join(', ')}. ` +
    'Jeder Satz endet höflich auf -아요/어요 und enthält GENAU EINE Lücke "___" direkt hinter dem Nomen, an dem die Partikel fehlt. ' +
    'Antworte nur als JSON-Array: [{"sentence":"...___...","answer":"<richtige Partikel>","german":"<deutsche Übersetzung>","tip":"<kurzer deutscher Tipp>"}].'
  )
}

export function checkSentence(particle: '이/가' | '을/를', it: { sentence?: unknown; answer?: unknown; german?: unknown; tip?: unknown }): SentenceItem {
  const sentence = String(it.sentence ?? '')
  const answer = String(it.answer ?? '').trim()
  const base = { sentence, answer, german: String(it.german ?? ''), tip: String(it.tip ?? '') }
  const gaps = sentence.split('___').length - 1
  if (gaps !== 1) return { ...base, valid: false, problem: `${gaps} Lücken statt 1` }
  const head = sentence.split('___')[0]
  if (!head || /\s$/.test(head)) return { ...base, valid: false, problem: 'Lücke steht nicht direkt am Nomen' }
  const before = head.trim().split(/\s+/).pop() ?? ''
  const [withB, withoutB] = PAIR[particle]
  const expected = hasBatchim(before) ? withB : withoutB
  if (!before) return { ...base, valid: false, problem: 'kein Wort vor der Lücke' }
  if (answer !== expected) return { ...base, valid: false, problem: `nach „${before}“ gehört ${expected}` }
  return { ...base, valid: true }
}

export async function generateSentences(apiKey: string, model: string, particle: '이/가' | '을/를', words: string[], level: string): Promise<SentenceResult> {
  const r = await callModel(apiKey, model, [{ text: buildSentencePrompt(particle, words, level) }], { json: true, timeoutMs: 40_000 })
  if (!r.ok) return { model, ms: r.ms, items: [], parsed: false, error: r.error }
  const j = looseJson(r.text)
  if (!Array.isArray(j)) return { model, ms: r.ms, items: [], parsed: false, error: 'Antwort ist kein JSON-Array' }
  return { model, ms: r.ms, items: j.map((x) => checkSentence(particle, x as Record<string, unknown>)), parsed: true }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
