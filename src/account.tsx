/**
 * Hangul-Studio-Konto: Anmeldung, automatischer Abgleich mit Firebase und „App mitverbessern“.
 * Läuft parallel zum Google-Drive-Abgleich; es ist immer höchstens eine der beiden Speicherarten aktiv.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useToast } from './components/Toasts'
import { setContributionSink } from './lib/contribute'
import {
  accountRemote, accountsAvailable, firestoreAudioRemote, authMessage, deleteAccountAndData, reauthenticate, resetPassword, sendContribution, signInEmail, signInGoogle,
  signOutAccount, watchAuth, watchRemote,
} from './lib/firebase'
import { fingerprint, LOCAL_ONLY_SETTINGS, type SyncPayload } from './lib/merge'
import { syncWithRemote } from './lib/remoteSync'
import { setAudioRemote } from './lib/audio/voice'
import { useApp } from './store'
import { useSync } from './sync'

const K_ACCOUNT = 'hangul-studio:account-sync'
/** Merker: Auf diesem Gerät wurde das Konto schon benutzt (dann Firebase beim Start laden) */
const K_USED = 'hangul-studio:account-used'
const wasUsed = () => { try { return localStorage.getItem(K_USED) === '1' } catch { return false } }

export type AccountState = 'off' | 'idle' | 'syncing' | 'error'
export type StorageMode = 'local' | 'drive' | 'account'

interface AccountUser {
  uid: string
  email: string | null
  provider: 'google' | 'password' | 'other'
}

interface AccountCtx {
  /** Ist im Projekt überhaupt ein Firebase-Konto eingerichtet? */
  available: boolean
  user: AccountUser | null
  /** Anmeldestatus ist bekannt */
  ready: boolean
  enabled: boolean
  state: AccountState
  error: string
  lastSync: number | null
  signIn: (how: { google: true } | { email: string; password: string; create: boolean }) => Promise<boolean>
  forgotPassword: (email: string) => Promise<string>
  /** Konto als Speicherort einschalten (trennt Google Drive) und sofort abgleichen */
  enable: () => Promise<void>
  /** Abgleich ausschalten; angemeldet bleibt man */
  disable: () => void
  syncNow: () => Promise<void>
  signOut: () => Promise<void>
  /** Alle Daten im Konto und das Konto selbst löschen. Liefert eine Fehlermeldung oder null */
  deleteAll: () => Promise<string | null>
}

const Ctx = createContext<AccountCtx | null>(null)

export function useAccount(): AccountCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAccount außerhalb des Providers')
  return c
}

/** Welche Speicherart gerade aktiv ist */
export function useStorageMode(): StorageMode {
  const sync = useSync()
  const acc = useAccount()
  return acc.enabled && acc.user ? 'account' : sync.enabled ? 'drive' : 'local'
}

