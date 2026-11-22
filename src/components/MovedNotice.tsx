import { ArrowRight, CloudDownload } from 'lucide-react'
import { Sheet } from './ui'

export const NEW_HOST = 'hangul.adomas-mockaitis.de'
const SEEN_KEY = 'hangul-studio:moved-notice'

/**
 * Umzug von adomasmockaitis.github.io/hangul-studio auf die eigene Domain: Der Browser speichert Daten je Adresse,
 * deshalb ist hier anfangs alles leer. Einmal pro Gerät erklären, wie man seine Daten zurückholt.
 * Nur auf der neuen Adresse und nur, solange hier noch nichts eingerichtet ist.
 */
export function shouldShowMovedNotice(onboarded: boolean): boolean {
  if (typeof location === 'undefined') return false
  // ?umzug zeigt den Hinweis zum Ansehen/Testen immer
  if (new URLSearchParams(location.search).has('umzug')) return true
  if (location.hostname !== NEW_HOST || onboarded) return false
  try {
    return localStorage.getItem(SEEN_KEY) !== '1'
  } catch {
    return false
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* privat */
  }
}

export function MovedNotice({ onNew, onRestore }: { onNew: () => void; onRestore: () => void }) {
  return (
    <Sheet open onClose={() => { markSeen(); onNew() }} title="Hangul Studio ist umgezogen">
      <div className="space-y-4">
        <p>
          Die neue Adresse ist <b>{NEW_HOST}</b>. Bitte aktualisiere dein Lesezeichen bzw. die Verknüpfung auf dem Home-Bildschirm.
        </p>
        <div className="rounded-2xl bg-fill-4 p-4 text-sm">
          <p className="font-semibold">Du hast schon mit Hangul Studio gelernt?</p>
          <p className="mt-1 text-label-2">
            Dein Browser speichert Daten getrennt pro Adresse – deshalb ist hier noch alles leer. Hast du mit einem Konto oder Google Drive
            abgeglichen, melde dich einfach wieder an: Wörter, Lernstand, Statistik und Einstellungen kommen zurück.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button className="btn-primary flex-1 !py-3" onClick={() => { markSeen(); onRestore() }}>
            <CloudDownload size={18} /> Anmelden und Daten holen
          </button>
          <button className="btn-soft flex-1 !py-3" onClick={() => { markSeen(); onNew() }}>
            Ich bin neu hier <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </Sheet>
  )
}
