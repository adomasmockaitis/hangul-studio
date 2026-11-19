import { useEffect, useRef, useState } from 'react'

/** Gleiche Bedingung wie die Tailwind-Variante `landscape-phone:` in index.css */
export const LANDSCAPE_PHONE = '(orientation: landscape) and (max-height: 540px)'

/** Handy quer gehalten? */
export function useLandscapePhone(): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(LANDSCAPE_PHONE).matches)
  useEffect(() => {
    const mq = window.matchMedia(LANDSCAPE_PHONE)
    const f = () => setOn(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return on
}

/** Im Querformat die Aufgabe ganz ins Bild holen (Wort links, Zeichenfeld rechts) */
export function useLandscapeFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const landscape = useLandscapePhone()
  useEffect(() => {
    if (landscape) requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [landscape])
  return ref
}
