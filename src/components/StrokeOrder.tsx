import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw } from 'lucide-react'
import { expandJamo } from '../lib/hangul'
import { arrowHead, strokePath } from '../lib/strokes'
import { layoutSyllable, type SyllableLayout } from '../lib/syllableLayout'
import type { StrokeStyleMode } from '../types'

// Jeder Strich einer Silbe bekommt eine eigene, gut unterscheidbare Farbe
const COLORS = ['#007aff', '#ff9500', '#34c759', '#af52de', '#ff3b30', '#00b8d4', '#ff2d92', '#a2845e']
const DUR = 0.8 // Zeichendauer pro Strich (s, bei 1x)
const GAP = 0.3 // Pause zwischen Strichen
const JAMO_GAP = 0.25 // zusätzliche Pause zwischen Buchstaben
const SYL_GAP = 0.5 // zusätzliche Pause zwischen Silben

const blockSvg = 'h-[132px] w-[132px] rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5'
const blockSvgSmall = 'h-[104px] w-[104px] rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5'

function Ghost({ layout }: { layout: SyllableLayout }) {
  return (
    <g stroke="currentColor" className="text-black/10 dark:text-white/15" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {layout.strokes.map((s, i) => <path key={i} d={strokePath(s.pts)} />)}
    </g>
  )
}

/** Hilfslinien wie im Silbenraster, damit die Blockform erkennbar ist */
function Guides() {
  return (
    <g stroke="currentColor" className="text-black/10 dark:text-white/10" strokeWidth="0.6" strokeDasharray="3 3">
      <line x1="50" y1="0" x2="50" y2="100" />
      <line x1="0" y1="50" x2="100" y2="50" />
    </g>
  )
}

function Caption({ layout }: { layout: SyllableLayout }) {
  return (
    <div className="text-center leading-tight">
      <span className="text-xl font-semibold">{layout.char}</span>
      <span className="block text-sm font-semibold">
        {(() => {
          let partIndex = 0
          return layout.jamo.map((j, i) => {
            // Farbe des ersten Strichs dieses Buchstabens (zusammengesetzte wie ㅘ zählen mehrere Teile)
            const start = partIndex
            partIndex += expandJamo(j).length
            const first = layout.strokes.findIndex((s) => s.jamoIndex === start && s.strokeIndex === 0)
            return (
              <span key={i}>
                {i > 0 && <span className="text-black/30 dark:text-white/30"> + </span>}
                <span style={{ color: COLORS[Math.max(0, first) % COLORS.length] }}>{j}</span>
              </span>
            )
          })
        })()}
      </span>
    </div>
  )
}

