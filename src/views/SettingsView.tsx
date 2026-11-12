import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Cloud, CloudOff, Download, Zap, Eye, EyeOff, Loader2, Monitor, Moon, RefreshCw, RotateCcw, Sparkles, Sun, Trash2, Upload } from 'lucide-react'
import { PageHeader, Segmented, Toggle } from '../components/ui'
import { playSound } from '../lib/sounds'
import { listModels, measureModels, MODEL_PRESETS, TIPS_TIME_FACTOR, setLastWorkingModel, warmup, type SpeedResult } from '../lib/gemini'
import { exportAllDevData } from '../lib/devExport'
import { clearDisputes, loadDisputes } from '../lib/geminiDisputes'
import { clearSamples, loadSamples, summarize } from '../lib/inputToolsLog'
import { BATCH_SIZE, clearPending, loadPending, processPending } from '../lib/inputToolsQueue'
import { useApp } from '../store'
import { useSync } from '../sync'
import { CONJUGATION_KEYS, CONJUGATION_LABELS, type CanvasBackground, type CheckMethod, type StrokeStyleMode, type ThemeMode } from '../types'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="label mb-2 px-2">{title}</h2>
      <div className="card divide-y divide-black/[0.06] dark:divide-white/10">{children}</div>
    </section>
  )
}

