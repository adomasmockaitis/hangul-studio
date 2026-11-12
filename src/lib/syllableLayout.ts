import { expandJamo, isSyllable, splitSyllable } from './hangul'
import { JAMO_STROKES, type Pt, type Stroke } from './strokes'

/** Ein Strich, bereits an seine Position im Silbenblock (100x100) gesetzt */
export interface PlacedStroke {
  jamo: string
  /** Index des Buchstabens innerhalb der Silbe (Anlaut = 0, Vokal = 1, Endlaut = 2 …) */
  jamoIndex: number
  strokeIndex: number
  pts: Stroke
}

export interface SyllableLayout {
  char: string
  /** Buchstaben in Schreibreihenfolge, z. B. ['ㄱ', 'ㅏ'] */
  jamo: string[]
  strokes: PlacedStroke[]
}

type Box = [x: number, y: number, w: number, h: number]

const HORIZONTAL = new Set(['ㅗ', 'ㅜ', 'ㅡ', 'ㅛ', 'ㅠ'])

/** Verteilt mehrere Zeichen (z. B. Doppelkonsonant ㄲ) nebeneinander in einer Box */
function split(box: Box, n: number): Box[] {
  const [x, y, w, h] = box
  return Array.from({ length: n }, (_, i) => [x + (w / n) * i, y, w / n, h] as Box)
}

function put(jamo: string, box: Box): Stroke[] {
  const [bx, by, bw, bh] = box
  return (JAMO_STROKES[jamo] ?? []).map((s) => s.map(([x, y]) => [Math.round((bx + (x * bw) / 100) * 10) / 10, Math.round((by + (y * bh) / 100) * 10) / 10] as Pt))
}

/**
 * Setzt die Buchstaben einer Silbe so zusammen, wie man sie schreibt:
 * Anlaut links/oben, Vokal rechts (senkrecht) oder unten (waagerecht), Endlaut unten.
 */
export function layoutSyllable(ch: string): SyllableLayout | null {
  if (!isSyllable(ch)) {
    return JAMO_STROKES[ch]
      ? { char: ch, jamo: [ch], strokes: JAMO_STROKES[ch].map((pts, strokeIndex) => ({ jamo: ch, jamoIndex: 0, strokeIndex, pts })) }
      : null
  }
  const [L, V, T] = splitSyllable(ch)
  const hasT = !!T
  const vParts = expandJamo(V)
  const hs = vParts.filter((p) => HORIZONTAL.has(p))
  const vs = vParts.filter((p) => !HORIZONTAL.has(p))

  let lBox: Box
  const tBox: Box = [18, 62, 64, 36]
  const vowelBoxes: { jamo: string; box: Box }[] = []

  if (!hs.length) {
    // senkrechter Vokal rechts
    lBox = hasT ? [2, 2, 50, 54] : [2, 6, 50, 88]
    const area: Box = hasT ? [50, 0, 48, 58] : [50, 2, 48, 96]
    split(area, vs.length).forEach((b, i) => vowelBoxes.push({ jamo: vs[i], box: b }))
  } else if (!vs.length) {
    // waagerechter Vokal unten
    if (hasT) {
      lBox = [20, 0, 60, 34]
      vowelBoxes.push({ jamo: hs[0], box: [6, 32, 88, 32] })
    } else {
      lBox = [18, 2, 64, 48]
      vowelBoxes.push({ jamo: hs[0], box: [6, 48, 88, 48] })
    }
  } else {
    // gemischt (ㅘ, ㅝ, ㅢ …): waagerechter Teil unten links, senkrechter rechts
    if (hasT) {
      lBox = [2, 0, 52, 34]
      vowelBoxes.push({ jamo: hs[0], box: [2, 34, 62, 28] })
      split([56, 0, 42, 62], vs.length).forEach((b, i) => vowelBoxes.push({ jamo: vs[i], box: b }))
    } else {
      lBox = [2, 2, 52, 46]
      vowelBoxes.push({ jamo: hs[0], box: [2, 46, 62, 50] })
      split([56, 2, 42, 94], vs.length).forEach((b, i) => vowelBoxes.push({ jamo: vs[i], box: b }))
    }
  }

  const parts: { jamo: string; box: Box }[] = []
  split(lBox, expandJamo(L).length).forEach((b, i) => parts.push({ jamo: expandJamo(L)[i], box: b }))
  parts.push(...vowelBoxes)
  if (hasT) split(tBox, expandJamo(T).length).forEach((b, i) => parts.push({ jamo: expandJamo(T)[i], box: b }))

  const strokes: PlacedStroke[] = []
  parts.forEach((p, jamoIndex) => {
    put(p.jamo, p.box).forEach((pts, strokeIndex) => strokes.push({ jamo: p.jamo, jamoIndex, strokeIndex, pts }))
  })
  return { char: ch, jamo: [L, V, T].filter(Boolean), strokes }
}
