import { useSyncExternalStore } from 'react'

/**
 * Kleines Hash-Routing (#/ueben/quiz). Funktioniert auf GitHub Pages ohne Server-Regeln;
 * Zurück-Taste und Neuladen bleiben auf der Seite.
 */
export type Tab = 'start' | 'ueben' | 'woerter' | 'einstellungen' | 'labor'
/** 'labor' ist eine versteckte Testseite ohne eigenen Tab */
const TABS: Tab[] = ['start', 'ueben', 'woerter', 'einstellungen', 'labor']

const read = () => window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '')

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** Aktueller Pfad, zerlegt: { tab: 'ueben', sub: 'quiz' } */
export function useRoute(): { tab: Tab; sub: string } {
  const path = useSyncExternalStore(subscribe, read)
  const [first = '', sub = ''] = path.split('/')
  const tab = (TABS as string[]).includes(first) ? (first as Tab) : 'start'
  return { tab, sub }
}

/** navigate('/ueben/quiz') – mit replace wird kein neuer Verlaufseintrag angelegt */
export function navigate(path: string, replace = false) {
  const hash = '#' + (path.startsWith('/') ? path : '/' + path)
  if (window.location.hash === hash) return
  if (replace) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}
