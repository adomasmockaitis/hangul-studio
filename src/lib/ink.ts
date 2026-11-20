/**
 * Handschrift für ganze Sätze: Striche gruppieren (Wörter / Kästchen), als Bild exportieren und erkennen.
 * Erkennung: Gemini (mit Key, liest ganze Zeilen gut) → Google Input Tools (kostenlos, gut bei Wörtern/Silben).
 */
import { readHandwriting } from './gemini'
import { recognizeInk } from './inputTools'

export interface Pt {
  x: number
  y: number
  t: number
}
export type Stroke = Pt[]

export interface Box {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function bbox(strokes: Stroke[]): Box | null {
  const pts = strokes.flat()
  if (!pts.length) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Striche zu Wörtern gruppieren: eine waagerechte Lücke, die deutlich größer ist als der Abstand zwischen
 * Silben, trennt zwei Wörter. Maßstab ist die Schrifthöhe (Silben stehen eng, Wörter mit Abstand).
 */
export function clusterWords(strokes: Stroke[], gapFactor = 0.45): Stroke[][] {
  const items = strokes
    .map((s) => ({ s, b: bbox([s])! }))
    .filter((x) => x.b)
    .sort((a, b) => a.b.minX - b.b.minX)
  if (!items.length) return []
  const all = bbox(strokes)!
  const height = Math.max(20, all.maxY - all.minY)
  const gap = height * gapFactor
  const groups: { strokes: Stroke[]; maxX: number }[] = []
  for (const it of items) {
    const g = groups[groups.length - 1]
    if (g && it.b.minX <= g.maxX + gap) {
      g.strokes.push(it.s)
      g.maxX = Math.max(g.maxX, it.b.maxX)
    } else groups.push({ strokes: [it.s], maxX: it.b.maxX })
  }
  return groups.map((g) => g.strokes)
}

/** Schwarz auf Weiß, eng zugeschnitten (Base64 ohne data:-Präfix) */
export function strokesToPng(strokes: Stroke[], lineWidth: number, maxSide = 1024): string {
  const b = bbox(strokes)
  if (!b) return ''
  const pad = 16
  const w = Math.max(40, b.maxX - b.minX + pad * 2)
  const h = Math.max(40, b.maxY - b.minY + pad * 2)
  const scale = Math.min(2, maxSide / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * scale))
  c.height = Math.max(1, Math.round(h * scale))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.translate((pad - b.minX) * scale, (pad - b.minY) * scale)
  ctx.strokeStyle = '#000'
  ctx.fillStyle = '#000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, lineWidth) * scale
  for (const s of strokes) {
    ctx.beginPath()
    ctx.moveTo(s[0].x * scale, s[0].y * scale)
    for (const p of s.slice(1)) ctx.lineTo(p.x * scale, p.y * scale)
    if (s.length === 1) ctx.lineTo(s[0].x * scale + 0.1, s[0].y * scale)
    ctx.stroke()
  }
  return c.toDataURL('image/png').split(',')[1]
}

/** Nur fertige Hangul-Silben (und Leerzeichen) – keine einzelnen Jamo, Satzzeichen oder Ziffern */
const isHangulText = (s: string) => /^[가-힣]+( [가-힣]+)*$/.test(s)

/** Input-Tools-Kandidaten für eine Strichgruppe (nur echte Hangul-Silben, bester zuerst) */
export async function candidates(strokes: Stroke[]): Promise<string[]> {
  const b = bbox(strokes)
  if (!b) return []
  const t0 = Math.min(...strokes.flat().map((p) => p.t))
  const ink = strokes.map((s) => s.map((p) => ({ x: p.x - b.minX + 10, y: p.y - b.minY + 10, t: p.t - t0 })))
  const cands = await recognizeInk(ink, b.maxX - b.minX + 20, b.maxY - b.minY + 20)
  return [...new Set(cands.map((c) => c.trim()).filter(isHangulText))]
}

export interface LineReading {
  text: string
  via: 'gemini' | 'inputtools' | 'none'
}

/**
 * Eine ganze Zeile lesen: mit Key Gemini (ganzes Bild), sonst Input Tools Wort für Wort.
 * Klappt beides nicht: leerer Text (dann schätzt die lernende Person selbst ein).
 */
export async function readLine(strokes: Stroke[], opts: { apiKey: string; model: string; expected: string; lineWidth: number }): Promise<LineReading> {
  if (!strokes.length) return { text: '', via: 'none' }
  if (opts.apiKey.trim()) {
    try {
      const r = await readHandwriting(opts.apiKey.trim(), opts.model, strokesToPng(strokes, opts.lineWidth), opts.expected, undefined, 15_000)
      if (r.recognizedText.trim()) return { text: r.recognizedText.trim(), via: 'gemini' }
    } catch {
      /* weiter mit Input Tools */
    }
  }
  try {
    const words = await Promise.all(clusterWords(strokes).map((g) => candidates(g).then((c) => c[0] ?? '')))
    const text = words.filter(Boolean).join(' ')
    if (text) return { text, via: 'inputtools' }
  } catch {
    /* nicht erreichbar */
  }
  return { text: '', via: 'none' }
}

/** Ein einzelnes Wort/eine Silbe: Input Tools, bei Ausfall Gemini (mit Key) */
export async function readPiece(strokes: Stroke[], opts: { apiKey: string; model: string; lineWidth: number }): Promise<string[]> {
  try {
    const c = await candidates(strokes)
    if (c.length) return c
  } catch {
    /* Ausweich: Gemini */
  }
  if (opts.apiKey.trim()) {
    try {
      const r = await readHandwriting(opts.apiKey.trim(), opts.model, strokesToPng(strokes, opts.lineWidth), '', undefined, 10_000)
      if (r.recognizedText.trim()) return [r.recognizedText.trim()]
    } catch {
      /* nichts */
    }
  }
  return []
}

/** Vergleich ohne Leerzeichen und Satzzeichen */
export const sameSentence = (a: string, b: string) => {
  const n = (s: string) => s.normalize('NFC').replace(/[\s.,!?·]/g, '')
  return !!n(a) && n(a) === n(b)
}
