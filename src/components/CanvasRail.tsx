import type { ReactNode } from 'react'
import { useApp } from '../store'

/**
 * Werkzeuge neben dem Schreibfeld: senkrechte Spalte auf der Seite, die die Schreibhand nicht verdeckt
 * (Rechtshänder: links). So sind Rückgängig/Löschen ohne Scrollen erreichbar.
 */
export function useHandSide() {
  const { settings } = useApp()
  const left = settings.handedness !== 'left'
  /** Werkzeuge und Hauptknopf liegen links (Rechtshänder) bzw. rechts (Linkshänder) */
  return { toolsLeft: left }
}

/** Schreibfeld + Werkzeugspalte nebeneinander; die Spalte liegt auf der Seite gegenüber der Schreibhand */
export function RailRow({ rail, children, className = '' }: { rail: ReactNode; children: ReactNode; className?: string }) {
  const { toolsLeft } = useHandSide()
  return (
    <div className={`flex items-start gap-2 ${toolsLeft ? '' : 'flex-row-reverse'} ${className}`}>
      <div className="flex shrink-0 flex-col gap-1.5">{rail}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function RailButton({ children, onClick, label, on = false, disabled = false }: { children: ReactNode; onClick: () => void; label: string; on?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-90 disabled:opacity-35 ${on ? 'bg-blue text-white' : 'bg-fill-3 text-label hover:bg-fill-2'}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on || undefined}
      title={label}
    >
      {children}
    </button>
  )
}

const WIDTHS = [3, 5, 8, 12] as const
const WIDTH_NAMES = ['dünn', 'mittel', 'dick', 'sehr dick']

/** Strichdicke: Tippen schaltet dünn → mittel → dick → sehr dick; der Punkt zeigt die Dicke */
export function WidthButton({ value, onChange }: { value: number; onChange: (w: number) => void }) {
  const i = WIDTHS.findIndex((w) => w >= value)
  const cur = i < 0 ? WIDTHS.length - 1 : i
  const next = WIDTHS[(cur + 1) % WIDTHS.length]
  return (
    <RailButton onClick={() => onChange(next)} label={`Strichdicke: ${WIDTH_NAMES[cur]} (tippen zum Ändern)`}>
      <span className="rounded-full bg-label" style={{ width: Math.max(4, value * 1.3), height: Math.max(4, value * 1.3) }} />
    </RailButton>
  )
}

/**
 * Stift-Seitentaste (z. B. S Pen am Galaxy Book) oder Radierer-Ende: schaltet auf Strich-Radierer.
 * Windows meldet Tippen mit gedrückter Seitentaste als Stift-Rechtsklick (button 2), den Radierer als button 5.
 */
export function isPenEraser(e: { pointerType: string; button: number; buttons: number }): boolean {
  return e.pointerType === 'pen' && (e.button === 2 || e.button === 5 || (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0)
}

type XY = { x: number; y: number }
const segDist = (p: XY, a: XY, b: XY) => {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Strich-Radierer: alle Striche entfernen, die der Punkt (mit Radius r) berührt – ganze Striche, nicht Teile */
export function eraseStrokesAt<S extends XY[]>(strokes: S[], p: XY, r: number): S[] {
  return strokes.filter((s) => {
    if (s.length === 1) return Math.hypot(p.x - s[0].x, p.y - s[0].y) > r
    for (let i = 1; i < s.length; i++) if (segDist(p, s[i - 1], s[i]) <= r) return false
    return true
  })
}