function Row({ title, desc, children, stack }: { title: string; desc?: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={`flex gap-3 p-4 ${stack ? 'flex-col' : 'flex-wrap items-center justify-between'}`}>
      <div className="min-w-0 max-w-md">
        <p className="font-medium">{title}</p>
        {desc && <p className="text-sm text-black/50 dark:text-white/50">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

export function SettingsView({ onRestartOnboarding }: { onRestartOnboarding?: () => void }) {
  const sync = useSync()
  const { settings, updateSettings, exportBackup, importBackup, words, resetStats, restoreDemo, clearAll } = useApp()
  const [showKey, setShowKey] = useState(false)
  const [withKey, setWithKey] = useState(false)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [models, setModels] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [modelErr, setModelErr] = useState('')

  const loadModels = async (force = false) => {
    const key = settings.geminiApiKey.trim()
    if (!key) return
    setLoading(true)
    setModelErr('')
    try {
      setModels(await listModels(key, force))
    } catch (e) {
      setModels(null)
      setModelErr(`Modelle konnten nicht geladen werden: ${e instanceof Error ? e.message : 'Fehler'}`)
    } finally {
      setLoading(false)
    }
  }

  // Automatisch laden, sobald ein plausibler API-Key eingegeben wurde
  useEffect(() => {
    const key = settings.geminiApiKey.trim()
    if (key.length < 30) return
    const id = setTimeout(() => void loadModels(), 800)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.geminiApiKey])
  const MODEL_NOTES = ['Schnellster · 500 Anfragen/Tag', '500 Anfragen/Tag', 'Stark für große PDFs/Übungsblätter', 'Oft ausgelastet', 'Oft ausgelastet · nur 20/Tag']
  const chooseModel = (m: string, check = true) => {
    updateSettings({ geminiModel: m })
    if (m.trim()) setLastWorkingModel(m.trim())
    if (check) void warmup(settings.geminiApiKey, true)
  }

  const METHOD_INFO: Record<CheckMethod, { title: string; desc: string }> = {
    inputtools: { title: 'Input Tools (Strichanalyse)', desc: 'Sehr schnell, kostenlos, ohne API-Key. Inoffiziell; nur Strichkoordinaten gehen an Google.' },
    gemini: { title: 'Gemini (KI-Bild)', desc: 'Liest dein Bild. Braucht API-Key, kann bei Überlastung langsamer sein.' },
    manual: { title: 'Selbst-Check', desc: 'Musterlösung einblenden, du bewertest dich selbst. Funktioniert immer offline.' },
  }
  const moveStep = (i: number, d: -1 | 1) => {
    const o = [...settings.checkOrder]
    ;[o[i], o[i + d]] = [o[i + d], o[i]]
    updateSettings({ checkOrder: o })
  }

  const [disputes, setDisputes] = useState(() => loadDisputes())
  const [pendingCount, setPendingCount] = useState(() => loadPending().length)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchMsg, setBatchMsg] = useState('')
  const runBatchNow = async () => {
    setBatchBusy(true)
    setBatchMsg('')
    try {
      const n = await processPending(settings.geminiApiKey, settings.geminiModel, setBatchMsg)
      setBatchMsg(n ? n + ' Fälle nachgeprüft und gespeichert.' : 'Es wurde nichts verarbeitet.')
    } catch (e) {
      setBatchMsg('Nachprüfung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'))
    } finally {
      setBatchBusy(false)
      setPendingCount(loadPending().length)
      setSamples(loadSamples())
    }
  }
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const refreshDev = () => {
    setSamples(loadSamples())
    setDisputes(loadDisputes())
    setPendingCount(loadPending().length)
  }
  const runExport = async () => {
    setExporting(true)
    setExportMsg('')
    try {
      const r = await exportAllDevData(settings, setExportMsg)
      setExportMsg(
        `Fertig: ${r.samples} Rückmeldungen, ${r.disputes} Widersprüche, ${r.pending} unbewertet, ${r.images} Bilder${r.processedNow ? `, ${r.processedNow} Fälle gerade nachgeprüft` : ''}.` +
          (r.note ? ` ⚠ ${r.note}` : '') +
          ' Die Datei liegt in deinen Downloads.',
      )
    } catch (e) {
      setExportMsg('Export fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Fehler'))
    } finally {
      setExporting(false)
      refreshDev()
    }
  }
  const [samples, setSamples] = useState(() => loadSamples())
  const sum = summarize(samples)
  const [speed, setSpeed] = useState<SpeedResult[]>([])
  const [testing, setTesting] = useState(false)
  const fastest = speed.filter((r) => r.ms !== null).sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0))[0]?.model

  const runSpeedTest = async () => {
    setTesting(true)
    setSpeed([])
    try {
      await measureModels(settings.geminiApiKey, (r) => setSpeed((s) => [...s, r]))
    } finally {
      setTesting(false)
    }
  }
  const toggleConj = (k: (typeof CONJUGATION_KEYS)[number]) => {
    const has = settings.activeConjugations.includes(k)
    const next = has ? settings.activeConjugations.filter((x) => x !== k) : CONJUGATION_KEYS.filter((x) => x === k || settings.activeConjugations.includes(x))
    if (next.length) updateSettings({ activeConjugations: next }) // mindestens eine Form bleibt aktiv
  }

  const onImport = async (file: File) => {
    if (mode === 'replace' && !confirm('Alle aktuellen Vokabeln und Lernstände werden ersetzt. Fortfahren?')) return
    try {
      const { words: n } = importBackup(await file.text(), mode)
      setMsg({ ok: true, text: `Backup importiert (${n} Wörter).` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Import fehlgeschlagen.' })
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Einstellungen" />

      <Section title="Einrichtung">
        <Row title="Einrichtung erneut starten" desc="Führt dich nochmal Schritt für Schritt durch die wichtigsten Einstellungen.">
          <button className="btn-soft" onClick={onRestartOnboarding}><Sparkles size={16} /> Einrichtung starten</button>
        </Row>
      </Section>

      <Section title="Darstellung">
        <Row title="Theme">
          <Segmented<ThemeMode>
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'light', label: <><Sun size={14} /> Hell</> },
              { value: 'dark', label: <><Moon size={14} /> Dunkel</> },
              { value: 'system', label: <><Monitor size={14} /> System</> },
            ]}
          />
        </Row>
      </Section>

      <Section title="KI & Prüfung">
        <Row title="Gemini API-Key" desc="Wird nur lokal gespeichert und direkt an Google gesendet ." stack>
          <div className="flex gap-2">
            <input
              className="input"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza…"
              value={settings.geminiApiKey}
              onChange={(e) => updateSettings({ geminiApiKey: e.target.value })}
            />
            <button className="btn-soft shrink-0" onClick={() => setShowKey((s) => !s)} aria-label="Key anzeigen">{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </Row>
        <Row title="Gemini Modell" desc="Bei Überlastung, 404 oder Timeout (8 s) wechselt die App sofort zum nächsten Modell der Kette und merkt sich das schnellste funktionierende." stack>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={() => void loadModels(true)} disabled={!settings.geminiApiKey.trim() || loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Verfügbare Modelle laden
            </button>
            {models && <span className="text-xs text-black/50 dark:text-white/50">{models.length} Modelle gefunden</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-soft" onClick={() => void runSpeedTest()} disabled={!settings.geminiApiKey.trim() || testing}>
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Geschwindigkeit der Modelle messen
            </button>
            <span className="text-xs text-black/50 dark:text-white/50">10 winzige Anfragen (2 pro Modell)</span>
          </div>
          {speed.length > 0 && (
            <ul className="space-y-1 text-sm">
              {speed.map((r) => (
                <li key={r.model} className="flex items-center gap-2">
                  <span className="w-44 truncate font-medium">{r.model}</span>
                  {r.ms === null ? <span className="text-[#ff3b30]">nicht verfügbar</span> : <span className={r.model === fastest ? 'font-semibold text-[#34c759]' : ''}>{r.ms} ms{r.model === fastest ? ' · am schnellsten' : ''}</span>}
                  {r.ms !== null && settings.geminiModel !== r.model && <button className="btn-soft !px-2 !py-0.5 text-xs" onClick={() => chooseModel(r.model, false)}>Wählen</button>}
                </li>
              ))}
            </ul>
          )}
          {modelErr && <p className="text-sm text-[#ff3b30]">{modelErr}</p>}
          {models && models.length > 0 && (
            <select className="input" value={models.includes(settings.geminiModel) ? settings.geminiModel : ''} onChange={(e) => e.target.value && chooseModel(e.target.value)}>
              {!models.includes(settings.geminiModel) && <option value="">– Modell wählen –</option>}
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {MODEL_PRESETS.map((m, i) => (
              <button
                key={m}
                onClick={() => chooseModel(m)}
                className={`rounded-xl border p-3 text-left transition ${settings.geminiModel === m ? 'border-[#007aff] bg-[#007aff]/10' : 'border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/5'}`}
              >
                <p className="text-sm font-semibold">{m}{i === 0 && <span className="ml-1.5 rounded-full bg-[#34c759]/20 px-1.5 py-0.5 text-[10px] text-[#34c759]">Standard</span>}</p>
                <p className="text-xs text-black/50 dark:text-white/50">{MODEL_NOTES[i]}</p>
              </button>
            ))}
          </div>
          <input
            className="input"
            spellCheck={false}
            placeholder="Eigener Modellname, z. B. gemini-flash-latest"
            value={settings.geminiModel}
            onChange={(e) => chooseModel(e.target.value, false)}
          />
        </Row>
        <Row title="Gemini-Zeitlimit" desc="Antwortet Gemini (inklusive Modellwechsel) in dieser Zeit nicht, springt die App zur nächsten Methode. Bei längeren Wörtern kommt automatisch Zeit dazu (ab 3 Zeichen +0,5 s je Zeichen, höchstens +2 s). Sind die Schreib-Tipps an, gilt die Basiszeit x1,5, weil Gemini dann länger braucht.">
          <div className="flex items-center gap-3">
            <input type="range" min={2} max={15} value={settings.geminiTimeoutSec} onChange={(e) => updateSettings({ geminiTimeoutSec: +e.target.value })} className="w-36 accent-[#007aff]" />
            <span className="min-w-10 text-right text-sm font-medium tabular-nums">{settings.geminiTimeoutSec} s{settings.writingTips && <span className="block text-xs font-normal text-black/50 dark:text-white/50">mit Tipps: {+(settings.geminiTimeoutSec * TIPS_TIME_FACTOR).toFixed(1)} s</span>}</span>
          </div>
        </Row>
        <Row title="Reihenfolge der Handschrift-Prüfung" desc="Die App probiert die aktiven Methoden von oben nach unten. Fällt eine aus (Netzwerk, Überlastung, kein Key), geht es automatisch mit der nächsten weiter. Der Selbst-Check zeigt die Musterlösung und fragt dich." stack>
          <ol className="space-y-2">
            {settings.checkOrder.map((s, i) => (
              <li key={s.method} className={`flex items-center gap-3 rounded-xl border p-3 ${s.enabled ? 'border-black/10 dark:border-white/10' : 'border-dashed border-black/10 opacity-60 dark:border-white/10'}`}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#007aff] text-xs font-bold text-white">{s.enabled ? settings.checkOrder.slice(0, i + 1).filter((x) => x.enabled).length : '–'}</span>
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
        </Row>
      </Section>

      <Section title="Zeichenfeld">
        <Row title="Hintergrund">
          <select className="input !w-auto" value={settings.canvasBackground} onChange={(e) => updateSettings({ canvasBackground: e.target.value as CanvasBackground })}>
            <option value="blank">Weiß (Blanko)</option>
            <option value="grid">Kariert (Grid)</option>
            <option value="lined">Liniert</option>
            <option value="hangul">Hangul-Silbenraster</option>
          </select>
        </Row>
        <Row title="Blasse Wort-Vorlage zum Nachspuren anzeigen">
          <Toggle checked={settings.showTemplate} onChange={(showTemplate) => updateSettings({ showTemplate })} label="Vorlage" />
        </Row>
        <Row title="Strichreihenfolge (Stroke Order) im Lernmodus anzeigen">
          <Toggle checked={settings.showStrokeOrder} onChange={(showStrokeOrder) => updateSettings({ showStrokeOrder })} label="Strichreihenfolge" />
        </Row>
        <Row title="Darstellung der Strichreihenfolge">
          <Segmented<StrokeStyleMode>
            value={settings.strokeOrderStyle}
            onChange={(strokeOrderStyle) => updateSettings({ strokeOrderStyle })}
            options={[{ value: 'numbers', label: 'Zahlen & Richtungspfeile' }, { value: 'animation', label: 'Animation' }]}
          />
        </Row>
        <Row title="Schreib-Tipps von Gemini" desc="Wenn ein Zeichen richtig erkannt wird, aber unsauber aussieht, gibt Gemini einen kurzen Tipp. Kostet etwas Antwortzeit.">
          <Toggle checked={settings.writingTips} onChange={(writingTips) => updateSettings({ writingTips })} label="Schreib-Tipps" />
        </Row>
        {settings.writingTips && (
          <Row title="Strenge der Schreib-Tipps" desc="Ab welcher Schriftnote (1–5) Gemini einen Tipp gibt.">
            <Segmented<string>
              value={String(settings.tipThreshold)}
              onChange={(v) => updateSettings({ tipThreshold: Number(v) })}
              options={[{ value: '2', label: 'Nur sehr unsauber' }, { value: '3', label: 'Normal' }, { value: '4', label: 'Streng' }]}
            />
          </Row>
        )}
        <Row title="Standard-Strichdicke">
          <input type="range" min={2} max={16} value={settings.strokeWidth} onChange={(e) => updateSettings({ strokeWidth: +e.target.value })} className="w-40 accent-[#007aff]" />
        </Row>
      </Section>

      <Section title="Audio & Lernen">
        <Row title="Wort automatisch vorlesen bei neuer Karte">
          <Toggle checked={settings.autoSpeak} onChange={(autoSpeak) => updateSettings({ autoSpeak })} label="Auto-Vorlesen" />
        </Row>
        <Row title="Klänge für richtig / falsch" desc="Dezente, leise Töne als Rückmeldung.">
          <Toggle checked={settings.soundEffects} onChange={(soundEffects) => updateSettings({ soundEffects })} label="Klänge" />
        </Row>
        {settings.soundEffects && (
          <Row title="Lautstärke der Klänge">
            <div className="flex flex-wrap items-center gap-2">
              <input type="range" min={0.1} max={1} step={0.05} value={settings.soundVolume} onChange={(e) => updateSettings({ soundVolume: +e.target.value })} className="w-36 accent-[#007aff]" />
              <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={() => playSound('success')}>▶ Richtig</button>
              <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={() => playSound('error')}>▶ Falsch</button>
            </div>
          </Row>
        )}
        <Row title="Aktive Beugungsformen" desc="Gelten für Lernkarten und den Beugungs-Trainer." stack>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONJUGATION_KEYS.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl bg-black/[0.04] px-3 py-2.5 dark:bg-white/5">
                <input type="checkbox" className="h-4.5 w-4.5 accent-[#007aff]" checked={settings.activeConjugations.includes(k)} onChange={() => toggleConj(k)} />
                <span className="text-sm">
                  <span className="font-medium">{CONJUGATION_LABELS[k].label}</span>
                  <span className="block text-xs text-black/50 dark:text-white/50">{CONJUGATION_LABELS[k].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Synchronisation (Google Drive)">
        <Row
          title="Geräte automatisch abgleichen"
          desc="Speichert deinen Lernstand in einem versteckten App-Ordner deines eigenen Google Drive und gleicht ihn zwischen PC, Tablet und Smartphone ab. Nur diese App kann die Datei lesen."
          stack
        >
          {!sync.clientId ? (
            <>
              <p className="text-sm text-black/60 dark:text-white/60">
                Für die Anmeldung braucht die App eine <b>Google-Client-ID</b>. Wie du sie in wenigen Minuten erstellst, steht in der{' '}
                <a className="font-medium text-[#007aff]" href="https://github.com/adomasmockaitis/hangul-studio/blob/main/docs/GOOGLE-DRIVE-SYNC.md" target="_blank" rel="noreferrer">Anleitung</a>.
              </p>
              <input
                className="input"
                spellCheck={false}
                placeholder="1234567890-abc….apps.googleusercontent.com"
                value={settings.googleClientId}
                onChange={(e) => updateSettings({ googleClientId: e.target.value })}
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {!sync.enabled || sync.state === 'needs-auth' ? (
                  <button className="btn-primary" onClick={() => void sync.connect()} disabled={sync.state === 'syncing'}>
                    {sync.state === 'syncing' ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
                    {sync.enabled ? 'Erneut verbinden' : 'Mit Google Drive verbinden'}
                  </button>
                ) : (
                  <>
                    <button className="btn-primary" onClick={() => void sync.syncNow()} disabled={sync.state === 'syncing'}>
                      {sync.state === 'syncing' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Jetzt synchronisieren
                    </button>
                    <button className="btn-soft" onClick={sync.disconnect}><CloudOff size={16} /> Trennen</button>
                  </>
                )}
              </div>
              <p className="text-sm text-black/60 dark:text-white/60">
                {sync.state === 'error' ? <span className="text-[#ff3b30]">{sync.error}</span>
                  : sync.state === 'needs-auth' ? 'Bitte kurz erneut mit Google verbinden (die Anmeldung ist abgelaufen).'
                  : sync.enabled ? `✓ Verbunden${sync.lastSync ? ` · zuletzt synchronisiert ${new Date(sync.lastSync).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`
                  : 'Noch nicht verbunden.'}
              </p>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.04] p-3 dark:bg-white/5">
                <div>
                  <p className="text-sm font-medium">API-Key mitsynchronisieren</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Standardmäßig aus: Der Key bleibt nur auf diesem Gerät.</p>
                </div>
                <Toggle checked={settings.syncApiKey} onChange={(syncApiKey) => updateSettings({ syncApiKey })} label="API-Key synchronisieren" />
              </div>
              <details className="text-sm text-black/55 dark:text-white/55">
                <summary className="cursor-pointer">Eigene Client-ID verwenden</summary>
                <input className="input mt-2" spellCheck={false} placeholder="…apps.googleusercontent.com" value={settings.googleClientId} onChange={(e) => updateSettings({ googleClientId: e.target.value })} />
              </details>
            </>
          )}
        </Row>
      </Section>

      <Section title="Backup & Sync">
        <Row title="Backup exportieren (.json)" desc="Alle Vokabeln, Lernstände und Einstellungen – zum Übertragen auf andere Geräte.">
          <div className="flex flex-col items-end gap-2">
            <button className="btn-primary" onClick={() => exportBackup(withKey)}><Download size={16} /> Backup Exportieren</button>
            <label className="flex items-center gap-2 text-xs text-black/55 dark:text-white/55">
              <input type="checkbox" className="accent-[#007aff]" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} /> API-Key einschließen
            </label>
          </div>
        </Row>
        <Row title="Backup importieren" desc="Zusammenführen behält bessere Lernstände beider Seiten; Ersetzen überschreibt alles." stack>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<'merge' | 'replace'> value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Zusammenführen' }, { value: 'replace', label: 'Ersetzen' }]} />
            <button className="btn-soft" onClick={() => fileRef.current?.click()}><Upload size={16} /> Backup Importieren</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }} />
          </div>
          {msg && <p className={`text-sm ${msg.ok ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>{msg.text}</p>}
        </Row>
      </Section>

      <Section title="Entwickler">
        <Row title="Alles exportieren (eine Datei)" desc="Ein Klick: wartende Fälle werden zuerst von Gemini nachgeprüft, dann entsteht EINE .zip-Datei mit allen Daten (data.json) und allen Bildern (Ordner images/). Diese Datei kannst du mir geben, damit ich Input-Tools-Erkennung und Gemini-Prompt auswerten und verbessern kann." stack>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary !px-5 !py-2.5" disabled={exporting || (!sum.total && !disputes.length && !pendingCount)} onClick={() => void runExport()}>
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Alles exportieren (.zip)
            </button>
            <span className="text-sm text-black/60 dark:text-white/60">
              {sum.total} Rückmeldungen · {disputes.length} Widersprüche · {pendingCount} wartend
            </span>
          </div>
          {exportMsg && <p className="text-sm text-black/60 dark:text-white/60">{exportMsg}</p>}
        </Row>
        <Row title="Automatische Gemini-Nachprüfung" desc={`Springt Input Tools wegen eines Gemini-Ausfalls ein, wird der Fall vorgemerkt. Sobald ${BATCH_SIZE} Fälle vorliegen, bewertet Gemini sie alle in EINEM Request. Beim Export passiert das automatisch für alle wartenden Fälle.`} stack>
          <div className="flex flex-wrap items-center gap-3">
            <Toggle checked={settings.autoLabel} onChange={(autoLabel) => updateSettings({ autoLabel })} label="Automatische Nachprüfung" />
            <span className="text-sm text-black/60 dark:text-white/60">{pendingCount} / {BATCH_SIZE} Fälle vorgemerkt</span>
            <button className="btn-soft" disabled={!pendingCount || !settings.geminiApiKey.trim() || batchBusy} onClick={() => void runBatchNow()}>
              {batchBusy ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Jetzt nachprüfen
            </button>
          </div>
          {batchMsg && <p className="text-sm text-black/55 dark:text-white/55">{batchMsg}</p>}
        </Row>
        <Row title="Statistik" stack>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span><b className="text-lg">{sum.total}</b> Einträge</span>
            <span><b className="text-lg">{sum.accuracy === null ? '–' : `${sum.accuracy}%`}</b> Input Tools richtig erkannt</span>
            {sum.agreement.agree + sum.agreement.disagree > 0 && (
              <span title="Wie oft Input Tools und Gemini beim parallelen Lauf dasselbe gelesen haben">
                <b className="text-lg">{Math.round((sum.agreement.agree / (sum.agreement.agree + sum.agreement.disagree)) * 100)}%</b> Übereinstimmung mit Gemini ({sum.agreement.agree + sum.agreement.disagree} Vergleiche)
              </span>
            )}
            <span><b className="text-lg">{disputes.length}</b> Widersprüche gegen Gemini</span>
          </div>
          {sum.topConfusions.length > 0 && (
            <ul className="text-sm text-black/60 dark:text-white/60">
              {sum.topConfusions.slice(0, 5).map((c) => <li key={c.pair}>{c.pair} <span className="text-black/40 dark:text-white/40">· {c.count}×</span></li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={refreshDev}><RefreshCw size={16} /> Aktualisieren</button>
            <button
              className="btn-soft !text-[#ff3b30]"
              disabled={!sum.total && !disputes.length && !pendingCount}
              onClick={() => {
                if (confirm('Alle gesammelten Entwickler-Daten (Rückmeldungen, Widersprüche, wartende Fälle) löschen? Tipp: Vorher exportieren.')) {
                  clearSamples()
                  clearDisputes()
                  clearPending()
                  refreshDev()
                }
              }}
            >
              <Trash2 size={16} /> Alle Entwickler-Daten löschen
            </button>
          </div>
        </Row>
      </Section>
      <p className="mb-6 px-2 text-center text-xs text-black/40 dark:text-white/40">
        <a className="underline" href={`${import.meta.env.BASE_URL}datenschutz.html`} target="_blank" rel="noreferrer">Datenschutz</a>
        {' · '}
        <a className="underline" href="https://github.com/adomasmockaitis/hangul-studio" target="_blank" rel="noreferrer">Quellcode auf GitHub</a>
      </p>

      <Section title="Daten">
        <Row title="Lernstände zurücksetzen" desc={`Setzt Statistiken aller ${words.length} Wörter zurück.`}>
          <button className="btn-soft" onClick={() => confirm('Alle Lernstände zurücksetzen?') && resetStats()}><RotateCcw size={16} /> Zurücksetzen</button>
        </Row>
        <Row title="Demo-Set wiederherstellen" desc="Ersetzt alle Vokabeln durch die 12 Beispielwörter.">
          <button className="btn-soft" onClick={() => confirm('Alle Vokabeln durch das Demo-Set ersetzen?') && restoreDemo()}>Demo laden</button>
        </Row>
        <Row title="Alle Vokabeln löschen">
          <button className="btn-soft !text-[#ff3b30]" onClick={() => confirm('Wirklich ALLE Vokabeln und Lernstände löschen? Das lässt sich nicht rückgängig machen.') && clearAll()}><Trash2 size={16} /> Löschen</button>
        </Row>
      </Section>
    </div>
  )
}
