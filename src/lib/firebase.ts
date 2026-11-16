/**
 * Hangul-Studio-Konto über Firebase (kostenloser Spark-Tarif, Speicherort Frankfurt).
 *
 * - Anmeldung: Google oder E-Mail + Passwort
 * - Daten: users/{uid} (Metadaten) + users/{uid}/chunks/{n} (der Sync-Stand als Text in Stücken)
 * - „App mitverbessern“: contributions/{id} – ohne Nutzer-ID, nur der Entwickler kann lesen (siehe firestore.rules)
 *
 * Die Firebase-Bibliothek wird erst geladen, wenn jemand das Konto nutzt (spart Ladezeit für alle anderen).
 * Die Konfiguration ist nicht geheim; sie steht ohnehin im ausgelieferten Code.
 */
import type { FirebaseApp } from 'firebase/app'
import type { Auth, User } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import { parsePayload, type SyncPayload } from './merge'
import { splitChunks, type RemoteStore } from './remoteSync'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  storageBucket?: string
  messagingSenderId?: string
}

/** Öffentliche Konfiguration des Hangul-Studio-Projekts (per Build-Variable überschreibbar) */
const BUILT_IN: FirebaseConfig | null = null

function readConfig(): FirebaseConfig | null {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined
  if (raw) {
    try {
      const c = JSON.parse(raw) as FirebaseConfig
      if (c.apiKey && c.projectId && c.appId) return c
    } catch {
      /* ungültig – fällt auf die eingebaute zurück */
    }
  }
  return BUILT_IN
}

export const firebaseConfig = readConfig()
export const accountsAvailable = !!firebaseConfig

interface Fb {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  authMod: typeof import('firebase/auth')
  fsMod: typeof import('firebase/firestore')
}
let fbPromise: Promise<Fb> | null = null

/** Firebase laden und starten (nur einmal) */
export function loadFirebase(): Promise<Fb> {
  if (!firebaseConfig) return Promise.reject(new Error('Konten sind in dieser Version noch nicht eingerichtet.'))
  fbPromise ??= (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
    const app = appMod.getApps()[0] ?? appMod.initializeApp(firebaseConfig)
    const auth = authMod.getAuth(app)
    await authMod.setPersistence(auth, authMod.browserLocalPersistence)
    auth.languageCode = 'de'
    const db = fsMod.getFirestore(app)
    return { app, auth, db, authMod, fsMod }
  })()
  return fbPromise
}

/** Verständliche Meldungen für die häufigsten Anmeldefehler */
export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-email': 'Die E-Mail-Adresse ist ungültig.',
    'auth/missing-password': 'Bitte ein Passwort eingeben.',
    'auth/weak-password': 'Das Passwort ist zu kurz (mindestens 6 Zeichen).',
    'auth/email-already-in-use': 'Für diese E-Mail gibt es schon ein Konto – melde dich an.',
    'auth/invalid-credential': 'E-Mail oder Passwort stimmen nicht.',
    'auth/wrong-password': 'E-Mail oder Passwort stimmen nicht.',
    'auth/user-not-found': 'Für diese E-Mail gibt es noch kein Konto.',
    'auth/too-many-requests': 'Zu viele Versuche – bitte kurz warten.',
    'auth/popup-closed-by-user': 'Das Anmeldefenster wurde geschlossen.',
    'auth/popup-blocked': 'Der Browser hat das Anmeldefenster blockiert – bitte Pop-ups erlauben.',
    'auth/unauthorized-domain': 'Diese Adresse ist im Firebase-Projekt noch nicht freigegeben (Authentication → Einstellungen → Autorisierte Domains).',
    'auth/network-request-failed': 'Keine Verbindung zum Internet.',
    'auth/requires-recent-login': 'Bitte melde dich zur Sicherheit kurz neu an und versuche es dann noch einmal.',
  }
  return map[code] ?? (e instanceof Error ? e.message : 'Unbekannter Fehler')
}

export async function watchAuth(cb: (u: User | null) => void): Promise<() => void> {
  const { auth, authMod } = await loadFirebase()
  return authMod.onAuthStateChanged(auth, cb)
}

export async function signInGoogle(): Promise<User> {
  const { auth, authMod } = await loadFirebase()
  return (await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider())).user
}

export async function signInEmail(email: string, password: string, create: boolean): Promise<User> {
  const { auth, authMod } = await loadFirebase()
  const fn = create ? authMod.createUserWithEmailAndPassword : authMod.signInWithEmailAndPassword
  return (await fn(auth, email.trim(), password)).user
}

export async function resetPassword(email: string): Promise<void> {
  const { auth, authMod } = await loadFirebase()
  await authMod.sendPasswordResetEmail(auth, email.trim())
}

