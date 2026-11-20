/**
 * Doppelte Bedeutungen beim Scannen finden: gleiches deutsches Wort mit verschiedenem Koreanisch
 * (z. B. 집 und 가정 = „Haus“) oder gleiches Koreanisch mit verschiedenem Deutsch – innerhalb des Scans
 * und gegenüber dem Wörterbuch.
 */

export interface DupEntry {
  /** Zeilen-ID im Scan bzw. Wort-ID im Wörterbuch */
  id: string
  source: 'scan' | 'dict'
  korean: string
  german: string
}

export interface DupGroup {
  /** stabiler Schlüssel (für „beide behalten“) */
  key: string
  kind: 'german' | 'korean'
  /** gemeinsame Bedeutung bzw. gemeinsames koreanisches Wort */
  shared: string
  entries: DupEntry[]
}

/** Deutsche Bedeutungen eines Eintrags: getrennt an , ; / – ohne Artikel, „sich“, „etw.“ und Satzzeichen */
export function germanMeanings(german: string): string[] {
  return german
    .split(/[,;/]/)
    .map((p) =>
      p
        .toLowerCase()
        .normalize('NFC')
        .replace(/\b(der|die|das|ein|eine|sich|etw\.?|jdn\.?|jdm\.?|zu)\s+/g, '')
        .replace(/[.!?"„“'’]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}

const ko = (s: string) => s.normalize('NFC').replace(/\s+/g, '').trim()

/**
 * Gruppen mit gleicher Bedeutung. Nur Gruppen mit mindestens einem Scan-Eintrag werden gemeldet
 * (Doppelungen nur im Wörterbuch betreffen diesen Upload nicht). Klammerzusätze unterscheiden:
 * „Haus (Gebäude)“ und „Haus (Zuhause)“ gelten als verschieden.
 */
/** Alle Doppelungen innerhalb des Wörterbuchs (für die einmalige Prüfung bestehender Wörter) */
export const findDictDuplicates = (dict: DupEntry[]) => findDuplicates(dict, [], true)

export function findDuplicates(scan: DupEntry[], dict: DupEntry[], any = false): DupGroup[] {
  const all = [...scan, ...dict]
  const groups: DupGroup[] = []
  const seen = new Set<string>()

  // gleiches Deutsch, verschiedenes Koreanisch
  const byGerman = new Map<string, DupEntry[]>()
  for (const e of all) for (const m of germanMeanings(e.german)) {
    const list = byGerman.get(m) ?? []
    if (!list.includes(e)) list.push(e)
    byGerman.set(m, list)
  }
  for (const [m, list] of byGerman) {
    const distinct = new Map<string, DupEntry>()
    for (const e of list) if (!distinct.has(ko(e.korean))) distinct.set(ko(e.korean), e)
    const entries = [...distinct.values()]
    if (entries.length < 2 || (!any && !entries.some((e) => e.source === 'scan'))) continue
    const sig = 'g:' + entries.map((e) => e.id).sort().join('|')
    if (seen.has(sig)) continue
    seen.add(sig)
    groups.push({ key: sig, kind: 'german', shared: m, entries })
  }

  // gleiches Koreanisch, verschiedenes Deutsch (innerhalb des Scans oder Scan ↔ Wörterbuch)
  const byKorean = new Map<string, DupEntry[]>()
  for (const e of all) {
    const k = ko(e.korean)
    if (!k) continue
    byKorean.set(k, [...(byKorean.get(k) ?? []), e])
  }
  for (const [k, list] of byKorean) {
    if (!any && !list.some((e) => e.source === 'scan')) continue
    const meanings = new Set(list.map((e) => germanMeanings(e.german).join(', ')))
    if (list.length < 2 || meanings.size < 2) continue
    const sig = 'k:' + list.map((e) => e.id).sort().join('|')
    if (seen.has(sig)) continue
    seen.add(sig)
    groups.push({ key: sig, kind: 'korean', shared: k, entries: list })
  }
  return groups
}

/** Anfrage an Gemini: deutsche Übersetzungen so schärfen, dass sie sich klar unterscheiden */
export function distinguishPrompt(entries: DupEntry[]): string {
  return [
    'Du hilfst beim Koreanisch-Lernen (Lernende sprechen Deutsch).',
    'Diese koreanischen Wörter haben in einer Vokabelliste dieselbe oder eine sehr ähnliche deutsche Übersetzung.',
    'Gib für jedes Wort eine kurze, präzisere deutsche Übersetzung, an der man die Wörter auseinanderhalten kann',
    '(z. B. Nuance, Sprachebene oder typischer Gebrauch in Klammern: „Haus (Gebäude)“, „Zuhause (Familie)“).',
    'Bleib nah an der bisherigen Übersetzung, höchstens etwa 6 Wörter. Ist ein Wort nur eine Schreibvariante, sag das in der Klammer.',
    'Antworte NUR mit JSON: [{"korean": "...", "german": "..."}] in derselben Reihenfolge.',
    '',
    ...entries.map((e) => `- ${e.korean} = ${e.german}`),
  ].join('\n')
}

export function parseDistinguish(text: string): { korean: string; german: string }[] {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0]) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x): x is { korean: string; german: string } => !!x && typeof x.korean === 'string' && typeof x.german === 'string')
      .map((x) => ({ korean: x.korean.trim(), german: x.german.trim() }))
      .filter((x) => x.korean && x.german)
  } catch {
    return []
  }
}
