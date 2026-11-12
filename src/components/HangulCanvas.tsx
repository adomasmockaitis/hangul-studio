import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  AlertTriangle, ArrowRight, Check, Eraser, Eye, EyeOff, Keyboard, ListOrdered, Flag, Loader2, PenLine, ThumbsDown, ThumbsUp, Undo2, X,
} from 'lucide-react'
import { dynamicTimeoutMs, readHandwriting } from '../lib/gemini'
import { recognizeInk } from '../lib/inputTools'
import { playSound } from '../lib/sounds'
import { addDispute } from '../lib/geminiDisputes'
import { addSample, bumpAgreement, updateSample } from '../lib/inputToolsLog'
import { BATCH_SIZE, enqueuePending, processPending, removePending, updateByPendingId, type SampleBase } from '../lib/inputToolsQueue'
import { normalizeKorean } from '../lib/hangul'
import { useApp } from '../store'
import { StrokeOrder } from './StrokeOrder'

interface P {
  x: number
  y: number
  w: number
  t: number
}
type DrawStroke = P[]

type Phase = 'idle' | 'checking' | 'reveal' | 'result'
interface Result {
  correct: boolean
  read?: string
  error?: string
  feedback?: string
  via?: string
  meta?: string
}

export interface CanvasInfo {
  /** data:-URL des gezeichneten Bildes (schwarz auf weiß) */
  image?: string
  /** was die KI gelesen bzw. was getippt wurde */
  read?: string
}

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

