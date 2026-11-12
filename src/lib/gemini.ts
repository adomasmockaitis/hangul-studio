import type { WordItem } from '../types'

/** Fallback-Kette, exakt in dieser Reihenfolge (nur Modelle mit nutzbarem Free-Tier-Limit) */
export const MODEL_CHAIN = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
] as const
export const DEFAULT_MODEL = MODEL_CHAIN[0]
export const MODEL_PRESETS: readonly string[] = MODEL_CHAIN
/** Frühere Standardmodelle, die ersetzt werden */
export const OBSOLETE_MODELS = ['gemini-2.5-flash', 'gemini-3.0-flash']

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
const REQUEST_TIMEOUT_MS = 8000
const PING_TIMEOUT_MS = 3000
const CHECK_INTERVAL_MS = 30 * 60 * 1000

export interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

class GeminiHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ---------- Smart Model Memory ----------
const LS_MODEL = 'lastWorkingGeminiModel'
const LS_STAMP = 'lastModelCheckTimestamp'
const LS_PING = 'lastModelPingMs'

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

export function getLastWorkingModel(): string | null {
  const m = lsGet(LS_MODEL)
  return m && !OBSOLETE_MODELS.includes(m) ? m : null
}
export function setLastWorkingModel(model: string) {
  lsSet(LS_MODEL, model)
}

// ---------- Status-Store (für die Ampel) ----------
export type AiState = 'idle' | 'connecting' | 'ready' | 'offline'
export interface AiStatus {
  state: AiState
  model?: string
  ms?: number
  note?: string
}
let aiStatus: AiStatus = { state: 'idle' }
const listeners = new Set<() => void>()
function publish(s: AiStatus) {
  aiStatus = s
  listeners.forEach((l) => l())
}
export const getAiStatus = () => aiStatus
export const subscribeAiStatus = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ---------- ListModels (nur für das optionale Dropdown in den Einstellungen) ----------
const modelCache = new Map<string, string[]>()