function loadCfg(): { enabled: boolean; lastSync: number | null } {
  try {
    const j = JSON.parse(localStorage.getItem(K_ACCOUNT) || '{}') as { enabled?: boolean; lastSync?: number }
    return { enabled: !!j.enabled, lastSync: typeof j.lastSync === 'number' ? j.lastSync : null }
  } catch {
    return { enabled: false, lastSync: null }
  }
}
function persist(enabled: boolean, lastSync: number | null) {
  try {
    localStorage.setItem(K_ACCOUNT, JSON.stringify({ enabled, lastSync }))
  } catch {
    /* ignore */
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const { words, deleted, activity, settings, folders, deletedFolders, particles, applySyncPayload } = useApp()
  const sync = useSync()
  const toast = useToast()
  const cfg0 = useMemo(loadCfg, [])
  const [user, setUser] = useState<AccountUser | null>(null)
  const [ready, setReady] = useState(!accountsAvailable)
  const [enabled, setEnabled] = useState(cfg0.enabled)
  const [lastSync, setLastSync] = useState<number | null>(cfg0.lastSync)
  const [state, setState] = useState<AccountState>(cfg0.enabled ? 'idle' : 'off')
  const [error, setError] = useState('')

  const live = useRef({ words, deleted, activity, settings, folders, deletedFolders, particles })
  live.current = { words, deleted, activity, settings, folders, deletedFolders, particles }
  const busy = useRef(false)
  const lastFp = useRef('')
  const lastRun = useRef(0)
  const lastToast = useRef(0)
  /**
   * Live-Abgleich ohne Uhrvergleich (Geräteuhren weichen ab): eigene Uploads merken,
   * jeder andere neue Stand im Konto löst einen Abgleich aus.
   */
  const ownSaves = useRef(new Set<number>())
  const lastSeen = useRef(0)
  const rerun = useRef(false)

  // Anmeldestatus beobachten – Firebase wird nur geladen, wenn das Konto schon einmal benutzt wurde
  useEffect(() => {
    if (!accountsAvailable || (!cfg0.enabled && !wasUsed())) {
      setReady(true)
      return
    }
    let off: (() => void) | undefined
    void watchAuth((u) => {
      setUser(u ? { uid: u.uid, email: u.email, provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : u.providerData.some((p) => p.providerId === 'password') ? 'password' : 'other' } : null)
      setReady(true)
    }).then((f) => (off = f), () => setReady(true))
    return () => off?.()
  }, [cfg0.enabled])

  const getLocal = useCallback((): SyncPayload => {
    const s = live.current.settings
    const out: Record<string, unknown> = { ...s }
    for (const k of LOCAL_ONLY_SETTINGS) delete out[k]
    delete out.settingsUpdatedAt
    if (!s.syncApiKey) delete out.geminiApiKey
    return {
      app: 'hangul-studio', kind: 'sync', version: 2, updatedAt: Date.now(),
      words: live.current.words, deleted: live.current.deleted, activity: live.current.activity, settings: out,
      settingsUpdatedAt: s.settingsUpdatedAt ?? 0, folders: live.current.folders, deletedFolders: live.current.deletedFolders, particles: live.current.particles,
    }
  }, [])

  const run = useCallback(
    async (uid: string, manual = false, first = false) => {
      if (busy.current) return
      busy.current = true
      lastRun.current = Date.now()
      setState('syncing')
      setError('')
      try {
        const base = accountRemote(uid)
        const remote = {
          load: base.load,
          save: (p: SyncPayload) => {
            ownSaves.current.add(p.updatedAt)
            if (ownSaves.current.size > 20) ownSaves.current.delete(ownSaves.current.values().next().value as number)
            return base.save(p)
          },
        }
        const res = await syncWithRemote({ remote, includeApiKey: live.current.settings.syncApiKey, getLocal, applyLocal: applySyncPayload })
        lastFp.current = fingerprint(res.merged)
        if (res.savedAt) lastSeen.current = res.savedAt
        const now = Date.now()
        setLastSync(now)
        persist(true, now)
        setState('idle')
        if (first) toast.show({ kind: 'success', key: 'acc-ok', title: 'Konto verbunden', text: res.changedLocal ? 'Daten aus deinem Konto wurden übernommen.' : 'Dein Stand wird ab jetzt automatisch im Konto gesichert.' })
        else if (res.changedLocal) toast.show({ kind: 'sync', key: 'acc-ok', title: 'Aktualisiert', text: 'Neue Daten von einem anderen Gerät wurden übernommen.' })
        else if (manual) toast.show({ kind: 'success', key: 'acc-ok', title: 'Synchronisiert', text: res.uploaded ? 'Dein Stand wurde im Konto gespeichert.' : 'Alles ist auf dem neuesten Stand.', duration: 3000 })
        else if (res.uploaded && now - lastToast.current > 2 * 60_000) {
          lastToast.current = now
          toast.show({ kind: 'sync', key: 'acc-ok', title: 'Im Konto gesichert', duration: 2500 })
        }
      } catch (e) {
        const msg = /quota|resource-exhausted/i.test(String((e as { code?: string })?.code ?? e))
          ? 'Das Tageskontingent des kostenlosen Speichers ist erreicht – der Abgleich läuft morgen weiter, die App arbeitet lokal weiter.'
          : authMessage(e)
        setState('error')
        setError(msg)
        if (manual || first) toast.show({ kind: 'error', key: 'acc-error', title: 'Abgleich fehlgeschlagen', text: msg, duration: 7000 })
      } finally {
        busy.current = false
        if (rerun.current) {
          rerun.current = false
          setTimeout(() => void runRef.current(uid), 300)
        }
      }
    },
    [getLocal, applySyncPayload, toast],
  )

  const runRef = useRef(run)
  runRef.current = run

  // Beim Start und bei Änderungen abgleichen
  useEffect(() => {
    if (!enabled || !user) return
    const id = setTimeout(() => void run(user.uid), 1200)
    return () => clearTimeout(id)
    // nur wenn sich Anmeldung oder Schalter ändern
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.uid])

  useEffect(() => {
    if (!enabled || !user) return
    const id = setTimeout(() => {
      if (fingerprint(getLocal()) !== lastFp.current) void run(user.uid)
    }, 4000)
    return () => clearTimeout(id)
  }, [words, deleted, activity, settings, folders, deletedFolders, particles, enabled, user, getLocal, run])

  // Live: speichert ein anderes Gerät, sofort abgleichen (ohne Neuladen)
  useEffect(() => {
    if (!enabled || !user) return
    let off: (() => void) | undefined
    let alive = true
    const uid = user.uid
    void watchRemote(uid, (t) => {
      if (t === lastSeen.current || ownSaves.current.has(t)) return
      const firstSnapshot = lastSeen.current === 0
      lastSeen.current = t
      // Der erste Stand beim Verbinden wird ohnehin beim Start abgeglichen
      if (firstSnapshot && Date.now() - lastRun.current < 10_000) return
      // Läuft gerade ein Abgleich, danach noch einmal (sonst ginge die neue Änderung verloren)
      if (busy.current) rerun.current = true
      else void runRef.current(uid)
    }).then((f) => {
      if (alive) off = f
      else f()
    })
    return () => {
      alive = false
      off?.()
    }
    // runRef statt run: sonst würde der Beobachter bei jedem Neuzeichnen neu verbunden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.uid])

  useEffect(() => {
    if (!enabled || !user) return
    const tick = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > 60_000) void run(user.uid)
    }
    document.addEventListener('visibilitychange', tick)
    const iv = setInterval(tick, 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      clearInterval(iv)
    }
  }, [enabled, user, run])

  // Gemini-Aufnahmen über das Konto abgleichen
  useEffect(() => {
    if (!enabled || !user) {
      setAudioRemote('account', null)
      return
    }
    setAudioRemote('account', firestoreAudioRemote(user.uid))
    return () => setAudioRemote('account', null)
  }, [enabled, user])

  // „App mitverbessern“: nur mit Einwilligung und Anmeldung
  useEffect(() => {
    setContributionSink(settings.contribute && user ? (c) => void sendContribution(c).catch(() => undefined) : null)
    return () => setContributionSink(null)
  }, [settings.contribute, user])

  const toUser = (u: { uid: string; email: string | null; providerData: { providerId: string }[] }): AccountUser => ({
    uid: u.uid, email: u.email, provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password',
  })

  const signIn: AccountCtx['signIn'] = useCallback(async (how) => {
    setError('')
    try {
      const u = 'google' in how ? await signInGoogle() : await signInEmail(how.email, how.password, how.create)
      setUser(toUser(u))
      try { localStorage.setItem(K_USED, '1') } catch { /* ignore */ }
      // Ab jetzt den Anmeldestatus beobachten (Abmelden in einem anderen Tab usw.)
      void watchAuth((x) => setUser(x ? toUser(x) : null))
      return true
    } catch (e) {
      setError(authMessage(e))
      return false
    }
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    try {
      await resetPassword(email)
      return 'Wir haben dir eine E-Mail zum Zurücksetzen geschickt.'
    } catch (e) {
      return authMessage(e)
    }
  }, [])

  const enable = useCallback(async () => {
    if (!user) return
    if (sync.enabled) sync.disconnect()
    setEnabled(true)
    persist(true, lastSync)
    await run(user.uid, false, true)
  }, [user, sync, lastSync, run])

  const disable = useCallback(() => {
    setEnabled(false)
    setState('off')
    persist(false, null)
  }, [])

  const syncNow = useCallback(async () => {
    if (user) await run(user.uid, true)
  }, [user, run])

  const signOut = useCallback(async () => {
    disable()
    await signOutAccount()
    setUser(null)
    toast.show({ kind: 'info', key: 'acc-ok', title: 'Abgemeldet', text: 'Deine Daten bleiben auf diesem Gerät und in deinem Konto.' })
  }, [disable, toast])

  const deleteAll = useCallback(async () => {
    try {
      try {
        await deleteAccountAndData()
      } catch (e) {
        if ((e as { code?: string })?.code !== 'auth/requires-recent-login') throw e
        await reauthenticate()
        await deleteAccountAndData()
      }
      disable()
      setUser(null)
      return null
    } catch (e) {
      return authMessage(e)
    }
  }, [disable])

  // Wird Google Drive verbunden, endet der Konto-Abgleich (immer nur ein Speicherort)
  useEffect(() => {
    if (sync.enabled && enabled) disable()
  }, [sync.enabled, enabled, disable])

  const value = useMemo<AccountCtx>(
    () => ({ available: accountsAvailable, user, ready, enabled, state, error, lastSync, signIn, forgotPassword, enable, disable, syncNow, signOut, deleteAll }),
    [user, ready, enabled, state, error, lastSync, signIn, forgotPassword, enable, disable, syncNow, signOut, deleteAll],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
