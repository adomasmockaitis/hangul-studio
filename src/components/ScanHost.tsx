import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Sheet } from './ui'
import { UploadScanner } from './UploadScanner'
import { useToast } from './Toasts'
import { navigate } from '../lib/route'

/**
 * Der Scanner lebt auf App-Ebene: Schließt man das Fenster oder wechselt die Seite, scannt er im Hintergrund weiter.
 * Ist er fertig, kommt eine Meldung; im Wörterbuch steht oben „Neu eingescannt“, bis man die Wörter geprüft hat.
 */
interface ScanState {
  open: boolean
  folderId: string | null
  busy: boolean
  /** erkannte, noch nicht gespeicherte Wörter */
  pending: number
}

let state: ScanState = { open: false, folderId: null, busy: false, pending: 0 }
const listeners = new Set<() => void>()
const set = (p: Partial<ScanState>) => {
  if ((Object.keys(p) as (keyof ScanState)[]).every((k) => state[k] === p[k])) return
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useScanState = () => useSyncExternalStore(subscribe, () => state)
/** Scanner öffnen; der Ordner gilt nur, solange keine erkannten Wörter warten */
export const openScanner = (folderId: string | null = state.folderId) => set({ open: true, folderId: state.pending || state.busy ? state.folderId : folderId })

export function ScanHost() {
  const s = useScanState()
  const toast = useToast()
  const openRef = useRef(s.open)
  openRef.current = s.open

  // Wird im Hintergrund fertig gescannt: Meldung mit „Ansehen“
  const onDone = (count: number) => {
    if (openRef.current) return
    toast.show({
      key: 'scan-done',
      kind: count ? 'success' : 'warning',
      title: count ? 'Datei fertig gescannt' : 'Scan beendet',
      text: count ? `${count} ${count === 1 ? 'Wort' : 'Wörter'} erkannt – bitte prüfen und speichern.` : 'Es wurden keine Vokabeln gefunden.',
      action: { label: 'Ansehen', onClick: () => { navigate('/woerter'); openScanner() } },
      duration: null,
    })
  }
  useEffect(() => {
    if (s.open) toast.dismissKey('scan-done')
  }, [s.open, toast])

  return (
    <Sheet open={s.open} onClose={() => set({ open: false })} title="Datei scannen" wide keepMounted>
      <UploadScanner
        defaultFolderId={s.folderId}
        onBusy={(busy) => set({ busy })}
        onPending={(pending) => set({ pending })}
        onDone={onDone}
        background
      />
    </Sheet>
  )
}
