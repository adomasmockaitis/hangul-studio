import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { playSound } from '../lib/sounds'

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        playSound(checked ? 'off' : 'on')
        onChange(!checked)
      }}
      className={`group relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ${checked ? 'bg-green' : 'bg-fill-1'}`}
    >
      <span
        className={`ease-spring absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-md transition-all duration-300 group-active:scale-x-110 ${checked ? 'left-[22px]' : 'left-[2px]'}`}
      />
    </button>
  )
}

export function Segmented<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label?: string }) {
  // Gleitende Auswahl-Kapsel: Position und Breite der gewählten Option messen
  const wrap = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  const [animate, setAnimate] = useState(false)
  useLayoutEffect(() => {
    const box = wrap.current
    if (!box) return
    const measure = () => {
      const el = box.querySelector<HTMLElement>('[aria-checked="true"]')
      setThumb(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    measure()
    // Auch die einzelnen Knöpfe beobachten: ihre Breite ändert sich z. B., wenn Symbole auf dem Handy ausgeblendet werden
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(box)
    for (const el of box.querySelectorAll('[role="radio"]')) ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [value, options.length])
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div ref={wrap} role="radiogroup" aria-label={label} className="relative inline-flex rounded-full bg-fill-3 p-0.5">
      {thumb && (
        <span
          aria-hidden
          className={`ease-spring pointer-events-none absolute bottom-0.5 top-0.5 rounded-full bg-surface shadow-sm dark:bg-[#636366] ${animate ? 'transition-[left,width] duration-300' : ''}`}
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => {
            if (o.value !== value) playSound('tap')
            onChange(o.value)
          }}
          className={`relative flex min-h-9 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium sm:px-3.5 sm:text-sm transition-colors duration-200 active:opacity-60 ${
            value === o.value ? 'text-label' : 'text-label-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Großer Seitentitel. Scrollt er aus dem Bild, erscheint oben eine kleine Glas-Kapsel mit dem Titel
 * (abschaltbar mit collapsible={false}, z. B. wenn die Seite selbst etwas oben anheftet).
 */
/**
 * Gruppe nach Apple-Art: Überschrift über der Karte, Erklärung darunter (wie in den Einstellungen).
 * So stehen Abschnittstitel überall gleich – nicht mal innerhalb, mal außerhalb der Karte.
 */
export function Group({ title, footer, children, className = '', bare = false }: {
  title?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  /** ohne Kartenhintergrund (z. B. wenn der Inhalt selbst Karten enthält) */
  bare?: boolean
}) {
  return (
    <section>
      {title && <h2 className="mb-1.5 px-4 text-[13px] font-medium text-label-2">{title}</h2>}
      <div className={bare ? className : `card p-4 ${className}`}>{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] text-label-2">{footer}</p>}
    </section>
  )
}

export function PageHeader({ title, subtitle, right, below, collapsible = true }: {
  title: string; subtitle?: string; right?: ReactNode
  /** Eigene Zeile unter dem Titel (z. B. Umschalter) */
  below?: ReactNode
  collapsible?: boolean
}) {
  const h1 = useRef<HTMLHeadingElement>(null)
  const [away, setAway] = useState(false)
  useEffect(() => {
    if (!collapsible || !h1.current) return
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting), { rootMargin: '-12px 0px 0px 0px' })
    io.observe(h1.current)
    return () => io.disconnect()
  }, [collapsible])
  return (
    <>
      {collapsible && (
        <div className="pointer-events-none sticky top-0 z-30 h-0" aria-hidden>
          <div
            className={`glass absolute left-1/2 top-[-3.25rem] max-w-[60%] -translate-x-1/2 truncate rounded-full px-5 py-2 text-sm font-semibold transition duration-200 md:top-[-1.75rem] ${
              away ? 'opacity-100' : '-translate-y-2 opacity-0'
            }`}
          >
            {title}
          </div>
        </div>
      )}
      <div className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 ref={h1} className="text-[2.125rem] font-bold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="mt-0.5 text-[15px] text-label-2">{subtitle}</p>}
          </div>
          {right}
        </div>
        {below && <div className="mt-4">{below}</div>}
      </div>
    </>
  )
}

/** Hält den Tastatur-Fokus im Dialog, schließt mit Escape und gibt den Fokus danach zurück. */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const box = ref.current
    const items = () =>
      box ? [...box.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((e) => !e.hasAttribute('disabled')) : []
    if (box && !box.contains(document.activeElement)) box.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      } else if (e.key === 'Tab') {
        const list = items()
        if (!list.length) return
        const first = list[0]
        const last = list[list.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      before?.focus?.()
    }
  }, [open])
  return ref
}

/** Sheet: auf dem Handy von unten, auf größeren Bildschirmen mittig. */
export function Sheet({
  open, onClose, title, children, wide, keepMounted,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Breiteres Sheet für Tabellen */
  wide?: boolean
  /** Inhalt bleibt beim Schließen erhalten (z. B. laufender Scan) */
  keepMounted?: boolean
}) {
  const ref = useDialog(open, onClose)
  const titleId = useId()
  useEffect(() => {
    if (open) playSound('open')
  }, [open])
  if (!open && !keepMounted) return null
  return (
    <div className={`fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6 ${open ? '' : 'hidden'}`} onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sheet-up max-h-[92dvh] w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} overflow-y-auto rounded-t-[28px] bg-page p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:rounded-[28px] dark:bg-surface`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-9 rounded-full bg-fill-1 sm:hidden" aria-hidden />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fill-3 text-label-2 transition hover:bg-fill-1">
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
/** Alter Name – bitte `Sheet` verwenden. */
export const Modal = Sheet

/** Gruppierte Liste im iOS-Stil: Überschrift, Zeilen mit Trennlinien, Fußnote. */
export function List({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-1.5 px-4 text-[13px] font-medium text-label-2">{title}</h2>}
      <div className="card divide-y divide-separator overflow-hidden">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] text-label-2">{footer}</p>}
    </section>
  )
}

export function ListRow({
  icon, iconColor, title, subtitle, value, right, onClick, destructive,
}: {
  icon?: ReactNode
  iconColor?: string
  title: ReactNode
  subtitle?: ReactNode
  /** Kurzer Wert rechts (grau) */
  value?: ReactNode
  /** Eigenes Bedienelement rechts (Schalter, Auswahl …) */
  right?: ReactNode
  /** Mit onClick wird die Zeile zum Knopf und bekommt einen Pfeil */
  onClick?: () => void
  destructive?: boolean
}) {
  const body = (
    <>
      {icon && (
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-white" style={{ background: iconColor ?? 'var(--color-blue)' }}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-base ${destructive ? 'text-red' : ''}`}>{title}</span>
        {subtitle && <span className="block text-xs text-label-2">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-base text-label-2">{value}</span>}
      {right}
      {onClick && !right && <ChevronRight size={18} className="shrink-0 text-label-3" />}
    </>
  )
  const cls = 'flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left'
  return onClick ? (
    <button type="button" onClick={() => { playSound('nav'); onClick() }} className={`${cls} transition hover:bg-fill-4 active:bg-fill-3`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/* ---------- Bestätigungs-Dialog (ersetzt window.confirm) ---------- */

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Rote Bestätigung für Löschen & Co. */
  destructive?: boolean
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false))

/** `const confirm = useConfirm(); if (await confirm({ title: '…' })) …` */
export const useConfirm = () => useContext(ConfirmContext)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)
  const ask = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })), [])
  const done = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const ref = useDialog(!!state, () => done(false))
  const titleId = useId()
  const o = state?.opts
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {o && (
        <div className="fade-in fixed inset-0 z-[80] grid place-items-center bg-black/40 p-6" onMouseDown={() => done(false)}>
          <div
            ref={ref}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="glass alert-in w-full max-w-[20rem] rounded-[28px] p-5 text-center outline-none"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-semibold">{o.title}</h2>
            {o.message && <p className="mt-1.5 text-xs text-label-2">{o.message}</p>}
            <div className="mt-5 flex gap-2.5">
              <button type="button" className="btn-soft flex-1" onClick={() => done(false)}>{o.cancelLabel ?? 'Abbrechen'}</button>
              <button type="button" className={`${o.destructive ? 'btn-red' : 'btn-primary'} flex-1`} onClick={() => done(true)}>
                {o.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
