/**
 * Ganze Sätze von Hand schreiben (Partikel-Trainer). Drei Arten, wählbar in den Einstellungen:
 *  - Schreibband: ein langes Feld, das beim Schreiben nach rechts mitwandert; am Ende wird die ganze Zeile gelesen
 *  - Wort für Wort: ein Wort ins Feld, Vorschläge antippen, das Wort rutscht in die Satzzeile
 *  - Silbe für Silbe: zwei Kästchen – wer im anderen Kästchen weiterschreibt, übernimmt die fertige Silbe
 * Die Tastatur bleibt immer als Ausweich.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Delete, Eraser, Keyboard, Loader2, PenLine, Space, Undo2 } from 'lucide-react'
import { useApp } from '../store'
import { bbox, readLine, readPiece, strokesToPng, type Pt, type Stroke } from '../lib/ink'
import { useLandscapePhone } from '../lib/useLandscape'
import type { SentenceInput } from '../types'

export interface SentenceResult {
  text: string
  via: 'gemini' | 'inputtools' | 'keyboard' | 'none'
  /** Bild der Handschrift (Schreibband), zum Vergleichen */
  image?: string
}

// ---------- Zeichenfläche ----------

interface PadHandle {
  strokes(): Stroke[]
  set(strokes: Stroke[]): void
  clear(): void
  undo(): void
}

interface PadProps {
  width: number
  height: number
  lineWidth: number
  /** Hilfslinien (z. B. Kästchen) */
  guides?: ReactNode
  onStrokeStart?: (p: Pt) => void
  onStrokeEnd?: (strokes: Stroke[]) => void
  className?: string
}

const InkPad = forwardRef<PadHandle, PadProps>(function InkPad({ width, height, lineWidth, guides, onStrokeStart, onStrokeEnd, className = '' }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const pointer = useRef<number | null>(null)

  const color = () => (canvas.current ? getComputedStyle(canvas.current).color : '#000')
  const drawSegment = (ctx: CanvasRenderingContext2D, s: Stroke, from: number) => {
    const dpr = window.devicePixelRatio || 1
    ctx.strokeStyle = color()
    ctx.fillStyle = color()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = lineWidth * dpr
    if (s.length === 1) {
      ctx.beginPath()
      ctx.arc(s[0].x * dpr, s[0].y * dpr, (lineWidth * dpr) / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.moveTo(s[Math.max(0, from - 1)].x * dpr, s[Math.max(0, from - 1)].y * dpr)
    for (let i = Math.max(1, from); i < s.length; i++) ctx.lineTo(s[i].x * dpr, s[i].y * dpr)
    ctx.stroke()
  }
  const redraw = useCallback(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    for (const s of strokes.current) drawSegment(ctx, s, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineWidth])

  useLayoutEffect(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    redraw()
  }, [width, height, redraw])

  // iOS: Berühren darf nicht markieren oder scrollen
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const stop = (e: TouchEvent) => e.preventDefault()
    c.addEventListener('touchstart', stop, { passive: false })
    c.addEventListener('touchmove', stop, { passive: false })
    return () => {
      c.removeEventListener('touchstart', stop)
      c.removeEventListener('touchmove', stop)
      document.documentElement.classList.remove('no-select')
    }
  }, [])

  useImperativeHandle(ref, () => ({
    strokes: () => strokes.current,
    set: (s) => {
      strokes.current = s
      redraw()
    },
    clear: () => {
      strokes.current = []
      redraw()
    },
    undo: () => {
      strokes.current = strokes.current.slice(0, -1)
      redraw()
    },
  }), [redraw])

  const pos = (e: PointerEvent | React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }
  }

  return (
    <div className={`no-select relative overflow-hidden rounded-2xl border border-separator bg-fill-4 ${className}`} style={{ width, height }}>
      {guides}
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full cursor-crosshair text-label"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (pointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return
          e.preventDefault()
          canvas.current!.setPointerCapture(e.pointerId)
          pointer.current = e.pointerId
          document.documentElement.classList.add('no-select')
          const p = pos(e)
          onStrokeStart?.(p)
          current.current = [p]
          drawSegment(canvas.current!.getContext('2d')!, current.current, 0)
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== pointer.current || !current.current) return
          const ctx = canvas.current!.getContext('2d')!
          const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
          for (const ev of evs.length ? evs : [e.nativeEvent]) {
            const before = current.current.length
            current.current.push(pos(ev))
            drawSegment(ctx, current.current, before)
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== pointer.current) return
          pointer.current = null
          document.documentElement.classList.remove('no-select')
          if (current.current) {
            strokes.current = [...strokes.current, current.current]
            current.current = null
            onStrokeEnd?.(strokes.current)
          }
        }}
        onPointerCancel={() => {
          pointer.current = null
          current.current = null
          document.documentElement.classList.remove('no-select')
          redraw()
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
})

