> **Update 17.11.2026:** Die Regeln enthalten jetzt zusätzlich `match /audio/{pack}` für die Gemini-Aufnahmen. Bitte den Inhalt von `firestore.rules` erneut in der Konsole einfügen (dabei `ENTWICKLER_UID` wieder durch die eigene UID ersetzen) und veröffentlichen.

# Hangul-Studio-Konten einrichten (Firebase)

Einmalig, etwa 10 Minuten, kostenlos. Du brauchst nur dein Google-Konto. **Keine Zahlungsdaten hinterlegen** – dann können nie Kosten entstehen.

## 1. Projekt anlegen
1. Öffne <https://console.firebase.google.com> und melde dich an.
2. **Projekt erstellen** → Name z. B. `hangul-studio` → Weiter.
3. **Google Analytics: ausschalten** (brauchen wir nicht) → Projekt erstellen.

## 2. Anmeldung einschalten
1. Links **Erstellen → Authentication** → **Starten**.
2. Reiter **Anmeldemethode**:
   - **Google** → aktivieren → Support-E-Mail auswählen → Speichern.
   - **E-Mail-Adresse/Passwort** → nur den ersten Schalter aktivieren → Speichern.
3. Reiter **Einstellungen → Autorisierte Domains** → **Domain hinzufügen**: `adomasmockaitis.github.io`
   (`localhost` steht schon drin.)

## 3. Datenbank anlegen – Speicherort Frankfurt
1. Links **Erstellen → Firestore Database** → **Datenbank erstellen**.
2. Edition: **Standard**.
3. **Speicherort: `europe-west3 (Frankfurt)`** – das lässt sich später **nicht** mehr ändern.
4. **Im Produktionsmodus starten** → Erstellen.

## 4. Sicherheitsregeln einfügen
1. In Firestore Database den Reiter **Regeln** öffnen.
2. Alles löschen und den Inhalt der Datei [`firestore.rules`](../firestore.rules) aus diesem Projekt einfügen.
3. **Veröffentlichen.** (`ENTWICKLER_UID` ersetzen wir in Schritt 6.)

## 5. Web-App registrieren und Konfiguration schicken
1. Oben links **Zahnrad → Projekteinstellungen** → ganz unten **Meine Apps** → Symbol **`</>`** (Web).
2. Spitzname `hangul-studio-web` → **Firebase Hosting NICHT** anhaken → **App registrieren**.
3. Es erscheint ein Block `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };`
4. **Diesen Block an Claude schicken.** Er ist nicht geheim (er steht später ohnehin im Code der Seite); geschützt werden die Daten durch die Regeln aus Schritt 4.

## 6. Später: deine Entwickler-ID für „App mitverbessern“
Nachdem du dich einmal in der App mit deinem Konto angemeldet hast:
1. **Authentication → Nutzer** → deine Zeile → **Nutzer-UID** kopieren.
2. In den **Regeln** (Schritt 4) `ENTWICKLER_UID` durch diese ID ersetzen → Veröffentlichen.
Danach kannst nur du die gesammelten Fälle unter *Einstellungen → Erweitert → Mitverbessern-Daten exportieren* herunterladen.

## Grenzen des kostenlosen Tarifs (Spark)
- 1 GiB Datenbank, 50 000 Lese- und 20 000 Schreibvorgänge pro Tag – für viele Nutzer reichlich.
- Wird ein Limit erreicht, pausiert nur der Abgleich bis zum nächsten Tag; die App läuft lokal weiter.
