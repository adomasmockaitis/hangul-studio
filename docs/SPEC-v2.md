# Hangul Studio v2 – Spezifikation

Stand: 16.11.2026 · Ergebnis der Planungsrunde (Fragen Q1–Q49). Die bisherige Version ist als Git-Markierung `old-version` und als ZIP gesichert.

## Problem Statement

Hangul Studio kann Wörter verwalten, mit der Hand schreiben lassen, per KI prüfen und abfragen. Für ernsthaftes, längerfristiges Lernen fehlt aber einiges:

- Wörter lassen sich nur über Tags ordnen; bei wachsendem Wortschatz (mehrere Kurse, Lektionen) wird es unübersichtlich.
- Lernen, Quiz und Diktat haben jeweils eigene, uneinheitliche Auswahlmöglichkeiten. Es gibt keine echte Wiederholungsplanung – „fällig“ ist nur geschätzt.
- Die App kennt den Lernstand der Person nicht als Ganzes; Schwierigkeit, neue Inhalte und Auswahl passen sich nicht an.
- Grammatik, vor allem Partikeln, kann man gar nicht üben.
- Der Import braucht für Bilder und PDFs immer einen API-Key; fehlt eine Sprache in der Vorlage, bleibt das Wort halb leer.
- Die Sprachausgabe hängt vollständig von der Systemstimme ab und klingt je nach Gerät unnatürlich.
- Synchronisation geht nur über Google Drive; es gibt keine einfachen Konten, und der Browser-Speicher (ca. 5 MB) reicht für Audio, Sätze und Texterkennung nicht.

Alles muss weiterhin **kostenlos** bleiben (kostenloses Google-Kontingent, kostenloser Firebase-Tarif, kein eigener Server) und als statische Seite auf GitHub Pages laufen.

## Solution

Hangul Studio wird zu einer zusammenhängenden Lern-App, in der ein **gemeinsamer Lernstand** alles steuert:

- Wörter liegen in **Ordnern** (bis 3 Ebenen) und tragen **Tags**; Notizen und Beispielsätze gehören dazu.
- **Ein Auswahl-Dialog** (einzeln, Ordner, Tags, Smart) dient Lernmodus, Test und Diktat. **Smart/Auto** ist überall der einfache Standard.
- Die Wiederholung plant **FSRS** pro Wort und Richtung.
- Ein neuer **Partikel-Trainer** führt durch die 10 Partikeln aus den Unterlagen der Professorin: Erklärung → Aufwärmen → Mini-Test → Training, in fünf Schwierigkeitsstufen, mit KI-Sätzen aus dem eigenen Wortschatz oder offline aus einem eingebauten Satz-Pool.
- Der **Import** kann auch ohne Key (Offline-Texterkennung) und ergänzt fehlende Übersetzungen.
- **Natürlichere Stimmen** über Gemini (mit Zwischenspeicher), sonst die beste Systemstimme.
- Daten liegen in **IndexedDB**; synchronisiert wird wahlweise **gar nicht**, über **Google Drive** oder über ein **Hangul-Studio-Konto** (Firebase).
- Freiwillig kann man die App **mitverbessern**, indem Fehlerfälle der Handschrift-Erkennung ohne Zuordnung gesammelt werden.

Alle bisherigen Funktionen (Zeichenfeld, Strichreihenfolge, Beugungs-Trainer, Onboarding, Klänge, Neuigkeiten-Fenster, Apple-Design) bleiben erhalten.

## User Stories

### Speicher, Konten, Daten

