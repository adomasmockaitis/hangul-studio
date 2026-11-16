/** Toleranter Vergleich deutscher Antworten (Artikel, Groß-/Kleinschreibung, kleine Tippfehler; jede Bedeutung zählt) */
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/\(.*?\)/g, '')
    .replace(/[.,!?;:"'()]/g, '')
    .replace(/^(der|die|das|ein|eine|zu|to)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export function matchesGerman(input: string, german: string): boolean {
  const x = norm(input)
  if (!x) return false
  const variants = [german, ...german.split(/[,;/]/)].map(norm).filter((v) => v.length >= 3 || v === norm(german))
  return variants.some((v) => v === x || (v.length >= 6 && x.length >= 6 && lev(v, x) <= 1))
}