/** Breite des umgebenden Elements beobachten */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(320)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// ---------- Rahmen ----------

export function SentenceWriter({ expected, onSubmit, submitLabel, slots }: {
  /** Mustersatz – nur als Lesehilfe für Gemini, wird nicht angezeigt */
  expected: string
  onSubmit: (r: SentenceResult) => void
  submitLabel: string
  /** Wort für Wort: Zahl der Wort-Plätze vorgeben (leichtere Stufen) */
  slots?: number
}) {
  const { settings } = useApp()
  const [mode, setMode] = useState<SentenceInput>(settings.sentenceInput)
  const [keyboard, setKeyboard] = useState(false)
  const [typed, setTyped] = useState('')
  const opts = { apiKey: settings.geminiApiKey, model: settings.geminiModel, lineWidth: settings.strokeWidth }

  if (keyboard) {
    return (
      <div className="space-y-3">
        <textarea
          autoFocus
          lang="ko"
          rows={2}
          className="input text-center !text-xl"
          placeholder="한국어로 …"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit({ text: typed.trim(), via: 'keyboard' }) } }}
          aria-label="Koreanischer Satz"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button className="btn-soft" onClick={() => setKeyboard(false)}><PenLine size={16} /> Von Hand schreiben</button>
          <button className="btn-primary" onClick={() => onSubmit({ text: typed.trim(), via: 'keyboard' })} disabled={!typed.trim()}>{submitLabel} <ArrowRight size={16} /></button>
        </div>
      </div>
    )
  }

  const toKeyboard = (current: string) => {
    setTyped(current)
    setKeyboard(true)
  }
  const common = { opts, expected, onSubmit, submitLabel, toKeyboard }
  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full bg-fill-3 p-0.5 text-xs font-medium" role="radiogroup" aria-label="Schreibart">
          {([['band', 'Schreibband'], ['word', 'Wort für Wort'], ['syllable', 'Silbe für Silbe']] as const).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={mode === v} className={`rounded-full px-3 py-1.5 transition ${mode === v ? 'bg-surface text-label shadow-sm' : 'text-label-2'}`} onClick={() => setMode(v)}>{l}</button>
          ))}
        </div>
      </div>
      {mode === 'band' && <BandWriter {...common} />}
      {mode === 'word' && <WordWriter {...common} slots={slots} />}
      {mode === 'syllable' && <SyllableWriter {...common} />}
    </div>
  )
}

interface WriterProps {
  opts: { apiKey: string; model: string; lineWidth: number }
  expected: string
  onSubmit: (r: SentenceResult) => void
  submitLabel: string
  toKeyboard: (current: string) => void
}

/** Zeile mit dem bisher Geschriebenen */
function Line({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <div className={`flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl bg-fill-4 px-3 py-2 text-xl ${muted ? 'text-label-3' : ''}`} lang="ko" aria-live="polite">
      {children}
    </div>
  )
}

function Tools({ children }: { children: ReactNode }) {
  return <div className="landscape-compact flex flex-wrap items-center gap-2">{children}</div>
}

// ---------- Schreibband ----------

