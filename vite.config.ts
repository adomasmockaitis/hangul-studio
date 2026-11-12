import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Für GitHub Pages läuft die App unter /hangul-studio/ (wird im Deploy-Workflow gesetzt); lokal bleibt es '/'
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: { host: true },
})
