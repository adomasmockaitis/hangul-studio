const L = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const V = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ']
const T = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']

/** Zusammengesetzte Jamo -> Grundbausteine, die einzeln geschrieben werden */
const DECOMP: Record<string, string[]> = {
  'ㄲ': ['ㄱ','ㄱ'], 'ㄸ': ['ㄷ','ㄷ'], 'ㅃ': ['ㅂ','ㅂ'], 'ㅆ': ['ㅅ','ㅅ'], 'ㅉ': ['ㅈ','ㅈ'],
  'ㄳ': ['ㄱ','ㅅ'], 'ㄵ': ['ㄴ','ㅈ'], 'ㄶ': ['ㄴ','ㅎ'], 'ㄺ': ['ㄹ','ㄱ'], 'ㄻ': ['ㄹ','ㅁ'],
  'ㄼ': ['ㄹ','ㅂ'], 'ㄽ': ['ㄹ','ㅅ'], 'ㄾ': ['ㄹ','ㅌ'], 'ㄿ': ['ㄹ','ㅍ'], 'ㅀ': ['ㄹ','ㅎ'], 'ㅄ': ['ㅂ','ㅅ'],
  'ㅐ': ['ㅏ','ㅣ'], 'ㅒ': ['ㅑ','ㅣ'], 'ㅔ': ['ㅓ','ㅣ'], 'ㅖ': ['ㅕ','ㅣ'],
  'ㅘ': ['ㅗ','ㅏ'], 'ㅙ': ['ㅗ','ㅏ','ㅣ'], 'ㅚ': ['ㅗ','ㅣ'],
  'ㅝ': ['ㅜ','ㅓ'], 'ㅞ': ['ㅜ','ㅓ','ㅣ'], 'ㅟ': ['ㅜ','ㅣ'], 'ㅢ': ['ㅡ','ㅣ'],
}

/** Zerlegt zusammengesetzte Jamo in Grundbausteine (ㅘ -> ㅗ, ㅏ), einfache bleiben unverändert */
export function expandJamo(j: string): string[] {
  return DECOMP[j] ?? [j]
}

export function isSyllable(ch: string): boolean {
  const c = ch.charCodeAt(0)
  return c >= 0xac00 && c <= 0xd7a3
}

/** Silbe -> [Anlaut, Vokal, Endlaut?] als Kompatibilitäts-Jamo */
export function splitSyllable(ch: string): string[] {
  if (!isSyllable(ch)) return [ch]
  const s = ch.charCodeAt(0) - 0xac00
  const out = [L[Math.floor(s / 588)], V[Math.floor((s % 588) / 28)]]
  const t = T[s % 28]
  if (t) out.push(t)
  return out
}

/** Alle Grund-Jamo eines Textes in Schreibreihenfolge, ohne Duplikate */
export function basicJamo(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ch of text) {
    for (const j of splitSyllable(ch)) {
      for (const b of DECOMP[j] ?? [j]) {
        if (!seen.has(b)) {
          seen.add(b)
          out.push(b)
        }
      }
    }
  }
  return out
}

/** Alle Grund-Jamo in Schreibreihenfolge, Silbe für Silbe, ohne Duplikat-Entfernung */
export function jamoSequence(text: string): string[] {
  const out: string[] = []
  for (const ch of text) {
    for (const j of splitSyllable(ch)) out.push(...(DECOMP[j] ?? [j]))
  }
  return out
}

/** Normalisiert Text für Vergleiche (NFC, ohne Leerzeichen/Satzzeichen) */
export function normalizeKorean(s: string): string {
  return s.normalize('NFC').replace(/[\s.,!?~\-_'"`´‘’“”()[\]{}·…]/g, '')
}

export function stripPronunciation(s: string) {
  return s.replace(/[[\]]/g, '')
}