export async function listModels(apiKey: string, force = false): Promise<string[]> {
  const key = apiKey.trim()
  if (!force && modelCache.has(key)) return modelCache.get(key)!
  const out: string[] = []
  let pageToken = ''
  for (let page = 0; page < 5; page++) {
    const res = await fetch(`${BASE}/models?pageSize=100&key=${encodeURIComponent(key)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`)
    if (!res.ok) throw new GeminiHttpError(res.status, await errorMessage(res))
    const j = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[]
      nextPageToken?: string
    }
    for (const m of j.models ?? []) {
      const name = m.name.replace(/^models\//, '')
      if (name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent')) out.push(name)
    }
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
  }
  const list = [...new Set(out)].sort()
  modelCache.set(key, list)
  return list
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json()
    return j?.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

async function post(apiKey: string, model: string, body: unknown, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new GeminiHttpError(408, `Zeitüberschreitung (${timeoutMs / 1000} s)`)
    throw new GeminiHttpError(0, 'Netzwerkfehler')
  } finally {
    clearTimeout(timer)
  }
}

// Schnellmodus-Stufen je Modell: 0 = Thinking aus + niedrige Bildauflösung, 1 = nur Thinking aus, 2 = ohne Extras.
// Meldet ein Modell "invalid argument", wird die nächste Stufe gemerkt und sofort verwendet.
const LS_LEVELS = 'geminiFastLevels'
function getLevel(model: string): number {
  try {
    return (JSON.parse(lsGet(LS_LEVELS) || '{}') as Record<string, number>)[model] ?? 0
  } catch {
    return 0
  }
}
function setLevel(model: string, level: number) {
  try {
    const all = JSON.parse(lsGet(LS_LEVELS) || '{}') as Record<string, number>
    all[model] = level
    lsSet(LS_LEVELS, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

function buildConfig(level: number, maxTokens: number, lowRes: boolean): Record<string, unknown> {
  const g: Record<string, unknown> = { responseMimeType: 'application/json', temperature: 0 }
  if (level === 0) Object.assign(g, { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 }, ...(lowRes ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}) })
  else if (level === 1) Object.assign(g, { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } })
  else if (level === 2) Object.assign(g, { maxOutputTokens: 1024 })
  else Object.assign(g, { maxOutputTokens: 16384 }) // Level 3: Langtext-Aufgaben (Datei-Scanner), nicht abschneiden
  return g
}

async function callOnce(apiKey: string, model: string, parts: GeminiPart[], timeoutMs: number, fast = false, maxTokens = 80, lowRes = true): Promise<string> {
  if (!fast) {
    const res = await post(apiKey, model, { contents: [{ parts }], generationConfig: buildConfig(3, 0, false) }, timeoutMs)
    if (res.ok) return extractText(await res.json())
    const msg = await errorMessage(res)
    // Modell lehnt das hohe Token-Limit ab -> ohne Limit wiederholen
    if (res.status === 400 && !/api key|API_KEY|expired/i.test(msg)) {
      const res2 = await post(apiKey, model, { contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }, timeoutMs)
      if (res2.ok) return extractText(await res2.json())
      throw new GeminiHttpError(res2.status, await errorMessage(res2))
    }
    throw new GeminiHttpError(res.status, msg)
  }
  let level = getLevel(model)
  for (;;) {
    const res = await post(apiKey, model, { contents: [{ parts }], generationConfig: buildConfig(level, maxTokens, lowRes) }, timeoutMs)
    if (res.ok) return extractText(await res.json())
    const msg = await errorMessage(res)
    // "invalid argument": Das Modell kennt eine der Schnellmodus-Optionen nicht -> nächste Stufe, gemerkt
    if (res.status === 400 && level < 2 && !/api key|API_KEY|expired/i.test(msg)) {
      level++
      setLevel(model, level)
      continue
    }
    throw new GeminiHttpError(res.status, msg)
  }
}
function extractText(data: { candidates?: { content?: { parts?: GeminiPart[] } }[] }): string {
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!text) throw new GeminiHttpError(502, 'Leere Antwort der KI')
  return text
}
/** Fehler, bei denen sofort das nächste Modell probiert wird */
const isSwitchable = (e: unknown) =>
  e instanceof GeminiHttpError &&
  (e.status === 0 || e.status === 408 || e.status === 404 || e.status === 429 || e.status >= 500 ||
    /high demand|overloaded|not found|no longer available|not supported/i.test(e.message))

export type StatusFn = (msg: string) => void

/** Reihenfolge: zuletzt funktionierendes Modell, gewähltes Modell, dann die feste Kette */
function attemptOrder(preferred: string): string[] {
  const list = [getLastWorkingModel(), preferred.trim(), ...MODEL_CHAIN].filter((m): m is string => !!m && !OBSOLETE_MODELS.includes(m))
  return [...new Set(list)]
}

/**
 * Zeitlimit abhängig von Wortlänge und Schreib-Tipps: ab 3 Zeichen +0,5 s pro Zeichen, höchstens +2 s.
 * 1–2 Zeichen: Basis; 3: +0,5; 4: +1; 5: +1,5; ab 6: +2 s.
 */
export const TIPS_TIME_FACTOR = 1.5

export function dynamicTimeoutMs(baseSec: number, target: string, withTips = false): number {
  const chars = Array.from(target).filter((c) => c.trim()).length
  const extra = Math.min(2, Math.max(0, (chars - 2) * 0.5))
  // Mit Schreib-Tipps ist die Antwort länger und das Bild höher aufgelöst: Basiszeit x1,5
  const base = Math.max(2, baseSec) * (withTips ? TIPS_TIME_FACTOR : 1)
  return Math.round((base + extra) * 1000)
}

export interface CallOptions {
  /** Timeout pro einzelnem Modell-Versuch */
  timeoutMs?: number
  /** Gesamtbudget über alle Modellwechsel; danach wird abgebrochen */
  budgetMs?: number
  /** Schnellmodus: Thinking aus, kurze Antwort */
  fast?: boolean
  /** Max. Ausgabe-Tokens im Schnellmodus */
  maxTokens?: number
  /** Niedrige Bildauflösung (schneller; für Qualitätsbewertung aus) */
  lowRes?: boolean
}

