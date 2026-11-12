import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CloudUpload, Info, X } from 'lucide-react'

export type ToastKind = 'success' | 'info' | 'warning' | 'error' | 'sync'

export interface ToastOptions {
  kind?: ToastKind
  title: string
  text?: string
  action?: { label: string; onClick: () => void }
  /** Anzeigedauer in ms; null = bleibt, bis man sie schließt */
  duration?: number | null
  /** Gleiche Kennung ersetzt eine bestehende Meldung statt sie doppelt anzuzeigen */
  key?: string
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastCtx {
  show: (t: ToastOptions) => number
  dismiss: (id: number) => void
  /** Schließt alle Meldungen mit dieser Kennung */
  dismissKey: (key: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function useToast(): ToastCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast außerhalb des Providers')
  return c
}

const ICON: Record<ToastKind, { Icon: typeof Check; bg: string }> = {
  success: { Icon: Check, bg: '#34c759' },
  sync: { Icon: CloudUpload, bg: '#007aff' },
  info: { Icon: Info, bg: '#5e5ce6' },
  warning: { Icon: AlertTriangle, bg: '#ff9500' },
  error: { Icon: AlertTriangle, bg: '#ff3b30' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setItems((l) => l.filter((x) => x.id !== id))
  }, [])

  const show = useCallback(
    (t: ToastOptions) => {
      const id = nextId.current++
      setItems((l) => [...l.filter((x) => !t.key || x.key !== t.key), { ...t, id }].slice(-4))
      const d = t.duration === undefined ? 4500 : t.duration
      if (d !== null) timers.current.set(id, setTimeout(() => dismiss(id), d))
      return id
    },
    [dismiss],
  )

  const dismissKey = useCallback((key: string) => {
    setItems((l) => {
      for (const x of l) if (x.key === key) { const t = timers.current.get(x.id); if (t) clearTimeout(t); timers.current.delete(x.id) }
      return l.filter((x) => x.key !== key)
    })
  }, [])

  const value = useMemo(() => ({ show, dismiss, dismissKey }), [show, dismiss, dismissKey])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-3 z-[80] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[360px]">
        {items.map((t) => {
          const { Icon, bg } = ICON[t.kind ?? 'info']
          return (
            <div
              key={t.id}
              role="status"
              className="toast-in pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-black/[0.08] bg-white/80 p-3.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#2c2c2e]/85"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: bg }}>
                <Icon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight">{t.title}</p>
                {t.text && <p className="mt-0.5 text-sm leading-snug text-black/60 dark:text-white/60">{t.text}</p>}
                {t.action && (
                  <button
                    className="mt-2 rounded-lg bg-[#007aff] px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.97]"
                    onClick={() => {
                      t.action!.onClick()
                      dismiss(t.id)
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button className="rounded-full p-1 text-black/35 hover:bg-black/[0.06] dark:text-white/40 dark:hover:bg-white/10" onClick={() => dismiss(t.id)} aria-label="Schließen">
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