1. Als Lernende möchte ich beim Update meine bisherigen Wörter, Lernstände und Einstellungen automatisch behalten, damit ich nicht neu anfangen muss.
2. Als Lernende möchte ich, dass vor jeder Datenumstellung automatisch ein Backup angelegt wird, damit ich bei Problemen zurück kann.
3. Als Lernende möchte ich im Onboarding wählen, ob meine Daten nur auf diesem Gerät, in Google Drive oder in einem Hangul-Studio-Konto liegen, damit ich selbst über meine Daten bestimme.
4. Als Lernende möchte ich die Speicherart später in den Einstellungen wechseln, wobei meine Daten mitziehen, damit ich mich nicht endgültig festlegen muss.
5. Als Lernende möchte ich mich mit Google oder E-Mail anmelden, damit der Abgleich zwischen Geräten ohne Google-Drive-Umweg funktioniert.
6. Als Lernende möchte ich die App ohne Konto voll nutzen können, damit ich mich nicht registrieren muss.
7. Als Lernende möchte ich offline weiterlernen und später automatisch abgleichen, damit unterwegs nichts verloren geht.
8. Als Lernende möchte ich mit einem Klick mein Konto und alle Daten löschen, damit ich die Kontrolle behalte.
9. Als Lernende möchte ich mit einem Klick meine Daten in Google Drive löschen, damit nichts zurückbleibt.
10. Als Lernende möchte ich vor jedem Löschen angeboten bekommen, ein lokales Backup herunterzuladen, damit ich nichts versehentlich verliere.
11. Als Lernende möchte ich meine Daten jederzeit exportieren, damit ich sie sichern oder mitnehmen kann.
12. Als Lernende möchte ich, dass mein Gemini-Key standardmäßig nur auf diesem Gerät bleibt und nur auf Wunsch geschützt in meinem Konto gespeichert wird, damit er nicht ungewollt weitergegeben wird.
13. Als Lernende möchte ich, dass meine Daten in der EU gespeichert werden und eine Datenschutzerklärung erklärt, was wo liegt, damit ich der App vertrauen kann.
14. Als Lernende möchte ich, dass Handschrift-Bilder nur lokal bleiben (außer ich willige ins Mitverbessern ein), damit sie nicht zentral gespeichert werden.
15. Als Lernende möchte ich freiwillig „App mitverbessern“ einschalten, damit Fehlerfälle der Erkennung (mit Bild, Zielwort, erkanntem Text, Modell, Datum) zur Verbesserung beitragen.
16. Als Lernende möchte ich, dass beim Mitverbessern keine Nutzer-ID, E-Mail oder Geräteinfo gespeichert wird, damit die Beispiele nicht zu mir zurückverfolgbar sind.
17. Als Lernende möchte ich im Einwilligungstext erfahren, dass gesendete Beispiele später nicht einzeln löschbar sind, damit ich informiert entscheide.
18. Als Entwickler möchte ich die gesammelten Mitverbessern-Daten als ZIP exportieren, damit ich Prompts und Modellwahl verbessern kann.
19. Als Entwickler möchte ich, dass nur ich die Mitverbessern-Sammlung lesen kann, damit die Daten geschützt sind.
20. Als Lernende möchte ich, dass bei erreichten Firebase-Limits nur der Abgleich pausiert und die App lokal weiterläuft, damit nie Kosten entstehen.

### Wörter, Ordner, Tags

21. Als Lernende möchte ich Ordner bis zu 3 Ebenen tief anlegen (z. B. Kurs › Lektion › Teil), damit mein Wortschatz übersichtlich bleibt.
22. Als Lernende möchte ich, dass ein Wort in genau einem Ordner oder unter „Ohne Ordner“ liegt, damit die Ablage eindeutig ist.
23. Als Lernende möchte ich Wörtern beliebig viele Tags geben, damit ich quer zu Ordnern filtern kann.
24. Als Lernende möchte ich mehrere Wörter markieren und gesammelt verschieben oder taggen, damit das Aufräumen schnell geht.
25. Als Lernende möchte ich Ordner umbenennen und löschen und beim Löschen wählen, ob die Wörter mitgelöscht oder nach „Ohne Ordner“ verschoben werden, damit nichts ungewollt verschwindet.
26. Als bestehende Nutzerin möchte ich beim ersten Start angeboten bekommen, Kapitel-/Lektions-Tags in Ordner umzuwandeln, damit ich nicht alles von Hand sortieren muss.
27. Als Lernende möchte ich zu jedem Wort eine Notiz schreiben, damit ich mir Eselsbrücken merken kann.
28. Als Lernende möchte ich bis zu zwei Beispielsätze pro Wort sehen, zuerst aus der Satz-Datenbank, damit ich das Wort im Zusammenhang lerne.
29. Als Lernende möchte ich fehlende Beispielsätze per Knopf von Gemini erzeugen lassen, und einstellen (auch im Onboarding), ob das automatisch geschieht.
30. Als Lernende möchte ich Wörter mit fehlender Übersetzung in der Liste deutlich markiert sehen, damit ich sie nachtragen kann.