function BandWriter({ opts, expected, onSubmit, submitLabel, toKeyboard }: WriterProps) {
  const landscape = useLandscapePhone()
  const [wrapRef, viewW] = useWidth<HTMLDivElement>()
  const pad = useRef<PadHandle>(null)
  const [width, setWidth] = useState(0)
  const [preview, setPreview] = useState('')
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const height = landscape ? Math.max(150, window.innerHeight - 190) : 190

  useEffect(() => setWidth((w) => Math.max(w, viewW * 1.6)), [viewW])

  const after = (strokes: Stroke[]) => {
    setCount(strokes.length)
    const b = bbox(strokes)
    const el = wrapRef.current
    if (b && el) {
      // Feld wächst mit und wandert mit: rechts bleibt immer Platz zum Weiterschreiben
      if (b.maxX > width - viewW * 0.5) setWidth(b.maxX + viewW)
      if (b.maxX > el.scrollLeft + viewW * 0.65) el.scrollTo({ left: b.maxX - viewW * 0.35, behavior: 'smooth' })
    }
    // Vorschau (Input Tools, kostenlos) nach kurzer Pause
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await readLine(strokes, { ...opts, apiKey: '', expected }).catch(() => null)
      setPreview(r?.text ?? '')
    }, 700)
  }
  const scroll = (dir: number) => wrapRef.current?.scrollBy({ left: dir * viewW * 0.6, behavior: 'smooth' })
  const finish = async () => {
    const strokes = pad.current?.strokes() ?? []
    clearTimeout(timer.current)
    setBusy(true)
    const r = await readLine(strokes, { ...opts, expected })
    setBusy(false)
    onSubmit({ text: r.text, via: r.via, image: strokes.length ? 'data:image/png;base64,' + strokesToPng(strokes, opts.lineWidth) : undefined })
  }

  return (
    <div className="space-y-2">
      <Line muted={!preview}>{preview || <span className="text-base">Schreib den Satz von links nach rechts – das Feld wandert mit.</span>}</Line>
      <div ref={wrapRef} className="overflow-x-auto overflow-y-hidden rounded-2xl [scrollbar-width:thin]">
        {width > 0 && (
          <InkPad
            ref={pad}
            width={width}
            height={height}
            lineWidth={opts.lineWidth}
            onStrokeEnd={after}
            guides={<div aria-hidden className="pointer-events-none absolute inset-x-0 top-[62%] border-t border-dashed border-separator" />}
          />
        )}
      </div>
      <Tools>
        <button className="btn-soft" onClick={() => scroll(-1)} aria-label="Nach links"><ChevronLeft size={16} /></button>
        <button className="btn-soft" onClick={() => scroll(1)} aria-label="Nach rechts"><ChevronRight size={16} /></button>
        <button className="btn-soft" onClick={() => { pad.current?.undo(); after(pad.current?.strokes() ?? []) }} disabled={!count} aria-label="Letzten Strich rückgängig"><Undo2 size={16} /></button>
        <button className="btn-soft" onClick={() => { pad.current?.clear(); setPreview(''); setCount(0); wrapRef.current?.scrollTo({ left: 0 }) }} disabled={!count} aria-label="Alles löschen"><Eraser size={16} /></button>
        <button className="btn-soft" onClick={() => toKeyboard(preview)} aria-label="Tastatur statt Handschrift"><Keyboard size={16} /></button>
        <button className="btn-primary ml-auto" onClick={() => void finish()} disabled={!count || busy}>
          {busy ? <><Loader2 size={16} className="animate-spin" /> {opts.apiKey.trim() ? 'Gemini liest …' : 'Wird gelesen …'}</> : <>{submitLabel} <ArrowRight size={16} /></>}
        </button>
      </Tools>
    </div>
  )
}

// ---------- Wort für Wort ----------

