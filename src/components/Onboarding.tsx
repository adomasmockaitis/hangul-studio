import { useState, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, Brush, Check, ChevronLeft, Cloud, ExternalLink, KeyRound, Lightbulb, Monitor, Moon, Palette,
  HeartHandshake, PenLine, Repeat2, Sun, Timer, Volume2, Waypoints, type LucideIcon,
} from 'lucide-react'
import { dynamicTimeoutMs, TIPS_TIME_FACTOR } from '../lib/gemini'
import { markReleaseSeen } from '../lib/releases'
import { speakWord } from '../lib/speech'
import { playSound } from '../lib/sounds'
import { useApp } from '../store'
import { useSync } from '../sync'
import { useStorageMode } from '../account'
import { StorageChooser } from './StorageChooser'
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
      <div className="mt-2 text-[15px] leading-relaxed text-label-2">{text}</div>
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
        active ? 'border-blue bg-blue/10' : 'border-separator bg-surface hover:bg-fill-4'
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
    <div className="relative h-20 overflow-hidden rounded-xl border border-separator bg-surface dark:bg-surface-2" style={style}>
      {kind === 'hangul' && (
        <>
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-gray-400/60" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-400/60" />
          <div className="absolute inset-1 rounded border border-gray-400/50" />
        </>
      )}
      {sample && <span className="absolute inset-0 grid place-items-center text-5xl font-bold text-label-4">가</span>}
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
  const storageMode = useStorageMode()
  const [stepId, setStepId] = useState('welcome')
  const hasKey = settings.geminiApiKey.trim().length > 0

  const STEPS: { id: string; needsKey?: boolean }[] = [
    { id: 'welcome' }, { id: 'sync' }, { id: 'contribute' }, { id: 'theme' }, { id: 'key' }, { id: 'timeout', needsKey: true }, { id: 'order' },
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
            <div className="mb-8 grid h-28 w-28 place-items-center rounded-[28px] bg-gradient-to-br from-blue to-indigo text-6xl font-bold text-white shadow-2xl">한</div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Willkommen bei<br />Hangul Studio</h1>
            <p className="mt-4 max-w-sm text-lg text-label-2">
              Koreanisch lernen – mit der Hand schreiben, prüfen lassen und gezielt wiederholen. Richten wir alles in ein paar Schritten ein.
            </p>
          </div>
        )

      case 'sync':
        return (
          <Page
            icon={Cloud}
            color="#0a84ff"
            title="Wo sollen deine Daten liegen?"
            text="Nur auf diesem Gerät, in deinem Google Drive oder in einem Hangul-Studio-Konto. Mit Drive oder Konto ist dein Lernstand auf PC, Tablet und Smartphone derselbe. Du kannst das später jederzeit ändern."
          >
            <StorageChooser compact />
            {sync.lastResult?.changedLocal && (
              <div className="card space-y-2 p-4">
                <p className="text-sm text-label-2">Dein Lernstand und deine Einstellungen von den anderen Geräten wurden geladen.</p>
                <button className="btn-soft" onClick={finish}>Einrichtung abkürzen und loslegen</button>
              </div>
            )}
          </Page>
        )

      case 'contribute':
        return (
          <Page
            icon={HeartHandshake}
            color="#ff2d55"
            title="Hilfst du mit, die Erkennung zu verbessern?"
            text="Freiwillig und jederzeit in den Einstellungen änderbar. Standardmäßig aus."
          >
            <div className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">App mitverbessern</p>
                  <p className="text-sm text-label-2">
                    Liegt die Handschrift-Erkennung daneben oder widersprichst du Gemini, wird dieser Fall gesendet: das Bild der Schrift, das Zielwort, das Erkannte, das Modell und das Datum.
                  </p>
                </div>
                <Toggle checked={settings.contribute} onChange={(contribute) => updateSettings({ contribute })} label="App mitverbessern" />
              </div>
              <ul className="space-y-1 text-sm text-label-2">
                <li>• <b>Ohne Bezug zu dir:</b> keine Nutzer-ID, keine E-Mail, keine Geräteinfos.</li>
                <li>• Nur der Entwickler kann die Fälle lesen, sie dienen nur der Verbesserung der Erkennung.</li>
                <li>• Weil nichts zuordenbar ist, lassen sich gesendete Fälle später nicht einzeln löschen.</li>
              </ul>
              {settings.contribute && storageMode !== 'account' && (
                <p className="text-sm text-orange">Gesendet wird nur, solange du mit einem Hangul-Studio-Konto angemeldet bist.</p>
              )}
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue"
            >
              Kostenlosen Key bei Google AI Studio holen <ExternalLink size={14} />
            </a>
            <p className="rounded-2xl bg-fill-4 p-3 text-sm text-label-2">
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
                <input type="range" min={2} max={15} value={settings.geminiTimeoutSec} onChange={(e) => updateSettings({ geminiTimeoutSec: +e.target.value })} className="flex-1 accent-blue" />
                <span className="w-14 text-right text-2xl font-bold tabular-nums">{settings.geminiTimeoutSec} s</span>
              </div>
              <p className="label mb-1 mt-4">So viel Zeit bekommt …</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {[['가', '1 Zeichen'], ['학교', '2 Zeichen'], ['한국어', '3 Zeichen'], ['감사합니다', '5 Zeichen']].map(([w, l]) => (
                  <div key={w} className="flex justify-between border-b border-separator py-1">
                    <span><b className="mr-1.5 text-base">{w}</b> <span className="text-label-3">{l}</span></span>
                    <span className="font-semibold tabular-nums">{(dynamicTimeoutMs(settings.geminiTimeoutSec, w, false) / 1000).toFixed(1)} s</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-label-3">
                Mit aktiven Schreib-Tipps (nächste Seiten) gilt die Basiszeit ×{TIPS_TIME_FACTOR}.
              </p>
            </div>
            <p className="text-sm text-label-2">Empfehlung: 5 Sekunden.</p>
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
                <li key={s.method} className={`flex items-center gap-3 rounded-2xl border p-3 ${s.enabled ? 'border-separator bg-surface' : 'border-dashed border-separator opacity-60'}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue text-sm font-bold text-white">
                    {s.enabled ? settings.checkOrder.slice(0, i + 1).filter((x) => x.enabled).length : '–'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{METHOD_INFO[s.method].title}</p>
                    <p className="text-xs text-label-2">{METHOD_INFO[s.method].desc}</p>
                  </div>
                  <button className="btn-soft !p-1.5" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Nach oben"><ArrowUp size={15} /></button>
                  <button className="btn-soft !p-1.5" disabled={i === settings.checkOrder.length - 1} onClick={() => moveStep(i, 1)} aria-label="Nach unten"><ArrowDown size={15} /></button>
                  <Toggle checked={s.enabled} onChange={(enabled) => updateSettings({ checkOrder: settings.checkOrder.map((x) => (x.method === s.method ? { ...x, enabled } : x)) })} label={METHOD_INFO[s.method].title} />
                </li>
              ))}
            </ol>
            {!hasKey && <p className="text-sm text-label-2">Gemini ist ausgeschaltet, weil kein Key eingetragen ist.</p>}
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
                <p className="text-sm text-label-2">Das Wort erscheint hell im Hintergrund – siehst du oben in der Vorschau.</p>
              </div>
              <Toggle checked={settings.showTemplate} onChange={(showTemplate) => updateSettings({ showTemplate })} label="Vorlage" />
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">Standard-Strichdicke</p>
                <input type="range" min={2} max={16} value={settings.strokeWidth} onChange={(e) => updateSettings({ strokeWidth: +e.target.value })} className="w-40 accent-blue" />
              </div>
              <div className="mt-3 grid h-12 place-items-center rounded-xl bg-surface dark:bg-surface-2">
                <div className="w-3/4 rounded-full bg-label" style={{ height: settings.strokeWidth }} />
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
                <p className="text-sm text-label-2">Lässt sich dort jederzeit minimieren.</p>
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
                <p className="text-sm text-label-2">
                  Zeitlimit dann: {+(settings.geminiTimeoutSec * (settings.writingTips ? TIPS_TIME_FACTOR : 1)).toFixed(1)} s statt {settings.geminiTimeoutSec} s
                </p>
              </div>
              <Toggle checked={settings.writingTips} onChange={(writingTips) => updateSettings({ writingTips })} label="Schreib-Tipps" />
            </div>
            <div className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Beispielsätze automatisch erzeugen</p>
                <p className="text-sm text-label-2">Fehlen einem Wort Beispielsätze, schreibt Gemini beim Lernen zwei passend zu deinem Stand – einmal pro Wort.</p>
              </div>
              <Toggle checked={settings.autoExamples} onChange={(autoExamples) => updateSettings({ autoExamples })} label="Beispielsätze automatisch erzeugen" />
            </div>
            <div className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Partikel-Trainer: neue Wörter einbauen</p>
                <p className="text-sm text-label-2">Übungssätze entstehen aus deinen Wörtern. An: Gemini darf auch ein paar neue Wörter einbauen – anfangs nur wenige, mit Übersetzung.</p>
              </div>
              <Toggle checked={settings.particleNewWords} onChange={(particleNewWords) => updateSettings({ particleNewWords })} label="Neue Wörter im Partikel-Trainer" />
            </div>
            {settings.writingTips && (
              <div className="card p-4">
                <p className="mb-2 font-medium">Wie streng soll Gemini sein?</p>
                <div className="inline-flex rounded-xl bg-fill-3 p-0.5">
                  {([[2, 'Nur sehr unsauber'], [3, 'Normal'], [4, 'Streng']] as [number, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => updateSettings({ tipThreshold: v })} className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${settings.tipThreshold === v ? 'bg-surface shadow-sm dark:bg-[#636366]' : 'text-label-2'}`}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-green/40 bg-green/15 p-3.5 text-sm">
              <p className="flex items-center gap-2 font-semibold"><Check size={16} className="text-green" /> Richtig! <span className="text-lg">먹다</span></p>
              <p className="mt-1 text-label-2">✍️ Schönere Schrift: Das ㅓ-Strichlein etwas länger und gerader ziehen.</p>
              <p className="text-xs text-label-3">Schrift 3/5 · Beispiel</p>
            </div>
          </Page>
        )

      case 'audio':
        return (
          <Page icon={Volume2} color="#ff3b30" title="Ton" text="Aussprache zum Mitsprechen und kleine Klänge als Rückmeldung – dezent und leise.">
            <div className="card divide-y divide-separator">
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">Wort automatisch vorlesen</p>
                  <p className="text-sm text-label-2">Bei jeder neuen Lernkarte.</p>
                </div>
                <Toggle checked={settings.autoSpeak} onChange={(autoSpeak) => updateSettings({ autoSpeak })} label="Auto-Vorlesen" />
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="font-medium">Was soll vorgelesen werden?</p>
                  <p className="text-sm text-label-2">Deutsch wird gekürzt gesprochen: „Schüler/in, Student/in“ → „Schüler, Student“.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([['both', 'Koreanisch + Deutsch'], ['ko', 'Nur Koreanisch'], ['de', 'Nur Deutsch']] as [SpeechMode, string][]).map(([v, label]) => (
                    <Choice key={v} active={settings.speechMode === v} onClick={() => { updateSettings({ speechMode: v }); speakWord({ korean: '학생', german: 'Schüler/in, Student/in' }, v) }} className="!py-2.5 text-center">
                      <span className="text-sm font-medium">{label}</span>
                    </Choice>
                  ))}
                </div>
                <p className="text-xs text-label-3">Ein Tipp auf eine Auswahl spielt eine Hörprobe ab.</p>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">Klänge für richtig / falsch</p>
                  <p className="text-sm text-label-2">Ein sanfter Ton, wenn du etwas geschafft hast.</p>
                </div>
                <Toggle checked={settings.soundEffects} onChange={(soundEffects) => updateSettings({ soundEffects })} label="Klänge" />
              </div>
              {settings.soundEffects && (
                <div className="space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-label-2">Lautstärke</span>
                    <input type="range" min={0.1} max={1} step={0.05} value={settings.soundVolume} onChange={(e) => updateSettings({ soundVolume: +e.target.value })} className="flex-1 accent-blue" />
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
                      <span className="text-xs text-label-2">{CONJUGATION_LABELS[k].hint}</span>
                    </span>
                    {on && <Check size={20} className="text-blue" />}
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
            <div className="mb-8 grid h-24 w-24 place-items-center rounded-full bg-green text-white shadow-2xl"><Check size={52} strokeWidth={3} /></div>
            <h1 className="text-4xl font-bold tracking-tight">Alles bereit</h1>
            <p className="mt-4 max-w-sm text-lg text-label-2">
              Du kannst jede Einstellung später unter <b>Einstellungen</b> ändern – und die Einrichtung dort jederzeit neu starten.
            </p>
          </div>
        )
    }
  })()

  const last = idx === list.length - 1
  const first = idx === 0

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-page text-label">
      <div className="mx-auto flex w-full max-w-xl items-center gap-4 px-5 pt-5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill-2">
          <div className="h-full rounded-full bg-blue transition-all duration-500" style={{ width: `${(idx / Math.max(1, list.length - 1)) * 100}%` }} />
        </div>
        {!last && <button className="min-h-11 text-sm font-medium text-label-2 hover:text-label" onClick={finish}>Überspringen</button>}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div key={stepId} className="fade-up mx-auto w-full max-w-xl px-5 py-8">{content}</div>
      </div>

      <div className="glass mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-[28px] px-4 py-3 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          {!first && (
            <button className="btn-soft !px-4 !py-3" onClick={() => go(-1)}><ChevronLeft size={18} /> Zurück</button>
          )}
          <button
            className="btn-primary flex-1 !py-3.5 !text-base"
            onClick={() => (last ? finish() : go(1))}
          >
            {first ? 'Los geht’s' : last ? 'Loslegen' : stepId === 'key' && !hasKey ? 'Ohne KI weiter' : stepId === 'sync' && storageMode === 'local' ? 'Nur auf diesem Gerät weiter' : 'Weiter'}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-xl text-center text-xs text-label-2">Schritt {idx + 1} von {list.length}</p>
      </div>
    </div>
  )
}