### Import

31. Als Lernende möchte ich Vokabeln weiterhin von Hand eintragen.
32. Als Lernende mit Key möchte ich Bilder, PDFs und unordentliche Notizen von Gemini auslesen lassen.
33. Als Lernende ohne Key möchte ich sauber gedruckte Vorlagen offline per Texterkennung einlesen, damit der Import auch ohne Key funktioniert.
34. Als Lernende möchte ich vor dem ersten Offline-Scan erfahren, dass einmalig ca. 10–15 MB Sprachdaten geladen und dann gespeichert werden.
35. Als Lernende möchte ich, dass fehlende Übersetzungen beim Import automatisch ergänzt werden (Gemini, sonst inoffizielles Google Translate), und als „bitte prüfen“ markiert sind.
36. Als Lernende möchte ich, dass nicht übersetzbare Wörter trotzdem gespeichert werden und ein Hinweisfenster sie bei jedem App-Start auflistet, bis sie ausgefüllt oder gelöscht sind.
37. Als Lernende möchte ich im Hinweisfenster Übersetzungen direkt eintragen, „Nochmal automatisch übersetzen“ oder „Später“ wählen.
38. Als Lernende möchte ich, dass Wörter ohne Übersetzung in der fehlenden Richtung nicht abgefragt werden.
39. Als Lernende möchte ich in der Import-Vorschau den Zielordner wählen; vorgeschlagen ist ein neuer Ordner nach dem Dateinamen.
40. Als Lernende möchte ich, dass die KI pro Wort Tags vorschlägt, die ich in der Vorschau ändern kann.
41. Als Lernende möchte ich, dass neue Wörter nach dem Import im Hintergrund für die Sprachausgabe vorbereitet werden.

### Auswahl, Smart-Modus, Lernstand

42. Als Lernende möchte ich in Lernmodus, Test und Diktat dieselbe Auswahl haben: einzelne Wörter, Ordner, Tags oder Smart.
43. Als Lernende möchte ich überall einen Auto/Smart-Modus als Standard, damit ich nicht nachdenken muss, was ich üben soll.
44. Als Lernende möchte ich, dass jedes Wort pro Richtung einen eigenen Wiederholungstermin hat, damit „fällig“ genau stimmt.
45. Als Lernende möchte ich, dass die App die Qualität meiner Antwort selbst abstuft (falsch / im zweiten Versuch / richtig aber langsam oder mit Hilfe / richtig und schnell), damit die Planung genauer wird.
46. Als Lernende möchte ich, dass sich die Planung nach genügend Wiederholungen an mein persönliches Vergessen anpasst.
47. Als Lernende möchte ich, dass unsichere KI-Prüfungen und Fälle, denen ich widersprochen habe, schwächer zählen.
48. Als Lernende möchte ich auf der Startseite meinen Lernstand als Stufe 1–10 sehen und was mir zur nächsten Stufe fehlt.
49. Als bestehende Nutzerin möchte ich aus meinen bisherigen Daten eingestuft werden.
50. Als neue Nutzerin möchte ich im Onboarding eine freiwillige Kurz-Einstufung (ca. 2 Minuten) machen oder auf Stufe 1 starten.

### Lernmodus, Test, Diktat