export async function signOutAccount(): Promise<void> {
  const { auth, authMod } = await loadFirebase()
  await authMod.signOut(auth)
}

// ---------- Daten ----------

/** Das Konto als entfernter Speicherort */
export function accountRemote(uid: string): RemoteStore {
  return {
    async load() {
      const { db, fsMod } = await loadFirebase()
      const meta = await fsMod.getDoc(fsMod.doc(db, 'users', uid))
      const n = meta.exists() ? Number(meta.data().chunks) || 0 : 0
      if (!n) return null
      const parts = await Promise.all(Array.from({ length: n }, (_, i) => fsMod.getDoc(fsMod.doc(db, 'users', uid, 'chunks', String(i)))))
      try {
        return parsePayload(JSON.parse(parts.map((p) => String(p.data()?.data ?? '')).join('')))
      } catch {
        return null
      }
    },
    async save(payload: SyncPayload) {
      const { db, fsMod } = await loadFirebase()
      const chunks = splitChunks(JSON.stringify(payload))
      const metaRef = fsMod.doc(db, 'users', uid)
      const old = await fsMod.getDoc(metaRef)
      const oldN = old.exists() ? Number(old.data().chunks) || 0 : 0
      const batch = fsMod.writeBatch(db)
      chunks.forEach((data, i) => batch.set(fsMod.doc(db, 'users', uid, 'chunks', String(i)), { data }))
      for (let i = chunks.length; i < oldN; i++) batch.delete(fsMod.doc(db, 'users', uid, 'chunks', String(i)))
      batch.set(metaRef, { chunks: chunks.length, updatedAt: payload.updatedAt, bytes: chunks.reduce((a, c) => a + c.length, 0) })
      await batch.commit()
    },
  }
}

/** Alle Daten des Kontos löschen und danach das Konto selbst */
export async function deleteAccountAndData(): Promise<void> {
  const { auth, db, fsMod, authMod } = await loadFirebase()
  const user = auth.currentUser
  if (!user) throw new Error('Nicht angemeldet')
  const chunks = await fsMod.getDocs(fsMod.collection(db, 'users', user.uid, 'chunks'))
  const batch = fsMod.writeBatch(db)
  chunks.forEach((d) => batch.delete(d.ref))
  batch.delete(fsMod.doc(db, 'users', user.uid))
  await batch.commit()
  await authMod.deleteUser(user)
}

/** Für die Sicherheitsabfrage vor dem Löschen: kurz neu anmelden */
export async function reauthenticate(): Promise<void> {
  const { auth, authMod } = await loadFirebase()
  const user = auth.currentUser
  if (!user) throw new Error('Nicht angemeldet')
  if (user.providerData.some((p) => p.providerId === 'google.com')) await authMod.reauthenticateWithPopup(user, new authMod.GoogleAuthProvider())
  else throw Object.assign(new Error('Bitte melde dich ab und mit E-Mail und Passwort neu an, dann noch einmal löschen.'), { code: 'reauth-email' })
}

// ---------- App mitverbessern ----------

export interface Contribution {
  kind: 'gemini-dispute' | 'inputtools-wrong'
  target: string
  read: string
  model?: string
  /** Was die Prüfung gesagt hat */
  verdict: boolean
  /** Was laut Nutzer stimmt */
  actuallyCorrect: boolean
  /** Handschrift als PNG (Base64), klein */
  image?: string
}

/** Fehlerfall ohne Nutzerbezug senden (nur angemeldet, damit Missbrauch begrenzt bleibt; die Kennung wird nicht gespeichert) */
export async function sendContribution(c: Contribution): Promise<void> {
  const { db, fsMod, auth } = await loadFirebase()
  if (!auth.currentUser) return
  const data: Record<string, unknown> = {
    kind: c.kind, target: c.target.slice(0, 40), read: c.read.slice(0, 40), verdict: c.verdict, actuallyCorrect: c.actuallyCorrect,
    app: 'hangul-studio', createdAt: fsMod.serverTimestamp(),
  }
  if (c.model) data.model = c.model.slice(0, 60)
  if (c.image && c.image.length < 80_000) data.image = c.image
  await fsMod.addDoc(fsMod.collection(db, 'contributions'), data)
}

/** Nur für den Entwickler-Account (laut Sicherheitsregeln): alle Beiträge laden */
export async function loadContributions(): Promise<Record<string, unknown>[]> {
  const { db, fsMod } = await loadFirebase()
  const snap = await fsMod.getDocs(fsMod.collection(db, 'contributions'))
  return snap.docs.map((d) => {
    const x = d.data()
    const created = x.createdAt as { toMillis?: () => number } | undefined
    return { id: d.id, ...x, createdAt: created?.toMillis?.() ?? null }
  })
}
