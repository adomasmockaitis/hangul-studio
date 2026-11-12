<div align="center">

# 한 Hangul Studio

**Koreanisch lernen – mit der Hand schreiben, von KI prüfen lassen und gezielt wiederholen.**

Eine schlichte Web-App im Apple-Look (iOS/macOS), die komplett im Browser läuft.

**[▶ Jetzt ausprobieren](https://adomasmockaitis.github.io/hangul-studio/)**

</div>

---

## Inhalt

- [Features](#features)
- [Die Handschrift-Prüfung](#die-handschrift-prüfung)
- [Erste Schritte](#erste-schritte)
- [Bedienung im Überblick](#bedienung-im-überblick)
- [Vokabeln importieren](#vokabeln-importieren)
- [Daten, Backup und Datenschutz](#daten-backup-und-datenschutz)
- [Entwickler-Export](#entwickler-export)
- [Technik](#technik)
- [Entwicklung und Veröffentlichung](#entwicklung-und-veröffentlichung)
- [Grenzen und Hinweise](#grenzen-und-hinweise)

---

## Features

### Lernen
- **Lernkarten** mit koreanischem Grundwort, deutscher Bedeutung (groß direkt am Zeichenfeld), Audio (Sprachausgabe `ko-KR`) und optionaler Aussprachehilfe in Hangul (z. B. `[학꾜]`, nie Romanisierung).
- **Beugungsformen** bei Verben und Adjektiven zum Aufklappen: Präsens höflich (-아요/-어요), Präsens formell (-습니다/-ㅂ니다), Vergangenheit und Zukunft. Welche Formen angezeigt werden, stellst du ein.
- **Filter und Sortierung** nach Tags (`#Verb`, `#Nomen`, `#Kapitel1` …) und Hinzufügedatum.
- **Daily Smart Test:** wählt bis zu 15 Wörter nach Fehlerquote, Wiederholungs-Abstand und „noch nie geübt“ (eine einfache Spaced-Repetition-Logik mit `easeFactor` und `streak`).

### Handschrift-Zeichenfeld
- Funktioniert mit **Maus, Trackpad, Finger und Stift** (Pointer Events, mit Druckempfindlichkeit beim Stift; kein versehentliches Scrollen).
- Hintergründe: **Weiß, Kariert, Liniert, Hangul-Silbenraster**; optional eine blasse **Wort-Vorlage** zum Nachspuren.
- Werkzeuge direkt am Feld: Löschen, Rückgängig, Strichdicke. Zusätzlich ein Umschalter **„Tastatur statt Zeichnen“**.

### Strichreihenfolge
- Jede Silbe wird als **ein Block** gezeigt, so wie du sie schreibst (Anlaut links/oben, Vokal rechts oder unten, Endlaut unten).
- Zwei Darstellungen: **Zahlen & Pfeile** oder **Animation** (strikt nacheinander: Silbe → Buchstabe → Strich, mit Pause/Wiederholen und 1x/0,5x).
- Jeder Strich hat eine eigene Farbe. Die Strichformen sind an eine echte Handschrift angelehnt. Die Anzeige lässt sich minimieren.

### Quiz und Beugungs-Trainer
- **Quiz:** Auswahl per Daily Smart Test oder eigener Filter (Tags, Zeitraum, Anzahl). Richtungen: Deutsch → Koreanisch, Koreanisch → Deutsch (tippen oder Multiple Choice), gemischt und **Hör-Diktat** (nur Audio, du schreibst das Wort).
- **Beugungs-Trainer:** Lern- und Testmodus. Du bildest die gefragte Form per Hand („Bilde *Präsens – Höflich* von: *essen*“). Grundwort in der Frage auf Deutsch, Koreanisch oder beidem.
- **Auswertung** nach jedem Durchgang: Erfolgsquote, Tages-Streak, alle Wörter mit Lösung, bei Fehlern dein gezeichnetes Bild. Mit „Nur falsche Wörter sofort wiederholen“.

### Wörterbuch und Upload
- Suchen, nach Tag filtern, sortieren (neueste, älteste, höchste Fehlerquote), Wörter anlegen, bearbeiten, löschen.
- **Intelligenter Datei-Scanner** (mit Gemini): zieh PDFs, Screenshots/Fotos (PNG/JPG/WebP), TXT, CSV oder JSON hinein, oder füge Text ein. Die KI zieht alle Vokabeln heraus, stellt Verben/Adjektive auf die Grundform (-다) und ergänzt Übersetzung, Aussprachehilfe, Tags und alle vier Beugungen.
- **Editierbare Vorschau-Tabelle** vor dem Speichern, mit Tags für den ganzen Upload (z. B. `#Kapitel1`). Bereits vorhandene Wörter werden erkannt.

### Dashboard und Komfort
- Dashboard mit Tages-Streak, gelernten Wörtern, Erfolgsquote, Top-Fehlerwörtern und 7-Tage-Aktivität.
- **Onboarding** beim ersten Start: führt Schritt für Schritt durch alle Einstellungen, mit Live-Vorschauen und Ausprobier-Zeichenfeld. Jederzeit neu startbar.
- **Hinweise oben rechts** (z. B. „Synchronisiert“ oder „Bitte erneut anmelden“) und ein **„Das ist neu“-Fenster** bei Updates, das neue Funktionen zeigt und direkt zum Einrichten führt (z. B. Google verbinden).
- **Dezente Klänge** (richtig, falsch, geschafft), synthetisiert im Browser. Lautstärke und Ein/Aus einstellbar.
- Hell-/Dunkelmodus (oder System), Navigation per Sidebar (Desktop) bzw. Tab-Leiste (Mobil/Tablet).
- **Backup** als `.json` zum Übertragen zwischen PC, Tablet und Smartphone.
- **Google-Drive-Synchronisation** (optional): gleicht Vokabeln, Lernstand und Einstellungen automatisch zwischen deinen Geräten ab, über einen versteckten App-Ordner in *deinem* Drive. Einrichtung: [docs/GOOGLE-DRIVE-SYNC.md](docs/GOOGLE-DRIVE-SYNC.md).

---

## Die Handschrift-Prüfung

Beim Klick auf **Prüfen** werden bis zu drei Methoden in einer von dir festgelegten **Reihenfolge** ausprobiert (Einstellungen → Zeichenfeld). Fällt eine aus, geht es automatisch mit der nächsten weiter:

| Methode | Was sie tut | Voraussetzung |
|---|---|---|
| **Gemini** (KI-Bild) | Liest dein Bild und vergleicht mit dem Zielwort. Am genauesten, kann optional **Schreib-Tipps** geben, wenn die Schrift richtig, aber unsauber ist. | kostenloser API-Key |
| **Input Tools** | Erkennt deine **Strichkoordinaten** (kein Bild). Sehr schnell und ohne Key, etwas ungenauer (z. B. ㅏ/ㅓ). | – |
| **Selbst-Check** | Zeigt die Musterlösung, du bewertest dich selbst („Richtig gewusst“ / „Noch unsicher“). | – |

Standardreihenfolge: **Gemini → Input Tools → Selbst-Check**.

**Gut zu wissen**
- **Sofort-Vorschau:** Ist Gemini zuerst dran, läuft Input Tools parallel und zeigt nach Sekundenbruchteilen ein *vorläufiges* Ergebnis, bis Gemini antwortet.
- **Zeitlimit:** Du legst fest, wie lange Gemini brauchen darf. Längere Wörter bekommen automatisch etwas mehr Zeit (bis +2 s), mit Schreib-Tipps gilt die Basiszeit ×1,5. Danach springt die App zur nächsten Methode und warnt, dass Input Tools ungenauer ist.
- **Modell-Kette mit Fallback:** `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3-flash` → `gemini-3.6-flash` → `gemini-3.8-flash`. Bei Überlastung (503/429), 404 oder Zeitüberschreitung wird **ohne Wartezeit** zum nächsten Modell gewechselt. Das zuletzt funktionierende Modell wird gemerkt und zuerst probiert. Ein Speed-Test in den Einstellungen zeigt, welches Modell bei dir am schnellsten ist.
- **Start-Check und Status-Pille:** Beim Start prüft die App im Hintergrund (höchstens alle 30 Minuten) mit einem winzigen Ping, ob die KI erreichbar ist. Die Pille zeigt 🟡 verbindet, 🟢 bereit (Modell + Antwortzeit) oder ⚪/🔴 Offline. Ein Klick löst einen neuen Check aus.
- **Widerspruch:** Bei Gemini-Ergebnissen gibt es einen Button, wenn die KI sich irrt. Dein Urteil korrigiert auch deine Lernstatistik.

---

## Erste Schritte

### Online nutzen
Öffne **https://adomasmockaitis.github.io/hangul-studio/**. Beim ersten Start führt dich das Onboarding durch die Einrichtung.

### Gemini-API-Key (optional, empfohlen)
1. Auf [Google AI Studio](https://aistudio.google.com/apikey) einen kostenlosen Key erstellen.
2. Im Onboarding oder unter *Einstellungen → KI & Prüfung* eintragen.

Ohne Key funktionieren Lernen, Quiz, Beugungs-Trainer, **Input Tools** und der **Selbst-Check** trotzdem. Nur der Datei-Scanner und die Gemini-Prüfung brauchen den Key.

### Lokal starten

```bash
npm install
npm run dev
```

Dann `http://localhost:5173` öffnen.

---

## Bedienung im Überblick

| Bereich | Wofür |
|---|---|
| **Dashboard** | Stand auf einen Blick, Start des Daily Smart Tests. |
| **Wörterbuch & Upload** | Wörter verwalten, Dateien/Übungsblätter einlesen. |
| **Lernen & Quiz** | *Lernen:* Karten mit Zeichenfeld. *Quiz:* Abfragemodi inkl. Hör-Diktat. |
| **Beugungs-Trainer** | Verb- und Adjektivformen schreiben (Lern- und Testmodus). |
| **Einstellungen** | Theme, KI, Prüf-Reihenfolge, Zeichenfeld, Strichreihenfolge, Audio, Beugungen, Backup, Entwickler. |

---

## Vokabeln importieren

Im Wörterbuch lassen sich Dateien per Drag-and-Drop einlesen:

- **PDF / Bild / TXT / eingefügter Text** → werden mit Gemini ausgewertet (Key nötig). Ohne Key wird Text als Tabelle gelesen.
- **CSV / TSV** und **JSON** werden direkt eingelesen. Eine CSV-Vorlage gibt es als Button.

CSV-Spalten (Trennzeichen `;`, `,` oder Tab, Kopfzeile optional):

```text
korean;german;pronunciation;wordType;tags;presentPolite;presentFormal;pastPolite;futurePolite
먹다;essen;[먹따];verb;#Verb #Alltag;먹어요;먹습니다;먹었어요;먹을 거예요
학교;Schule;[학꾜];noun;#Nomen #Ort;;;;
```

`wordType` ist `verb`, `adjective`, `noun` oder `other`. Vor dem Speichern prüfst und bearbeitest du alles in einer Vorschau-Tabelle.

---

## Daten, Backup und Datenschutz

- **Alles liegt lokal im Browser** (`localStorage`): Vokabeln, Lernstand, Einstellungen und API-Key. Es gibt keinen eigenen Server und kein Konto.
- Daten gelten **pro Gerät und pro Adresse**. Die gehostete Seite und `localhost` haben getrennte Daten.
- **Umziehen:** *Einstellungen → Backup → Exportieren* und auf dem anderen Gerät *Importieren* (zusammenführen oder ersetzen). Der API-Key ist nur auf Wunsch im Backup.
- **Automatisch abgleichen (optional):** Mit der Google-Drive-Synchronisation (*Einstellungen → Synchronisation*) wird dein Stand in einer einzigen Datei im versteckten App-Ordner deines eigenen Drive gehalten. Die App fragt dafür nur den Zugriff auf diesen App-Ordner an (`drive.appdata`), nicht auf deine anderen Dateien. Jede Person, die sich anmeldet, nutzt ihr eigenes Konto und ihren eigenen Ordner; der Betreiber der Seite sieht keine Daten. Zusammenführung: pro Wort gewinnt die neuere Änderung, beim Lernstand gehen keine Zähler verloren, gelöschte Wörter werden übertragen. Der API-Key wird nur auf ausdrücklichen Wunsch mitsynchronisiert. Details und Einrichtung: [docs/GOOGLE-DRIVE-SYNC.md](docs/GOOGLE-DRIVE-SYNC.md).
- **Was ins Internet geht:**
  - **Gemini:** Bei der KI-Prüfung ein kleines Bild deiner Schrift (nur beim Prüfen), beim Datei-Scanner die hochgeladene Datei bzw. der Text, jeweils direkt an Google.
  - **Input Tools:** Die Strichkoordinaten deiner Schrift (kein Bild) an Google.
  - Sonst nichts. Es gibt keine Analyse und kein Tracking.
- Mach ab und zu ein Backup: Löschst du die Browserdaten, sind Vokabeln und Lernstand weg.

---

## Entwickler-Export

Unter *Einstellungen → Entwickler* gibt es **einen** Knopf „Alles exportieren (.zip)“. Er sammelt alles, womit sich die Erkennung verbessern lässt:

- Rückmeldungen zu Input Tools („richtig / nicht richtig erkannt“), samt Strichdaten.
- Widersprüche gegen Gemini mit Bild.
- Uneinigkeiten zwischen Input Tools und Gemini (kostet keine zusätzliche Anfrage).
- Fälle, bei denen Input Tools wegen eines Gemini-Ausfalls eingesprungen ist, werden gesammelt (10 Stück) und in **einem** Request von Gemini nachbewertet. Beim Export passiert das automatisch.

Die Datei enthält `data.json` (inkl. aktueller Prompts und Einstellungen, ohne API-Key) und einen Ordner `images/` mit allen Bildern. Das ist nur für die Weiterentwicklung gedacht.

---

## Technik

- **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **lucide-react**
- Keine Backend-Anbindung, keine Datenbank: reines Frontend
- Web Speech API (Sprachausgabe), Web Audio API (Klänge), Pointer Events und Canvas (Zeichenfeld)
- Gemini REST-API (`generateContent`) und Googles Input-Tools-Handschrifterkennung

### Projektstruktur

```text
src/
  App.tsx                 Layout, Navigation, Onboarding-Einbindung
  store.tsx               globaler Zustand, localStorage, Backup
  types.ts                Datentypen (WordItem, Settings, …)
  components/             Zeichenfeld, Strichreihenfolge, Onboarding, Quiz-Fragen, …
  views/                  Dashboard, Wörterbuch, Lernen, Quiz, Beugungs-Trainer, Einstellungen
  lib/
    gemini.ts             API-Aufrufe, Modell-Kette, Fallback, Start-Check
    inputTools.ts         Strichbasierte Handschrifterkennung
    hangul.ts, strokes.ts, syllableLayout.ts   Jamo-Zerlegung, Strichdaten, Silbenblöcke
    srs.ts                Wiederholungslogik
    sounds.ts             synthetisierte Klänge
    devExport.ts          Entwickler-Export (.zip)
    driveSync.ts, merge.ts   Google-Drive-Anbindung und Zusammenführung der Geräte-Stände
  sync.tsx                Steuerung der automatischen Synchronisation
```

---

## Entwicklung und Veröffentlichung

```bash
npm run dev         # Entwicklungsserver
npm run typecheck   # TypeScript prüfen
npm run build       # Produktions-Build nach dist/
```

Jeder Push auf `main` löst den Workflow `.github/workflows/deploy.yml` aus: TypeScript-Prüfung, Build und Veröffentlichung über **GitHub Pages** (unter dem Pfad `/hangul-studio/`).

---

## Grenzen und Hinweise

- Die **Input-Tools-Erkennung** nutzt einen inoffiziellen Google-Endpunkt. Er kann sich ändern oder wegfallen. Die App fällt dann automatisch auf die nächste Methode zurück.
- Die KI kann sich irren, besonders bei ähnlichen Vokalen (ㅏ/ㅓ, ㅗ/ㅜ) und sehr unsauberer Schrift. Dafür gibt es den Widerspruch-Button.
- Welche Modelle verfügbar sind und welche Limits gelten (Anfragen pro Minute/Tag), legt Google fest und ändert sich. Bei Fehlern wechselt die App selbst das Modell, die Auswahl lässt sich in den Einstellungen anpassen.
- Die Sprachausgabe hängt von den auf deinem Gerät installierten koreanischen Stimmen ab.
- Die Strichformen und -reihenfolgen sind an gängige Schreibweisen und eine konkrete Handschrift angelehnt, nicht an eine amtliche Norm.
