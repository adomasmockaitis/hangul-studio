/**
 * Offline-Texterkennung ohne Key: Tesseract.js (Koreanisch + Deutsch) für Bilder und eingescannte PDFs,
 * pdf.js für PDFs mit eingebettetem Text. Beides wird erst bei Bedarf geladen.
 * Die Sprachdaten (ca. 10–15 MB) lädt Tesseract beim ersten Mal und speichert sie im Browser.
 */

const K_READY = 'hangul-studio:ocr-ready'
export const ocrDataLoaded = () => {
  try {
    return localStorage.getItem(K_READY) === '1'
  } catch {
    return false
  }
}

export type Progress = (text: string) => void

let workerP: Promise<import('tesseract.js').Worker> | null = null
let progressCb: Progress | null = null

async function worker(onProgress?: Progress) {
  progressCb = onProgress ?? null
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import('tesseract.js')
      const w = await createWorker(['kor', 'deu'], 1, {
        logger: (m: { status: string; progress: number }) => {
          if (!progressCb) return
          const pct = Math.round((m.progress ?? 0) * 100)
          if (/loading|load/i.test(m.status)) progressCb(`Sprachdaten werden geladen … ${pct} %`)
          else if (/recogniz/i.test(m.status)) progressCb(`Text wird erkannt … ${pct} %`)
        },
      })
      try { localStorage.setItem(K_READY, '1') } catch { /* ignore */ }
      return w
    })().catch((e) => {
      workerP = null
      throw e
    })
  }
  return workerP
}

/** Bild (Datei oder Canvas) erkennen */
export async function ocrImage(img: Blob | HTMLCanvasElement, onProgress?: Progress): Promise<string> {
  const w = await worker(onProgress)
  const { data } = await w.recognize(img)
  return data.text ?? ''
}

const MAX_PAGES = 20

/** PDF lesen: eingebetteten Text nehmen, Seiten ohne Text per Texterkennung */
export async function pdfToText(file: Blob, onProgress?: Progress): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const out: string[] = []
  const pages = Math.min(doc.numPages, MAX_PAGES)
  for (let n = 1; n <= pages; n++) {
    onProgress?.(`Seite ${n} von ${pages} wird gelesen …`)
    const page = await doc.getPage(n)
    const tc = await page.getTextContent()
    // Textstücke nach Zeilen (y-Position) gruppieren
    const rows = new Map<number, { x: number; s: string }[]>()
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      if (!it.str?.trim() || !it.transform) continue
      const y = Math.round(it.transform[5] / 3) * 3
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str }])
    }
    const text = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '))
      .join('\n')
    if ((text.match(/[가-힣A-Za-z]/g)?.length ?? 0) >= 20) {
      out.push(text)
      continue
    }
    // eingescannte Seite: als Bild rendern und erkennen
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    out.push(await ocrImage(canvas, (s) => onProgress?.(`Seite ${n}: ${s}`)))
  }
  return out.join('\n')
}