/** Zahlen & Pfeile: jede Silbe als fertiger Block, Striche fortlaufend durchnummeriert */
function NumberBlock({ layout, small = false }: { layout: SyllableLayout; small?: boolean }) {
  return (
    <div className={`flex ${small ? 'w-[104px]' : 'w-[132px]'} shrink-0 flex-col items-center gap-1`}>
      <svg viewBox="0 0 100 100" className={small ? blockSvgSmall : blockSvg}>
        <Guides />
        <Ghost layout={layout} />
        {layout.strokes.map((s, n) => {
          const color = COLORS[n % COLORS.length]
          const [sx, sy] = s.pts[0]
          const cx = Math.min(94, Math.max(6, sx < 50 ? sx - 6 : sx + 6))
          const cy = Math.min(94, Math.max(6, sy < 50 ? sy - 5 : sy + 6))
          return (
            <g key={n}>
              <path d={strokePath(s.pts)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <polygon points={arrowHead(s.pts, 5)} fill={color} />
              <circle cx={cx} cy={cy} r="4.6" fill={color} />
              <text x={cx} y={cy + 2.4} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff">{n + 1}</text>
            </g>
          )
        })}
      </svg>
      <Caption layout={layout} />
    </div>
  )
}

/** Strikt sequenzielle Animation: Silbe für Silbe, Buchstabe für Buchstabe, Strich für Strich – im Silbenblock */
function Animated({ layouts, compact = false }: { layouts: SyllableLayout[]; compact?: boolean }) {
  const { starts, total } = useMemo(() => {
    let t = 0.2
    const starts = layouts.map((l) => {
      const arr: number[] = []
      let prevJamo = 0
      for (const s of l.strokes) {
        if (s.jamoIndex !== prevJamo) t += JAMO_GAP
        prevJamo = s.jamoIndex
        arr.push(t)
        t += DUR + GAP
      }
      t += SYL_GAP
      return arr
    })
    return { starts, total: t }
  }, [layouts])

  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const timeRef = useRef(0)
  const speedRef = useRef(1)
  speedRef.current = speed

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      timeRef.current = Math.min(total, timeRef.current + ((now - last) / 1000) * speedRef.current)
      last = now
      setTime(timeRef.current)
      if (timeRef.current >= total) setPlaying(false)
    }, 30)
    return () => clearInterval(id)
  }, [playing, total])

  const replay = () => {
    timeRef.current = 0
    setTime(0)
    setPlaying(true)
  }
  const togglePlay = () => {
    if (!playing && timeRef.current >= total) return replay()
    setPlaying((p) => !p)
  }

  // Kompakte Vorschau (Onboarding): Animation läuft in Schleife, ohne Bedienelemente
  useEffect(() => {
    if (!compact || time < total) return
    const id = setTimeout(replay, 1400)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, time, total])

  let active = -1
  starts.forEach((arr, i) => { if (arr.length && time >= arr[0]) active = i })
  const finished = time >= total

  return (
    <>
      {!compact && (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={togglePlay}>
          {playing ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Weiter</>}
        </button>
        <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={replay}><RotateCcw size={13} /> Nochmal abspielen</button>
        {[1, 0.5].map((s) => (
          <button key={s} className={`${speed === s ? 'btn-primary' : 'btn-soft'} !px-2.5 !py-1 text-xs`} onClick={() => setSpeed(s)}>{s}x</button>
        ))}
      </div>
      )}
      <div className={compact ? 'flex flex-wrap justify-center gap-3' : 'flex flex-wrap gap-3'}>
        {layouts.map((l, li) => (
          <div key={li} className={`flex ${compact ? 'w-[104px]' : 'w-[132px]'} shrink-0 flex-col items-center gap-1`}>
            <svg viewBox="0 0 100 100" className={`${compact ? blockSvgSmall : blockSvg} transition ${!finished && li === active ? 'ring-2 ring-[#007aff]' : ''}`}>
              <Guides />
              <Ghost layout={l} />
              {l.strokes.map((s, si) => {
                const p = Math.min(1, Math.max(0, (time - starts[li][si]) / DUR))
                if (p <= 0) return null
                return (
                  <path
                    key={si}
                    d={strokePath(s.pts)}
                    pathLength={1}
                    fill="none"
                    stroke={COLORS[si % COLORS.length]}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="1 1"
                    strokeDashoffset={1 - p}
                  />
                )
              })}
            </svg>
            <Caption layout={l} />
          </div>
        ))}
      </div>
    </>
  )
}

export function StrokeOrder({ text, mode, compact = false }: { text: string; mode: StrokeStyleMode; compact?: boolean }) {
  const layouts = useMemo(
    () => Array.from(text).map((ch) => layoutSyllable(ch)).filter((l): l is SyllableLayout => !!l),
    [text],
  )
  if (compact) {
    // Schlichte Vorschau ohne Kopfzeile (z. B. im Onboarding)
    return mode === 'animation' ? (
      <Animated key={text} layouts={layouts} compact />
    ) : (
      <div className="flex flex-wrap justify-center gap-3">{layouts.map((l, i) => <NumberBlock key={i} layout={l} small />)}</div>
    )
  }
  // Minimiert-Zustand wird gemerkt, damit er beim Wechsel zur nächsten Karte bleibt
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('hangul-studio:strokeorder-collapsed') === '1'
    } catch {
      return false
    }
  })
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('hangul-studio:strokeorder-collapsed', c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }

  return (
    <div className="fade-up rounded-2xl border border-black/[0.06] bg-black/[0.03] p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <p className="label">Strichreihenfolge · {mode === 'animation' ? 'Animation' : 'Zahlen & Pfeile'}</p>
        <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={toggle} aria-expanded={!collapsed} title={collapsed ? 'Strichreihenfolge einblenden' : 'Strichreihenfolge minimieren'}>
          {collapsed ? <><ChevronDown size={14} /> Einblenden</> : <><ChevronUp size={14} /> Minimieren</>}
        </button>
      </div>
      {collapsed ? null : (
        <>
      <p className="mb-2 mt-1 text-xs text-black/50 dark:text-white/50">
        Jede Silbe wird als <b>ein Block</b> geschrieben – genau so, wie unten im Silbenraster: Anlaut links/oben, Vokal rechts oder unten.
      </p>
      {layouts.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">Keine Hangul-Zeichen im Wort.</p>
      ) : mode === 'animation' ? (
        <Animated key={text} layouts={layouts} />
      ) : (
        <div className="flex flex-wrap gap-3">
          {layouts.map((l, i) => <NumberBlock key={i} layout={l} />)}
        </div>
      )}
        </>
      )}
    </div>
  )
}