51. Als Lernende möchte ich im Lernmodus Wort, Audio, Notiz und Beispielsätze sehen.
52. Als Lernende möchte ich im Lernmodus automatisch Koreanisch und Deutsch vorgelesen bekommen.
53. Als Lernende möchte ich im Test nur die abgefragte Ausgangssprache vorgelesen bekommen, damit nichts verraten wird.
54. Als Lernende möchte ich in beide Richtungen abgefragt werden.
55. Als Lernende möchte ich bei Koreanisch → Deutsch tolerant geprüft werden (jede eingetragene Bedeutung zählt, Groß-/Kleinschreibung, Artikel und kleine Tippfehler egal).
56. Als Lernende möchte ich „Ich hatte recht“ drücken können, wenn eine richtige Antwort als falsch gewertet wurde.
57. Als Lernende möchte ich ein Diktat „Koreanisch hören → Koreanisch schreiben“ (tippen oder von Hand).
58. Als Lernende möchte ich ein Diktat „Koreanisch hören → Deutsch tippen“ zum Hörverstehen.
59. Als Lernende möchte ich jedes Wort jederzeit per Knopf noch einmal anhören.

### Partikel-Trainer

60. Als Lernende möchte ich die 10 Partikeln aus den Unterlagen üben: 이/가, 을/를, 은/는, 과/와/하고, 도, 만, 의, 에게/한테/께, 에 (Ort, Richtung, Zeit, gut/schlecht für, Ursache), 에서 (Handlungsort, Herkunft).
61. Als Lernende möchte ich, dass eine Partikel ein Kapitel ist und ihre Verwendungen einzelne Lektionen mit eigenem Fortschritt.
62. Als Lernende möchte ich alle Partikeln jederzeit öffnen können, mit einer empfohlenen, nummerierten Reihenfolge.
63. Als Lernende möchte ich beim ersten Öffnen gefragt werden, ob ich die Partikel kenne.
64. Als Lernende, die „kenne ich schon“ wählt, möchte ich einen Check mit 5 Aufgaben; bestehe ich, geht es direkt ins Training, sonst wird die Erklärung empfohlen (überspringen bleibt möglich).
65. Als Lernende, die eine Partikel nicht kennt, möchte ich eine verständliche Erklärung mit Regel, Merkhilfe, Beispielen und typischen Verwechslungen, dann eine Aufwärmübung und einen Mini-Test.
66. Als Lernende möchte ich mehrere Partikeln gleichzeitig auswählen oder „Alle gelernten mischen“, damit ich abwechslungsreich übe.
67. Als Lernende möchte ich, dass gemischte Übungen nach meinen Schwächen gewichtet sind und gezielt Verwechslungspaare (에/에서, 은/는 vs. 이/가) abfragen.
68. Als Lernende möchte ich die Aufgabenarten Lücke mit Auswahl, Lücke zum Tippen oder von Hand, richtige Form wählen und Satz übersetzen.
69. Als Lernende möchte ich, dass Lücken sofort geprüft werden, ohne KI.
70. Als Lernende im Prüfungsmodus möchte ich, dass freie Antworten gesammelt und am Ende in einer einzigen Anfrage bewertet werden.
71. Als Lernende möchte ich zu jeder Aufgabe ausklappbare Tipps.
72. Als Lernende möchte ich zwischen fünf Stufen wählen (Einsteiger, Anfänger, Mittel, Fortgeschritten, Profi) oder Auto nutzen.
73. Als Lernende möchte ich, dass Auto die Stufe nach Trefferquote (über 85 % → höher, unter 60 % → tiefer über die letzten 20 Aufgaben), Wortschatz und Lernstand anpasst.
74. Als Lernende mit Key möchte ich, dass die KI Übungssätze vor allem aus meinen eigenen Wörtern bildet.
75. Als Lernende möchte ich einstellen (auch im Onboarding), ob die KI neue Wörter einbauen darf.
76. Als Lernende möchte ich, dass neue Wörter seltener kommen, solange mein Stand niedrig ist (Stufe 1–3: höchstens 1 pro Satz, 3 pro Runde und nur bei Bedarf; 4–7: 1 pro Satz, 5 pro Runde; 8–10: 2 pro Satz, 8 pro Runde).
77. Als Lernende möchte ich unbekannte Wörter im Satz direkt mit Übersetzung sehen.
78. Als Lernende möchte ich am Ende einer Runde neue Wörter per Häkchen in den Ordner „Aus Partikel-Übungen“ übernehmen.
79. Als Lernende ohne Key möchte ich mit einem eingebauten Pool von 50 Sätzen pro Partikel (10 je Stufe) üben.
80. Als Lernende möchte ich, dass erzeugte Sätze gespeichert und gemischt mit neuen wiederholt werden.