/**
 * Zentraler Gemini-Aufruf: probiert zuerst das zuletzt funktionierende Modell, wechselt bei
 * 404/429/503/Timeout SOFORT (ohne Wartezeit) auf das nächste und merkt sich den Gewinner.
 * Mit budgetMs bricht der gesamte Aufruf nach dieser Zeit ab (z. B. um auf eine andere Methode zu wechseln).
 * Andere Fehler (z. B. ungültiger Key) werden sofort weitergereicht.
 */
export async function callGeminiWithFallback(
  apiKey: string,
  preferredModel: string,
  parts: GeminiPart[],
  onStatus?: StatusFn,
  opts: CallOptions = {},
): Promise<{ text: string; model: string }> {
  const order = attemptOrder(preferredModel || DEFAULT_MODEL)
  const deadline = opts.budgetMs ? performance.now() + opts.budgetMs : Infinity
  let lastErr: unknown
  let budgetHit = false
  for (let i = 0; i < order.length; i++) {
    const model = order[i]
    const remaining = deadline - performance.now()
    if (remaining < 300) {
      budgetHit = true
      break
    }
    const t0 = performance.now()
    try {
      const text = await callOnce(apiKey, model, parts, Math.min(opts.timeoutMs ?? REQUEST_TIMEOUT_MS, remaining), opts.fast, opts.maxTokens, opts.lowRes ?? true)
      const ms = Math.round(performance.now() - t0)
      setLastWorkingModel(model)
      lsSet(LS_STAMP, String(Date.now()))
      lsSet(LS_PING, String(ms))
      publish({ state: 'ready', model, ms })
      return { text, model }
    } catch (e) {
      lastErr = e
      if (!isSwitchable(e)) throw e
      const next = order[i + 1]
      if (next) onStatus?.(`${model} nicht verfügbar – wechsle zu ${next} …`)
    }
  }
  if (budgetHit || (lastErr instanceof GeminiHttpError && lastErr.status === 408 && opts.budgetMs)) {
    throw new Error(`Zeitlimit von ${Math.round((opts.budgetMs ?? 0) / 1000)} s erreicht`)
  }
  publish({ state: 'offline', note: 'Kein Modell erreichbar' })
  const msg = lastErr instanceof Error ? lastErr.message : 'Unbekannter Fehler'
  throw new Error(`Kein Gemini-Modell hat geantwortet (${order.length} versucht). Letzter Fehler: ${msg}`)
}
// ---------- Warm-up / Ping ----------
async function ping(apiKey: string, model: string, timeoutMs = PING_TIMEOUT_MS): Promise<number> {
  const t0 = performance.now()
  const res = await post(apiKey, model, { contents: [{ parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 1 } }, timeoutMs)
  if (!res.ok) throw new GeminiHttpError(res.status, await errorMessage(res))
  return Math.round(performance.now() - t0)
}

export interface SpeedResult {
  model: string
  /** Antwortzeit in ms, null bei Fehler */
  ms: number | null
  error?: string
}

/** Misst nacheinander die Antwortzeit aller Modelle der Kette (je 1 winziger Request) */
export async function measureModels(apiKey: string, onResult?: (r: SpeedResult) => void): Promise<SpeedResult[]> {
  const out: SpeedResult[] = []
  for (const model of MODEL_CHAIN) {
    let r: SpeedResult
    try {
      // zweiter Messwert zählt: der erste enthält oft Verbindungsaufbau/Kaltstart
      await ping(apiKey, model, 6000)
      r = { model, ms: await ping(apiKey, model, 6000) }
    } catch (e) {
      r = { model, ms: null, error: e instanceof Error ? e.message : 'Fehler' }
    }
    out.push(r)
    onResult?.(r)
  }
  return out
}

let warming = 0

/**
 * Schonender Start-Check: Innerhalb von 30 Minuten nach dem letzten Check wird kein Request gesendet.
 * Sonst ein minimaler Ping an das zuletzt funktionierende Modell; bei Fehler/Timeout (>3 s) das nächste der Kette.
 */
export async function warmup(apiKey: string, force = false): Promise<void> {
  const key = apiKey.trim()
  if (key.length < 30) {
    publish({ state: 'offline', note: key ? 'API-Key unvollständig' : 'Kein API-Key' })
    return
  }
  const last = getLastWorkingModel()
  const stamp = Number(lsGet(LS_STAMP) ?? 0)
  if (!force && last && Date.now() - stamp < CHECK_INTERVAL_MS) {
    publish({ state: 'ready', model: last, ms: Number(lsGet(LS_PING) ?? 0) || undefined })
    return
  }
  const run = ++warming
  publish({ state: 'connecting' })
  const order = [...new Set([last ?? DEFAULT_MODEL, ...MODEL_CHAIN])]
  for (const model of order) {
    try {
      const ms = await ping(key, model)
      if (run !== warming) return
      setLastWorkingModel(model)
      lsSet(LS_STAMP, String(Date.now()))
      lsSet(LS_PING, String(ms))
      publish({ state: 'ready', model, ms })
      return
    } catch (e) {
      if (run !== warming) return
      if (!isSwitchable(e)) {
        publish({ state: 'offline', note: e instanceof Error ? e.message : 'Fehler' })
        return
      }
    }
  }
  if (run === warming) publish({ state: 'offline', note: 'Keine Verbindung' })
}
function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  return JSON.parse(cleaned) as T
}

