import { buildHandwritingPrompt } from './gemini'
import { loadDisputes } from './geminiDisputes'
import { loadAgreement, loadSamples, summarize } from './inputToolsLog'
import { loadPending, processPending } from './inputToolsQueue'
import type { Settings } from '../types'

// ---------- Minimaler ZIP-Writer (ohne Kompression), damit Daten + Bilder in EINER Datei landen ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface ZipFile {
  name: string
  data: Uint8Array<ArrayBuffer>
}

function makeZip(files: ZipFile[]): Blob {
  const enc = new TextEncoder()
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const chunks: BlobPart[] = []
  const central: BlobPart[] = []
  let offset = 0
  let centralSize = 0

  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8-Dateinamen
    local.setUint16(8, 0, true) // gespeichert, nicht komprimiert
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    chunks.push(local.buffer, name, f.data)

    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0x0800, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, dosTime, true)
    cd.setUint16(14, dosDate, true)
    cd.setUint32(16, crc, true)
    cd.setUint32(20, f.data.length, true)
    cd.setUint32(24, f.data.length, true)
    cd.setUint16(28, name.length, true)
    cd.setUint32(42, offset, true)
    central.push(cd.buffer, name)
    centralSize += 46 + name.length
    offset += 30 + name.length + f.data.length
  }

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' })
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const README = `Hangul Studio – Entwickler-Export
=================================
data.json    Alle gesammelten Daten (siehe "guide" darin)
images/      Die dazugehörigen Bilder (PNG, schwarz auf weiß, max. 512 px). In data.json stehen nur die Dateipfade.

Zweck: Auswertung der Handschrifterkennung, um (a) die Input-Tools-Erkennung zu verbessern und
(b) den Gemini-Prompt zu verbessern.
`

export interface ExportResult {
  samples: number
  disputes: number
  pending: number
  images: number
  processedNow: number
  note?: string
}

/**
 * Erzeugt EINE .zip-Datei mit allen Entwickler-Daten und Bildern.
 * Vorher werden wartende Fälle noch per Gemini nachgeprüft, damit alles vollständig ist.
 */
export async function exportAllDevData(
  settings: Settings,
  onStatus?: (m: string) => void,
): Promise<ExportResult> {
  let processedNow = 0
  let note: string | undefined

  // 1) Wartende Fälle zuerst nachprüfen
  if (loadPending().length && settings.geminiApiKey.trim()) {
    onStatus?.('Gemini prüft wartende Fälle nach …')
    try {
      processedNow = await processPending(settings.geminiApiKey, settings.geminiModel, onStatus)
    } catch (e) {
      note = `Nachprüfung nicht möglich (${e instanceof Error ? e.message : 'Fehler'}) – wartende Fälle sind unbewertet im Export enthalten.`
    }
  } else if (loadPending().length) {
    note = 'Ohne API-Key konnten wartende Fälle nicht nachgeprüft werden – sie sind unbewertet im Export enthalten.'
  }

  onStatus?.('Erstelle Datei …')
  const files: ZipFile[] = []
  const enc = new TextEncoder()
  let imageCount = 0
  const addImage = (kind: string, index: number, png: string | undefined): string | undefined => {
    if (!png) return undefined
    const path = `images/${kind}-${String(index + 1).padStart(3, '0')}.png`
    files.push({ name: path, data: b64ToBytes(png) })
    imageCount++
    return path
  }

  // 2) Daten einsammeln (Base64-Bilder werden durch Dateipfade ersetzt)
  const samplesRaw = loadSamples()
  const samples = samplesRaw.map((s, i) => {
    const { imagePng, ...rest } = s
    return { ...rest, image: addImage('inputtools', i, imagePng) }
  })
  const disputesRaw = loadDisputes()
  const disputes = disputesRaw.map((d, i) => {
    const { imagePng, ...rest } = d
    return { ...rest, image: addImage('gemini-dispute', i, imagePng) }
  })
  const pendingRaw = loadPending()
  const pending = pendingRaw.map((p, i) => ({ id: p.id, ...p.base, image: addImage('pending', i, p.png) }))

  const payload = {
    app: 'hangul-studio',
    kind: 'dev-export',
    version: 2,
    exportedAt: new Date().toISOString(),
    guide: {
      inputToolsSamples:
        'Rückmeldungen zur Input-Tools-Erkennung. candidates = Lesarten von Input Tools (beste zuerst), appVerdict = daraus gefolgertes Urteil, recognitionCorrect/actuallyCorrect = Bewertung, labelSource = woher (manual = von dir, self-check = Selbst-Check, gemini-auto = automatische Nachprüfung durch Gemini, gemini-compare = Uneinigkeit beim parallelen Lauf, Gemini nur als Referenz). strokes = [x, y, t]-Tripel pro Strich.',
      geminiDisputes:
        'Widersprüche gegen Gemini-Urteile: target = gesuchtes Wort, geminiReading = was Gemini gelesen hat, geminiSaidCorrect = sein Urteil, actuallyCorrect = dein Urteil.',
      pendingUnchecked: 'Fälle, die noch auf die Gemini-Nachprüfung warteten (unbewertet).',
      agreement: 'Zähler: wie oft Input Tools und Gemini beim parallelen Lauf dasselbe gelesen haben.',
    },
    appSettings: {
      geminiModel: settings.geminiModel,
      geminiTimeoutSec: settings.geminiTimeoutSec,
      writingTips: settings.writingTips,
      tipThreshold: settings.tipThreshold,
      checkOrder: settings.checkOrder,
      autoLabel: settings.autoLabel,
      canvasBackground: settings.canvasBackground,
    },
    currentGeminiPrompt: {
      withoutTips: buildHandwritingPrompt('<ZIELWORT>', false, settings.tipThreshold),
      withTips: buildHandwritingPrompt('<ZIELWORT>', true, settings.tipThreshold),
    },
    summary: {
      inputTools: summarize(samplesRaw),
      geminiDisputes: {
        total: disputes.length,
        geminiSaidWrongButActuallyCorrect: disputes.filter((d) => !d.geminiSaidCorrect && d.actuallyCorrect).length,
        geminiSaidCorrectButActuallyWrong: disputes.filter((d) => d.geminiSaidCorrect && !d.actuallyCorrect).length,
      },
      pendingUnchecked: pending.length,
      agreement: loadAgreement(),
    },
    inputToolsSamples: samples,
    geminiDisputes: disputes,
    pendingUnchecked: pending,
  }

  files.unshift({ name: 'data.json', data: enc.encode(JSON.stringify(payload, null, 2)) }, { name: 'README.txt', data: enc.encode(README) })

  // 3) Download
  const url = URL.createObjectURL(makeZip(files))
  const a = document.createElement('a')
  a.href = url
  a.download = `hangul-studio-dev-export-${new Date().toISOString().slice(0, 10)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)

  return { samples: samples.length, disputes: disputes.length, pending: pending.length, images: imageCount, processedNow, note }
}
