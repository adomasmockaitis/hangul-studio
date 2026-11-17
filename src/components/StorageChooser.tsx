import { useState } from 'react'
import { Check, Cloud, CloudOff, Download, HardDrive, Loader2, LogOut, RefreshCw, Trash2, UserRound } from 'lucide-react'
import { useAccount, useStorageMode, type StorageMode } from '../account'
import { deleteDriveData } from '../lib/driveSync'
import { formatAgo } from '../lib/time'
import { useApp } from '../store'
import { useSync } from '../sync'
import { Sheet, Toggle } from './ui'

const OPTIONS: { id: StorageMode; icon: typeof Cloud; title: string; text: string }[] = [
  { id: 'local', icon: HardDrive, title: 'Nur auf diesem Gerät', text: 'Alles bleibt in diesem Browser. Sichern und übertragen per Backup-Datei.' },
  { id: 'drive', icon: Cloud, title: 'Google Drive', text: 'Versteckter App-Ordner in deinem eigenen Drive. Anmeldung muss gelegentlich erneuert werden.' },
  { id: 'account', icon: UserRound, title: 'Hangul-Studio-Konto', text: 'Anmeldung mit Google oder E-Mail, Speicherort Frankfurt. Bleibt angemeldet.' },
]

/** Wahl der Speicherart samt Anmeldung, Status und Löschen (Einstellungen und Onboarding) */
export function StorageChooser({ compact = false }: { compact?: boolean }) {
  const { settings, updateSettings, exportBackup } = useApp()
  const sync = useSync()
  const acc = useAccount()
  const mode = useStorageMode()
  const [wantAccount, setWantAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [create, setCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [delSheet, setDelSheet] = useState<null | 'drive' | 'account'>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delMsg, setDelMsg] = useState('')

  const choose = async (m: StorageMode) => {
    setNote('')
    if (m === mode && m !== 'account') return
    if (m === 'local') {
      if (sync.enabled) sync.disconnect()
      if (acc.enabled) acc.disable()
      setWantAccount(false)
    } else if (m === 'drive') {
      if (acc.enabled) acc.disable()
      setWantAccount(false)
      await sync.connect()
    } else {
      if (acc.user) {
        setBusy(true)
        await acc.enable()
        setBusy(false)
      } else setWantAccount(true)
    }
  }

  const signIn = async (how: Parameters<typeof acc.signIn>[0]) => {
    setBusy(true)
    const ok = await acc.signIn(how)
    if (ok) {
      setWantAccount(false)
      await acc.enable()
    }
    setBusy(false)
  }

  const runDelete = async () => {
    setDelBusy(true)
    setDelMsg('')
    if (delSheet === 'drive') {
      try {
        const had = await deleteDriveData(sync.clientId)
        sync.disconnect()
        setDelMsg(had ? 'Deine Daten in Google Drive wurden gelöscht.' : 'In Google Drive lagen keine Daten.')
      } catch (e) {
        setDelMsg(e instanceof Error ? e.message : 'Löschen fehlgeschlagen')
      }
    } else {
      const err = await acc.deleteAll()
      setDelMsg(err ?? 'Dein Konto und alle Daten darin wurden gelöscht. Auf diesem Gerät bleibt alles erhalten.')
    }
    setDelBusy(false)
  }

  const showAccountForm = (wantAccount || mode === 'account') && !acc.user

  return (
    <div className="space-y-3">
      <div className="card divide-y divide-separator overflow-hidden" role="radiogroup" aria-label="Speicherart">
        {OPTIONS.map((o) => {
          // Während der Anmeldung zum Konto ist nur „Konto“ markiert
          const on = wantAccount && mode !== 'account' ? o.id === 'account' : o.id === mode
          const disabled = o.id === 'account' && !acc.available
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled || busy}
              onClick={() => void choose(o.id)}
              className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-fill-4 disabled:opacity-50 ${on ? 'bg-blue/10' : ''}`}
            >
              <o.icon size={20} className="shrink-0 text-blue" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{o.title}</span>
                {!compact && <span className="block text-xs text-label-2">{disabled ? 'Wird gerade eingerichtet – bald verfügbar.' : o.text}</span>}
              </span>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-blue bg-blue text-white' : 'border-label-3'}`} aria-hidden>
                {on && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>

      {/* Google Drive */}
      {mode === 'drive' && (
        <div className="card space-y-3 p-4">
          <p className="text-sm text-label-2">
            {sync.state === 'error' ? <span className="text-red">{sync.error}</span>
              : sync.state === 'needs-auth' ? 'Die Anmeldung wird beim nächsten Klick automatisch erneuert – oder jetzt erneut verbinden.'
              : `✓ Verbunden${sync.lastSync ? ` · zuletzt synchronisiert ${formatAgo(sync.lastSync)}` : ''}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {sync.state === 'needs-auth' ? (
              <button className="btn-primary" onClick={() => void sync.connect()}><Cloud size={16} /> Erneut verbinden</button>
            ) : (
              <button className="btn-primary" disabled={sync.state === 'syncing'} onClick={() => void sync.syncNow()}>
                {sync.state === 'syncing' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Jetzt synchronisieren
              </button>
            )}
            <button className="btn-soft" onClick={sync.disconnect}><CloudOff size={16} /> Trennen</button>
          </div>
          {!compact && <button className="btn-soft !text-red" onClick={() => { setDelMsg(''); setDelSheet('drive') }}><Trash2 size={16} /> Meine Daten in Google Drive löschen</button>}
        </div>
      )}
      {mode !== 'drive' && sync.state === 'error' && <p className="px-4 text-sm text-red">{sync.error}</p>}

      {/* Konto: anmelden */}
      {showAccountForm && (
        <div className="card space-y-3 p-4">
          <button className="btn-primary w-full" disabled={busy} onClick={() => void signIn({ google: true })}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <UserRound size={16} />} Mit Google anmelden
          </button>
          <div className="flex items-center gap-3 text-xs text-label-3"><span className="h-px flex-1 bg-separator" />oder mit E-Mail<span className="h-px flex-1 bg-separator" /></div>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void signIn({ email, password, create }) }}>
            <input className="input" type="email" autoComplete="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-Mail" />
            <input className="input" type="password" autoComplete={create ? 'new-password' : 'current-password'} placeholder={create ? 'Neues Passwort (mind. 6 Zeichen)' : 'Passwort'} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Passwort" />
            <button type="submit" className="btn-soft w-full" disabled={busy || !email.trim() || !password}>{create ? 'Konto anlegen' : 'Anmelden'}</button>
          </form>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button className="font-medium text-blue" onClick={() => setCreate((c) => !c)}>{create ? 'Ich habe schon ein Konto' : 'Neues Konto anlegen'}</button>
            {!create && <button className="text-label-2" disabled={!email.trim()} onClick={async () => setNote(await acc.forgotPassword(email))}>Passwort vergessen?</button>}
          </div>
          {(acc.error || note) && <p className={`text-sm ${acc.error ? 'text-red' : 'text-green'}`}>{acc.error || note}</p>}
          <p className="text-xs text-label-3">Deine Daten werden im Rechenzentrum Frankfurt gespeichert. Nur du kannst sie lesen. Löschen geht jederzeit mit einem Klick.</p>
        </div>
      )}

      {/* Konto: angemeldet */}
      {acc.user && (mode === 'account' || wantAccount) && (
        <div className="card space-y-3 p-4">
          <p className="text-sm">
            Angemeldet als <b>{acc.user.email ?? 'Google-Konto'}</b>
            <span className="block text-label-2">
              {acc.state === 'error' ? <span className="text-red">{acc.error}</span>
                : acc.state === 'syncing' ? 'Gleicht ab …'
                : acc.enabled ? `✓ Abgleich aktiv${acc.lastSync ? ` · zuletzt ${formatAgo(acc.lastSync)}` : ''}` : 'Abgleich aus'}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {acc.enabled ? (
              <button className="btn-primary" disabled={acc.state === 'syncing'} onClick={() => void acc.syncNow()}>
                {acc.state === 'syncing' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Jetzt synchronisieren
              </button>
            ) : (
              <button className="btn-primary" disabled={busy} onClick={() => void choose('account')}><Cloud size={16} /> Abgleich einschalten</button>
            )}
            <button className="btn-soft" onClick={() => void acc.signOut()}><LogOut size={16} /> Abmelden</button>
          </div>
          {!compact && <button className="btn-soft !text-red" onClick={() => { setDelMsg(''); setDelSheet('account') }}><Trash2 size={16} /> Konto und alle Daten löschen</button>}
        </div>
      )}

      {/* Freiwillig: App mitverbessern */}
      {acc.available && (mode === 'account' || wantAccount || !compact) && (
        <div className="card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">App mitverbessern</p>
              <p className="text-xs text-label-2">
                Liegt die Handschrift-Erkennung daneben oder widersprichst du Gemini, wird dieser Fall (Bild der Schrift, Zielwort, Erkanntes, Modell, Datum)
                <b> ohne Bezug zu dir</b> gespeichert – keine Nutzer-ID, keine E-Mail, keine Geräteinfos. Damit lassen sich Erkennung und Prompts verbessern.
                Weil nichts zuordenbar ist, lassen sich gesendete Fälle später nicht einzeln löschen. Nur mit Konto.
              </p>
            </div>
            <Toggle checked={settings.contribute} onChange={(contribute) => updateSettings({ contribute })} label="App mitverbessern" />
          </div>
          {settings.contribute && !acc.user && <p className="mt-2 text-xs text-orange">Wird erst gesendet, wenn du mit einem Konto angemeldet bist.</p>}
        </div>
      )}

      {mode !== 'local' && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-fill-4 p-3">
          <div>
            <p className="text-sm font-medium">API-Key mitsynchronisieren</p>
            <p className="text-xs text-label-2">Standardmäßig aus: Der Key bleibt nur auf diesem Gerät.</p>
          </div>
          <Toggle checked={settings.syncApiKey} onChange={(syncApiKey) => updateSettings({ syncApiKey })} label="API-Key synchronisieren" />
        </div>
      )}

      {/* Löschen mit Backup-Angebot */}
      <Sheet open={!!delSheet} onClose={() => setDelSheet(null)} title={delSheet === 'drive' ? 'Daten in Google Drive löschen?' : 'Konto und alle Daten löschen?'}>
        <div className="space-y-3">
          <p className="text-sm text-label-2">
            {delSheet === 'drive'
              ? 'Die Sync-Datei in deinem Google Drive wird gelöscht und die Verbindung getrennt. Auf diesem Gerät bleibt alles erhalten.'
              : 'Alle Daten in deinem Hangul-Studio-Konto und das Konto selbst werden sofort gelöscht. Auf diesem Gerät bleibt alles erhalten.'}
            {' '}Willst du vorher eine Sicherung herunterladen?
          </p>
          <button className="btn-soft w-full" onClick={() => exportBackup(false)}><Download size={16} /> Backup herunterladen</button>
          <button className="btn-red w-full" disabled={delBusy} onClick={() => void runDelete()}>
            {delBusy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Endgültig löschen
          </button>
          {delMsg && <p className="text-sm text-label-2">{delMsg}</p>}
          <button className="btn-soft w-full" onClick={() => setDelSheet(null)}>{delMsg ? 'Schließen' : 'Abbrechen'}</button>
        </div>
      </Sheet>
    </div>
  )
}