// ---------- Handschrift ----------
export interface HandwritingResult {
  recognizedText: string
  isCorrect: boolean
  feedback: string
  /** Modell, das tatsächlich geantwortet hat, und Gesamtdauer */
  model?: string
  ms?: number
  /** Sauberkeit der Schrift 1–5 (nur mit Schreib-Tipps) */
  quality?: number
  tip?: string
}

/** Der Prompt für die Handschrift-Prüfung (auch Teil des Entwickler-Exports, damit man sieht, womit geprüft wurde) */
export function buildHandwritingPrompt(expected: string, withTips: boolean, tipThreshold: number): string {
  const syllables = Array.from(expected).filter((c) => c.trim()).length
  return (
    'Das Bild zeigt handgeschriebenes koreanisches Hangul (schwarz auf weiß) von einer Lernenden – die Schrift kann krakelig oder ungleichmäßig sein. ' +
    'Regeln: ' +
    '(1) Lies Silbe für Silbe als fertige Hangul-Silben (Anlaut + Vokal, ggf. + Endlaut). Gib NIEMALS einzelne Jamo wie ㄷ oder ㅏ als eigene Zeichen aus. ' +
    'Steht der Vokal weit vom Konsonanten entfernt, gehört er trotzdem zur selben Silbe. ' +
    '(2) Die Richtung der Striche entscheidet: kurzer Strich RECHTS vom langen senkrechten Strich = ㅏ/ㅑ, LINKS davon = ㅓ/ㅕ; ' +
    'kurzer Strich OBEN an der waagerechten Linie = ㅗ/ㅛ, UNTEN = ㅜ/ㅠ. ' +
    '(3) Lies, was wirklich dasteht, und korrigiere nicht zum Zielwort. ' +
    `Zielwort (nur zur Orientierung, ${syllables} Silben): "${expected}". ` +
    (withTips
      ? 'Bewerte zusätzlich STRENG die Schreibqualität (Form, Proportionen, gerade Striche, saubere Winkel, Ausrichtung) von 1 (kaum lesbar) bis 5 (sauber wie gedruckt). Normale, leicht krumme oder ungleichmäßige Handschrift ist höchstens 3. ' +
        `Antworte nur als JSON: {"recognizedText":"<gelesener Text>","quality":<1-5>,"tip":"<nur wenn quality <= ${tipThreshold}: kurzer deutscher Tipp (max. 14 Wörter), welche konkrete Stelle oder welcher Strich schöner geschrieben werden könnte; sonst leer>"}. Nichts lesbar: recognizedText leer.`
      : 'Antworte nur als JSON: {"recognizedText":"<gelesener Text>"}. Nichts lesbar: "".')
  )
}
/** Liest handgeschriebenes Koreanisch aus einem PNG (Base64 ohne data:-Prefix) – im Schnellmodus */
export async function readHandwriting(
  apiKey: string,
  model: string,
  pngBase64: string,
  expected: string,
  onStatus?: StatusFn,
  budgetMs?: number,
  withTips = false,
  tipThreshold = 4,
): Promise<HandwritingResult> {
  const prompt = buildHandwritingPrompt(expected, withTips, tipThreshold)
  const t0 = performance.now()
  const { text, model: used } = await callGeminiWithFallback(
    apiKey, model,
    [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: pngBase64 } }],
    onStatus,
    { fast: true, budgetMs, maxTokens: withTips ? 160 : 80, lowRes: false },
  )
  const j = parseJson<Partial<HandwritingResult>>(text)
  return { recognizedText: String(j.recognizedText ?? ''), isCorrect: false, feedback: '', quality: typeof j.quality === 'number' ? j.quality : undefined, tip: typeof j.tip === 'string' ? j.tip.trim() : undefined, model: used, ms: Math.round(performance.now() - t0) }
}
/** Liest mehrere handgeschriebene Bilder in EINEM Request (für die gesammelte Nachprüfung) */
export async function readHandwritingBatch(
  apiKey: string,
  model: string,
  items: { id: string; png: string; target: string }[],
  onStatus?: StatusFn,
  budgetMs = 40_000,
): Promise<{ readings: Record<string, string>; model: string }> {
  const parts: GeminiPart[] = [
    {
      text:
        `Die folgenden ${items.length} Bilder zeigen jeweils handgeschriebenes Hangul (schwarz auf weiß). ` +
        'Lies bei jedem Bild exakt, was dort steht, ohne zum Zielwort zu korrigieren. ' +
        'Lies als fertige Hangul-Silben (nie einzelne Jamo ausgeben); ein weit entfernter Vokal gehört trotzdem zur selben Silbe. ' +
        'Richtung entscheidet: kurzer Strich RECHTS vom senkrechten Strich = ㅏ/ㅑ, LINKS = ㅓ/ㅕ; kurzer Strich OBEN an der waagerechten Linie = ㅗ/ㅛ, UNTEN = ㅜ/ㅠ. ' +
        'Antworte nur als JSON-Array, ein Eintrag pro Bild in der Reihenfolge: [{"i":1,"recognizedText":"..."}, ...]. Nichts lesbar: "".',
    },
  ]
  items.forEach((it, idx) => {
    parts.push({ text: `Bild ${idx + 1} (Zielwort nur zur Orientierung: "${it.target}"):` })
    parts.push({ inlineData: { mimeType: 'image/png', data: it.png } })
  })
  const { text, model: used } = await callGeminiWithFallback(apiKey, model, parts, onStatus, {
    fast: true,
    budgetMs,
    timeoutMs: budgetMs,
    maxTokens: 60 + items.length * 30,
    lowRes: false,
  })
  const j = parseJson<unknown>(text)
  const arr = Array.isArray(j) ? j : Array.isArray((j as { results?: unknown })?.results) ? (j as { results: unknown[] }).results : []
  const readings: Record<string, string> = {}
  for (const row of arr as { i?: number; recognizedText?: unknown }[]) {
    const it = typeof row?.i === 'number' ? items[row.i - 1] : undefined
    if (it) readings[it.id] = String(row.recognizedText ?? '')
  }
  return { readings, model: used }
}

