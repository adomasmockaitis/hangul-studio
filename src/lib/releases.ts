/**
 * Neuigkeiten-Dialog: Bei jedem neuen Eintrag ganz oben erscheint einmalig ein großes „Das ist neu“-Fenster.
 * Für ein neues Update einfach einen Eintrag an den ANFANG der Liste setzen.
 */
export type ReleaseIcon = 'cloud' | 'shield' | 'bell' | 'clock'

export interface Release {
  /** Eindeutige Kennung; ändert sich sie, wird das Fenster erneut gezeigt */
  id: string
  title: string
  subtitle: string
  features: { icon: ReleaseIcon; color: string; title: string; text: string }[]
  /** Optionale Hauptaktion im Fenster */
  cta?: 'sync'
}

export const RELEASES: Release[] = [
  {
    id: '2026-11-sync',
    title: 'Neu in Hangul Studio',
    subtitle: 'Synchronisation mit Google Drive',
    cta: 'sync',
    features: [
      {
        icon: 'cloud',
        color: '#0a84ff',
        title: 'Auf allen Geräten dasselbe',
        text: 'Verbinde Google Drive, und dein Lernstand ist auf PC, Tablet und Smartphone gleich – automatisch.',
      },
      {
        icon: 'shield',
        color: '#34c759',
        title: 'Deine Daten, dein Drive',
        text: 'Gespeichert wird nur in einem versteckten App-Ordner deines eigenen Google Drive. Niemand sonst sieht ihn.',
      },
      {
        icon: 'bell',
        color: '#ff9500',
        title: 'Hinweise oben rechts',
        text: 'Kleine Meldungen zeigen dir, wann synchronisiert wurde – und wenn du dich bei Google neu anmelden musst.',
      },
      {
        icon: 'clock',
        color: '#af52de',
        title: 'Zuverlässig, auch bei falscher Uhr',
        text: 'Der Abgleich funktioniert auch dann richtig, wenn die Uhr eines Geräts falsch geht.',
      },
    ],
  },
]

export const LATEST_RELEASE = RELEASES[0]

const KEY = 'hangul-studio:seen-release'

export function getSeenRelease(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return LATEST_RELEASE.id // ohne Speicher nicht dauernd anzeigen
  }
}

export function markReleaseSeen(id = LATEST_RELEASE.id): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* ignore */
  }
}
