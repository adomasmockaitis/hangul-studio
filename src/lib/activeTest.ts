import { useEffect, useRef } from 'react'

/**
 * Läuft gerade ein Test (Quiz/Diktat)? Die Navigation fragt dann nach, bevor das Wörterbuch geöffnet wird –
 * dort stünden die Lösungen. Alle anderen Seiten lassen den Test einfach im Hintergrund weiterlaufen.
 */
interface ActiveTest {
  label: string
  end: () => void
}

let current: ActiveTest | null = null

export const getActiveTest = () => current

export function useActiveTest(active: boolean, label: string, end: () => void) {
  const endRef = useRef(end)
  endRef.current = end
  useEffect(() => {
    if (!active) return
    const entry: ActiveTest = { label, end: () => endRef.current() }
    current = entry
    return () => {
      if (current === entry) current = null
    }
  }, [active, label])
}