// ---------- Einzelwort ergänzen ----------
export type WordDraft = Pick<WordItem, 'korean' | 'german' | 'pronunciation' | 'wordType' | 'conjugations'>

export async function completeWord(apiKey: string, model: string, korean: string, onStatus?: StatusFn): Promise<Partial<WordDraft>> {
  const prompt =
    `Koreanisches Wort: "${korean}". Antworte nur als JSON mit den Feldern: ` +
    '"german" (kurze deutsche Übersetzung), ' +
    '"pronunciation" (NUR wenn sich die Aussprache durch Lautverschiebung vom Schriftbild unterscheidet: Aussprache in Hangul in eckigen Klammern wie "[학꾜]", sonst leerer String; KEINE Romanisierung), ' +
    '"wordType" (genau einer von: verb, adjective, noun, other), ' +
    'und nur für Verben/Adjektive "conjugations" mit den Feldern presentPolite (-아요/-어요/-해요), presentFormal (-습니다/-ㅂ니다), pastPolite (-았어요/-었어요/-했어요), futurePolite (-(으)ㄹ 거예요) als vollständig ausgeschriebene Formen.'
  const { text } = await callGeminiWithFallback(apiKey, model, [{ text: prompt }], onStatus)
  return parseJson<Partial<WordDraft>>(text)
}