### Sprachausgabe

81. Als Lernende möchte ich, dass die App automatisch die beste installierte koreanische und deutsche Systemstimme wählt.
82. Als Lernende möchte ich in Onboarding und Einstellungen aus allen installierten Stimmen wählen und sie probehören.
83. Als Lernende mit Key möchte ich eine natürlicher klingende Gemini-Stimme wählen können, aus vier Stimmen (2 weiblich, 2 männlich) mit Hörprobe.
84. Als Lernende möchte ich, dass Gemini-Aufnahmen pro Wort, Stimme und Quelle gespeichert werden, damit sie sofort und ohne erneute Anfrage abspielen.
85. Als Lernende möchte ich, dass bis zur fertigen Aufnahme die Systemstimme spricht, ohne Wartezeit.
86. Als Lernende möchte ich, dass Sätze in Übungen live von der Systemstimme gesprochen werden.

### KI-Key, Kontingent, Onboarding

87. Als Lernende ohne Key möchte ich KI-Funktionen sehen, aber als „nur mit API-Key“ markiert, mit Knopf „Key hinzufügen“.
88. Als Lernende möchte ich ein verständliches Tutorial, wie ich einen kostenlosen Key bekomme – auch im Onboarding.
89. Als Lernende möchte ich im Tutorial erfahren, dass Google ein Mindestalter von 18 verlangt und im kostenlosen Kontingent Ein- und Ausgaben einsehen kann.
90. Als Lernende möchte ich in den Einstellungen sehen, wie viel vom Tageskontingent verbraucht ist.
91. Als Lernende möchte ich, dass die App bei erschöpftem Kontingent leise auf ein Ersatzmodell bzw. die Systemstimme umschaltet.
92. Als Lernende möchte ich ein Onboarding in drei Blöcken (Grundlagen, Lernen, KI und Daten) mit Standardwerten und „Überspringen“.

## Implementation Decisions

### Architektur und Speicher
- Die App bleibt eine statische React/Vite-App auf GitHub Pages ohne eigenen Server.
- Persistenz zieht von `localStorage` nach **IndexedDB** um. Eine einmalige Migration übernimmt Wörter, Lernstände, Aktivität, Einstellungen und Entwickler-Daten; vorher wird automatisch eine Backup-Datei angelegt. `localStorage` bleibt nur für kleine Gerätevorlieben.
- Ein **Speicher-Adapter** mit einheitlicher Schnittstelle (laden, speichern, abgleichen, alles löschen, exportieren) hat drei Umsetzungen: *nur lokal*, *Google Drive* (bestehender Abgleich, weiter mit Zusammenführung, Tombstones und hybrider Uhr) und *Firebase*. Beim Wechsel werden die Daten vom alten in den neuen Adapter übertragen.
- **Firebase** im kostenlosen Spark-Tarif ohne Zahlungsdaten: Authentication (Google, E-Mail), Firestore im Standort Frankfurt (unveränderlich, vor dem Anlegen festgelegt) mit Offline-Persistenz. Zugriffsregeln: jede Person liest/schreibt nur unter ihrer eigenen Kennung. Kein Cloud Storage (für neue Projekte nicht mehr kostenlos).
- Synchronisiert werden Wörter, Lernstände (FSRS-Zustände je Richtung), Ordner, Notizen, Beispielsätze, Satz-Datenbank, Partikel-Fortschritt und Einstellungen. Nicht synchronisiert: Audio-Zwischenspeicher, Texterkennungs-Daten, Handschrift-Bilder.
- **Mitverbessern**: separate Firestore-Sammlung ohne Nutzerbezug; Bilder klein (ca. 400 px, 10–30 KB) als codierter Text im Datensatz. Schreiben nur mit Anmeldung (Kennung wird nicht gespeichert), Lesen nur durch den Entwickler-Account. Export als ZIP in den Entwickler-Einstellungen.
- Die Firebase-Konfiguration ist öffentlich und wird als Build-Variable eingebunden (wie die Google-Client-ID).

