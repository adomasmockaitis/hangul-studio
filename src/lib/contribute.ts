/**
 * „App mitverbessern“: Fehlerfälle der Handschrift-Erkennung werden – nur mit Einwilligung und Konto –
 * ohne Nutzerbezug gesendet. Die Module, die Fehlerfälle erkennen, kennen weder Einstellungen noch Konto;
 * sie melden sich hier, und das Konto-Modul schaltet das Senden ein oder aus.
 */
import type { Contribution } from './firebase'

let sink: ((c: Contribution) => void) | null = null

export function setContributionSink(fn: ((c: Contribution) => void) | null) {
  sink = fn
}

export function contributeCase(c: Contribution) {
  try {
    sink?.(c)
  } catch {
    /* Mitverbessern darf nie das Lernen stören */
  }
}