// ---------- Vokabel-Extraktion aus Dateien ----------
const EXTRACT_PROMPT = `Du bist ein Experte für Koreanisch-Unterricht für deutschsprachige Lernende.
Extrahiere aus dem folgenden Material (auch aus unordentlichen Übungsblättern, Kursfolien, Screenshots oder Vokabellisten) ALLE koreanischen Vokabeln.
Antworte ausschließlich mit einem JSON-Array. Jedes Element hat diese Felder:
- "korean": Das koreanische Wort. Verben und Adjektive IMMER in die Grundform (Wörterbuchform auf -다) umwandeln, z. B. "가다" statt "가요".
- "german": Deutsche Übersetzung – aus dem Material übernehmen oder präzise ins Deutsche übersetzen.
- "pronunciation": Aussprachehilfe NUR in Hangul in eckigen Klammern wie "[학꾜]", falls Lautverschiebungen auftreten, sonst "". NIEMALS Romanisierung oder lateinische Buchstaben.
- "wordType": genau einer von "verb", "adjective", "noun", "other".
- "tags": Array deutscher Tags: immer die Wortart (z. B. "#Verb", "#Adjektiv", "#Nomen") plus ein Thema (z. B. "#Essen", "#Schule", "#Personen").
- "conjugations": Nur bei Verben/Adjektiven, Objekt mit den vier korrekt berechneten Formen: "presentPolite" (-아요/-어요/-해요), "presentFormal" (-습니다/-ㅂ니다), "pastPolite" (-았어요/-었어요/-했어요), "futurePolite" (-(으)ㄹ 거예요, z. B. "갈 거예요").
Keine Duplikate. Ignoriere reine Grammatikerklärungen und ganze Sätze, sofern sie keine Vokabeln sind. Wenn nichts Passendes gefunden wird, antworte mit [].`

export interface ExtractedWord {
  korean: string
  german: string
  pronunciation?: string
  wordType?: string
  tags?: string[]
  conjugations?: Record<string, string>
}

export type ExtractInput = { text: string } | { mimeType: string; base64: string }

/** Rettet vollständige Objekte aus einem abgeschnittenen JSON-Array */
function salvageArray(text: string): unknown[] {
  const t = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const start = t.indexOf('[')
  if (start < 0) return []
  for (let end = t.lastIndexOf('}'); end > start; end = t.lastIndexOf('}', end - 1)) {
    try {
      const arr = JSON.parse(t.slice(start, end + 1) + ']')
      if (Array.isArray(arr)) return arr
    } catch {
      /* weiter nach vorne suchen */
    }
  }
  return []
}

export async function extractVocabulary(
  apiKey: string,
  model: string,
  input: ExtractInput,
  onStatus?: StatusFn,
): Promise<{ words: ExtractedWord[]; truncated: boolean }> {
  const parts: GeminiPart[] =
    'text' in input
      ? [{ text: `${EXTRACT_PROMPT}\n\nMaterial:\n"""\n${input.text}\n"""` }]
      : [{ text: EXTRACT_PROMPT }, { inlineData: { mimeType: input.mimeType, data: input.base64 } }]
  const { text } = await callGeminiWithFallback(apiKey, model, parts, onStatus, { timeoutMs: 90_000 })
  let j: unknown
  let truncated = false
  try {
    j = parseJson<unknown>(text)
  } catch {
    // Antwort war zu lang und wurde abgeschnitten: vollständige Einträge retten
    j = salvageArray(text)
    truncated = true
  }
  const arr = Array.isArray(j) ? j : Array.isArray((j as { words?: unknown })?.words) ? (j as { words: unknown[] }).words : []
  return { words: arr as ExtractedWord[], truncated }
}