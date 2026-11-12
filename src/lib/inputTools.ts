/**
 * Strichbasierte Handschrifterkennung über Googles Input-Tools-Endpunkt.
 * Inoffiziell (kann sich ändern); sendet nur Strichkoordinaten, keine Bilder.
 */
export interface InkPoint {
  x: number
  y: number
  /** Millisekunden seit Beginn des Zeichnens */
  t: number
}

const URL_IT = 'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8'
const TIMEOUT_MS = 4000

export async function recognizeInk(strokes: InkPoint[][], width: number, height: number): Promise<string[]> {
  const ink = strokes
    .filter((s) => s.length)
    .map((s) => [s.map((p) => Math.round(p.x)), s.map((p) => Math.round(p.y)), s.map((p) => Math.round(p.t))])
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(URL_IT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        options: 'enable_pre_space',
        requests: [{ writing_guide: { writing_area_width: Math.round(width), writing_area_height: Math.round(height) }, ink, language: 'ko' }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Input Tools: HTTP ${res.status}`)
    const j = (await res.json()) as unknown
    if (!Array.isArray(j) || j[0] !== 'SUCCESS') throw new Error('Input Tools: unerwartete Antwort')
    const cands = (j[1] as unknown[][])?.[0]?.[1]
    if (!Array.isArray(cands)) throw new Error('Input Tools: keine Kandidaten')
    return cands.filter((c): c is string => typeof c === 'string')
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Input Tools: Zeitüberschreitung')
    if (e instanceof TypeError) throw new Error('Input Tools: nicht erreichbar (Netzwerk/CORS)')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
