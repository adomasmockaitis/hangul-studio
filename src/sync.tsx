import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { forgetToken, hasValidToken, NeedAuthError, revokeToken, syncOnce } from './lib/driveSync'
import { fingerprint, LOCAL_ONLY_SETTINGS, type SyncPayload } from './lib/merge'
import { useApp } from './store'

const K_SYNC = 'hangul-studio:sync'

/** Im Build mitgegebene Client-ID (GitHub-Variable GOOGLE_CLIENT_ID); die Einstellung auf dem Gerät hat Vorrang */
const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

export type SyncState = 'off' | 'idle' | 'syncing' | 'needs-auth' | 'error'

interface SyncCtx {
  state: SyncState
  enabled: boolean
  lastSync: number | null
  error: string
  clientId: string
  /** Erstmals verbinden (öffnet das Google-Anmeldefenster) bzw. nach Ablauf erneut anmelden */
  connect: () => Promise<void>
  syncNow: () => Promise<void>
  disconnect: () => void
}

const Ctx = createContext<SyncCtx | null>(null)

export function useSync(): SyncCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSync außerhalb des Providers')
  return c
}

function loadCfg(): { enabled: boolean; lastSync: number | null } {
  try {
    const j = JSON.parse(localStorage.getItem(K_SYNC) || '{}') as { enabled?: boolean; lastSync?: number }
    return { enabled: !!j.enabled, lastSync: typeof j.lastSync === 'number' ? j.lastSync : null }
  } catch {
    return { enabled: false, lastSync: null }
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { words, deleted, activity, settings, applySyncPayload } = useApp()
  const cfg0 = useMemo(loadCfg, [])
  const [enabled, setEnabled] = useState(cfg0.enabled)
  const [lastSync, setLastSync] = useState<number | null>(cfg0.lastSync)
  const [state, setState] = useState<SyncState>(cfg0.enabled ? 'idle' : 'off')
  const [error, setError] = useState('')

  const clientId = settings.googleClientId.trim() || ENV_CLIENT_ID

  // Aktueller Stand für Abgleiche, ohne ständig neue Funktionen zu erzeugen
  const live = useRef({ words, deleted, activity, settings })
  live.current = { words, deleted, activity, settings }
  const busy = useRef(false)
  const lastFp = useRef('')
  const lastRun = useRef(0)

  const getLocal = useCallback((): SyncPayload => {
    const s = live.current.settings
    const out: Record<string, unknown> = { ...s }
    for (const k of LOCAL_ONLY_SETTINGS) delete out[k]
    delete out.settingsUpdatedAt
    if (!s.syncApiKey) delete out.geminiApiKey
    return {
      app: 'hangul-studio',
      kind: 'sync',
      version: 2,
      updatedAt: Date.now(),
      words: live.current.words,
      deleted: live.current.deleted,
      activity: live.current.activity,
      settings: out,
      settingsUpdatedAt: s.settingsUpdatedAt ?? 0,
    }
  }, [])

  const persist = (e: boolean, t: number | null) => {
    try {
      localStorage.setItem(K_SYNC, JSON.stringify({ enabled: e, lastSync: t }))
    } catch {
      /* ignore */
    }
  }

  const run = useCallback(
    async (interactive: boolean) => {
      if (busy.current || !clientId) return
      busy.current = true
      lastRun.current = Date.now()
      setState('syncing')
      setError('')
      try {
        const res = await syncOnce({
          clientId,
          interactive,
          includeApiKey: live.current.settings.syncApiKey,
          getLocal,
          applyLocal: applySyncPayload,
        })
        lastFp.current = fingerprint(res.merged)
        const now = Date.now()
        setLastSync(now)
        setEnabled(true)
        persist(true, now)
        setState('idle')
      } catch (e) {
        if (e instanceof NeedAuthError) {
          setState('needs-auth')
          setError(e.message)
        } else {
          setState('error')
          setError(e instanceof Error ? e.message : 'Synchronisation fehlgeschlagen')
        }
      } finally {
        busy.current = false
      }
    },
    [clientId, getLocal, applySyncPayload],
  )

  const connect = useCallback(() => run(true), [run])
  const syncNow = useCallback(async () => {
    // Zuerst still versuchen; wenn eine Anmeldung nötig ist, bleibt der Button „Erneut verbinden“ sichtbar
    await run(false)
  }, [run])

  const disconnect = useCallback(() => {
    revokeToken()
    forgetToken()
    setEnabled(false)
    setState('off')
    setError('')
    persist(false, null)
  }, [])

  // Beim Start still abgleichen
  useEffect(() => {
    if (!enabled || !clientId) return
    const id = setTimeout(() => void run(false), 1200)
    return () => clearTimeout(id)
    // nur beim ersten Laden bzw. wenn sich die Client-ID ändert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  // Änderungen automatisch hochladen (mit Verzögerung)
  useEffect(() => {
    if (!enabled || !clientId || !hasValidToken()) return
    const id = setTimeout(() => {
      if (fingerprint(getLocal()) !== lastFp.current) void run(false)
    }, 4000)
    return () => clearTimeout(id)
  }, [words, deleted, activity, settings, enabled, clientId, getLocal, run])

  // Beim Zurückkehren in den Tab und regelmäßig abgleichen
  useEffect(() => {
    if (!enabled || !clientId) return
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > 60_000) void run(false)
    }
    document.addEventListener('visibilitychange', tick)
    const iv = setInterval(tick, 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      clearInterval(iv)
    }
  }, [enabled, clientId, run])

  const value = useMemo<SyncCtx>(
    () => ({ state, enabled, lastSync, error, clientId, connect, syncNow, disconnect }),
    [state, enabled, lastSync, error, clientId, connect, syncNow, disconnect],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