### Datenmodell (Erweiterungen)
- **Ordner**: Kennung, Name, übergeordneter Ordner (max. 3 Ebenen), Zeitstempel.
- **Wort**: zusätzlich Ordner-Kennung (oder keiner), Notiz, Beispielsätze (max. 2, mit Herkunft), Merkmal „Übersetzung fehlt“ je Richtung, Merkmal „bitte prüfen“.
- **Lernstand pro Wort und Richtung**: FSRS-Zustand (Stabilität, Schwierigkeit, letzter und nächster Termin, Wiederholungen, Fehlschläge) sowie ein Protokoll der Bewertungen für die persönliche Anpassung.
- **Partikel-Fortschritt**: pro Partikel und Verwendung Status (unbekannt / bekannt laut Check / Erklärung gesehen / Mini-Test bestanden), Trefferquote, aktuelle Stufe.
- **Satz**: Kennung, Text mit markierten Lücken, Lösung(en), Partikel und Verwendung, Stufe, Übersetzung, Tipps, unbekannte Wörter mit Übersetzung, Herkunft (Pool / KI), Wiederholungsdaten.
- **Audio-Zwischenspeicher**: Schlüssel aus Quelle, Stimme, Sprache und Text; Inhalt als Audiodatei.

### Lern-Kern (reine Logik ohne Oberfläche)
- **Planer (FSRS)**: bewertet Antworten in vier Stufen, die aus Ergebnis, zweitem Versuch, Antwortzeit und genutzter Hilfe (Vorlage, Tipp) abgeleitet werden; unsichere KI-Prüfungen und Widersprüche zählen abgeschwächt. Ab ca. 300 Wiederholungen werden die Parameter an die Person angepasst (im Hintergrund). Bestehende Lernstände werden in Startwerte übersetzt.
- **Lernstand (Stufe 1–10)**: berechnet aus sicher beherrschten Wörtern (laut FSRS), Partikel-Beherrschung und Trefferquote der letzten Zeit. Steuert Auto-Stufe, Satzlänge, Menge neuer KI-Wörter und Smart-Auswahl.
- **Auswahl**: eine gemeinsame Funktion liefert aus (einzeln | Ordner | Tags | Smart) plus Richtung die Wortliste; Smart nimmt fällige und schwache Wörter, schließt Wörter ohne Übersetzung in der fehlenden Richtung aus.
- **Antwortprüfung Deutsch**: jede eingetragene Bedeutung zählt; Groß-/Kleinschreibung, Artikel, Satzzeichen und kleine Tippfehler werden toleriert; „Ich hatte recht“ korrigiert die Bewertung.
- **Partikel-Logik**: richtige Form je nach Endkonsonant (이/가, 을/를, 은/는, 과/와) inkl. Sonderformen (내가/제가/네가, 내/제/네); Lückenprüfung sofort und lokal; Stufenwechsel im Auto-Modus über die letzten 20 Aufgaben (über 85 % / unter 60 %).

### Partikel-Inhalte
- 10 Partikeln aus den Unterlagen der Professorin. Erklärungen, Merkhilfen und Beispiele werden **eigenständig formuliert** auf Grundlage der Unterlagen; die PDFs selbst kommen nicht ins Projekt. Zwei Übersetzungsfehler der Vorlage (화요일 = Dienstag, 우유 = Milch) werden korrigiert.
- Fünf Stufen überall: Einsteiger (3–4 Wörter, eine Partikel, Hilfe zum Endkonsonanten), Anfänger (kurz, eine Lücke, Präsens höflich), Mittel (länger, Verwechslungspaare, Vergangenheit), Fortgeschritten (zwei Lücken, gemischt, Nebensätze), Profi (mehrere Lücken, Höflichkeitsformen, feine Bedeutungsunterschiede).
- Eingebauter Satz-Pool: 50 Sätze pro Partikel (10 je Stufe), mit automatischer Prüfung auf eindeutige Lösung; Stichprobe von 20 Sätzen wird vom Nutzer gegengelesen.

