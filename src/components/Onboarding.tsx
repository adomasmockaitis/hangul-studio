import { useState, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, Brush, Check, ChevronLeft, Cloud, ExternalLink, KeyRound, Lightbulb, Monitor, Moon, Palette,
  PenLine, Repeat2, Sun, Timer, Volume2, Waypoints, type LucideIcon,
} from 'lucide-react'
import { dynamicTimeoutMs, TIPS_TIME_FACTOR } from '../lib/gemini'
import { markReleaseSeen } from '../lib/releases'
import { speakWord } from '../lib/speech'
import { playSound } from '../lib/sounds'
import { useApp } from '../store'
import { useSync } from '../sync'
import {
  CONJUGATION_KEYS, CONJUGATION_LABELS, type CanvasBackground, type CheckMethod, type SpeechMode, type StrokeStyleMode, type ThemeMode,
} from '../types'
import { HangulCanvas } from './HangulCanvas'
import { StrokeOrder } from './StrokeOrder'
import { Toggle } from './ui'

export const ONBOARDING_KEY = 'hangul-studio:onboarded'

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return true // ohne Speicherzugriff nicht ständig neu anzeigen
  }
}

function Page({ icon: Icon, color, title, text, children }: { icon: LucideIcon; color: string; title: string; text: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl text-white shadow-md" style={{ background: color }}>
        <Icon size={28} />
      </div>
      <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-black/60 dark:text-white/60">{text}</div>
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  )
}

function Choice({ active, onClick, children, className = '' }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border-2 p-3 text-left transition active:scale-[0.98] ${
        active ? 'border-[#007aff] bg-[#007aff]/10' : 'border-black/10 bg-white/60 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
      } ${className}`}
    >
      {children}
    </button>
  )
}

function BgPreview({ kind, sample }: { kind: CanvasBackground; sample: boolean }) {
  const line = 'rgba(128,128,128,0.35)'
  const style: React.CSSProperties = {}
  if (kind === 'grid') {
    style.backgroundImage = `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
    style.backgroundSize = '14px 14px'
  } else if (kind === 'lined') {
    style.backgroundImage = `linear-gradient(${line} 1px, transparent 1px)`
    style.backgroundSize = '100% 20px'
    style.backgroundPosition = '0 19px'
  }
  return (
    <div className="relative h-20 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-[#2c2c2e]" style={style}>
      {kind === 'hangul' && (
        <>
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-gray-400/60" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-400/60" />
          <div className="absolute inset-1 rounded border border-gray-400/50" />
        </>
      )}
      {sample && <span className="absolute inset-0 grid place-items-center text-5xl font-bold text-black/15 dark:text-white/15">가</span>}
    </div>
  )
}

const BG_OPTIONS: { value: CanvasBackground; label: string }[] = [
  { value: 'blank', label: 'Weiß (Blanko)' },
  { value: 'grid', label: 'Kariert' },
  { value: 'lined', label: 'Liniert' },
  { value: 'hangul', label: 'Silbenraster' },
]

const METHOD_INFO: Record<CheckMethod, { title: string; desc: string }> = {
  gemini: { title: 'Gemini (KI-Bild)', desc: 'Liest dein Bild. Am genauesten, braucht einen API-Key.' },
  inputtools: { title: 'Input Tools (Strichanalyse)', desc: 'Sehr schnell und kostenlos, ohne Key – etwas ungenauer.' },
  manual: { title: 'Selbst-Check', desc: 'Du siehst die Lösung und bewertest dich selbst. Geht immer.' },
}

