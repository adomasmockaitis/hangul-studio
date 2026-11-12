/** „gerade eben“, „vor 5 Min.“, „heute 20:11“ – bewusst nicht nur die (evtl. falsche) Uhrzeit des Geräts */
export function formatAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const d = new Date(ts)
  const today = new Date(now)
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `heute ${time}`
  const y = new Date(now - 86_400_000)
  if (d.toDateString() === y.toDateString()) return `gestern ${time}`
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}. ${time}`
}
