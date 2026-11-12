import { emptyPayload, fingerprint, mergePayloads, parsePayload, type SyncPayload } from './merge'

/**
 * Synchronisation über Google Drive (versteckter App-Ordner „appDataFolder“).
 * Anmeldung per Google Identity Services (Token-Modell, nur im Browser, kein Server).
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const FILE_NAME = 'hangul-studio-sync.json'
const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

// ---------- Google Identity Services (minimale Typen) ----------
interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void
}
interface GoogleAccounts {
  oauth2: {
    initTokenClient: (cfg: {
      client_id: string
      scope: string
      callback: (r: TokenResponse) => void
      error_callback?: (e: { type?: string; message?: string }) => void
    }) => TokenClient
    revoke: (token: string, done?: () => void) => void
  }
}
declare global {
  interface Window {
    google?: { accounts: GoogleAccounts }
  }
}

export class NeedAuthError extends Error {
  constructor(message = 'Anmeldung bei Google nötig') {
    super(message)
    this.name = 'NeedAuthError'
  }
}

let gisPromise: Promise<void> | null = null

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('Google-Anmeldung konnte nicht geladen werden (Netzwerk oder Werbeblocker?)'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

// ---------- Zugriffstoken ----------
// Google gibt Web-Apps ohne Server nur ein kurzlebiges Token (~1 Stunde). Es wird – nur mit dem schmalen
// Bereich „drive.appdata“ – im Browser gemerkt, damit ein Neuladen der Seite nicht sofort abmeldet.
const TOKEN_KEY = 'hangul-studio:gtoken'
type Token = { value: string; expiresAt: number }

function loadStoredToken(): Token | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as Token | null
    return t && typeof t.value === 'string' && t.expiresAt - 60_000 > Date.now() ? t : null
  } catch {
    return null
  }
}

let token: Token | null = loadStoredToken()

function setToken(t: Token | null) {
  token = t
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Ablaufzeitpunkt des aktuellen Tokens (ms) oder null */
export function tokenExpiresAt(): number | null {
  return token ? token.expiresAt : null
}

export function hasValidToken(): boolean {
  return !!token && token.expiresAt - 60_000 > Date.now()
}

/**
 * Holt ein Zugriffstoken.
 * - interactive=false: versucht es still (ohne Anmeldefenster); klappt nur, wenn Google/Browser das ohne Klick erlauben.
 * - interactive=true: darf ein kurzes Google-Fenster öffnen. Das geht nur zuverlässig direkt nach einem Klick des Nutzers
 *   (sonst blockiert der Browser das Pop-up). Hat der Nutzer schon zugestimmt, schließt sich das Fenster von selbst.
 * - force=true: auch dann ein neues Token holen, wenn das alte noch gültig ist (vorzeitige Erneuerung).
 */
export async function getToken(clientId: string, interactive: boolean, force = false): Promise<string> {
  if (!force && hasValidToken()) return token!.value
  if (!clientId.trim()) throw new Error('Keine Google-Client-ID hinterlegt')
  await loadGis()
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          const silent = !interactive || r.error === 'interaction_required' || r.error === 'login_required' || r.error === 'consent_required'
          reject(silent ? new NeedAuthError() : new Error(r.error_description || r.error || 'Anmeldung fehlgeschlagen'))
          return
        }
        setToken({ value: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 })
        resolve(r.access_token)
      },
      error_callback: (e) => {
        if (e.type === 'popup_closed') reject(new Error('Anmeldefenster wurde geschlossen'))
        else reject(interactive ? new Error(e.message || 'Anmeldung nicht möglich (Pop-ups erlaubt?)') : new NeedAuthError())
      },
    })
    client.requestAccessToken({ prompt: interactive ? '' : 'none' })
  })
}

export function revokeToken(): void {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value)
  setToken(null)
}

export function forgetToken(): void {
  setToken(null)
}
// ---------- Drive-REST ----------
async function drive(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) } })
  if (res.status === 401) {
    forgetToken()
    throw new NeedAuthError('Sitzung abgelaufen – bitte erneut verbinden')
  }
  if (!res.ok) {
    let msg = `Google Drive: HTTP ${res.status}`
    try {
      const j = await res.json()
      msg = j?.error?.message ? `Google Drive: ${j.error.message}` : msg
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res
}

async function findFileId(accessToken: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)
  const res = await drive(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=10&orderBy=modifiedTime desc`, accessToken)
  const j = (await res.json()) as { files?: { id: string }[] }
  return j.files?.[0]?.id ?? null
}

async function download(accessToken: string, id: string): Promise<SyncPayload | null> {
  const res = await drive(`${DRIVE}/files/${id}?alt=media`, accessToken)
  try {
    return parsePayload(await res.json())
  } catch {
    return null
  }
}

async function createFile(accessToken: string, payload: SyncPayload): Promise<string> {
  const boundary = 'hangulstudio' + Math.random().toString(16).slice(2)
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' })
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`
  const res = await drive(`${UPLOAD}/files?uploadType=multipart&fields=id`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return ((await res.json()) as { id: string }).id
}

async function updateFile(accessToken: string, id: string, payload: SyncPayload): Promise<void> {
  await drive(`${UPLOAD}/files/${id}?uploadType=media`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  })
}

// ---------- Abgleich ----------
export interface SyncResult {
  /** true, wenn der Drive-Stand hochgeladen wurde */
  uploaded: boolean
  /** true, wenn lokal etwas aus Drive übernommen wurde */
  changedLocal: boolean
  merged: SyncPayload
}

/**
 * Ein Abgleich: Drive-Datei laden → mit dem lokalen Stand zusammenführen → Lokales aktualisieren → bei Bedarf hochladen.
 * `applyLocal` wird nur aufgerufen, wenn sich lokal etwas ändert.
 */
export async function syncOnce(opts: {
  clientId: string
  interactive: boolean
  /** API-Key mit synchronisieren (sonst wird er aus dem Drive-Stand entfernt) */
  includeApiKey?: boolean
  getLocal: () => SyncPayload
  applyLocal: (merged: SyncPayload) => void
}): Promise<SyncResult> {
  const accessToken = await getToken(opts.clientId, opts.interactive)
  const id = await findFileId(accessToken)
  const remote = id ? await download(accessToken, id) : null
  if (remote && !opts.includeApiKey) delete remote.settings.geminiApiKey
  const local = opts.getLocal()
  const merged = remote ? mergePayloads(local, remote) : { ...emptyPayload(), ...local }

  const changedLocal = fingerprint(merged) !== fingerprint(local)
  if (changedLocal) opts.applyLocal(merged)

  const needsUpload = !remote || fingerprint(merged) !== fingerprint(remote)
  if (needsUpload) {
    const out: SyncPayload = { ...merged, updatedAt: Date.now() }
    if (id) await updateFile(accessToken, id, out)
    else await createFile(accessToken, out)
  }
  return { uploaded: needsUpload, changedLocal, merged }
}