export function Onboarding({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useApp()
  const sync = useSync()
  const [stepId, setStepId] = useState('welcome')
  const hasKey = settings.geminiApiKey.trim().length > 0

  const STEPS: { id: string; needsKey?: boolean }[] = [
    { id: 'welcome' }, { id: 'sync' }, { id: 'theme' }, { id: 'key' }, { id: 'timeout', needsKey: true }, { id: 'order' },
    { id: 'canvas' }, { id: 'strokes' }, { id: 'tips', needsKey: true }, { id: 'audio' }, { id: 'conj' }, { id: 'try' }, { id: 'done' },
  ]
  const visible = (key: boolean) => STEPS.filter((s) => !s.needsKey || key)
  const list = visible(hasKey)
  const idx = Math.max(0, list.findIndex((s) => s.id === stepId))

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      /* ignore */
    }
    markReleaseSeen() // neue Nutzer bekommen das Neuigkeiten-Fenster nicht zusätzlich
    playSound('complete')
    onClose()
  }

  /** Beim Verlassen des Key-Schritts: Prüf-Reihenfolge passend setzen */
  const applyKeyChoice = (key: boolean) => {
    // Wurden Einstellungen gerade aus Google Drive übernommen, bleibt die dort gespeicherte Reihenfolge erhalten
    if (sync.lastResult?.changedLocal && key === hasKey) return
    updateSettings({
      checkOrder: [
        { method: 'gemini', enabled: key },
        { method: 'inputtools', enabled: true },
        { method: 'manual', enabled: true },
      ],
    })
  }

  const go = (dir: 1 | -1) => {
    playSound('tap')
    let key = hasKey
    if (dir === 1 && stepId === 'key') {
      key = settings.geminiApiKey.trim().length > 0
      applyKeyChoice(key)
    }
    const l = visible(key)
    const i = l.findIndex((s) => s.id === stepId)
    const n = l[Math.min(l.length - 1, Math.max(0, i + dir))]
    setStepId(n.id)
  }

  const moveStep = (i: number, d: -1 | 1) => {
    const o = [...settings.checkOrder]
    ;[o[i], o[i + d]] = [o[i + d], o[i]]
    updateSettings({ checkOrder: o })
  }

  const content = (() => {
    switch (stepId) {
      case 'welcome':
        return (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div className="mb-8 grid h-28 w-28 place-items-center rounded-[28px] bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] text-6xl font-bold text-white shadow-2xl">한</div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Willkommen bei<br />Hangul Studio</h1>
            <p className="mt-4 max-w-sm text-lg text-black/55 dark:text-white/55">
              Koreanisch lernen – mit der Hand schreiben, prüfen lassen und gezielt wiederholen. Richten wir alles in ein paar Schritten ein.
            </p>
          </div>
        )

      case 'sync':
        return (
          <Page
            icon={Cloud}
            color="#0a84ff"
            title="Auf allen Geräten lernen"
            text="Verbinde Google Drive, dann ist dein Lernstand auf PC, Tablet und Smartphone derselbe – automatisch. Gespeichert wird in einem versteckten Ordner in deinem eigenen Drive, den nur diese App sehen kann."
          >
            <div className="card p-4">
              {sync.enabled && sync.state !== 'needs-auth' ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 font-semibold text-[#34c759]"><Check size={18} /> Mit Google Drive verbunden</p>
                  {sync.lastResult?.changedLocal ? (
                    <>
                      <p className="text-sm text-black/60 dark:text-white/60">Dein Lernstand und deine Einstellungen von den anderen Geräten wurden geladen. Du kannst die Einrichtung abkürzen oder trotzdem alles durchgehen.</p>
                      <button className="btn-soft" onClick={finish}>Einrichtung abkürzen und loslegen</button>
                    </>
                  ) : (
                    <p className="text-sm text-black/60 dark:text-white/60">Dein Stand wird ab jetzt automatisch gesichert und mit deinen anderen Geräten abgeglichen.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <button className="btn-primary !px-5 !py-3 !text-base" onClick={() => void sync.connect()} disabled={sync.state === 'syncing' || !sync.clientId}>
                    <Cloud size={18} /> {sync.state === 'syncing' ? 'Verbinde …' : 'Mit Google verbinden'}
                  </button>
                  {sync.state === 'error' && <p className="text-sm text-[#ff3b30]">{sync.error}</p>}
                  <p className="text-xs text-black/45 dark:text-white/45">Die App bekommt nur Zugriff auf ihren eigenen Ordner – nicht auf deine anderen Dateien. Du kannst die Verbindung jederzeit trennen.</p>
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-black/[0.04] p-4 text-sm leading-relaxed text-black/60 dark:bg-white/5 dark:text-white/60">
              <p className="mb-1 font-medium text-black/80 dark:text-white/80">Ohne Verbindung</p>
              Alles bleibt <b>lokal in diesem Browser</b> gespeichert. Du kannst deine Daten dann jederzeit selbst sichern und übertragen: <b>Einstellungen → Backup</b> (exportieren und auf einem anderen Gerät importieren). Die Synchronisation kannst du später in den Einstellungen nachholen.
            </div>
          </Page>
        )

      case 'theme':
        return (
          <Page icon={Palette} color="#af52de" title="Erscheinungsbild" text="Hell, dunkel oder passend zum Gerät. Du siehst die Änderung sofort.">
            <div className="grid grid-cols-3 gap-3">
              {([['light', 'Hell', Sun], ['dark', 'Dunkel', Moon], ['system', 'System', Monitor]] as [ThemeMode, string, LucideIcon][]).map(([v, label, Icon]) => (
                <Choice key={v} active={settings.theme === v} onClick={() => updateSettings({ theme: v })} className="flex flex-col items-center gap-2 !py-5">
                  <Icon size={26} />
                  <span className="font-medium">{label}</span>
                </Choice>
              ))}
            </div>
          </Page>
        )

      case 'key':
        return (
          <Page
            icon={KeyRound}
            color="#007aff"
            title="KI für bessere Erkennung"
            text={
              <>
                Mit einem kostenlosen <b>Gemini-API-Key</b> liest eine KI deine Handschrift und sagt, ob das Wort stimmt – deutlich genauer als die Standard-Erkennung.
                Der Key bleibt <b>nur in deinem Browser</b>. Du kannst auch ohne Key lernen: Dann prüfen „Input Tools“ und der Selbst-Check.
              </>
            }
          >
            <input
              className="input !py-3.5"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="API-Key einfügen (optional) – AIza…"
              value={settings.geminiApiKey}
              onChange={(e) => updateSettings({ geminiApiKey: e.target.value })}
            />
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#007aff]"
            >
              Kostenlosen Key bei Google AI Studio holen <ExternalLink size={14} />
            </a>
            <p className="rounded-2xl bg-black/[0.04] p-3 text-sm text-black/55 dark:bg-white/5 dark:text-white/55">
              {hasKey ? '✓ Key eingetragen – Gemini wird als erste Prüfmethode genutzt.' : 'Ohne Key geht es auch: Du kannst ihn später jederzeit in den Einstellungen nachtragen.'}
            </p>
          </Page>
        )

      case 'timeout':
        return (
          <Page
            icon={Timer}
            color="#ff9500"
            title="Wie lange darf Gemini brauchen?"
            text="Antwortet Gemini in dieser Zeit nicht, springt die App automatisch zur nächsten Methode (Input Tools). Längere Wörter bekommen automatisch etwas mehr Zeit."
          >
            <div className="card p-4">
              <div className="flex items-center gap-4">
                <input type="range" min={2} max={15} value={settings.geminiTimeoutSec} onChange={(e) => updateSettings({ geminiTimeoutSec: +e.target.value })} className="flex-1 accent-[#007aff]" />
                <span className="w-14 text-right text-2xl font-bold tabular-nums">{settings.geminiTimeoutSec} s</span>
              </div>
              <p className="label mb-1 mt-4">So viel Zeit bekommt …</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {[['가', '1 Zeichen'], ['학교', '2 Zeichen'], ['한국어', '3 Zeichen'], ['감사합니다', '5 Zeichen']].map(([w, l]) => (
                  <div key={w} className="flex justify-between border-b border-black/[0.06] py-1 dark:border-white/10">
                    <span><b className="mr-1.5 text-base">{w}</b> <span className="text-black/45 dark:text-white/45">{l}</span></span>
                    <span className="font-semibold tabular-nums">{(dynamicTimeoutMs(settings.geminiTimeoutSec, w, false) / 1000).toFixed(1)} s</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-black/45 dark:text-white/45">
                Mit aktiven Schreib-Tipps (nächste Seiten) gilt die Basiszeit ×{TIPS_TIME_FACTOR}.
              </p>
            </div>
            <p className="text-sm text-black/50 dark:text-white/50">Empfehlung: 5 Sekunden.</p>
          </Page>
        )

      case 'order':
        return (
          <Page
            icon={Waypoints}
            color="#34c759"
            title="Reihenfolge der Prüfung"
            text="Die App probiert die Methoden von oben nach unten. Fällt eine aus, geht es automatisch mit der nächsten weiter. Verschieben und ein-/ausschalten ist jederzeit möglich."
          >
            <ol className="space-y-2">
              {settings.checkOrder.map((s, i) => (
                <li key={s.method} className={`flex items-center gap-3 rounded-2xl border p-3 ${s.enabled ? 'border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/5' : 'border-dashed border-black/10 opacity-60 dark:border-white/10'}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#007aff] text-sm font-bold text-white">
                    {s.enabled ? settings.checkOrder.slice(0, i + 1).filter((x) => x.enabled).length : '–'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{METHOD_INFO[s.method].title}</p>
                    <p className="text-xs text-black/50 dark:text-white/50">{METHOD_INFO[s.method].desc}</p>
                  </div>
                  <button className="btn-soft !p-1.5" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Nach oben"><ArrowUp size={15} /></button>
                  <button className="btn-soft !p-1.5" disabled={i === settings.checkOrder.length - 1} onClick={() => moveStep(i, 1)} aria-label="Nach unten"><ArrowDown size={15} /></button>
                  <Toggle checked={s.enabled} onChange={(enabled) => updateSettings({ checkOrder: settings.checkOrder.map((x) => (x.method === s.method ? { ...x, enabled } : x)) })} label={METHOD_INFO[s.method].title} />
                </li>
              ))}
            </ol>
            {!hasKey && <p className="text-sm text-black/50 dark:text-white/50">Gemini ist ausgeschaltet, weil kein Key eingetragen ist.</p>}
          </Page>
        )

      case 'canvas':
        return (
          <Page icon={Brush} color="#ff2d92" title="Dein Zeichenfeld" text="Wähle den Hintergrund, auf dem du schreibst. So sieht er aus:">
            <div className="grid grid-cols-2 gap-3">
              {BG_OPTIONS.map((o) => (
                <Choice key={o.value} active={settings.canvasBackground === o.value} onClick={() => updateSettings({ canvasBackground: o.value })}>
                  <BgPreview kind={o.value} sample={settings.showTemplate} />
                  <p className="mt-2 text-sm font-medium">{o.label}</p>
                </Choice>
              ))}
            </div>
            <div className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Blasse Wort-Vorlage zum Nachspuren</p>
                <p className="text-sm text-black/50 dark:text-white/50">Das Wort erscheint hell im Hintergrund – siehst du oben in der Vorschau.</p>
              </div>
              <Toggle checked={settings.showTemplate} onChange={(showTemplate) => updateSettings({ showTemplate })} label="Vorlage" />
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">Standard-Strichdicke</p>
                <input type="range" min={2} max={16} value={settings.strokeWidth} onChange={(e) => updateSettings({ strokeWidth: +e.target.value })} className="w-40 accent-[#007aff]" />
              </div>
              <div className="mt-3 grid h-12 place-items-center rounded-xl bg-white dark:bg-[#2c2c2e]">
                <div className="w-3/4 rounded-full bg-black dark:bg-white" style={{ height: settings.strokeWidth }} />
              </div>
            </div>
          </Page>
        )

      case 'strokes':
        return (
          <Page
            icon={PenLine}
            color="#5e5ce6"
            title="Strichreihenfolge"
            text="Zeigt dir, wie jede Silbe als Block geschrieben wird – wahlweise mit Zahlen und Pfeilen oder als Animation. Hier am Beispiel 가:"
          >
            <div className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Im Lernmodus anzeigen</p>
                <p className="text-sm text-black/50 dark:text-white/50">Lässt sich dort jederzeit minimieren.</p>
              </div>
              <Toggle checked={settings.showStrokeOrder} onChange={(showStrokeOrder) => updateSettings({ showStrokeOrder })} label="Strichreihenfolge" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([['numbers', 'Zahlen & Pfeile'], ['animation', 'Animation']] as [StrokeStyleMode, string][]).map(([v, label]) => (
                <Choice key={v} active={settings.strokeOrderStyle === v} onClick={() => updateSettings({ strokeOrderStyle: v })}>
                  <div className="grid place-items-center py-1">
                    <StrokeOrder text="가" mode={v} compact />
                  </div>
                  <p className="mt-1 text-center text-sm font-medium">{label}</p>
                </Choice>
              ))}
            </div>
          </Page>
        )

      case 'tips':
        return (
          <Page
            icon={Lightbulb}
            color="#ffcc00"
            title="Schreib-Tipps von Gemini"
            text={<>Ist ein Zeichen richtig, aber unsauber geschrieben, gibt Gemini einen kurzen Tipp. Dafür dauert die Antwort <b>etwas länger</b> – das Zeitlimit wird automatisch ×{TIPS_TIME_FACTOR} genommen.</>}
          >
            <div className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Schreib-Tipps aktivieren</p>
                <p className="text-sm text-black/50 dark:text-white/50">
                  Zeitlimit dann: {+(settings.geminiTimeoutSec * (settings.writingTips ? TIPS_TIME_FACTOR : 1)).toFixed(1)} s statt {settings.geminiTimeoutSec} s
                </p>
              </div>
              <Toggle checked={settings.writingTips} onChange={(writingTips) => updateSettings({ writingTips })} label="Schreib-Tipps" />
            </div>
            {settings.writingTips && (
              <div className="card p-4">
                <p className="mb-2 font-medium">Wie streng soll Gemini sein?</p>
                <div className="inline-flex rounded-xl bg-black/[0.06] p-0.5 dark:bg-white/10">
                  {([[2, 'Nur sehr unsauber'], [3, 'Normal'], [4, 'Streng']] as [number, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => updateSettings({ tipThreshold: v })} className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${settings.tipThreshold === v ? 'bg-white shadow-sm dark:bg-[#636366]' : 'text-black/60 dark:text-white/60'}`}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-[#34c759]/40 bg-[#34c759]/15 p-3.5 text-sm">
              <p className="flex items-center gap-2 font-semibold"><Check size={16} className="text-[#34c759]" /> Richtig! <span className="text-lg">먹다</span></p>
              <p className="mt-1 text-black/60 dark:text-white/60">✍️ Schönere Schrift: Das ㅓ-Strichlein etwas länger und gerader ziehen.</p>
              <p className="text-xs text-black/40 dark:text-white/40">Schrift 3/5 · Beispiel</p>
            </div>
          </Page>
        )

      case 'audio':
        return (
          <Page icon={Volume2} color="#ff3b30" title="Ton" text="Aussprache zum Mitsprechen und kleine Klänge als Rückmeldung – dezent und leise.">
            <div className="card divide-y divide-black/[0.06] dark:divide-white/10">
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">Wort automatisch vorlesen</p>
                  <p className="text-sm text-black/50 dark:text-white/50">Bei jeder neuen Lernkarte.</p>
                </div>
                <Toggle checked={settings.autoSpeak} onChange={(autoSpeak) => updateSettings({ autoSpeak })} label="Auto-Vorlesen" />
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="font-medium">Was soll vorgelesen werden?</p>
                  <p className="text-sm text-black/50 dark:text-white/50">Deutsch wird gekürzt gesprochen: „Schüler/in, Student/in“ → „Schüler, Student“.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([['both', 'Koreanisch + Deutsch'], ['ko', 'Nur Koreanisch'], ['de', 'Nur Deutsch']] as [SpeechMode, string][]).map(([v, label]) => (
                    <Choice key={v} active={settings.speechMode === v} onClick={() => { updateSettings({ speechMode: v }); speakWord({ korean: '학생', german: 'Schüler/in, Student/in' }, v) }} className="!py-2.5 text-center">
                      <span className="text-sm font-medium">{label}</span>
                    </Choice>
                  ))}
                </div>
                <p className="text-xs text-black/40 dark:text-white/40">Ein Tipp auf eine Auswahl spielt eine Hörprobe ab.</p>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">Klänge für richtig / falsch</p>
                  <p className="text-sm text-black/50 dark:text-white/50">Ein sanfter Ton, wenn du etwas geschafft hast.</p>
                </div>
                <Toggle checked={settings.soundEffects} onChange={(soundEffects) => updateSettings({ soundEffects })} label="Klänge" />
              </div>
              {settings.soundEffects && (
                <div className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-black/55 dark:text-white/55">Lautstärke</span>
                    <input type="range" min={0.1} max={1} step={0.05} value={settings.soundVolume} onChange={(e) => updateSettings({ soundVolume: +e.target.value })} className="flex-1 accent-[#007aff]" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-soft" onClick={() => playSound('success')}>▶ Richtig</button>
                    <button className="btn-soft" onClick={() => playSound('error')}>▶ Falsch</button>
                    <button className="btn-soft" onClick={() => playSound('complete')}>▶ Geschafft</button>
                  </div>
                </div>
              )}
            </div>
          </Page>
        )

      case 'conj':
        return (
          <Page icon={Repeat2} color="#00b8d4" title="Beugungsformen" text="Welche Formen von Verben und Adjektiven sollen bei Lernkarten und im Beugungs-Trainer vorkommen? Mindestens eine bleibt aktiv.">
            <div className="grid gap-2">
              {CONJUGATION_KEYS.map((k) => {
                const on = settings.activeConjugations.includes(k)
                return (
                  <Choice
                    key={k}
                    active={on}
                    onClick={() => {
                      const next = on ? settings.activeConjugations.filter((x) => x !== k) : CONJUGATION_KEYS.filter((x) => x === k || settings.activeConjugations.includes(x))
                      if (next.length) updateSettings({ activeConjugations: next })
                    }}
                    className="flex items-center justify-between"
                  >
                    <span>
                      <span className="block font-medium">{CONJUGATION_LABELS[k].label}</span>
                      <span className="text-xs text-black/50 dark:text-white/50">{CONJUGATION_LABELS[k].hint}</span>
                    </span>
                    {on && <Check size={20} className="text-[#007aff]" />}
                  </Choice>
                )
              })}
            </div>
          </Page>
        )

      case 'try':
        return (
          <Page icon={PenLine} color="#0a84ff" title="Probier es aus" text={<>Schreibe <b className="text-lg">한글</b> ins Feld und drück auf „Prüfen“. So fühlt sich dein Zeichenfeld mit den gewählten Einstellungen an – Maus, Finger und Stift funktionieren.</>}>
            <div className="card p-3 sm:p-4">
              <HangulCanvas target="한글" onResult={() => undefined} />
            </div>
          </Page>
        )

      case 'done':
      default:
        return (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div className="mb-8 grid h-24 w-24 place-items-center rounded-full bg-[#34c759] text-white shadow-2xl"><Check size={52} strokeWidth={3} /></div>
            <h1 className="text-4xl font-bold tracking-tight">Alles bereit</h1>
            <p className="mt-4 max-w-sm text-lg text-black/55 dark:text-white/55">
              Du kannst jede Einstellung später unter <b>Einstellungen</b> ändern – und die Einrichtung dort jederzeit neu starten.
            </p>
          </div>
        )
    }
  })()

  const last = idx === list.length - 1
  const first = idx === 0

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#f2f2f7] text-[#1c1c1e] dark:bg-black dark:text-[#f5f5f7]">
      <div className="mx-auto flex w-full max-w-xl items-center gap-4 px-5 pt-5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
          <div className="h-full rounded-full bg-[#007aff] transition-all duration-500" style={{ width: `${(idx / Math.max(1, list.length - 1)) * 100}%` }} />
        </div>
        {!last && <button className="text-sm font-medium text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white" onClick={finish}>Überspringen</button>}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div key={stepId} className="fade-up mx-auto w-full max-w-xl px-5 py-8">{content}</div>
      </div>

      <div className="border-t border-black/[0.06] bg-white/70 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/10 dark:bg-[#1c1c1e]/70">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          {!first && (
            <button className="btn-soft !px-4 !py-3" onClick={() => go(-1)}><ChevronLeft size={18} /> Zurück</button>
          )}
          <button
            className="btn-primary flex-1 !rounded-2xl !py-3.5 !text-base"
            onClick={() => (last ? finish() : go(1))}
          >
            {first ? 'Los geht’s' : last ? 'Loslegen' : stepId === 'key' && !hasKey ? 'Ohne KI weiter' : stepId === 'sync' && !sync.enabled ? 'Ohne Synchronisation weiter' : 'Weiter'}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-xl text-center text-xs text-black/35 dark:text-white/35">Schritt {idx + 1} von {list.length}</p>
      </div>
    </div>
  )
}
