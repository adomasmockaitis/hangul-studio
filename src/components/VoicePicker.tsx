/**
 * Stimmenauswahl (Einstellungen und Onboarding): natürliche Gemini-Stimme oder Systemstimme,
 * je mit Hörprobe; dazu die Systemstimmen für Koreanisch und Deutsch.
 */
import { useEffect, useState } from 'react'
import { Check, KeyRound, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react'
import { GEMINI_VOICES, type ClipLang } from '../lib/audio/clips'
import { audioSyncInfo, clearClips, clipQueueSize, clipStats, coverage, retryFailed, ttsOverview } from '../lib/audio/voice'
import { navigate } from '../lib/route'
import { SAMPLE_KO, onVoicesChanged, prepareWords, speakSlow, previewGeminiVoice, previewSystemVoice, regenerateWords, systemVoices, voiceItems } from '../lib/speech'
import { VoiceLegend, useClipsVersion } from './VoiceStatus'
import { useApp } from '../store'
import { Segmented, useConfirm } from './ui'

export function VoicePicker({ compact = false }: { compact?: boolean }) {
  const { settings, updateSettings } = useApp()
  const hasKey = !!settings.geminiApiKey.trim()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const preview = async (voice: string) => {
    setBusy(voice)
    setFailed(null)
    const ok = await previewGeminiVoice(voice)
    setBusy(null)
    if (!ok) setFailed(voice)
  }

  return (
    <div className="space-y-4">
      <Segmented<'gemini' | 'system'>
        label="Stimme"
        value={settings.voiceSource}
        onChange={(voiceSource) => updateSettings({ voiceSource })}
        options={[{ value: 'gemini', label: 'Natürlich (Gemini)' }, { value: 'system', label: 'Systemstimme' }]}
      />

      {settings.voiceSource === 'gemini' && (
        hasKey ? (
          <div className="space-y-2">
            <p className="text-sm text-label-2">
              Wörter und Sätze werden einmal mit Gemini aufgenommen, geprüft und gespeichert – danach spielen sie sofort. Bis dahin spricht die Systemstimme.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GEMINI_VOICES.map((v) => {
                const on = settings.geminiVoice === v.id
                return (
                  <div key={v.id} className={`flex items-center gap-2 rounded-2xl border p-2.5 transition-colors ${on ? 'border-blue bg-blue/10' : 'border-separator'}`}>
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => updateSettings({ geminiVoice: v.id })} aria-pressed={on}>
                      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-blue bg-blue text-white' : 'border-label-3'}`}>
                        {on && <Check size={12} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{v.label}</span>
                        <span className="block truncate text-xs text-label-2">{failed === v.id ? 'Probe gerade nicht möglich – Systemstimme' : v.desc}</span>
                      </span>
                    </button>
                    <button className="btn-soft !min-h-9 !px-2.5 !py-1 text-xs" onClick={() => void preview(v.id)} disabled={!!busy} aria-label={`Hörprobe ${v.label}`}>
                      {busy === v.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-label-3">Die erste Hörprobe einer Stimme dauert ein paar Sekunden, danach ist sie gespeichert.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-fill-4 p-3 text-sm text-label-2">
            <KeyRound size={16} className="shrink-0" />
            <span className="flex-1">
              Die natürliche Stimme braucht einen Gemini-Key (kostenlos){compact ? ' – den kannst du im Schritt „KI“ hinterlegen' : ''}. Bis dahin spricht die Systemstimme.
            </span>
            {!compact && <button className="btn-soft !min-h-9 !py-1 text-xs" onClick={() => navigate('/einstellungen/ki')}>Key hinzufügen</button>}
          </div>
        )
      )}

      {settings.voiceSource === 'gemini' && hasKey && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Langsam anhören <span className="font-normal text-label-3">(Schnecken-Knopf)</span></p>
          <Segmented<'gemini' | 'stretch'>
            label="Langsam anhören"
            value={settings.slowMode}
            onChange={(slowMode) => updateSettings({ slowMode })}
            options={[{ value: 'gemini', label: 'Gemini spricht langsam' }, { value: 'stretch', label: 'Original mit 0,75×' }]}
          />
          <p className="text-xs text-label-2">
            {settings.slowMode === 'gemini'
              ? 'Klingt am natürlichsten: eigene ruhige Aufnahme mit kleinen Pausen (nur auf diesem Gerät). Bis sie fertig ist, spielt die normale mit 75 % Tempo.'
              : 'Spielt die normale Aufnahme mit 75 % Tempo ab – sofort und ohne zusätzliche Aufnahmen, klingt aber etwas künstlicher.'}
          </p>
          <SlowSample />
        </div>
      )}
      {settings.voiceSource === 'gemini' && hasKey && (
        <details className="rounded-2xl bg-fill-4 p-3" open={compact}>
          <summary className="cursor-pointer text-sm font-medium">Was bedeuten die kleinen Kennzeichen an den Wörtern?</summary>
          <div className="mt-2"><VoiceLegend /></div>
        </details>
      )}

      <SystemVoices compact={compact} />
      {!compact && hasKey && settings.voiceSource === 'gemini' && <CacheInfo />}
    </div>
  )
}

/** Hörprobe für die gewählte Langsam-Variante */
function SlowSample() {
  return (
    <button className="btn-soft !min-h-9 !py-1 text-xs" onClick={() => speakSlow(SAMPLE_KO)}>
      <Play size={14} /> Probe: „{SAMPLE_KO}“ langsam
    </button>
  )
}

function SystemVoices({ compact }: { compact: boolean }) {
  const { settings, updateSettings } = useApp()
  const [, setTick] = useState(0)
  useEffect(() => onVoicesChanged(() => setTick((t) => t + 1)), [])
  const row = (lang: ClipLang, label: string, value: string, set: (v: string) => void) => {
    const list = systemVoices(lang)
    const id = `voice-${lang}`
    return (
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="w-24 shrink-0 text-sm text-label-2">{label}</label>
        <select id={id} className="input !w-auto min-w-0 flex-1" value={value} onChange={(e) => { set(e.target.value); previewSystemVoice(lang, e.target.value || list[0]?.name || '') }}>
          <option value="">Automatisch{list[0] ? ` (${list[0].name})` : ''}</option>
          {list.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
        </select>
        <button className="btn-soft !min-h-9 !px-2.5 !py-1 text-xs" onClick={() => previewSystemVoice(lang, value || list[0]?.name || '')} aria-label={`Hörprobe ${label}`}>
          <Play size={14} />
        </button>
        {!list.length && <p className="w-full text-xs text-orange">Keine {label.toLowerCase()}e Stimme installiert – das Gerät nimmt seine Standardstimme.</p>}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Systemstimmen {compact ? '' : <span className="font-normal text-label-3">· nur auf diesem Gerät</span>}</p>
      {row('ko', 'Koreanisch', settings.systemVoiceKo, (systemVoiceKo) => updateSettings({ systemVoiceKo }))}
      {row('de', 'Deutsch', settings.systemVoiceDe, (systemVoiceDe) => updateSettings({ systemVoiceDe }))}
    </div>
  )
}

function SyncLine() {
  useClipsVersion()
  const s = audioSyncInfo()
  if (s.unsupported) return <p className="text-xs text-orange">Dieser Browser kann Aufnahmen nicht komprimieren – sie bleiben auf diesem Gerät.</p>
  if (!s.active) return <p className="text-xs text-label-3">Aufnahmen bleiben auf diesem Gerät. Mit Konto oder Google Drive werden sie komprimiert zwischen deinen Geräten abgeglichen.</p>
  const where = s.where === 'account' ? 'deinem Konto' : 'Google Drive'
  return (
    <p className={`text-xs ${s.error ? 'text-orange' : 'text-label-3'}`}>
      {s.error ? `Abgleich der Aufnahmen mit ${where} gerade nicht möglich: ${s.error}` : `Aufnahmen werden komprimiert mit ${where} abgeglichen${s.lastSync ? ` · zuletzt ${new Date(s.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ' …'}`}
    </p>
  )
}

function CacheInfo() {
  const { words } = useApp()
  const confirm = useConfirm()
  const v = useClipsVersion()
  const [cov, setCov] = useState<Awaited<ReturnType<typeof coverage>> | null>(null)
  const [stats, setStats] = useState<{ count: number; bytes: number } | null>(null)
  const [tts, setTts] = useState<{ model: string; used: number; limit: number }[]>([])
  useEffect(() => {
    let alive = true
    const id = setTimeout(() => {
      void coverage(voiceItems(words)).then((c) => alive && setCov(c))
      void clipStats().then((x) => alive && setStats(x))
      void ttsOverview().then((x) => alive && setTts(x))
    }, 300)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [words, v])
  const queue = clipQueueSize()
  const line = (lang: 'ko' | 'de', label: string) => {
    const c = cov?.[lang]
    if (!c || !c.total) return null
    const pct = Math.round((c.ready / c.total) * 100)
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums text-label-2">{c.ready} / {c.total} Wörter</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-fill-2"><div className="h-full rounded-full bg-green transition-all" style={{ width: `${pct}%` }} /></div>
      </div>
    )
  }
  const missing = cov ? cov.ko.total - cov.ko.ready + cov.de.total - cov.de.ready : 0
  return (
    <div className="space-y-3 rounded-2xl bg-fill-4 p-3">
      <p className="text-sm font-medium">Gemini-Stimme für deine Wörter</p>
      {line('ko', 'Koreanisch')}
      {line('de', 'Deutsch')}
      <p className="text-xs text-label-2">
        {queue > 0 ? `${queue} Aufnahmen in Arbeit – läuft im Hintergrund, solange die App offen ist. ` : missing ? 'Fehlende werden beim nächsten Start oder per Knopf erstellt. ' : 'Alles bereit. '}
        {stats && `${stats.count} Aufnahmen gespeichert (${(stats.bytes / 1_048_576).toFixed(1)} MB).`}
      </p>
      {tts.length > 0 && (
        <p
          className="w-fit cursor-help text-xs text-label-3 underline decoration-dotted underline-offset-2"
          title={`Ersatzmodelle, falls die Live API ein Wort dreimal nicht sauber schafft – bestes zuerst, je ${tts[0].limit} pro Tag:\n${tts.map((t) => `${t.model}: ${t.used}/${t.limit}`).join('\n')}`}
          tabIndex={0}
        >
          Ersatzmodelle heute: {tts.reduce((a, t) => a + t.used, 0)} / {tts.reduce((a, t) => a + t.limit, 0)} · {tts.length} Modelle
        </p>
      )}
      <SyncLine />
      <div className="flex flex-wrap gap-2">
        {missing > 0 && (
          <button className="btn-soft !min-h-9 !py-1 text-xs" onClick={() => { retryFailed(); prepareWords(words) }}>
            <Play size={14} /> Fehlende jetzt erstellen ({missing})
          </button>
        )}
        <button
          className="btn-soft !min-h-9 !py-1 text-xs"
          onClick={async () => {
            const ok = await confirm({
              title: 'Alle Stimmen neu erzeugen?',
              message: 'Jedes Wort wird mit der eingestellten Stimme neu aufgenommen und geprüft. Bis die neue Aufnahme fertig ist, spielt die alte. Mit Abgleich bekommen auch deine anderen Geräte die neuen.',
              confirmLabel: 'Neu erzeugen',
            })
            if (ok) regenerateWords(words)
          }}
        >
          <RefreshCw size={14} /> Alle neu erzeugen
        </button>
        <button className="btn-soft !min-h-9 !py-1 text-xs" onClick={() => void clearClips()}>
          <Trash2 size={14} /> Aufnahmen löschen
        </button>
      </div>
    </div>
  )
}
