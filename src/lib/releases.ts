/**
 * „Das ist neu“-Fenster.
 *
 * Neues Update = neuer Eintrag ganz OBEN in RELEASES.
 * - size: 'major'  → größeres Update mit eigenen Funktionen (features): löst das Fenster aus.
 * - size: 'minor'  → kleine Verbesserung (summary, ein Satz): löst allein KEIN Fenster aus, erscheint
 *                    aber als Zeile unter „Außerdem“, sobald ein großes Update angezeigt wird.
 * Das Fenster erscheint höchstens einmal pro Besuch: ein Fenster, bis zu 3 große Updates untereinander.
 */
export type ReleaseIcon = 'cloud' | 'shield' | 'bell' | 'clock' | 'pin' | 'check' | 'pointer' | 'sparkles' | 'layers' | 'back' | 'folder' | 'gauge' | 'ear' | 'puzzle' | 'volume'

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
    id: '2026-11-sync-review-log',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Statistik auf allen Geräten',
    features: [],
    summary: 'Deine Quiz-Antworten werden jetzt mit abgeglichen – Gelernt, Erfolgsquote und Stufe sind auf allen Geräten gleich.',
  },
  {
    id: '2026-11-dict-duplicates',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Doppelte Bedeutungen',
    features: [],
    summary: 'Das Wörterbuch prüft einmal alle Wörter auf gleiche Bedeutungen und zeigt sie nebeneinander – eins behalten, beide oder von Gemini Unterschiede vorschlagen lassen. Geändert wird erst, wenn du zustimmst.',
  },
  {
    id: '2026-11-extra-round',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Nochmal wiederholen',
    features: [],
    summary: 'Alles wiederholt? „Nochmal wiederholen“ startet eine Extra-Runde mit den 10 Wörtern, die du am häufigsten falsch machst.',
  },
  {
    id: '2026-11-smart-v2',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Ein klügerer Smart-Modus',
    features: [
      { icon: 'gauge', color: '#007aff', title: 'Smart nimmt, was dran ist', text: 'Wörter, die fällig sind, die du oft falsch machst oder lange nicht geübt hast – dazu bis zu 5 neue. Nur aus Ordnern, die du aktiv lernst. Eine Anzahl musst du nicht mehr wählen.' },
      { icon: 'check', color: '#34c759', title: 'Startseite zeigt, was bereit ist', text: 'Du siehst sofort, wie viele Wörter bereit sind und warum. Genau diese lädt das Smart-Quiz.' },
      { icon: 'shield', color: '#ff9500', title: 'Ehrliche Statistik', text: '„Gelernt“ und die Erfolgsquote zählen nur noch Quiz-Antworten. Gelernt heißt: Deutsch → Koreanisch an 3 verschiedenen Tagen ohne Hilfe richtig.' },
    ],
  },
  {
    id: '2026-11-writing-flow',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Bequemer schreiben, weiterlernen, wo du warst',
    features: [
      { icon: 'pointer', color: '#007aff', title: 'Werkzeuge neben dem Feld', text: 'Rückgängig, Radierer und Strichdicke stehen jetzt neben dem Schreibfeld, der Prüfen-Knopf liegt auf der Seite gegenüber deiner Schreibhand (einstellbar). Der Strich-Radierer löscht ganze Striche, auch mit der Seitentaste deines Stifts.' },
      { icon: 'back', color: '#34c759', title: 'Übung bleibt erhalten', text: 'Wechselst du kurz zu Start oder Einstellungen, geht die Übung danach genau dort weiter. Nur vor dem Wörterbuch fragt ein laufendes Quiz nach, weil dort die Lösungen stehen.' },
      { icon: 'folder', color: '#ff9500', title: 'Ordner aktiv lernen', text: 'Schalte in einem Ordner „Aktiv lernen“ aus, dann lässt der Smart-Modus diese Wörter aus. Beim Lernen gibt es außerdem die Reihenfolgen Zufällig, Schwächste und Stärkste zuerst.' },
      { icon: 'sparkles', color: '#af52de', title: 'Klügerer Scan', text: 'Der Scan läuft im Hintergrund weiter und meldet sich, wenn er fertig ist. Doppelte Bedeutungen werden markiert: Behalte eins, beide, oder lass Gemini die Übersetzungen unterscheiden.' },
    ],
  },
  {
    id: '2026-11-practice-writing',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Nachschreiben',
    features: [],
    summary: 'Neu in den Einstellungen unter Schreiben: Nach dem Prüfen ein freies Feld, um das Wort ein paar Mal nachzuschreiben.',
  },
  {
    id: '2026-11-motion-polish',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Ruhigere Bewegungen',
    summary: 'Knöpfe reagieren sofort beim Drücken und federn nicht mehr über, Fenster gleiten beim Schließen auf demselben Weg zurück und lassen sich auf dem Handy nach unten wegwischen, alle Übungen haben dieselbe Kopfzeile mit Fortschritt und „Beenden“, und „Weniger Transparenz“ sowie „Mehr Kontrast“ deines Geräts werden berücksichtigt.',
    features: [],
  },
  {
    id: '2026-11-design-cleanup',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Aufgeräumtes Layout',
    summary: 'Alle Seiten haben jetzt dieselbe Breite, Abschnitte stehen überall gleich (Überschrift über der Karte, Erklärung darunter), der Umschalter unter „Üben“ hat eine eigene Zeile, und die Wörter-Seite ist auf dem Handy kompakter.',
    features: [],
  },
  {
    id: '2026-11-particles-write-fix',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Schreib-Lücken korrigiert',
    summary: 'Bei Partikel-Lücken zum Schreiben steht jetzt groß, welches Wort du mit Partikel schreibst. Bei einem Fehler siehst du, was gelesen wurde – und ein Widerspruch gegen die Erkennung zählt jetzt auch.',
    features: [],
  },
  {
    id: '2026-11-handwriting-sentences',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Ganze Sätze von Hand',
    features: [
      {
        icon: 'pointer',
        color: '#0a84ff',
        title: 'Sätze von Hand schreiben',
        text: 'Deutsche Sätze schreibst du im Partikel-Trainer jetzt komplett auf Koreanisch von Hand – im mitwandernden Schreibband, Wort für Wort oder Silbe für Silbe. Die Art wählst du in den Einstellungen (Schreiben), die Tastatur bleibt als Ausweich.',
      },
      {
        icon: 'check',
        color: '#30d158',
        title: 'Lesen und prüfen',
        text: 'Mit Key liest Gemini deine Schrift, sonst Google Input Tools. Stimmt der Satz genau, zählt er sofort; sonst bewertet Gemini oder du vergleichst selbst mit dem Mustersatz.',
      },
      {
        icon: 'puzzle',
        color: '#ff9f0a',
        title: 'Wort + Partikel schreiben',
        text: 'Bei Lücken schreibst du das ganze Wort mit Partikel (친구가 statt nur 가). Ab Stufe 2 wird überwiegend geschrieben statt angetippt.',
      },
    ],
  },
  {
    id: '2026-11-particles-translate',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Ganze Sätze übersetzen',
    summary: 'Im Partikel-Training übersetzt du jetzt schon ab Stufe 2 ganze Sätze ins Koreanische – 1 pro Runde, bis zu 4 auf Profi. Mit Key bewertet Gemini, ohne Key vergleichst du selbst mit dem Mustersatz.',
    features: [],
  },
  {
    id: '2026-11-particles-newword-popup',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Neue Wörter im Partikel-Training',
    summary: 'Neue Wörter erscheinen jetzt als Pop-up direkt vor dem Satz, in dem sie vorkommen – mit Aussprache und auf Wunsch einmal schreiben. Die Prüfung, welche Wörter du schon kennst, ist deutlich strenger, die KI bekommt dein ganzes Wörterbuch für abwechslungsreichere Sätze, und die Aussprache wird schon während der Vorbereitung erzeugt.',
    features: [],
  },
  {
    id: '2026-11-particles-strict',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Partikel-Training nach deinen Regeln',
    features: [
      {
        icon: 'puzzle',
        color: '#0a84ff',
        title: 'Nur deine Partikeln',
        text: 'Abgefragt werden nur die Partikeln, die du ausgewählt hast – auch auf Profi. Andere stehen schon ausgefüllt im Satz, und die Antwortknöpfe zeigen nur deine Partikeln.',
      },
      {
        icon: 'check',
        color: '#30d158',
        title: 'Sätze aus deinen Wörtern',
        text: 'Die App prüft jeden Satz gegen dein Wörterbuch. Neue Wörter gibt es nur wenige: auf Stufe 1–2 keine, dann 2, 4 und auf Profi höchstens 6 pro Runde.',
      },
      {
        icon: 'sparkles',
        color: '#ff9f0a',
        title: 'Neue Wörter vorgestellt',
        text: 'Vor der Runde siehst du jedes neue Wort mit Bedeutung, im Satz ist es unterstrichen. Bei kleinem Wortschatz kommen pro Runde ein paar Grundwörter dazu – behalten landet im Ordner „Partikel-Trainer“.',
      },
    ],
  },
  {
    id: '2026-11-landscape-strip',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Querformat: maximal Platz zum Schreiben',
    summary: 'Quer gehalten steht das Wort mit Bedeutung und Aussprache in einer schmalen Leiste oben, darunter füllt das Zeichenfeld den ganzen Bildschirm. Löschen, Rückgängig, Vorlage, Tastatur und Strichreihenfolge sitzen als kleine Knöpfe neben „Prüfen“ – die Strichreihenfolge öffnet sich als Blase mit X.',
    features: [],
  },
  {
    id: '2026-11-landscape-polish',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Querformat aufgeräumt',
    summary: 'Im Querformat zeigt die linke Spalte nur noch Wort, Bedeutung und Aussprache, die Knöpfe sind kleiner und die Dynamic Island verdeckt nichts mehr – auch in Chrome. Die Prüfen-Blase öffnet sich ruhiger, und die langsame Aussprache hält ihr Tempo gleichmäßiger.',
    features: [],
  },
  {
    id: '2026-11-writing-bubble',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Schreiben, neu gedacht',
    features: [
      {
        icon: 'sparkles',
        color: '#0a84ff',
        title: 'Prüfen-Blase',
        text: '„Prüfen“ schwebt jetzt als kleine Blase unten rechts und verdeckt nichts mehr. Das Ergebnis wächst mit einer Animation direkt aus der Blase heraus.',
      },
      {
        icon: 'layers',
        color: '#5e5ce6',
        title: 'Handy quer halten',
        text: 'Im Querformat steht das Wort links und das Zeichenfeld nimmt fast den ganzen Bildschirm ein. Die Navigation wird zur schmalen Leiste.',
      },
      {
        icon: 'pointer',
        color: '#30d158',
        title: 'Kein Markieren mehr',
        text: 'Beim Zeichnen auf dem Handy wird kein Text mehr blau markiert.',
      },
      {
        icon: 'cloud',
        color: '#ff9f0a',
        title: 'Erst laden, dann erstellen',
        text: 'Auf einem neuen Gerät holt die App zuerst die Stimmen aus deinem Konto bzw. Drive und erstellt nur, was noch fehlt.',
      },
    ],
  },
  {
    id: '2026-11-slow-sync',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Langsame Aussprache überall',
    summary: 'Die langsame Gemini-Aussprache wird jetzt für alle Wörter erstellt und mit deinem Konto bzw. Drive abgeglichen. Löschst du ein Wort, verschwinden auch seine Aufnahmen, auf dem Gerät und im Abgleich.',
    features: [],
  },
  {
    id: '2026-11-voice-progress',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Fortschritt der Stimmen',
    summary: 'Während Gemini-Stimmen erstellt werden, zeigt eine kleine Anzeige, wie viele noch übrig sind und wie lange es ungefähr dauert; aufgeklappt getrennt nach Koreanisch, Deutsch und langsam. In der Wortliste siehst du jetzt auch, ob die langsame Fassung schon da ist.',
    features: [],
  },
  {
    id: '2026-11-import-offline',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Scannen auch ohne Key',
    features: [
      {
        icon: 'layers',
        color: '#0a84ff',
        title: 'Texterkennung ohne Key',
        text: 'Fotos und PDFs von gedruckten Vokabellisten werden jetzt auch ohne Gemini-Key gelesen – direkt im Browser, nach einmaligem Laden auch offline.',
      },
      {
        icon: 'sparkles',
        color: '#bf5af2',
        title: 'Fehlende Übersetzungen ergänzt',
        text: 'Steht nur Koreanisch oder nur Deutsch da, ergänzt die App die andere Sprache (Gemini, sonst Google Übersetzer) und markiert sie gelb mit „bitte prüfen“.',
      },
      {
        icon: 'check',
        color: '#34c759',
        title: 'Nichts geht verloren',
        text: 'Wörter ohne Übersetzung werden trotzdem gespeichert; ein Fenster erinnert dich beim Start daran. Außerdem erkennt die App Wortarten besser – 바다 ist jetzt ein Nomen.',
      },
    ],
  },
  {
    id: '2026-11-conjugation-voice',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Beugungsformen vorlesen',
    summary: 'Im Beugungs-Trainer wird die richtige Form nach deiner Antwort vorgelesen (auch langsam). Die nächsten Formen werden schon vorbereitet, auch auf den Lernkarten. Diese Aufnahmen bleiben auf dem Gerät, abgeglichen werden nur deine Vokabeln.',
    features: [],
  },
  {
    id: '2026-11-slow-choice',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Langsam: Gemini oder 0,75×',
    summary: 'Du wählst, wie „Langsam“ klingt: eigene ruhige Gemini-Aufnahme oder die normale mit 0,75×. Die Kennzeichen (KO, DE, Schnecke für langsam) sitzen jetzt oben rechts auf der Karte und werden unter Audio & Lernen erklärt.',
    features: [],
  },
  {
    id: '2026-11-slow-voice',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Langsam anhören',
    summary: 'Mit dem Schnecken-Knopf hörst du Wörter und Sätze langsam und deutlich – als eigene ruhige Gemini-Aufnahme, bis dahin die normale mit 75 % Tempo. Übungen bereiten die nächsten Aufgaben (auch langsam) schon vor. Abgeglichen werden nur normale Wort-Aufnahmen; Sätze und langsame Aufnahmen bleiben auf dem Gerät.',
    features: [],
  },
  {
    id: '2026-11-voice-check-fix',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Zuverlässigere Prüfung der Aufnahmen',
    summary: 'Die Prüfung der Gemini-Aufnahmen verwirft richtige Sätze nicht mehr, wenn das Prüfmodell den Anfang doppelt hört. Sätze bekommen bis zu 5 Versuche, Wörter 3.',
    features: [],
  },
  {
    id: '2026-11-voices-sync-sentences',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Gemini-Stimme für Sätze, Abgleich der Aufnahmen',
    summary: 'Auch Sätze (Partikel-Übungen, Beispielsätze) klingen jetzt natürlich mit der Gemini-Stimme. Mit Konto oder Drive werden die Aufnahmen komprimiert zwischen deinen Geräten abgeglichen, und unter Audio & Lernen kannst du alle Stimmen neu erzeugen.',
    features: [],
  },
  {
    id: '2026-11-voices-status',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Gemini-Stimme für alle Wörter',
    summary: 'Jedes Wort zeigt jetzt mit kleinen KO/DE-Kennzeichen, ob die Gemini-Stimme bereit ist oder gerade erstellt wird. Fehlende Aufnahmen (Koreanisch und Deutsch) entstehen automatisch im Hintergrund, alle TTS-Ersatzmodelle werden genutzt (bestes zuerst) und jede Aufnahme behält sicher deine gewählte Stimme.',
    features: [],
  },
  {
    id: '2026-11-voices',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Natürliche Aussprache',
    features: [
      {
        icon: 'volume',
        color: '#ff3b30',
        title: 'Gemini-Stimme für Wörter',
        text: 'Mit Key klingen Wörter jetzt natürlich: einmal aufgenommen, doppelt geprüft (nichts abgeschnitten) und gespeichert – danach sofort und ohne Anfrage.',
      },
      {
        icon: 'sparkles',
        color: '#bf5af2',
        title: 'Vier Stimmen zur Wahl',
        text: 'Zwei weibliche, zwei männliche – mit Hörprobe unter Einstellungen → Audio & Lernen. Neue Wörter werden nach dem Import im Hintergrund vorbereitet.',
      },
      {
        icon: 'check',
        color: '#34c759',
        title: 'Beste Systemstimme',
        text: 'Ohne Key oder bis zur fertigen Aufnahme spricht automatisch die natürlichste installierte Stimme – oder die, die du auswählst.',
      },
    ],
  },
  {
    id: '2026-11-particles',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Der Partikel-Trainer',
    features: [
      {
        icon: 'puzzle',
        color: '#bf5af2',
        title: '10 Partikeln, Schritt für Schritt',
        text: 'Unter Üben → Partikel: 이/가 bis 에서 als Kapitel. Kennst du eine schon, reicht ein kurzer Check – sonst Erklärung, Aufwärmen und Mini-Test.',
      },
      {
        icon: 'gauge',
        color: '#ff9f0a',
        title: 'Fünf Stufen oder Auto',
        text: 'Von Einsteiger bis Profi: Lücke wählen, von Hand schreiben, ganze Sätze übersetzen. Auto passt die Stufe an deine Trefferquote an.',
      },
      {
        icon: 'sparkles',
        color: '#0a84ff',
        title: 'Sätze aus deinen Wörtern',
        text: 'Mit Gemini-Key entstehen Übungssätze aus deinem Wortschatz; neue Wörter übernimmst du am Ende per Häkchen. Ohne Key: 500 eingebaute Sätze.',
      },
    ],
  },
  {
    id: '2026-11-skip-button-live-fix',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Überspringen neben Prüfen',
    summary: '„Überspringen“ und „Ich weiß es nicht“ sitzen jetzt direkt neben „Prüfen“. Der Live-Abgleich mit Konto zeigt Änderungen anderer Geräte zuverlässig ohne Neuladen an, auch wenn deren Uhr etwas abweicht.',
    features: [],
  },
  {
    id: '2026-11-quiz-skip-live-sync',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Überspringen, Zielordner, Live-Abgleich',
    summary: 'Im Quiz kannst du Fragen überspringen (sie kommen am Ende wieder, dann mit „Ich weiß es nicht“) und falsche Wörter direkt im Lernmodus üben. Der Scanner speichert in einen Ordner deiner Wahl. Mit Konto gleichen Geräte jetzt sofort ab, ohne Neuladen.',
    features: [],
  },
  {
    id: '2026-11-accounts',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Hangul-Studio-Konto',
    features: [
      {
        icon: 'cloud',
        color: '#0a84ff',
        title: 'Anmelden statt Drive',
        text: 'Melde dich mit Google oder E-Mail an – dein Lernstand ist dann auf allen Geräten gleich und du bleibst angemeldet.',
      },
      {
        icon: 'shield',
        color: '#34c759',
        title: 'In Frankfurt gespeichert',
        text: 'Nur du kannst deine Daten lesen. Konto und Daten löschst du mit einem Klick – auf Wunsch mit Sicherung vorher.',
      },
      {
        icon: 'layers',
        color: '#ff9500',
        title: 'Du entscheidest',
        text: 'Nur auf diesem Gerät, Google Drive oder Konto: Wähle unter Einstellungen → Sync & Backup. Es ist immer nur eins aktiv.',
      },
      {
        icon: 'sparkles',
        color: '#af52de',
        title: 'App mitverbessern',
        text: 'Freiwillig: Fehler der Handschrift-Erkennung ohne Bezug zu dir teilen, damit die Erkennung besser wird.',
      },
    ],
  },
  {
    id: '2026-11-storage-choice',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Speicherort wählen',
    summary: 'Unter Sync & Backup wählst du jetzt, wo deine Daten liegen (nur dieses Gerät oder Google Drive) und kannst die Daten in Google Drive mit einem Klick löschen – auf Wunsch mit Sicherung vorher.',
    features: [],
  },
  {
    id: '2026-11-notes-dictation',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Beispielsätze, Notizen und Diktat',
    features: [
      {
        icon: 'sparkles',
        color: '#5856d6',
        title: 'Beispielsätze',
        text: 'Beim Lernen zeigt jede Karte zwei Beispielsätze zum Anhören. Mit API-Key schreibt Gemini sie passend zu deinem Lernstand.',
      },
      {
        icon: 'pin',
        color: '#ff9500',
        title: 'Eigene Notizen',
        text: 'Halte Eselsbrücken direkt am Wort fest – auf der Lernkarte oder beim Bearbeiten.',
      },
      {
        icon: 'ear',
        color: '#007aff',
        title: 'Diktat',
        text: 'Neu unter „Üben“: Koreanisch hören und aufschreiben – oder hören und die Bedeutung tippen.',
      },
      {
        icon: 'check',
        color: '#34c759',
        title: 'Vorlesen ohne Verraten',
        text: 'Im Test wird nur die gefragte Sprache vorgelesen, die Lösung bleibt verborgen.',
      },
    ],
  },
  {
    id: '2026-11-smart-fsrs',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Smart-Modus und Lernstand',
    features: [
      {
        icon: 'sparkles',
        color: '#5856d6',
        title: 'Wiederholen wie Anki',
        text: 'Jedes Wort bekommt pro Richtung einen eigenen Wiederholungstermin (FSRS). Smart fragt zuerst ab, was du am ehesten vergisst.',
      },
      {
        icon: 'check',
        color: '#34c759',
        title: 'Genauer bewertet',
        text: 'Statt nur richtig/falsch zählt auch, wie schnell du warst und ob die Prüfung sicher war. Bisherige Lernstände wurden übernommen.',
      },
      {
        icon: 'layers',
        color: '#007aff',
        title: 'Eine Auswahl für alles',
        text: 'Lernen und Quiz wählen Wörter gleich aus: Smart, Ordner, Tags oder einzeln.',
      },
      {
        icon: 'gauge',
        color: '#ff9500',
        title: 'Dein Lernstand',
        text: 'Die Startseite zeigt deine Stufe von 1 bis 10 und was bis zur nächsten fehlt.',
      },
    ],
  },
  {
    id: '2026-11-folders',
    size: 'major',
    title: 'Neu in Hangul Studio',
    subtitle: 'Ordner für deine Wörter',
    features: [
      {
        icon: 'folder',
        color: '#007aff',
        title: 'Ordner bis 3 Ebenen',
        text: 'Sortiere Wörter z. B. nach Kurs › Lektion › Teil. Unter „Wörter“ legst du Ordner an, benennst sie um oder löschst sie.',
      },
      {
        icon: 'check',
        color: '#34c759',
        title: 'Mehrere auf einmal',
        text: 'Mit „Auswählen“ markierst du mehrere Wörter und verschiebst oder taggst sie in einem Schritt.',
      },
      {
        icon: 'layers',
        color: '#ff9500',
        title: 'Kapitel werden Ordner',
        text: 'Hast du Tags wie #Kapitel1, bietet die App einmal an, daraus Ordner zu machen.',
      },
      {
        icon: 'shield',
        color: '#af52de',
        title: 'Mehr Platz, sicher umgezogen',
        text: 'Deine Daten liegen jetzt in einem größeren Speicher des Browsers. Vor dem Umzug wurde automatisch eine Sicherungskopie angelegt.',
      },
    ],
  },
  {
    id: '2026-11-model-order',
    size: 'minor',
    title: 'Neu in Hangul Studio',
    subtitle: 'Schnellere Handschrift-Prüfung',
    summary: 'Die Handschrift-Prüfung fragt jetzt zuerst Gemini 3.1 Flash Lite – im Test das genaueste und schnellste Modell. Ein nicht mehr verfügbares Modell wurde entfernt.',
    features: [],
  },
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
