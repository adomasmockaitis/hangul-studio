# Hinweise für die Weiterentwicklung (Hangul Studio)

- **Jedes sichtbare Update bekommt einen Eintrag am Anfang von `src/lib/releases.ts`** (`RELEASES`, neue `id`):
  - `size: 'major'` – größere Neuerung mit 2–4 `features` (Icon, Farbe, Titel, Text, optional `cta`). Löst das „Neu in Hangul Studio“-Fenster aus.
  - `size: 'minor'` – kleine Verbesserung mit einem Satz `summary` (`features: []`). Löst allein **kein** Fenster aus, erscheint aber unter „Außerdem“, sobald ein großes Update gezeigt wird.
  - Das Fenster erscheint höchstens einmal pro Besuch: ein Fenster, bis zu 3 große Updates untereinander. Neue Icons in `ICONS` in `src/components/WhatsNew.tsx` eintragen.
- Vor dem Veröffentlichen: `npm run typecheck`, Build mit `VITE_BASE=/hangul-studio/ npm run build`, Code auf API-Keys und persönliche E-Mail-Adressen prüfen. Commits laufen über die GitHub-noreply-Adresse.
- Alle Nutzerdaten liegen lokal im Browser (`localStorage`); der optionale Google-Drive-Abgleich nutzt nur den App-Datenordner (`drive.appdata`).
