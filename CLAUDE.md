# Hinweise für die Weiterentwicklung (Hangul Studio)

- **Neue sichtbare Funktion = neuer Eintrag im „Das ist neu“-Fenster.** Dafür am Anfang von `src/lib/releases.ts` (`RELEASES`) einen Eintrag mit neuer `id`, 2–4 Funktionen (Icon, Farbe, Titel, Text) und optional `cta` ergänzen. Neue Icons in `ICONS` in `src/components/WhatsNew.tsx` eintragen. Das Fenster zeigt automatisch alle noch nicht gesehenen Updates einmalig.
- Vor dem Veröffentlichen: `npm run typecheck`, Build mit `VITE_BASE=/hangul-studio/ npm run build`, Code auf API-Keys und persönliche E-Mail-Adressen prüfen. Commits laufen über die GitHub-noreply-Adresse.
- Alle Nutzerdaten liegen lokal im Browser (`localStorage`); der optionale Google-Drive-Abgleich nutzt nur den App-Datenordner (`drive.appdata`).