function paintStroke(ctx: CanvasRenderingContext2D, s: DrawStroke, color: string, scale: number, from = 0, minW = 0) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.length === 1) {
    ctx.beginPath()
    ctx.arc(s[0].x * scale, s[0].y * scale, Math.max(s[0].w * scale, minW) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  for (let i = Math.max(1, from); i < s.length; i++) {
    const p0 = s[i - 1]
    const p1 = s[i]
    const m0 = i === 1 ? p0 : { x: (s[i - 2].x + p0.x) / 2, y: (s[i - 2].y + p0.y) / 2 }
    const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
    ctx.lineWidth = Math.max(p1.w * scale, minW)
    ctx.beginPath()
    ctx.moveTo(m0.x * scale, m0.y * scale)
    ctx.quadraticCurveTo(p0.x * scale, p0.y * scale, m1.x * scale, m1.y * scale)
    ctx.lineTo(p1.x * scale, p1.y * scale)
    ctx.stroke()
  }
}

interface Props {
  target: string
  onResult: (correct: boolean, info?: CanvasInfo) => void
  /** Wird aufgerufen, wenn du das Ergebnis nachträglich korrigierst (Widerspruch / Erkennung falsch) */
  onRevise?: (correct: boolean) => void
  onNext?: () => void
  nextLabel?: string
  /** Im Quiz soll das Zielwort nicht vorab sichtbar sein */
  testMode?: boolean
}

export function HangulCanvas({ target, onResult, onRevise, onNext, nextLabel = 'Weiter', testMode = false }: Props) {
  const { settings } = useApp()
  const dark = useIsDark()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<DrawStroke[]>([])
  const currentRef = useRef<DrawStroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const recordedRef = useRef(false)
  const imageRef = useRef<string | undefined>(undefined)
  const itRef = useRef<SampleBase | null>(null)
  const gemRef = useRef<{ reading: string; saidCorrect: boolean; model?: string; quality?: number; tip?: string } | null>(null)
  const [disputed, setDisputed] = useState(false)
  const cmpRef = useRef<{ id: string; toolsHit: boolean } | null>(null)
  const [itFeedback, setItFeedback] = useState<'good' | 'bad' | null>(null)
  const bgRef = useRef<{ queueId: string } | null>(null)
  const [preview, setPreview] = useState<{ read: string; hit: boolean } | null>(null)
  const [bgNote, setBgNote] = useState('')

  const [size, setSize] = useState({ w: 600, h: 300 })
  const [strokeCount, setStrokeCount] = useState(0)
  const [width, setWidth] = useState(settings.strokeWidth)
  const [template, setTemplate] = useState(settings.showTemplate && !testMode)
  const [showHelp, setShowHelp] = useState(settings.showStrokeOrder && !testMode)
  const [keyboard, setKeyboard] = useState(false)
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<Result | null>(null)
  const [status, setStatus] = useState('')

  const ink = dark ? '#f5f5f7' : '#1c1c1e'
  const chars = Array.from(target).filter((c) => c.trim())
  const firstMethod = settings.checkOrder.find((s) => s.enabled)?.method
  useEffect(() => setTemplate(settings.showTemplate && !testMode), [settings.showTemplate, testMode])
  useEffect(() => setShowHelp(settings.showStrokeOrder && !testMode), [settings.showStrokeOrder, testMode])

  const redraw = useCallback(() => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    for (const s of strokesRef.current) paintStroke(ctx, s, ink, dpr)
  }, [ink])

  // Größe beobachten
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [keyboard])

  useLayoutEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
    redraw()
  }, [size, redraw, keyboard])

  const pos = (e: React.PointerEvent | PointerEvent): P => {
    const r = canvasRef.current!.getBoundingClientRect()
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, w: e.pointerType === 'pen' ? width * (0.5 + pressure) : width }
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase === 'checking' || phase === 'result' || pointerIdRef.current !== null) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    pointerIdRef.current = e.pointerId
    const p = pos(e)
    currentRef.current = [p]
    const ctx = canvasRef.current!.getContext('2d')!
    paintStroke(ctx, currentRef.current, ink, window.devicePixelRatio || 1)
  }

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerIdRef.current || !currentRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const s = currentRef.current
      const before = s.length
      s.push(pos(ev))
      paintStroke(ctx, s, ink, dpr, before)
    }
  }

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerIdRef.current) return
    pointerIdRef.current = null
    if (currentRef.current) {
      strokesRef.current.push(currentRef.current)
      currentRef.current = null
      setStrokeCount(strokesRef.current.length)
    }
  }

  const clear = () => {
    strokesRef.current = []
    setStrokeCount(0)
    redraw()
  }
  const undo = () => {
    strokesRef.current.pop()
    setStrokeCount(strokesRef.current.length)
    redraw()
  }

  /** Enger Ausschnitt um die Striche (max. 512 px), schwarz auf reinweiß – Details wie die Richtung von ㅏ/ㅓ bleiben erkennbar */
  const exportPng = (): string => {
    const pts = strokesRef.current.flat()
    const pad = 14
    const minX = Math.min(...pts.map((p) => p.x)) - pad
    const maxX = Math.max(...pts.map((p) => p.x)) + pad
    const minY = Math.min(...pts.map((p) => p.y)) - pad
    const maxY = Math.max(...pts.map((p) => p.y)) + pad
    const bw = Math.max(maxX - minX, 40)
    const bh = Math.max(maxY - minY, 40)
    const scale = Math.min(2, 512 / Math.max(bw, bh))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bw * scale))
    c.height = Math.max(1, Math.round(bh * scale))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.translate(-minX * scale, -minY * scale)
    for (const s of strokesRef.current) paintStroke(ctx, s, '#000000', scale, 0, 3)
    return c.toDataURL('image/png').split(',')[1]
  }
  const record = (correct: boolean, read?: string) => {
    if (recordedRef.current) return
    recordedRef.current = true
    playSound(correct ? 'success' : 'error')
    onResult(correct, { image: imageRef.current ? 'data:image/png;base64,' + imageRef.current : undefined, read })
  }

  const conclude = (r: Result) => {
    setResult(r)
    setPhase('result')
    record(r.correct, r.read)
  }

  /** Rückmeldung zur Input-Tools-Erkennung speichern */
  const rate = (good: boolean) => {
    const s = itRef.current
    if (!s) return
    const actually = good ? s.appVerdict : !s.appVerdict
    const entry = { ...s, recognitionCorrect: good, actuallyCorrect: actually, labelSource: 'manual' as const }
    const q = bgRef.current?.queueId
    // Dein Urteil ersetzt die automatische Nachprüfung (aus der Warteschlange oder bereits gespeichert)
    if (q) {
      removePending(q)
      if (!updateByPendingId(q, { recognitionCorrect: good, actuallyCorrect: actually, labelSource: 'manual' })) addSample(entry)
    } else addSample(entry)
    itRef.current = null
    setItFeedback(good ? 'good' : 'bad')
    if (actually !== s.appVerdict) onRevise?.(actually)
    setResult((r) => (r ? { ...r, correct: actually, read: actually ? target : r.read, feedback: undefined } : r))
  }

  /** Selbst-Check nach einem Input-Tools-Vorschlag: dein Urteil liefert zugleich eine Bewertung der Erkennung */
  const finishReveal = (correct: boolean) => {
    const s = itRef.current
    if (s) {
      addSample({ ...s, recognitionCorrect: correct === s.appVerdict, actuallyCorrect: correct, labelSource: 'self-check' })
      itRef.current = null
    }
    conclude({ correct })
  }

  /** Widerspruch gegen ein Gemini-Urteil: wird samt Bild gespeichert, damit der Prompt verbessert werden kann */
  const dispute = () => {
    const g = gemRef.current
    if (!g || disputed) return
    const actually = !g.saidCorrect
    addDispute({
      target,
      geminiReading: g.reading,
      geminiSaidCorrect: g.saidCorrect,
      actuallyCorrect: actually,
      model: g.model,
      quality: g.quality,
      tip: g.tip,
      promptConfig: { writingTips: settings.writingTips, tipThreshold: settings.tipThreshold },
      imagePng: imageRef.current,
    })
    setDisputed(true)
    // Gemini war hier nur Referenz: dein Urteil ersetzt die Vergleichs-Bewertung
    if (cmpRef.current) {
      updateSample(cmpRef.current.id, { labelSource: 'manual', actuallyCorrect: actually, recognitionCorrect: cmpRef.current.toolsHit === actually })
    }
    onRevise?.(actually)
    setResult((r) => (r ? { ...r, correct: actually, read: actually ? target : r.read, feedback: undefined } : r))
  }

  /** Ausweichfall: nicht sofort bei Gemini nachfragen, sondern sammeln und später EINEN gemeinsamen Request senden */
  const queueForReview = (base: SampleBase, png: string) => {
    const { id, count } = enqueuePending(png, base)
    bgRef.current = { queueId: id }
    if (count < BATCH_SIZE) {
      setBgNote(`Für die gesammelte Gemini-Nachprüfung vorgemerkt (${count}/${BATCH_SIZE}).`)
      return
    }
    setBgNote('Gemini prüft die gesammelten Fälle jetzt in einem gemeinsamen Request …')
    processPending(settings.geminiApiKey, settings.geminiModel)
      .then((n) => setBgNote(n ? `${n} gesammelte Fälle von Gemini nachgeprüft und als Trainingsdaten gespeichert.` : ''))
      .catch(() => setBgNote('Sammel-Nachprüfung gerade nicht möglich – die Fälle bleiben vorgemerkt.'))
  }
  const check = async () => {
    if (keyboard) {
      if (!typed.trim()) return
      conclude({ correct: normalizeKorean(typed) === normalizeKorean(target), read: typed.trim() })
      return
    }
    if (strokesRef.current.length === 0) {
      setResult({ correct: false, error: 'Schreibe zuerst etwas ins Feld.' })
      return
    }
    imageRef.current = exportPng()
    setResult(null)
    setStatus('')
    setPreview(null)
    setBgNote('')
    bgRef.current = null
    gemRef.current = null
    cmpRef.current = null
    const steps = settings.checkOrder.filter((s) => s.enabled).map((s) => s.method)
    const errors: string[] = []
    const want = normalizeKorean(target)
    let finished = false

    // Input-Tools-Request (nur einmal pro Prüfung, wird von Vorschau und Ausweichstufe gemeinsam genutzt)
    type ItData = { cands: string[]; ink: { x: number; y: number; t: number }[][] }
    const itHolder: { data: ItData | null } = { data: null }
    let itCache: Promise<ItData> | null = null
    const getIt = () =>
      (itCache ??= (async () => {
        const t0 = Math.min(...strokesRef.current.flat().map((p) => p.t))
        const ink = strokesRef.current.map((s) => s.map((p) => ({ x: p.x, y: p.y, t: p.t - t0 })))
        return { cands: await recognizeInk(ink, size.w, size.h), ink }
      })())

    setPhase('checking')
    for (const method of steps) {
      if (method === 'manual') {
        finished = true
        setPhase('reveal')
        if (errors.length) setResult({ correct: false, error: `Automatische Prüfung übersprungen (${errors.join(' · ')}).` })
        return
      }
      if (method === 'inputtools') {
        setStatus('Input Tools erkennt deine Schrift …')
        try {
          const { cands, ink } = await getIt()
          // streng: nur die beste Lesart zählt (ㅏ/ㅓ-Verwechslungen nicht durchwinken)
          const hit = normalizeKorean(cands[0] ?? '') === want
          itRef.current = {
            source: errors.length ? 'inputtools-fallback' : 'inputtools',
            target,
            candidates: cands.slice(0, 5),
            appVerdict: hit,
            canvas: { w: Math.round(size.w), h: Math.round(size.h) },
            strokes: ink.map((s) => s.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.t)])),
          }
          setItFeedback(null)
          finished = true
          setPreview(null)
          conclude({
            correct: hit,
            read: hit ? target : cands[0] ?? '',
            via: 'Input Tools',
            feedback: errors.length
              ? errors.join(' · ') + '. Deshalb hat Input Tools geprüft. ⚠ Relativ ungenau – bitte prüfe selbst, ob es richtig geschrieben ist.'
              : '⚠ Input Tools ist relativ ungenau (z. B. ㅏ/ㅓ, ㅗ/ㅜ) – prüfe bei Zweifel selbst nach.',
          })
          // Ausweichfall nach Gemini-Problem: Gemini im Hintergrund nochmal fragen und Input Tools bewerten
          if (errors.length && settings.autoLabel && settings.geminiApiKey.trim() && imageRef.current) {
            queueForReview(itRef.current, imageRef.current)
          }
          return
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Input Tools Fehler')
          continue
        }
      }
      if (method === 'gemini') {
        if (!settings.geminiApiKey.trim()) {
          errors.push('Gemini: kein API-Key')
          continue
        }
        // Sofort-Vorschau: Input Tools läuft parallel (kostenlos) und zeigt ein vorläufiges Ergebnis, bis Gemini antwortet
        if (steps.includes('inputtools')) {
          void getIt()
            .then((data) => {
              itHolder.data = data
              if (!finished) setPreview({ read: data.cands[0] ?? '', hit: normalizeKorean(data.cands[0] ?? '') === want })
            })
            .catch(() => undefined)
        }
        try {
          const r = await readHandwriting(settings.geminiApiKey.trim(), settings.geminiModel, imageRef.current!, target, setStatus, dynamicTimeoutMs(settings.geminiTimeoutSec, target, settings.writingTips), settings.writingTips, settings.tipThreshold)
          const ok = normalizeKorean(r.recognizedText) === want
          gemRef.current = { reading: r.recognizedText, saidCorrect: ok, model: r.model, quality: r.quality, tip: r.tip }
          // Vergleich Input Tools ↔ Gemini: kostet keine zusätzliche Anfrage, liefert aber wertvolle Trainingsdaten
          if (steps.includes('inputtools')) {
            const data = itHolder.data ?? (await Promise.race([getIt().catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 600))]))
            if (data) {
              const toolsRead = data.cands[0] ?? ''
              const agreed = normalizeKorean(toolsRead) === normalizeKorean(r.recognizedText)
              bumpAgreement(agreed)
              if (!agreed) {
                const toolsHit = normalizeKorean(toolsRead) === want
                const id = addSample({
                  source: 'inputtools-parallel',
                  target,
                  candidates: data.cands.slice(0, 5),
                  appVerdict: toolsHit,
                  canvas: { w: Math.round(size.w), h: Math.round(size.h) },
                  strokes: data.ink.map((s) => s.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.t)])),
                  recognitionCorrect: false,
                  actuallyCorrect: ok,
                  labelSource: 'gemini-compare',
                  geminiReading: r.recognizedText,
                  geminiModel: r.model,
                  geminiVerdict: ok,
                  imagePng: imageRef.current,
                })
                cmpRef.current = { id, toolsHit }
              }
            }
          }
          setDisputed(false)
          finished = true
          setPreview(null)
          conclude({
            correct: ok,
            read: r.recognizedText,
            via: 'Gemini',
            // Tipp nur, wenn richtig erkannt, die Schrift aber nicht sauber wirkt
            feedback: ok && r.tip ? `✍️ Schönere Schrift: ${r.tip}` : undefined,
            meta: `${r.quality ? `Schrift ${r.quality}/5 · ` : ''}${r.model} · ${((r.ms ?? 0) / 1000).toFixed(1)} s`,
          })
          return
        } catch (err) {
          errors.push(`Gemini: ${err instanceof Error ? err.message : 'Fehler'}`)
          continue
        }
      }
    }
    // Keine automatische Methode hat geklappt (oder keine aktiv): Selbst-Check als Netz
    finished = true
    setPreview(null)
    setPhase('reveal')
    if (errors.length) setResult({ correct: false, error: `Automatische Prüfung nicht möglich – bitte selbst prüfen. (${errors.join(' · ')})` })
  }
  const retry = () => {
    itRef.current = null
    gemRef.current = null
    cmpRef.current = null
    setDisputed(false)
    bgRef.current = null
    setPreview(null)
    setBgNote('')
    setItFeedback(null)
    setPhase('idle')
    setResult(null)
    setTyped('')
    clear()
  }

  // ---------- Hintergrund ----------
  const line = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.09)'
  const bgBase = dark ? '#2c2c2e' : '#ffffff'
  const bgStyle: CSSProperties = { backgroundColor: bgBase }
  if (settings.canvasBackground === 'grid') {
    bgStyle.backgroundImage = `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
    bgStyle.backgroundSize = '28px 28px'
  } else if (settings.canvasBackground === 'lined') {
    bgStyle.backgroundImage = `linear-gradient(${line} 1px, transparent 1px)`
    bgStyle.backgroundSize = '100% 52px'
    bgStyle.backgroundPosition = '0 51px'
  }

  const cell = Math.max(60, Math.min(size.h, (size.w - 8) / Math.max(chars.length, 1)))
  const hangulRow = settings.canvasBackground === 'hangul'
  const tplFont = hangulRow ? cell * 0.7 : Math.min(size.h * 0.62, (size.w * 0.9) / Math.max(chars.length, 1))
  const guide = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'
  const tplColor = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.13)'

  const statusColor = result?.error ? 'amber' : result?.correct ? 'green' : 'red'

  return (
    <div className="space-y-3">
      {/* Kopfleiste: Hilfen & Eingabeart */}
      <div className="flex flex-wrap items-center gap-2">
        {!testMode && (
          <button className={showHelp ? 'btn-primary' : 'btn-soft'} onClick={() => setShowHelp((s) => !s)} title="Strichreihenfolge-Hilfe">
            <ListOrdered size={16} /> <span className="hidden sm:inline">Strichreihenfolge</span>
          </button>
        )}
        <button
          className="btn-soft ml-auto"
          onClick={() => {
            setKeyboard((k) => !k)
            retry()
          }}
          title="Zwischen Zeichnen und Tastatur wechseln"
        >
          {keyboard ? <PenLine size={16} /> : <Keyboard size={16} />}
          <span className="text-xs sm:text-sm">{keyboard ? 'Zeichnen' : 'Tastatur statt Zeichnen'}</span>
        </button>
      </div>
      {showHelp && <StrokeOrder text={target} mode={settings.strokeOrderStyle} />}

      {/* Musterlösung beim Selbst-Check */}
      {phase === 'reveal' && (
        <div className="fade-up rounded-2xl border border-[#007aff]/30 bg-[#007aff]/10 p-4 text-center">
          <p className="label mb-1">Musterlösung</p>
          <p className="text-4xl font-semibold">{target}</p>
        </div>
      )}

      {/* Zeichen-Werkzeuge direkt am Zeichenfeld */}
      {!keyboard && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-soft" onClick={clear} disabled={!strokeCount || phase === 'result'} title="Löschen">
            <Eraser size={16} /> <span className="hidden sm:inline">Löschen</span>
          </button>
          <button className="btn-soft" onClick={undo} disabled={!strokeCount || phase === 'result'} title="Rückgängig">
            <Undo2 size={16} /> <span className="hidden sm:inline">Rückgängig</span>
          </button>
          <label className="flex items-center gap-2 rounded-xl bg-black/[0.05] px-3 py-2 text-sm dark:bg-white/10" title="Strichdicke">
            <span className="text-black/50 dark:text-white/50">Strich</span>
            <input type="range" min={2} max={16} value={width} onChange={(e) => setWidth(+e.target.value)} className="w-20 accent-[#007aff]" />
          </label>
          {!testMode && (
            <button className={template ? 'btn-primary' : 'btn-soft'} onClick={() => setTemplate((t) => !t)} title="Blasse Vorlage">
              {template ? <Eye size={16} /> : <EyeOff size={16} />} <span className="hidden sm:inline">Vorlage</span>
            </button>
          )}
        </div>
      )}
      {/* Zeichenfläche / Tastatur */}
      {keyboard ? (
        <input
          autoFocus
          lang="ko"
          className="input !py-4 text-center !text-3xl"
          placeholder="한글 eingeben…"
          value={typed}
          disabled={phase === 'result'}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && phase !== 'result') void check()
          }}
        />
      ) : (
        <div
          ref={wrapRef}
          className="relative h-[260px] overflow-hidden rounded-2xl border border-black/10 shadow-inner sm:h-[320px] dark:border-white/10"
          style={bgStyle}
        >
          {hangulRow && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {chars.map((ch, i) => (
                <div
                  key={i}
                  className="relative grid place-items-center"
                  style={{ width: cell, height: cell, border: `1px solid ${guide}` }}
                >
                  <div className="absolute inset-y-0 left-1/2 border-l border-dashed" style={{ borderColor: guide }} />
                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed" style={{ borderColor: guide }} />
                  {template && (
                    <span className="relative leading-none" style={{ fontSize: tplFont, color: tplColor }}>{ch}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {!hangulRow && template && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center leading-none" style={{ fontSize: tplFont, color: tplColor }}>
              {target}
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-crosshair"
            style={{ touchAction: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onContextMenu={(e) => e.preventDefault()}
          />
          {phase === 'checking' && (
            <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-sm dark:bg-black/50">
              <div className="flex items-center gap-2 text-sm font-medium"><Loader2 className="animate-spin" size={18} /> {status || 'KI liest deine Schrift…'}</div>
            </div>
          )}
        </div>
      )}

      {/* Vorläufiges Ergebnis (Input Tools), solange Gemini noch prüft */}
      {phase === 'checking' && preview && (
        <div className="fade-up rounded-2xl border border-[#007aff]/30 bg-[#007aff]/10 p-3 text-sm">
          <p>
            <span className="font-semibold">Vorläufig (Input Tools):</span> „<span className="text-lg font-semibold">{preview.read || '?'}</span>“ –{' '}
            {preview.hit ? '✓ passt zum Zielwort' : '✗ passt nicht zum Zielwort'}
          </p>
          <p className="text-xs text-black/50 dark:text-white/50">Gemini prüft noch – das endgültige Ergebnis ersetzt diese Schätzung.</p>
        </div>
      )}

      {/* Feedback */}
      {result && (
        <div
          className={`fade-up flex items-start gap-3 rounded-2xl border p-3.5 ${
            statusColor === 'green'
              ? 'border-[#34c759]/40 bg-[#34c759]/15'
              : statusColor === 'amber'
                ? 'border-[#ff9500]/40 bg-[#ff9500]/15'
                : 'border-[#ff3b30]/40 bg-[#ff3b30]/15'
          }`}
        >
          {statusColor === 'green' ? <Check className="mt-0.5 text-[#34c759]" /> : statusColor === 'amber' ? <AlertTriangle className="mt-0.5 text-[#ff9500]" /> : <X className="mt-0.5 text-[#ff3b30]" />}
          <div className="min-w-0 flex-1 text-sm">
            {result.error ? (
              <>
                <p className="font-medium">{result.error}</p>
                {result.error.startsWith('KI') && (
                  <button className="btn-soft mt-2" onClick={() => { setResult(null); setPhase('reveal') }}>Stattdessen selbst prüfen</button>
                )}
              </>
            ) : result.correct ? (
              <>
                <p className="font-semibold">Richtig! {result.read ? <span className="ml-1 text-lg">{result.read}</span> : null}</p>
                {result.feedback && <p className="text-black/60 dark:text-white/60">{result.feedback}</p>}
                {result.meta && <p className="text-xs text-black/40 dark:text-white/40">{result.meta}</p>}
              </>
            ) : (
              <>
                <p className="font-semibold">Leider falsch.</p>
                <p>
                  {result.via && !keyboard ? result.via + ' las' : 'Du hast eingegeben'}:{' '}
                  <span className="text-lg font-semibold">{result.read || '(nichts erkannt)'}</span>
                </p>
                <p>Gesucht: <span className="text-lg font-semibold">{target}</span></p>
                {result.feedback && <p className="text-black/60 dark:text-white/60">{result.feedback}</p>}
                {result.meta && <p className="text-xs text-black/40 dark:text-white/40">{result.meta}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {bgNote && <p className="text-xs text-black/50 dark:text-white/50">{bgNote}</p>}

      {/* Nebenaktionen (Feedback zur Erkennung, Widerspruch) */}
      {phase === 'result' && result?.via === 'Input Tools' && (
        <div className="flex w-full flex-wrap items-center gap-2 text-sm">
          <span className="text-black/55 dark:text-white/55">Hat Input Tools richtig erkannt?</span>
          {itFeedback ? (
            <span className="font-medium text-[#34c759]">Danke – gespeichert ✓</span>
          ) : (
            <>
              <button className="btn-soft" onClick={() => rate(true)}><ThumbsUp size={15} /> Richtig erkannt</button>
              <button className="btn-soft" onClick={() => rate(false)}><ThumbsDown size={15} /> Nicht richtig erkannt</button>
            </>
          )}
        </div>
      )}
      {phase === 'result' && result?.via === 'Gemini' && (
        <div className="flex w-full flex-wrap items-center gap-2 text-xs text-black/45 dark:text-white/45">
          <span>⚠ Gemini kann sich irren.</span>
          {disputed ? (
            <span className="font-medium text-[#34c759]">Widerspruch gespeichert ✓</span>
          ) : (
            <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={dispute}><Flag size={13} /> Widerspruch</button>
          )}
        </div>
      )}

      {/* Hauptaktionen: schweben am unteren Rand, damit man nicht scrollen muss (auf dem Handy über der Tab-Leiste) */}
      <div className="sticky bottom-[5.25rem] z-20 md:bottom-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/[0.08] bg-white/80 p-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-[#2c2c2e]/85">
          {phase === 'reveal' ? (
            <>
              <button className="btn-green flex-1 !py-3" onClick={() => finishReveal(true)}><Check size={16} /> Richtig gewusst</button>
              <button className="btn-red flex-1 !py-3" onClick={() => finishReveal(false)}><X size={16} /> Noch unsicher</button>
            </>
          ) : phase === 'result' ? (
            <>
              {!result?.correct && <button className="btn-soft !py-3" onClick={retry}>Nochmal versuchen</button>}
              {onNext && <button className="btn-primary ml-auto !py-3" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>}
            </>
          ) : (
            <>
              <button className="btn-primary flex-1 !py-3 sm:flex-none" onClick={() => void check()} disabled={phase === 'checking' || (keyboard && !typed.trim())}>
                {phase === 'checking' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {phase === 'checking' ? 'Prüfe... (wechsle bei Überlastung automatisch Server)' : 'Prüfen'}
              </button>
              {!keyboard && phase === 'idle' && (
                <span className="px-1 text-xs text-black/45 dark:text-white/45">
                  {firstMethod === 'inputtools' ? 'Prüfung: Input Tools' : firstMethod === 'gemini' ? 'Prüfung: Gemini' : 'Selbst-Check'}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}