### KI und Kontingent
- Nur das kostenlose Google-Kontingent. Texte (Sätze, Übersetzungen, Tipps, Beispielsätze) **gebündelt** pro Anfrage; Bewertung freier Antworten im Prüfungsmodus gesammelt am Ende.
- Vorläufige Modellwahl: Texte über Gemini 3.5 Flash Lite (500 Anfragen/Tag), Ersatz Gemma 4 (14.400/Tag). Handschrift und Scans bleiben bei der bestehenden Ausweichkette.
- **Vor der Festlegung**: Vergleichstest als versteckte Testseite in der App mit dem lokal gespeicherten Key und den Daten aus dem Entwickler-Export (Handschrift), plus kleine Tests für Scan und Satzgenerierung. Gemessen werden Trefferquote, Antwortzeit und Kontingent-Verbrauch; Ergebnis als Datei.
- Ein Kontingent-Zähler pro Modell und Tag wird in den Einstellungen angezeigt.

### Sprachausgabe
- Gemeinsame Schnittstelle mit Quellen *Systemstimme* und *Gemini*.
- **Entschieden nach Testlabor (16./17.11.2026)**: Erzeugt wird über die **Live API** (`gemini-3.8-live`, kein Tageslimit, erster Ton nach ca. 0,4 s), Text mit Schlusspunkt. Die API schneidet gelegentlich das Wortende ab, ihre eigene Mitschrift merkt das nicht. Deshalb wird jede Aufnahme vor dem Speichern zweifach geprüft:
  - **Gegenprüfung** mit `gemini-3.5-transcribe-live` (kein Tageslimit; Antwort als `interimInputTranscription`, jeweils der ganze bisherige Text): erkennt fehlende oder falsche Wörter.
  - **Endprüfung**: Lautstärke der letzten 30 ms im Verhältnis zum lautesten 20-ms-Fenster. Saubere Aufnahmen enden in Stille (gemessen 0 %), abgeschnittene mitten im Ton (gemessen 46–60 %); Schwelle 15 %. Deckte sich in zwei Läufen mit dem Gehör.
  - Bis zu 3 Versuche. Scheitern alle (im Test regelmäßig bei 감사합니다), Ausweichen auf ein Gemini-Sprachausgabe-Modell (10/Tag, liest laut Doku wörtlich; WAV nur den data-Block abspielen), sonst Systemstimme.
  - Erzeugung im Hintergrund über eine Warteschlange nach Dringlichkeit, gefüllt beim Import.
- Aufnahmen werden pro Quelle, Stimme und Text in IndexedDB gespeichert; bis dahin spricht die Systemstimme. Sätze in Übungen immer Systemstimme.
- Systemstimme: automatische Wahl der besten installierten Stimme (Natural, Google, Premium), freie Auswahl mit Hörprobe.
- Vier Gemini-Stimmen (2 weiblich, 2 männlich) nach Hörtest; Hörproben einmalig vorab erzeugt und als Dateien mitgeliefert.
- Supertonic 3 (lokales Modell) nur nach separatem Test von Größe, Ladezeit und Klang.

### Import
- Gemini-Scan wie bisher; Offline-Texterkennung mit Tesseract.js, koreanische Sprachdaten erst bei Bedarf geladen und zwischengespeichert.
- Fehlende Übersetzung: Gemini, sonst inoffizieller Google-Translate-Endpunkt; immer „bitte prüfen“. Scheitert beides, wird das Wort mit „Übersetzung fehlt“ gespeichert und das Hinweisfenster erscheint bei jedem App-Start.
- Import-Vorschau mit Zielordner (Vorschlag: neuer Ordner nach Dateiname) und KI-Tag-Vorschlägen.

### Oberfläche
- Neuer Bereich „Partikel“ unter „Üben“ (neben Lernen, Quiz/Test, Beugung, Diktat).
- Gemeinsamer Auswahl-Dialog für Lernen, Test, Diktat.
- Onboarding in drei Blöcken: Grundlagen (Speicherart, Darstellung, Key mit Tutorial), Lernen (Einstufung, Stimme und Vorlesen, Prüf-Reihenfolge, Zeichenfeld), KI und Daten (neue Wörter, Beispielsätze, Mitverbessern).
- Bestehendes Apple-Design (Tokens, Glas, Sheets, Animationen) wird weiterverwendet. Jede sichtbare Etappe bekommt einen Eintrag im Neuigkeiten-Fenster.

