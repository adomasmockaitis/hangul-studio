export type Pt = [number, number]
/** Jeder Strich ist eine Polylinie im 100x100-Raster */
export type Stroke = Pt[]

function circle(cx: number, cy: number, r: number, n = 28): Stroke {
  const pts: Pt[] = []
  // Start oben, gegen den Uhrzeigersinn
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 - (i / n) * Math.PI * 2
    pts.push([Math.round((cx + r * Math.cos(a)) * 10) / 10, Math.round((cy + r * Math.sin(a)) * 10) / 10])
  }
  return pts
}

export const JAMO_STROKES: Record<string, Stroke[]> = {
  // ㄱ/ㅋ/ㅈ/ㅊ: handschriftliche Form mit leicht schräg nach links unten laufendem Strich
  'ㄱ': [[[18, 13], [80, 12], [79, 25], [78, 36], [73, 49], [67, 61], [57, 75], [46, 86]]],
  'ㄴ': [[[22, 15], [22, 80], [85, 80]]],
  'ㄷ': [[[22, 18], [80, 18]], [[22, 18], [22, 82], [80, 82]]],
  'ㄹ': [[[20, 15], [78, 15], [78, 45]], [[78, 45], [20, 45], [20, 82]], [[20, 82], [80, 82]]],
  'ㅁ': [[[22, 20], [22, 80]], [[22, 20], [78, 20], [78, 80]], [[22, 80], [78, 80]]],
  'ㅂ': [[[25, 15], [25, 85]], [[75, 15], [75, 85]], [[25, 45], [75, 45]], [[25, 85], [75, 85]]],
  // ㅅ = ㅈ ohne die obere Linie: gleiche Striche, gleiche Reihenfolge (langer Strich, dann zweiter Strich)
  'ㅅ': [[[75, 10], [15, 90]], [[48, 46], [86, 93]]],
  'ㅇ': [circle(50, 50, 30)],
  // ㅈ/ㅊ: nach deiner Handschrift vermessen (ス-Form: langer, GERADER Strich vom rechten Ende der Linie nach links unten)
  'ㅈ': [[[15, 12], [83, 12]], [[79, 10], [15, 90]], [[50, 46], [86, 93]]],
  'ㅊ': [[[38, 7], [47, 14], [55, 24]], [[18, 32], [71, 32]], [[70, 37], [19, 91]], [[49, 60], [82, 92]]],
  'ㅋ': [[[16, 10], [82, 9], [81, 22], [80, 34], [76, 47], [71, 59], [63, 74], [52, 87]], [[28, 47], [77, 45]]],
  // ㅌ: obere Linie, mittlere Linie, dann ㄴ (Schulbuch-Reihenfolge)
  'ㅌ': [[[22, 18], [80, 18]], [[22, 50], [75, 50]], [[22, 18], [22, 82], [80, 82]]],
  'ㅍ': [[[18, 18], [82, 18]], [[35, 18], [35, 82]], [[65, 18], [65, 82]], [[18, 82], [82, 82]]],
  'ㅎ': [[[50, 6], [50, 20]], [[22, 32], [78, 32]], circle(50, 66, 20)],
  'ㅏ': [[[40, 12], [40, 88]], [[40, 50], [72, 50]]],
  'ㅑ': [[[40, 12], [40, 88]], [[40, 38], [72, 38]], [[40, 64], [72, 64]]],
  // ㅓ/ㅕ: erst der kurze Querstrich (links nach rechts), dann der lange senkrechte Strich
  'ㅓ': [[[28, 50], [60, 50]], [[60, 12], [60, 88]]],
  'ㅕ': [[[28, 38], [60, 38]], [[28, 64], [60, 64]], [[60, 12], [60, 88]]],
  'ㅗ': [[[50, 35], [50, 70]], [[15, 70], [85, 70]]],
  'ㅛ': [[[35, 35], [35, 70]], [[65, 35], [65, 70]], [[15, 70], [85, 70]]],
  'ㅜ': [[[15, 30], [85, 30]], [[50, 30], [50, 65]]],
  'ㅠ': [[[15, 30], [85, 30]], [[35, 30], [35, 65]], [[65, 30], [65, 65]]],
  'ㅡ': [[[15, 50], [85, 50]]],
  'ㅣ': [[[50, 12], [50, 88]]],
}

export function strokePath(s: Stroke): string {
  return s.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
}

/** Pfeilspitze am Ende eines Strichs */
export function arrowHead(s: Stroke, size = 7): string {
  const [x2, y2] = s[s.length - 1]
  // Richtung aus dem letzten Segment mit sichtbarer Länge
  let [x1, y1] = s[s.length - 2]
  for (let i = s.length - 2; i >= 0; i--) {
    const [px, py] = s[i]
    if (Math.hypot(x2 - px, y2 - py) > 4) {
      ;[x1, y1] = [px, py]
      break
    }
  }
  const a = Math.atan2(y2 - y1, x2 - x1)
  const p = (ang: number): string =>
    `${(x2 - size * Math.cos(a + ang)).toFixed(1)},${(y2 - size * Math.sin(a + ang)).toFixed(1)}`
  return `${x2},${y2} ${p(0.45)} ${p(-0.45)}`
}
