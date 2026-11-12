import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useToast } from './components/Toasts'
import { forgetToken, hasValidToken, NeedAuthError, refreshTokenSilently, revokeToken, syncOnce, tokenExpiresAt, type SyncResult } from './lib/driveSync'
import { fingerprint, LOCAL_ONLY_SETTINGS, type SyncPayload } from './lib/merge'
import { useApp } from './store'

const K_SYNC = 'hangul-studio:sync'

/**
 * Öffentliche Google-Client-ID dieser App (kein Geheimnis – sie identifiziert nur die App).
 * Fest eingebaut, damit lokale und gehostete Version identisch funktionieren. Per Build-Variable
 * VITE_GOOGLE_CLIENT_ID oder in den Einstellungen (pro Gerät) lässt sie sich überschreiben.
 */
const BUILT_IN_CLIENT_ID = '251043778060-uc28ujh3dm3chfkkca0v17pa51godrm9.apps.googleusercontent.com'
const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || BUILT_IN_CLIENT_ID

export type SyncState = 'off' | 'idle' | 'syncing' | 'needs-auth' | 'error'

interface SyncCtx {
  state: SyncState
  enabled: boolean
  lastSync: number | null
  error: string
  clientId: string
  /** Ergebnis des letzten Abgleichs (z. B. ob Daten von einem anderen Gerät kamen) */
  lastResult: { changedLocal: boolean; uploaded: boolean; at: number } | null
  /** Verbinden (öffnet das Google-Anmeldefenster) bzw. nach Ablauf erneut anmelden */
  connect: () => Promise<SyncResult | null>
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
  const toast = useToast()
  const cfg0 = useMemo(loadCfg, [])
  const [enabled, setEnabled] = useState(cfg0.enabled)
  const [lastSync, setLastSync] = useState<number | null>(cfg0.lastSync)
  const [state, setState] = useState<SyncState>(cfg0.enabled ? 'idle' : 'off')
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState<SyncCtx['lastResult']>(null)

  const clientId = settings.googleClientId.trim() || ENV_CLIENT_ID

  // Aktueller Stand für Abgleiche, ohne ständig neue Funktionen zu erzeugen
  const live = useRef({ words, deleted, activity, settings })
  live.current = { words, deleted, activity, settings }
  const busy = useRef(false)
  const lastFp = useRef('')
  const lastRun = useRef(0)
  // Meldungen drosseln, damit nichts spammt
  const lastUploadToast = useRef(0)
  const lastAuthToast = useRef(0)
  const lastErrorToast = useRef(0)

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

  const connectRef = useRef<() => Promise<SyncResult | null>>(async () => null)

  const askReauth = useCallback(
    (force = false) => {
      const now = Date.now()
      if (!force && now - lastAuthToast.current < 20 * 60_000) return
      lastAuthToast.current = now
      toast.show({
        kind: 'warning',
        key: 'reauth',
        title: 'Bitte erneut bei Google anmelden',
        text: 'Die Anmeldung ist abgelaufen – das passiert bei Google nach etwa einer Stunde. Deine Daten sind sicher.',
        action: { label: 'Anmelden', onClick: () => void connectRef.current() },
        duration: null,
      })
    },
    [toast],
  )

  const run = useCallback(
    async (interactive: boolean, manual = false): Promise<SyncResult | null> => {
      if (busy.current || !clientId) return null
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
        const first = !enabled
        setLastSync(now)
        setEnabled(true)
        persist(true, now)
        setState('idle')
        setLastResult({ changedLocal: res.changedLocal, uploaded: res.uploaded, at: now })
        // Rückmeldung: Änderungen von anderen Geräten immer, eigenes Speichern gedrosselt
        if (first) {
          toast.show({ kind: 'success', key: 'sync-ok', title: 'Mit Google Drive verbunden', text: res.changedLocal ? 'Daten von deinen anderen Geräten wurden übernommen.' : 'Dein Stand wird ab jetzt automatisch gesichert.' })
        } else if (res.changedLocal) {
          toast.show({ kind: 'sync', key: 'sync-ok', title: 'Aktualisiert', text: 'Neue Daten von einem anderen Gerät wurden übernommen.' })
        } else if (manual) {
          toast.show({ kind: 'success', key: 'sync-ok', title: 'Synchronisiert', text: res.uploaded ? 'Dein Stand wurde in Google Drive gespeichert.' : 'Alles ist auf dem neuesten Stand.', duration: 3000 })
        } else if (res.uploaded && now - lastUploadToast.current > 2 * 60_000) {
          lastUploadToast.current = now
          toast.show({ kind: 'sync', key: 'sync-ok', title: 'In Google Drive gesichert', duration: 2500 })
        }
        return res
      } catch (e) {
        if (e instanceof NeedAuthError) {
          setState('needs-auth')
          setError(e.message)
          if (enabled || interactive) askReauth(interactive)
        } else {
          const msg = e instanceof Error ? e.message : 'Synchronisation fehlgeschlagen'
          setState('error')
          setError(msg)
          if (manual || interactive || Date.now() - lastErrorToast.current > 10 * 60_000) {
            lastErrorToast.current = Date.now()
            toast.show({ kind: 'error', key: 'sync-error', title: 'Synchronisation fehlgeschlagen', text: msg, duration: 7000 })
          }
        }
        return null
      } finally {
        busy.current = false
      }
    },
    [clientId, getLocal, applySyncPayload, enabled, toast, askReauth],
  )

  const connect = useCallback(() => run(true, true), [run])
  connectRef.current = connect
  const syncNow = useCallback(async () => {
    await run(false, true)
  }, [run])

  const disconnect = useCallback(() => {
    revokeToken()
    forgetToken()
    setEnabled(false)
    setState('off')
    setError('')
    persist(false, null)
    toast.show({ kind: 'info', key: 'sync-ok', title: 'Verbindung getrennt', text: 'Deine Daten bleiben lokal auf diesem Gerät. Die Datei in Google Drive bleibt bestehen.' })
  }, [toast])

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

  // Anmeldung rechtzeitig vor Ablauf still erneuern (Google-Zugriff gilt nur ~1 Stunde)
  useEffect(() => {
    if (!enabled || !clientId) return
    const check = async () => {
      if (busy.current) return
      const exp = tokenExpiresAt()
      if (exp === null || exp - Date.now() > 6 * 60_000) return
      try {
        await refreshTokenSilently(clientId)
        setState((s) => (s === 'needs-auth' ? 'idle' : s))
      } catch (e) {
        if (e instanceof NeedAuthError && Date.now() >= exp - 30_000) {
          setState('needs-auth')
          askReauth()
        }
      }
    }
    const iv = setInterval(check, 60_000)
    return () => clearInterval(iv)
  }, [enabled, clientId, askReauth])

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
    () => ({ state, enabled, lastSync, error, clientId, lastResult, connect, syncNow, disconnect }),
    [state, enabled, lastSync, error, clientId, lastResult, connect, syncNow, disconnect],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