function WordWriter({ opts, onSubmit, submitLabel, toKeyboard, slots }: WriterProps & { slots?: number }) {
  const landscape = useLandscapePhone()
  const [wrapRef, viewW] = useWidth<HTMLDivElement>()
  const pad = useRef<PadHandle>(null)
  const [words, setWords] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [cands, setCands] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [count, setCount] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const height = landscape ? Math.max(150, window.innerHeight - 200) : 220

  const read = async (strokes: Stroke[]) => {
    if (!strokes.length) return []
    setReading(true)
    const c = await readPiece(strokes, opts)
    setReading(false)
    setCands(c.slice(0, 3))
    return c
  }
  const after = (strokes: Stroke[]) => {
    setCount(strokes.length)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void read(strokes), 600)
  }
  const commit = (word: string) => {
    if (!word) return
    const next = [...words]
    next[active] = word
    setWords(next)
    // weiter zum nächsten freien Platz (beim Korrigieren eines Worts mitten im Satz: ans Ende)
    const free = next.findIndex((w) => !w)
    setActive(free >= 0 ? free : next.length)
    setCands([])
    setCount(0)
    pad.current?.clear()
  }
  const commitNow = async () => {
    clearTimeout(timer.current)
    const c = cands.length ? cands : await read(pad.current?.strokes() ?? [])
    if (c[0]) commit(c[0])
  }
  const text = () => words.filter(Boolean).join(' ')
  const finish = async () => {
    let ws = words
    if (count) {
      clearTimeout(timer.current)
      const c = cands.length ? cands : await read(pad.current?.strokes() ?? [])
      if (c[0]) {
        ws = [...words]
        ws[active] = c[0]
      }
    }
    const t = ws.filter(Boolean).join(' ')
    onSubmit({ text: t, via: t ? 'inputtools' : 'none' })
  }
  const total = Math.max(slots ?? 0, words.length + 1)

  return (
    <div className="space-y-2">
      <Line>
        {Array.from({ length: total }, (_, i) => {
          const w = words[i]
          const isActive = i === active
          if (!w && !slots && !isActive) return null
          return (
            <button
              key={i}
              className={`min-w-14 rounded-xl px-2.5 py-1 text-xl transition ${isActive ? 'bg-blue/15 text-blue ring-2 ring-blue/40' : w ? 'bg-surface' : 'border border-dashed border-separator text-label-3'}`}
              onClick={() => { setActive(i); setCands([]); pad.current?.clear(); setCount(0) }}
              aria-label={w ? `Wort ${i + 1}: ${w} – neu schreiben` : `Wort ${i + 1}`}
            >
              {w || (isActive ? '✎' : '…')}
            </button>
          )
        })}
      </Line>
      <div className="flex min-h-10 flex-wrap items-center justify-center gap-2" aria-live="polite">
        {reading ? <Loader2 size={16} className="animate-spin text-label-3" /> : cands.length ? (
          cands.map((c, k) => (
            <button key={c} lang="ko" className={`rounded-full px-4 py-1.5 text-lg ${k === 0 ? 'bg-blue text-white' : 'bg-fill-3'}`} onClick={() => commit(c)}>{c}</button>
          ))
        ) : <span className="text-sm text-label-3">{count ? 'Kurz warten – dann Vorschlag antippen' : `Schreib Wort ${active + 1} ins Feld`}</span>}
      </div>
      <div ref={wrapRef}>
        <InkPad ref={pad} width={viewW} height={height} lineWidth={opts.lineWidth} onStrokeEnd={after} />
      </div>
      <Tools>
        <button className="btn-soft" onClick={() => { pad.current?.undo(); after(pad.current?.strokes() ?? []) }} disabled={!count} aria-label="Letzten Strich rückgängig"><Undo2 size={16} /></button>
        <button className="btn-soft" onClick={() => { pad.current?.clear(); setCands([]); setCount(0) }} disabled={!count} aria-label="Feld leeren"><Eraser size={16} /></button>
        <button className="btn-soft" onClick={() => { setWords((ws) => ws.filter((_, i) => i !== active)); setActive((a) => Math.max(0, Math.min(a, words.length - 1))) }} disabled={!words[active] && !words.length} aria-label="Wort löschen"><Delete size={16} /></button>
        <button className="btn-soft" onClick={() => toKeyboard(text())} aria-label="Tastatur statt Handschrift"><Keyboard size={16} /></button>
        <button className="btn-soft" onClick={() => void commitNow()} disabled={!count}>Nächstes Wort</button>
        <button className="btn-primary ml-auto" onClick={() => void finish()} disabled={!words.length && !count}>{submitLabel} <ArrowRight size={16} /></button>
      </Tools>
    </div>
  )
}

// ---------- Silbe für Silbe ----------

