/**
 * „Das ist neu“-Fenster.
 *
 * Neues Update = neuer Eintrag ganz OBEN in RELEASES.
 * - size: 'major'  → größeres Update mit eigenen Funktionen (features): löst das Fenster aus.
 * - size: 'minor'  → kleine Verbesserung (summary, ein Satz): löst allein KEIN Fenster aus, erscheint
 *                    aber als Zeile unter „Außerdem“, sobald ein großes Update angezeigt wird.
 * Das Fenster erscheint höchstens einmal pro Besuch: ein Fenster, bis zu 3 große Updates untereinander.
 */
export type ReleaseIcon = 'cloud' | 'shield' | 'bell' | 'clock' | 'pin' | 'check' | 'pointer' | 'sparkles' | 'layers' | 'back'

export interface Release {
  /** Eindeutige Kennung */
  id: string
  size: 'major' | 'minor'
  title: string
  subtitle: string
  /** Bei großen Updates: 2–4 Funktionen */
  features: { icon: ReleaseIcon; color: string; title: string; text: string }[]
  /** Bei kleinen Updates: ein Satz für die Zeile unter „Außerdem“ */
  summary?: string
  /** Optionale Hauptaktion im Fenster */
  cta?: 'sync'
}
export const RELEASES: Release[] = [
  {
    id: '2026-11-motion',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Mehr Bewegung und Klang',
    summary: 'Sanfte Übergänge beim Seitenwechsel, gleitende Auswahl in Leisten und Umschaltern, federnde Knöpfe und leise Töne beim Tippen (abschaltbar unter Audio & Lernen).',
    features: [],
  },
  {
    id: '2026-11-pages-polish',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Seiten überarbeitet',
    summary: 'Die Startseite zeigt, wie viele Wörter heute fällig sind. Unter „Wörter“ öffnet ein Tipp auf die Zeile das Wort; Löschen liegt jetzt im Bearbeiten-Fenster.',
    features: [],
  },
  {
    id: '2026-11-settings-pages',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Aufgeräumte Einstellungen',
    summary: 'Die Einstellungen sind jetzt eine kurze Liste mit Unterseiten: Darstellung, KI & Prüfung, Schreiben, Audio & Lernen, Sync & Backup, Über, Erweitert.',
    features: [],
  },
  {
    id: '2026-11-new-design',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Neues Design und neue Navigation',
    features: [
      {
        icon: 'sparkles',
        color: '#007aff',
        title: 'Neuer Look',
        text: 'Leisten und Dialoge schweben als Glas über dem Inhalt, Schrift und Knöpfe sind größer und einheitlich.',
      },
      {
        icon: 'layers',
        color: '#34c759',
        title: 'Alles Üben an einem Ort',
        text: 'Lernen, Quiz und Beugungs-Trainer liegen jetzt zusammen im Tab „Üben“ – oben wechselst du zwischen ihnen.',
      },
      {
        icon: 'back',
        color: '#ff9500',
        title: 'Zurück-Taste und Neuladen',
        text: 'Jede Seite hat eine eigene Adresse: Zurück im Browser funktioniert, und nach dem Neuladen bleibst du, wo du warst.',
      },
      {
        icon: 'pin',
        color: '#af52de',
        title: 'Scanner unter „Wörter“',
        text: 'Der Datei-Scanner öffnet sich über „Datei scannen“ als eigenes Fenster; die Wortliste steht direkt oben.',
      },
    ],
  },
  {
    id: '2026-11-design-foundation',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Design-Fundament',
    summary: 'Größere Schrift und Tippflächen, eigene Dialoge statt Browser-Fenstern, sichtbarer Tastatur-Fokus und Rücksicht auf „Bewegung reduzieren“.',
    features: [],
  },
  {
    id: '2026-11-german-audio',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Deutsch vorlesen',
    summary: 'Wörter werden auch auf Deutsch vorgelesen (gekürzt) – einstellbar: Koreanisch + Deutsch, nur Koreanisch oder nur Deutsch.',
    features: [],
  },
  {
    id: '2026-11-done-card',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Abschluss-Ansicht',
    summary: 'Nach der letzten Karte gibt es jetzt „Zurück zum Dashboard“ und „Wiederholen“.',
    features: [],
  },
  {
    id: '2026-11-floating-bar',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Schwebende Aktionsleiste',
    summary: 'Ergebnis und Knöpfe schweben unten; der Kasten färbt sich bei richtig grün und bei falsch rot.',
    features: [
      {
        icon: 'pin',
        color: '#007aff',
        title: 'Immer in Reichweite',
        text: 'Prüfen, Weiter und Co. schweben am unteren Rand – nach dem Schreiben musst du nicht mehr scrollen.',
      },
      {
        icon: 'check',
        color: '#34c759',
        title: 'Ergebnis sofort sichtbar',
        text: 'Richtig oder falsch, was gelesen wurde und der Widerspruch erscheinen direkt in dieser Leiste.',
      },
      {
        icon: 'pointer',
        color: '#ff9500',
        title: 'Immer am selben Platz',
        text: 'Die Hauptaktion sitzt jetzt immer rechts – Prüfen und Nächstes Wort liegen übereinander.',
      },
    ],
  },
  {
    id: '2026-11-sync',
    size: 'major',
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

/** Noch nicht gesehene Releases (neueste zuerst). Kennt jemand keinen Stand, sind es alle. */
export function unseenReleases(): Release[] {
  const seen = getSeenRelease()
  const i = RELEASES.findIndex((r) => r.id === seen)
  return i === -1 ? RELEASES : RELEASES.slice(0, i)
}

/**
 * Inhalt des Fensters oder null, wenn keins erscheinen soll:
 * nur wenn es ein ungesehenes GROSSES Update gibt – höchstens 3 davon, dazu die ungesehenen kleinen als Zeilen.
 */
export function releasePopup(force = false): { majors: Release[]; minors: Release[] } | null {
  const unseen = unseenReleases()
  const majors = unseen.filter((r) => r.size === 'major').slice(0, 3)
  if (!majors.length) {
    if (!force) return null
    // Aus den Einstellungen aufgerufen: das neueste große Update noch einmal zeigen
    const latestMajor = RELEASES.find((r) => r.size === 'major')
    return latestMajor ? { majors: [latestMajor], minors: [] } : null
  }
  return { majors, minors: unseen.filter((r) => r.size === 'minor').slice(0, 5) }
}
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
