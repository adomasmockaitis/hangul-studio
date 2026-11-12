# Google-Drive-Synchronisation einrichten

Mit der Synchronisation gleicht Hangul Studio deinen Lernstand zwischen mehreren Geräten ab (PC, Tablet, Smartphone).
Die Daten liegen als **eine kleine Datei** im **versteckten App-Ordner** deines eigenen Google Drive. Nur diese App kann sie lesen, und sie taucht nicht in deiner normalen Dateiübersicht auf.

Dafür braucht die App eine **Google-Client-ID**. Sie identifiziert nur die App, ist **kein Geheimnis** und darf im Code stehen. Jede Person, die sich anmeldet, nutzt ihr **eigenes** Google-Konto und ihren **eigenen** Drive-Ordner.

> Die Oberfläche der Google Cloud Console ändert sich gelegentlich. Die Schritte sind sinngemäß gleich, auch wenn Menüs anders heißen.

## 1. Projekt anlegen

1. [console.cloud.google.com](https://console.cloud.google.com/) öffnen und anmelden.
2. Oben auf die Projektauswahl klicken → **Neues Projekt** → Name z. B. `Hangul Studio` → **Erstellen**.

## 2. Drive-API aktivieren

1. **APIs & Dienste → Bibliothek**.
2. **Google Drive API** suchen → **Aktivieren**.

## 3. Zustimmungsbildschirm (OAuth)

1. **APIs & Dienste → OAuth-Zustimmungsbildschirm** (bzw. *Google Auth Platform*).
2. Nutzertyp **Extern** wählen.
3. App-Name (z. B. `Hangul Studio`), Support-E-Mail und Entwickler-Kontakt eintragen.
   *Hinweis: Die Support-E-Mail kann auf dem Anmeldebildschirm sichtbar sein.*
4. Bei **Bereiche (Scopes)** hinzufügen: `https://www.googleapis.com/auth/drive.appdata`
   (Beschreibung bei Google: *eigene Konfigurationsdaten in Google Drive ansehen, erstellen und löschen* – gilt als unkritisch).
5. **App veröffentlichen** („In Produktion“ bzw. *Publish app*), damit sich auch andere Personen anmelden können.
   Bleibt die App im Status **Testing**, können sich nur eingetragene Testnutzer anmelden (max. 100).

## 4. Client-ID erstellen

1. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**.
2. Anwendungstyp **Webanwendung**.
3. Unter **Autorisierte JavaScript-Quellen** eintragen:
   - `https://adomasmockaitis.github.io`
   - `http://localhost:5173` (für lokales Testen)
4. Weiterleitungs-URIs sind **nicht nötig**.
5. Erstellen und die **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`).

## 5. Client-ID in der App hinterlegen

**Variante A – nur für dich, pro Gerät:** In der App unter *Einstellungen → Synchronisation* einfügen.

**Variante B – für die gehostete Seite fest eingebaut:**

```bash
gh variable set GOOGLE_CLIENT_ID --body "DEINE-CLIENT-ID.apps.googleusercontent.com"
```

Danach einen neuen Deploy auslösen (z. B. ein beliebiger Push auf `main` oder im Tab *Actions* den Workflow neu starten). Der Build übernimmt die Variable als `VITE_GOOGLE_CLIENT_ID`.

**Lokal entwickeln:** Eine Datei `.env.local` im Projektordner anlegen (wird nicht ins Repository übernommen):

```text
VITE_GOOGLE_CLIENT_ID=DEINE-CLIENT-ID.apps.googleusercontent.com
```

## 6. Verbinden

*Einstellungen → Synchronisation → Mit Google Drive verbinden*, im Google-Fenster zustimmen. Auf jedem weiteren Gerät dasselbe.

## Wie der Abgleich funktioniert

- **Wann:** beim Start, kurz nach Änderungen, beim Zurückkehren in den Tab, alle 5 Minuten und per Knopf *Jetzt synchronisieren*.
- **Zusammenführung:** Pro Wort gewinnt die zuletzt geänderte Version (Übersetzung, Tags, Beugungen). Beim Lernstand gehen **keine Zähler verloren** (jeweils der höhere Wert), die Lernserie kommt vom zuletzt gelernten Stand. Die Aktivität pro Tag nimmt das Maximum.
- **Gelöschte Wörter** werden über „Löschmarken“ auf andere Geräte übertragen (90 Tage lang). Legst du ein Wort danach neu an, bleibt es erhalten.
- **Einstellungen** werden ebenfalls abgeglichen; die zuletzt geänderten gewinnen. Nur auf dem Gerät bleiben: Client-ID und der Schalter für den API-Key.
- **API-Key:** wird nur mitsynchronisiert, wenn du es ausdrücklich einschaltest.
- Läuft die Google-Anmeldung ab (nach etwa einer Stunde ohne Aktivität), erscheint **Erneut verbinden**. Auf manchen Geräten (z. B. iPhone/Safari) kann das öfter nötig sein.

## Trennen und Löschen

- *Trennen* beendet die Verbindung auf diesem Gerät. Die Datei in Drive bleibt bestehen.
- Die Datei und die App-Berechtigung entfernst du in Google unter [Konto → Sicherheit → Drittanbieter-Zugriff](https://myaccount.google.com/connections) (App auswählen → *Verbindung löschen* bzw. gespeicherte Daten löschen).

## Grenzen

- Lernst du **dasselbe Wort gleichzeitig auf zwei Geräten**, bevor sie sich abgeglichen haben, wird der Lernstand zusammengeführt, aber nicht jeder einzelne Versuch zeitlich exakt nachgezeichnet.
- Wegen der Zusammenführung bleibt auch bei einem zurückgesetzten Lernstand auf einem Gerät der höhere Wert eines anderen Geräts erhalten, wenn dieses ihn vorher hochgeladen hat. Zum vollständigen Zurücksetzen alle Geräte nacheinander zurücksetzen, nachdem sie synchronisiert haben.
