/**
 * Sammelt Rückmeldungen zur Input-Tools-Erkennung (lokal im Browser), damit sie später
 * als JSON-Datei exportiert und zur Verbesserung der Erkennung ausgewertet werden können.
 */
const KEY = 'hangul-studio:inputtools-log'
const MAX_ENTRIES = 300

export interface InputToolsSample {
  id: string
  ts: number
  /** Wie kam der Eintrag zustande: direkte Prüfung oder als Ausweichmethode nach Gemini-Ausfall */
  source: 'inputtools' | 'inputtools-fallback' | 'inputtools-parallel'
  target: string
  /** Die ersten Lesarten von Input Tools */
  candidates: string[]
  /** Was die App aus der besten Lesart gefolgert hat */
  appVerdict: boolean
  /** Hat Input Tools nach deiner Rückmeldung richtig erkannt? */
  recognitionCorrect: boolean
  /** Tatsächliche Richtigkeit der Schrift laut deiner Rückmeldung */
  actuallyCorrect: boolean
  canvas: { w: number; h: number }
  /** Striche als [x, y, t]-Tripel (gerundet), t in ms ab Beginn */
  strokes: number[][][]
  /** Woher das Urteil stammt: du selbst (Buttons / Selbst-Check) oder automatische Gemini-Nachprüfung */
  labelSource?: 'manual' | 'self-check' | 'gemini-auto' | 'gemini-compare'
  /** Bei gemini-compare: Gemini hat die Schrift als richtig (true) oder falsch (false) bewertet – Gemini ist hier nur Referenz, nicht unfehlbar */
  geminiVerdict?: boolean
  /** Bei gemini-compare: Bild der Schrift (PNG, Base64, klein) für die Auswertung der Uneinigkeit */
  imagePng?: string
  /** Bei gemini-auto: was Gemini im Hintergrund gelesen hat */
  geminiReading?: string
  geminiModel?: string
  /** Verknüpfung zur Nachprüfungs-Warteschlange */
  pendingId?: string
}

export function loadSamples(): InputToolsSample[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as InputToolsSample[]) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function addSample(s: Omit<InputToolsSample, 'id' | 'ts'>): string {
  const all = loadSamples()
  const id = crypto.randomUUID()
  all.push({ ...s, id, ts: Date.now() })
  try {
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_ENTRIES)))
  } catch {
    // Speicher knapp: Bilder weglassen und noch einmal versuchen
    try {
      localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX_ENTRIES).map((x) => ({ ...x, imagePng: undefined }))))
    } catch {
      /* Speicher voll – Eintrag verwerfen */
    }
  }
  return id
}

// ---------- Übereinstimmung Input Tools ↔ Gemini (bei parallelem Lauf) ----------
const AGREE_KEY = 'hangul-studio:inputtools-agreement'

export interface AgreementCounter {
  agree: number
  disagree: number
}

export function loadAgreement(): AgreementCounter {
  try {
    const j = JSON.parse(localStorage.getItem(AGREE_KEY) || '{}') as Partial<AgreementCounter>
    return { agree: j.agree ?? 0, disagree: j.disagree ?? 0 }
  } catch {
    return { agree: 0, disagree: 0 }
  }
}

/** Zählt nur (ohne Bild/Striche), ob beide Methoden dasselbe gelesen haben */
export function bumpAgreement(agreed: boolean): void {
  const c = loadAgreement()
  if (agreed) c.agree++
  else c.disagree++
  try {
    localStorage.setItem(AGREE_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

export function clearAgreement(): void {
  try {
    localStorage.removeItem(AGREE_KEY)
  } catch {
    /* ignore */
  }
}

/** Bestehenden Eintrag aktualisieren (z. B. wenn du eine automatische Bewertung korrigierst) */
export function updateSample(id: string, patch: Partial<InputToolsSample>): void {
  const all = loadSamples()
  const i = all.findIndex((s) => s.id === id)
  if (i < 0) return
  all[i] = { ...all[i], ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function clearSamples(): void {
  clearAgreement()
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function summarize(samples: InputToolsSample[]) {
  const good = samples.filter((s) => s.recognitionCorrect).length
  const confusions = new Map<string, number>()
  for (const s of samples) {
    if (!s.recognitionCorrect) {
      const k = `${s.target} → ${s.candidates[0] ?? '?'}`
      confusions.set(k, (confusions.get(k) ?? 0) + 1)
    }
  }
  return {
    total: samples.length,
    recognizedCorrectly: good,
    byLabelSource: {
      manual: samples.filter((s) => s.labelSource === 'manual').length,
      selfCheck: samples.filter((s) => s.labelSource === 'self-check').length,
      geminiAuto: samples.filter((s) => s.labelSource === 'gemini-auto').length,
      geminiCompare: samples.filter((s) => s.labelSource === 'gemini-compare').length,
    },
    agreement: loadAgreement(),
    accuracy: samples.length ? Math.round((good / samples.length) * 100) : null,
    topConfusions: [...confusions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pair, count]) => ({ pair, count })),
  }
}

export function exportSamples(): void {
  const samples = loadSamples()
  const payload = {
    app: 'hangul-studio',
    kind: 'inputtools-feedback',
    version: 1,
    exportedAt: new Date().toISOString(),
    summary: summarize(samples),
    samples,
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `input-tools-feedback-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
