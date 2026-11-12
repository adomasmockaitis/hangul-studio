# Hangul Studio

Web-App zum Koreanischlernen (React, Vite, TypeScript, Tailwind CSS): Vokabeln, Handschrift-Zeichenfeld mit
KI-Prüfung (Gemini) bzw. Input Tools, Strichreihenfolge, Quiz, Hör-Diktat und Beugungs-Trainer.

Alle Daten (Vokabeln, Lernstand, Einstellungen, API-Key) liegen **nur lokal im Browser** (`localStorage`).
Zum Übertragen zwischen Geräten gibt es unter *Einstellungen → Backup* Export und Import.

## Lokal starten

```bash
npm install
npm run dev
```

Dann `http://localhost:5173` öffnen.

## Build / Prüfen

```bash
npm run typecheck
npm run build
```

## Veröffentlichung

Jeder Push auf `main` baut die App und veröffentlicht sie per GitHub Pages
(siehe `.github/workflows/deploy.yml`).
