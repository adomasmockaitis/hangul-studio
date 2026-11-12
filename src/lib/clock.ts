/**
 * Logische Uhr für den Geräte-Abgleich.
 *
 * Problem: Die Uhren von PC, Laptop und Handy gehen nie ganz gleich (oder sind falsch eingestellt).
 * Würde man nur `Date.now()` nehmen, könnte ein Gerät mit nachgehender Uhr beim Abgleich fälschlich „älter“ wirken.
 *
 * Lösung („hybrid logical clock“): Ein Zeitstempel ist immer mindestens so groß wie alles, was dieses Gerät
 * schon gesehen hat (auch von anderen Geräten), und wird mit jeder Änderung weiter erhöht. Dadurch gilt eine
 * Änderung nach einem Abgleich zuverlässig als „neuer“, egal wie weit die Uhr des Geräts abweicht.
 * Zeitzonen spielen keine Rolle, es werden UTC-Millisekunden verwendet.
 */
const KEY = 'hangul-studio:clock'
const MAX_FUTURE_MS = 7 * 86_400_000 // absurde Zukunftswerte (kaputte Uhr) nicht übernehmen

let last = (() => {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
})()

function persist() {
  try {
    localStorage.setItem(KEY, String(last))
  } catch {
    /* ignore */
  }
}

/** Neuer, streng wachsender Zeitstempel für eine Änderung */
export function stamp(): number {
  last = Math.max(Date.now(), last + 1)
  persist()
  return last
}

/** Merkt sich Zeitstempel, die von anderen Geräten (oder gespeicherten Daten) stammen */
export function observe(ts: number | undefined | null): void {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return
  if (ts > Date.now() + MAX_FUTURE_MS) return
  if (ts > last) {
    last = ts
    persist()
  }
}
