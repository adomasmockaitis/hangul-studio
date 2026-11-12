/**
 * Dezente Klänge per Web Audio (keine Audiodateien): weiche Glockentöne wie bei iOS.
 * Alles bewusst leise; die Lautstärke lässt sich in den Einstellungen anpassen.
 */
export type SoundName = 'success' | 'error' | 'tap' | 'complete'

const cfg = { enabled: true, volume: 0.5 }
let ctx: AudioContext | null = null

export function configureSounds(c: Partial<typeof cfg>) {
  Object.assign(cfg, c)
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  type?: OscillatorType
  /** Spitzenlautstärke relativ (0–1) */
  gain?: number
  attack?: number
  /** Endfrequenz für einen kleinen Gleiteffekt */
  glideTo?: number
  lowpass?: number
}

function tone(ac: AudioContext, master: GainNode, freq: number, start: number, dur: number, o: ToneOpts = {}) {
  const t = ac.currentTime + start
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + dur)
  const peak = o.gain ?? 0.5
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + (o.attack ?? 0.006))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  if (o.lowpass) {
    const f = ac.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = o.lowpass
    g.connect(f)
    f.connect(master)
  } else g.connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** Glockenton: Grundton plus leiser Oberton */
function bell(ac: AudioContext, master: GainNode, freq: number, start: number, dur = 0.45, gain = 0.5) {
  tone(ac, master, freq, start, dur, { gain })
  tone(ac, master, freq * 2.01, start, dur * 0.6, { gain: gain * 0.18 })
}

export function playSound(name: SoundName) {
  if (!cfg.enabled || cfg.volume <= 0) return
  const ac = audio()
  if (!ac) return
  const master = ac.createGain()
  master.gain.value = cfg.volume * 0.22 // insgesamt sehr leise
  master.connect(ac.destination)

  switch (name) {
    case 'success': // zwei aufsteigende, helle Glockentöne
      bell(ac, master, 1318.5, 0, 0.4)
      bell(ac, master, 1975.5, 0.085, 0.5)
      break
    case 'error': // weiches, tiefes „Tock“ in zwei Stufen
      tone(ac, master, 233, 0, 0.18, { type: 'triangle', gain: 0.55, lowpass: 900, glideTo: 196 })
      tone(ac, master, 174.6, 0.1, 0.26, { type: 'triangle', gain: 0.5, lowpass: 800, glideTo: 146.8 })
      break
    case 'tap': // winziges Tick
      tone(ac, master, 1760, 0, 0.05, { gain: 0.3 })
      break
    case 'complete': // sanfter Dur-Akkord als Arpeggio
      ;[1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(ac, master, f, i * 0.085, 0.65, 0.42))
      break
  }
}