function SyllableWriter({ opts, onSubmit, submitLabel, toKeyboard }: WriterProps) {
  const landscape = useLandscapePhone()
  const [wrapRef, viewW] = useWidth<HTMLDivElement>()
  const pad = useRef<PadHandle>(null)
  const boxes = landscape ? 3 : 2
  const height = landscape ? Math.max(150, Math.min(window.innerHeight - 200, viewW / boxes)) : Math.min(220, viewW / boxes)
  const boxW = viewW / boxes
  /** Geschriebener Text als Teile; text null = wird noch gelesen (Reihenfolge bleibt erhalten) */
  const [parts, setParts] = useState<{ id: number; text: string | null }[]>([])
  const seq = useRef(0)
  const [count, setCount] = useState(0)
  /** Kästchen, in das zuletzt geschrieben wurde */
  const lastBox = useRef<number | null>(null)

  const boxOf = (x: number) => Math.max(0, Math.min(boxes - 1, Math.floor(x / boxW)))
  /** Fertige Silbe aus einem Kästchen übernehmen und das Kästchen leeren */
  const commitBox = (box: number) => {
    const all = pad.current?.strokes() ?? []
    const mine = all.filter((s) => boxOf(s[0].x) === box)
    if (!mine.length) return
    pad.current?.set(all.filter((s) => boxOf(s[0].x) !== box))
    setCount((pad.current?.strokes() ?? []).length)
    const id = ++seq.current
    setParts((p) => [...p, { id, text: null }])
    void readPiece(mine, opts).then((c) => {
      const syl = c.find((x) => [...x].length === 1) ?? c[0]?.slice(0, 1) ?? '?'
      setParts((p) => p.map((x) => (x.id === id ? { ...x, text: syl } : x)))
    })
  }
  const onStart = (p: Pt) => {
    const b = boxOf(p.x)
    // In ein anderes Kästchen weitergeschrieben: die Silbe im vorigen ist fertig
    if (lastBox.current !== null && lastBox.current !== b) commitBox(lastBox.current)
    lastBox.current = b
  }
  const commitAll = () => {
    if (lastBox.current !== null) commitBox(lastBox.current)
    lastBox.current = null
  }
  const text = (p = parts) => p.map((x) => x.text ?? '').join('')
  const pendingRead = parts.some((x) => x.text === null)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (submitting && !pendingRead) {
      setSubmitting(false)
      const t = text().replace(/\s+/g, ' ').trim()
      onSubmit({ text: t, via: t ? 'inputtools' : 'none' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, pendingRead])

  return (
    <div className="space-y-2">
      <Line muted={!parts.length}>
        {parts.length ? (
          <span className="whitespace-pre-wrap">
            {parts.map((x) => (x.text === null ? <Loader2 key={x.id} size={16} className="inline animate-spin text-label-3" /> : <span key={x.id}>{x.text}</span>))}
            <span className="ml-0.5 inline-block h-6 w-0.5 animate-pulse bg-blue align-middle" aria-hidden />
          </span>
        ) : <span className="text-base">Eine Silbe pro Kästchen – im nächsten Kästchen weiterschreiben übernimmt sie.</span>}
      </Line>
      <div ref={wrapRef}>
        <InkPad
          ref={pad}
          width={viewW}
          height={height}
          lineWidth={opts.lineWidth}
          onStrokeStart={onStart}
          onStrokeEnd={(s) => setCount(s.length)}
          guides={
            <div aria-hidden className="pointer-events-none absolute inset-0 flex">
              {Array.from({ length: boxes }, (_, i) => (
                <div key={i} className="relative flex-1 border-r border-separator last:border-r-0">
                  <div className="absolute inset-y-3 left-1/2 border-l border-dashed border-separator" />
                  <div className="absolute inset-x-3 top-1/2 border-t border-dashed border-separator" />
                </div>
              ))}
            </div>
          }
        />
      </div>
      <Tools>
        <button className="btn-soft" onClick={() => { commitAll(); setParts((p) => [...p, { id: ++seq.current, text: ' ' }]) }} aria-label="Leerzeichen"><Space size={16} /> <span className="text-sm">Leerzeichen</span></button>
        <button className="btn-soft" onClick={() => { if (count) { pad.current?.undo(); setCount((pad.current?.strokes() ?? []).length) } else setParts((p) => p.slice(0, -1)) }} disabled={!count && !parts.length} aria-label="Zurück"><Delete size={16} /></button>
        <button className="btn-soft" onClick={() => toKeyboard(text())} aria-label="Tastatur statt Handschrift"><Keyboard size={16} /></button>
        <button className="btn-primary ml-auto" onClick={() => { commitAll(); setSubmitting(true) }} disabled={(!parts.length && !count) || submitting}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <>{submitLabel} <ArrowRight size={16} /></>}
        </button>
      </Tools>
    </div>
  )
}