### Auslieferung
Vorab-Tests (Modellvergleich, Live-API) → Etappen, jede getestet und veröffentlicht:
1. Speicher-Umbau (IndexedDB, Adapter) und Ordner
2. Auswahl-Dialog, Smart-Modus und FSRS, Lernstand
3. Lernmodus (Notizen, Beispielsätze) und Diktat
4. Konten und Firebase, Mitverbessern
5. Partikel-Trainer
6. Audio
7. Import-Erweiterungen (Offline-Scan, Übersetzung, Hinweisfenster)

## Testing Decisions

- Bisher gibt es **keine automatischen Tests**. Eingeführt wird **Vitest**; Tests prüfen nur äußeres Verhalten (Eingabe → Ergebnis), keine internen Details.
- **Vorgeschlagene Test-Nahtstellen** (so wenige und so hoch wie möglich):
  1. **Lern-Kern** als reine Funktionen ohne Oberfläche: Planer (FSRS-Bewertung, nächster Termin, Startwerte aus alten Lernständen), Lernstand-Berechnung, Auswahl (inkl. Ausschluss fehlender Übersetzungen), Antwortprüfung Deutsch, Partikel-Formen und Lückenprüfung, Auto-Stufenwechsel.
  2. **Speicher-Adapter** über seine gemeinsame Schnittstelle, getestet mit einer Speicher-Attrappe: Migration aus `localStorage`, Zusammenführen zweier Stände (vorhandenes Merge-/Uhr-Verhalten), Wechsel der Speicherart ohne Datenverlust, Löschen.
  3. **Satz-Pool-Prüfung**: jeder eingebaute Satz hat genau eine richtige Lösung und eine gültige Stufe.
- Oberflächen, Firebase selbst und KI-Antworten werden nicht automatisch getestet, sondern wie bisher im Browser durchgeklickt (Vorschau, Hell/Dunkel, Handy/Desktop) und über die Modell-Testseite gemessen.
- Vorbild im Code: die bestehenden reinen Module für Zusammenführung, Uhr, Hangul-Zerlegung und Silben-Layout.

## Out of Scope

- Weitere Partikeln: (이)랑, (으)로, 때문에, 부터 (später).
- Apple-Anmeldung (kostenpflichtiges Entwicklerkonto).
- Kostenpflichtige Dienste jeglicher Art (Gemini-Bezahltarif, Firebase Blaze, Cloud Storage, DeepL/Papago mit Key).
- edge-tts und andere inoffizielle Microsoft-Schnittstellen.
- Eigener Server oder Backend-Funktionen.
- Verwandte Wörter in der Wiederholungsplanung (z. B. Grundwort nach Beugungsfehler).
- Erweiterung des Lernstands über die drei Grundgrößen hinaus.
- Installierbare App / Offline-Paket (PWA) – nicht Teil dieser Planung.

## Further Notes

- **Google-Nutzungsbedingungen**: Sie sehen vor, dass Apps für Nutzer im EWR, der Schweiz und Großbritannien nur bezahlte Gemini-Dienste nutzen. Der Nutzer hat entschieden, beim kostenlosen Kontingent zu bleiben; im Key-Tutorial werden Mindestalter 18 und die mögliche Einsicht durch Google genannt, die EWR-Klausel nicht. Keine Rechtsberatung.
- **Limits laut Konsole des Nutzers (16.11.2026)**: Gemini-Sprachausgabe-Modelle 3/min, 10/Tag; Live-API-Modelle ohne Minuten-/Tageslimit (Token-Limits 65K–1M/min); Gemini 3.5 und 3.1 Flash Lite 500/Tag; stärkere Flash-Modelle 20/Tag; Gemma 4 14.400/Tag.
- Die Live API ist ein Dialogmodell; wörtliches Vorlesen ist nicht garantiert und muss im Vorab-Test belegt werden.
- Die Neuigkeiten-Regel aus `CLAUDE.md` gilt weiter: jede sichtbare Etappe bekommt einen Release-Eintrag.
