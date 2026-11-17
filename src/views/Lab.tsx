import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Download, FileArchive, Loader2, Mic, PenLine, Play, Square, Type } from 'lucide-react'
import { List, ListRow, PageHeader, Segmented } from '../components/ui'
import { loadDisputes } from '../lib/geminiDisputes'
import { loadSamples } from '../lib/inputToolsLog'
import { navigate } from '../lib/route'
import {
  HANDWRITING_CANDIDATES, gemmaModels, generateSentences, listAllModels, readOne, samplesFromExport, samplesFromLocal, sleep,
  type HandResult, type HandSample, type LabModel, type SentenceResult,
} from '../lib/lab/bench'
import { LIVE_VOICES, LiveSession, SLOW_INSTRUCTION, isVerbatim, playPcm, playPcmAtSpeed, speakWithTtsModel, tailCheck, verifyAudio, verifyAudioLive, withFinalStop, type SpeakResult } from '../lib/lab/liveTts'
import { useApp } from '../store'
import { POOL } from '../lib/particles/pool'
import { fillSentence } from '../lib/particles/forms'
import { speakSystem } from '../lib/speech'

type Section = 'hand' | 'saetze' | 'stimme'

const MAX_ATTEMPTS = 3
/** Sätze von kurz bis lang (aus dem Partikel-Pool, Stufe 1–5) und deutsche Sätze – für den Test „Live API liest Sätze“ */
const SENTENCE_SET = [
  ...[1, 2, 3, 4, 5].flatMap((lvl) => POOL.filter((x) => x.level === lvl && x.particle === (['ga', 'e', 'eseo', 'neun', 'reul'] as const)[lvl - 1]).slice(0, 2)).map((x) => fillSentence(x.ko)),
  '어제 친구랑 같이 한국 식당에 가서 비빔밥을 먹었는데 정말 맛있었어요.',
  'Ich lerne seit einem Jahr Koreanisch.',
  'Morgen fahre ich mit meiner Familie ans Meer.',
].join(String.fromCharCode(10))
const DEFAULT_WORDS = '학생\n감사합니다\n먹다\n읽다\n한국어\n괜찮아요\n학교에 가요\n물을 마셔요\nSchüler\nDanke\nessen\nKoreanisch'

/** Verstecktes Testlabor (#/labor): Modelle für Handschrift und Sätze vergleichen, Vorlesen testen. */
export function Lab() {
  const { settings } = useApp()
  const key = settings.geminiApiKey.trim()
  const [section, setSection] = useState<Section>('hand')
  const [models, setModels] = useState<{ id: string; methods: string[] }[] | null>(null)
  const [modelErr, setModelErr] = useState('')

  useEffect(() => {
    if (!key) return
    listAllModels(key).then(setModels, (e) => setModelErr(e instanceof Error ? e.message : 'Fehler'))
  }, [key])

  return (
    <div className="mx-auto max-w-3xl">
      <button className="-ml-2 mb-1 flex min-h-11 items-center gap-0.5 rounded-full px-2 text-base font-medium text-blue transition hover:bg-fill-4" onClick={() => navigate('/einstellungen/erweitert')}>
        <ChevronLeft size={22} /> Erweitert
      </button>
      <PageHeader title="Testlabor" subtitle="Modelle und Stimmen mit deinem Key vergleichen – alles läuft nur in diesem Browser." />
      {!key ? (
        <div className="card p-6 text-center text-label-2">Für das Testlabor brauchst du einen Gemini-API-Key (Einstellungen → KI & Prüfung).</div>
      ) : (
        <>
          <div className="mb-5">
            <Segmented<Section>
              label="Test"
              value={section}
              onChange={setSection}
              options={[
                { value: 'hand', label: <><PenLine size={15} /> Handschrift</> },
                { value: 'saetze', label: <><Type size={15} /> Sätze</> },
                { value: 'stimme', label: <><Mic size={15} /> Stimme</> },
              ]}
            />
          </div>
          {modelErr && <p className="mb-4 text-sm text-red">{modelErr}</p>}
          {/* Alle drei bleiben eingehängt, damit laufende Tests beim Umschalten weiterlaufen */}
          <div hidden={section !== 'hand'}><HandwritingBench apiKey={key} allModels={models} /></div>
          <div hidden={section !== 'saetze'}><SentenceBench apiKey={key} allModels={models} /></div>
          <div hidden={section !== 'stimme'}><VoiceBench apiKey={key} allModels={models} /></div>
        </>
      )}
    </div>
  )
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function ModelPicker({ list, chosen, setChosen }: { list: LabModel[]; chosen: string[]; setChosen: (v: string[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map((m) => (
        <label key={m.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-fill-4 px-3 py-2">
          <input type="checkbox" className="h-4.5 w-4.5 accent-blue" checked={chosen.includes(m.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, m.id] : chosen.filter((x) => x !== m.id))} />
          <span className="min-w-0 text-sm">
            <span className="block truncate font-medium">{m.id}</span>
            <span className="block text-xs text-label-2">{m.rpm}/Min · {m.rpd.toLocaleString('de-DE')}/Tag</span>
          </span>
        </label>
      ))}
    </div>
  )
}

// ---------------- Handschrift ----------------

function HandwritingBench({ apiKey, allModels }: { apiKey: string; allModels: { id: string; methods: string[] }[] | null }) {
  const local = useMemo(() => samplesFromLocal(loadSamples(), loadDisputes()), [])
  const [samples, setSamples] = useState<HandSample[]>(local)
  const [source, setSource] = useState(`Dieses Gerät (${local.length} Beispiele)`)
  const candidates = useMemo(() => [...HANDWRITING_CANDIDATES, ...(allModels ? gemmaModels(allModels) : [])], [allModels])
  const [chosen, setChosen] = useState<string[]>(HANDWRITING_CANDIDATES.map((m) => m.id))
  useEffect(() => {
    // gefundene Gemma-Modelle automatisch mit auswählen
    if (allModels) setChosen((c) => [...new Set([...c, ...gemmaModels(allModels).map((m) => m.id)])])
  }, [allModels])
  const [results, setResults] = useState<HandResult[]>([])
  const [running, setRunning] = useState(false)
  const stop = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')

  const loadExport = async (f: File) => {
    setErr('')
    try {
      const s = await samplesFromExport(f)
      setSamples(s)
      setSource(`${f.name} (${s.length} Beispiele)`)
      setResults([])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export konnte nicht gelesen werden')
    }
  }

  const run = async () => {
    stop.current = false
    setRunning(true)
    setResults([])
    const picked = candidates.filter((m) => chosen.includes(m.id))
    // Jedes Modell läuft für sich mit seinem Minutenlimit; Modelle mit 20/Tag bekommen höchstens 15 Beispiele
    await Promise.all(
      picked.map(async (m) => {
        const gap = Math.ceil(60_000 / m.rpm) + 300
        const list = samples.slice(0, m.rpd <= 20 ? Math.min(15, samples.length) : samples.length)
        for (let i = 0; i < list.length && !stop.current; i++) {
          const t = performance.now()
          const r = await readOne(apiKey, m.id, list[i])
          setResults((prev) => [...prev, r])
          if (r.error && /quota|exhausted|limit/i.test(r.error)) break // Tageskontingent erreicht
          const wait = gap - (performance.now() - t)
          if (wait > 0 && i < list.length - 1) await sleep(wait)
        }
      }),
    )
    setRunning(false)
  }

  const summary = useMemo(() => {
    const by = new Map<string, HandResult[]>()
    for (const r of results) by.set(r.model, [...(by.get(r.model) ?? []), r])
    return [...by.entries()].map(([model, rs]) => {
      const ok = rs.filter((r) => !r.error)
      return {
        model,
        n: rs.length,
        errors: rs.length - ok.length,
        acc: ok.length ? Math.round((ok.filter((r) => r.correct).length / ok.length) * 100) : null,
        ms: ok.length ? Math.round(ok.reduce((a, r) => a + r.ms, 0) / ok.length) : null,
      }
    }).sort((a, b) => (b.acc ?? -1) - (a.acc ?? -1) || (a.ms ?? 1e9) - (b.ms ?? 1e9))
  }, [results])
  const misreads = results.filter((r) => !r.correct)

  return (
    <div>
      <List title="Beispiele" footer="Gezählt werden nur Fälle, bei denen feststeht, was wirklich geschrieben wurde. Mehr Beispiele entstehen, wenn du übst und Rückmeldungen gibst.">
        <ListRow title="Quelle" value={source} />
        <ListRow
          icon={<FileArchive size={18} />}
          iconColor="var(--color-indigo)"
          title="Entwickler-Export (.zip) laden"
          subtitle="z. B. hangul-studio-dev-export-….zip aus deinen Downloads"
          onClick={() => fileRef.current?.click()}
        />
        {local.length > 0 && samples !== local && <ListRow title="Zurück zu den Beispielen dieses Geräts" onClick={() => { setSamples(local); setSource(`Dieses Gerät (${local.length} Beispiele)`); setResults([]) }} />}
      </List>
      <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadExport(f); e.target.value = '' }} />
      {err && <p className="-mt-4 mb-4 px-4 text-sm text-red">{err}</p>}

      {samples.length > 0 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {samples.slice(0, 20).map((s) => (
            <figure key={s.id} className="shrink-0 text-center">
              <img src={`data:image/png;base64,${s.png}`} alt={`Handschrift: ${s.truth}`} className="h-14 rounded-lg border border-separator bg-white object-contain" />
              <figcaption lang="ko" className="mt-0.5 text-xs text-label-2">{s.truth}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-1.5 px-4 text-xs font-medium text-label-2">Modelle {allModels === null && '(Gemma wird gesucht …)'}</h2>
        <ModelPicker list={candidates} chosen={chosen} setChosen={setChosen} />
        <p className="mt-1.5 px-4 text-xs text-label-2">Die Modelle laufen gleichzeitig, jedes in seinem Minutenlimit. Modelle mit 20 Anfragen pro Tag bekommen höchstens 15 Beispiele.</p>
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
        {!running ? (
          <button className="btn-primary" disabled={!samples.length || !chosen.length} onClick={() => void run()}><Play size={16} fill="currentColor" /> Test starten</button>
        ) : (
          <button className="btn-soft" onClick={() => { stop.current = true }}><Square size={14} fill="currentColor" /> Stoppen</button>
        )}
        {results.length > 0 && (
          <button className="btn-soft" onClick={() => download(`hangul-labor-handschrift-${new Date().toISOString().slice(0, 10)}.json`, { kind: 'handwriting', source, summary, results })}>
            <Download size={16} /> Ergebnis speichern
          </button>
        )}
        {running && <span className="flex items-center gap-2 text-sm text-label-2"><Loader2 size={16} className="animate-spin" /> {results.length} Antworten …</span>}
      </div>

      {summary.length > 0 && (
        <List title="Ergebnis">
          {summary.map((s) => (
            <ListRow
              key={s.model}
              title={s.model}
              subtitle={`${s.n} Beispiele${s.errors ? ` · ${s.errors} Fehler` : ''}${s.ms !== null ? ` · Ø ${s.ms} ms` : ''}`}
              value={s.acc === null ? '–' : `${s.acc} %`}
            />
          ))}
        </List>
      )}
      {misreads.length > 0 && (
        <List title="Falsch gelesen oder Fehler">
          {misreads.slice(0, 40).map((r, i) => (
            <ListRow key={i} title={<span lang="ko">{r.truth} → {r.error ? <span className="text-red">{r.error}</span> : r.read || '(leer)'}</span>} subtitle={r.model} value={`${r.ms} ms`} />
          ))}
        </List>
      )}
    </div>
  )
}

// ---------------- Sätze ----------------

function SentenceBench({ apiKey, allModels }: { apiKey: string; allModels: { id: string; methods: string[] }[] | null }) {
  const { words } = useApp()
  const nouns = useMemo(() => words.filter((w) => w.wordType === 'noun').map((w) => w.korean).slice(0, 12), [words])
  const candidates = useMemo<LabModel[]>(
    () => [
      { id: 'gemini-3.5-flash-lite', rpm: 15, rpd: 500 },
      { id: 'gemini-3.1-flash-lite', rpm: 15, rpd: 500 },
      { id: 'gemini-3.8-flash', rpm: 5, rpd: 20 },
      ...(allModels ? gemmaModels(allModels) : []),
    ],
    [allModels],
  )
  const [chosen, setChosen] = useState<string[]>(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'])
  useEffect(() => {
    if (allModels) setChosen((c) => [...new Set([...c, ...gemmaModels(allModels).map((m) => m.id)])])
  }, [allModels])
  const [particle, setParticle] = useState<'이/가' | '을/를'>('이/가')
  const [level, setLevel] = useState('Anfänger')
  const [results, setResults] = useState<SentenceResult[]>([])
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    setResults([])
    await Promise.all(
      candidates
        .filter((m) => chosen.includes(m.id))
        .map(async (m) => {
          const r = await generateSentences(apiKey, m.id, particle, nouns.length ? nouns : ['학생', '물', '책', '친구', '커피'], level)
          setResults((prev) => [...prev, r])
        }),
    )
    setRunning(false)
  }

  return (
    <div>
      <List title="Aufgabe" footer={`Jedes Modell erzeugt 5 Lückensätze in einer Anfrage aus deinen Nomen (${nouns.length ? nouns.join(', ') : 'Beispielwörter'}). Die App prüft automatisch, ob genau eine Lücke da ist und die Lösung zum Endkonsonanten passt – ob die Sätze natürlich klingen, beurteilst du.`}>
        <ListRow title="Partikel" right={<Segmented<'이/가' | '을/를'> label="Partikel" value={particle} onChange={setParticle} options={[{ value: '이/가', label: '이/가' }, { value: '을/를', label: '을/를' }]} />} />
        <ListRow
          title="Stufe"
          right={
            <select className="input !w-auto" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Stufe">
              {['Einsteiger', 'Anfänger', 'Mittel', 'Fortgeschritten', 'Profi'].map((l) => <option key={l}>{l}</option>)}
            </select>
          }
        />
      </List>
      <section className="mb-6">
        <h2 className="mb-1.5 px-4 text-xs font-medium text-label-2">Modelle</h2>
        <ModelPicker list={candidates} chosen={chosen} setChosen={setChosen} />
      </section>
      <div className="mb-6 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={running || !chosen.length} onClick={() => void run()}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />} Sätze erzeugen
        </button>
        {results.length > 0 && (
          <button className="btn-soft" onClick={() => download(`hangul-labor-saetze-${new Date().toISOString().slice(0, 10)}.json`, { kind: 'sentences', particle, level, results })}>
            <Download size={16} /> Ergebnis speichern
          </button>
        )}
      </div>
      {results.map((r) => (
        <List
          key={r.model}
          title={`${r.model} · ${r.ms} ms${r.parsed ? ` · ${r.items.filter((i) => i.valid).length}/${r.items.length} formal richtig` : ''}`}
          footer={r.error ? <span className="text-red">{r.error}</span> : undefined}
        >
          {r.items.map((it, i) => (
            <ListRow
              key={i}
              title={<span lang="ko">{it.sentence} <span className="text-label-2">→ {it.answer}</span></span>}
              subtitle={`${it.german}${it.tip ? ` · Tipp: ${it.tip}` : ''}`}
              right={<span className={`shrink-0 text-sm font-semibold ${it.valid ? 'text-green' : 'text-red'}`}>{it.valid ? '✓' : `✗ ${it.problem}`}</span>}
            />
          ))}
          {r.items.length === 0 && <ListRow title={<span className="text-label-2">Keine verwertbaren Sätze</span>} />}
        </List>
      ))}
    </div>
  )
}

// ---------------- Stimme ----------------

function VoiceBench({ apiKey, allModels }: { apiKey: string; allModels: { id: string; methods: string[] }[] | null }) {
  const liveModels = useMemo(() => (allModels ?? []).filter((m) => m.methods.includes('bidiGenerateContent') && !/translate|transcribe/i.test(m.id)).map((m) => m.id), [allModels])
  const ttsModels = useMemo(() => (allModels ?? []).filter((m) => /tts/i.test(m.id) && m.methods.includes('generateContent')).map((m) => m.id), [allModels])
  const [liveModel, setLiveModel] = useState('')
  const [ttsModel, setTtsModel] = useState('')
  useEffect(() => {
    if (!liveModel && liveModels.length) setLiveModel(liveModels.find((m) => /3\.8-live$/.test(m)) ?? liveModels[0])
    if (!ttsModel && ttsModels.length) setTtsModel(ttsModels.find((m) => /3\.8-flash-lite-tts/.test(m)) ?? ttsModels[0])
  }, [liveModels, ttsModels, liveModel, ttsModel])
  const [voice, setVoice] = useState<string>('Kore')
  /** Tempo-Test: normale Anweisung oder „langsam und deutlich“ */
  const [tempo, setTempo] = useState<'normal' | 'langsam'>('normal')
  const [text, setText] = useState(DEFAULT_WORDS)
  const [results, setResults] = useState<(SpeakResult & { source: string })[]>([])
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const transcribeModels = useMemo(() => (allModels ?? []).filter((m) => /transcribe/i.test(m.id) && m.methods.includes('bidiGenerateContent')).map((m) => m.id), [allModels])
  // Prüfer: Transcribe Live (kein Tageslimit) bevorzugt; 3.1 Flash Lite nur als Ausweichlösung, weil es das Handschrift-Kontingent teilt
  const [checker, setChecker] = useState('')
  useEffect(() => {
    if (!checker && allModels) setChecker(transcribeModels[0] ?? 'gemini-3.1-flash-lite')
  }, [allModels, transcribeModels, checker])
  const check = checker !== 'aus'
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  const runLive = async () => {
    setRunning(true)
    setResults([])
    const s = new LiveSession(apiKey, liveModel, voice, tempo === 'langsam' ? SLOW_INSTRUCTION : undefined)
    try {
      setStatus('Verbinde …')
      const connectMs = await s.open()
      setStatus(`Verbunden in ${connectMs} ms`)
      for (const l of lines) {
        // Bis zu 3 Erzeugungen: angenommen wird ein Ergebnis, das sauber endet und (falls geprüft) richtig gehört wurde
        let r: SpeakResult | null = null
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const cand = await s.speak(withFinalStop(l))
          cand.text = l
          cand.attempts = attempt
          if (!cand.error && cand.pcm.length) {
            const t = tailCheck(cand.pcm, cand.sampleRate)
            cand.tailRatio = t.ratio
            cand.tailCut = t.cut
            if (check) {
              try {
                cand.heard = /transcribe/i.test(checker)
                  ? await verifyAudioLive(apiKey, checker, cand.pcm, cand.sampleRate, (raw) => { cand.heardRaw = [...(cand.heardRaw ?? []), raw].slice(0, 6) })
                  : await verifyAudio(apiKey, checker, cand.pcm, cand.sampleRate)
                cand.heardOk = isVerbatim(l, cand.heard)
              } catch (e) {
                cand.heard = `(Gegenprüfung fehlgeschlagen: ${e instanceof Error ? e.message : 'Fehler'})`
              }
            }
          }
          r = cand
          const good = !cand.error && !cand.tailCut && cand.heardOk !== false
          if (good || cand.error?.startsWith('Verbindung')) break
        }
        if (!r) continue
        setResults((prev) => [...prev, { ...r, source: `${liveModel} · ${voice}${tempo === 'langsam' ? ' · langsam' : ''}` }])
        if (r.error?.startsWith('Verbindung')) break
      }
      setStatus((st) => st + ' · fertig')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Fehler')
    } finally {
      s.close()
      setRunning(false)
    }
  }

  const runTts = async () => {
    setRunning(true)
    for (const l of lines.slice(0, 2)) {
      const r = await speakWithTtsModel(apiKey, ttsModel, voice, l)
      setResults((prev) => [...prev, { ...r, source: `${ttsModel} · ${voice}` }])
    }
    setRunning(false)
  }

  const live = results.filter((r) => !r.source.includes('tts') && !r.error)
  const verbatimRate = live.length ? Math.round((live.filter((r) => r.verbatim).length / live.length) * 100) : null
  const clean = live.filter((r) => (r.heardOk ?? r.verbatim) && !r.tailCut)
  const cleanRate = live.length ? Math.round((clean.length / live.length) * 100) : null
  const avgTries = live.length ? (live.reduce((a, r) => a + (r.attempts ?? 1), 0) / live.length).toFixed(1) : null
  const avgFirst = live.length ? Math.round(live.reduce((a, r) => a + (r.firstAudioMs ?? 0), 0) / live.length) : null
  const checked = live.filter((r) => r.heardOk !== undefined)
  const heardRate = checked.length ? Math.round((checked.filter((r) => r.heardOk).length / checked.length) * 100) : null

  return (
    <div>
      <List title="Einstellungen" footer="Die Live API hat kein Tageslimit, ist aber ein Gesprächsmodell. Ihre eigene Mitschrift ist unzuverlässig (sie zeigte schon den vollen Text bei abgeschnittenem Audio). Die Gegenprüfung lässt deshalb ein zweites Modell das Audio anhören und aufschreiben.">
        <ListRow
          title="Live-Modell"
          right={
            <select className="input !w-auto max-w-[14rem]" value={liveModel} onChange={(e) => setLiveModel(e.target.value)} aria-label="Live-Modell">
              {liveModels.length === 0 && <option value="">{allModels ? 'keins gefunden' : 'suche …'}</option>}
              {liveModels.map((m) => <option key={m}>{m}</option>)}
            </select>
          }
        />
        <ListRow
          title="Gegenprüfung"
          subtitle={/transcribe/i.test(checker) ? 'Transcribe Live hört jedes Audio an – ohne Tageslimit' : checker === 'aus' ? 'aus' : 'Teilt das Tageskontingent mit der Handschrift-Prüfung (500/Tag)'}
          right={
            <select className="input !w-auto max-w-[14rem]" value={checker} onChange={(e) => setChecker(e.target.value)} aria-label="Gegenprüfung">
              {transcribeModels.map((m) => <option key={m}>{m}</option>)}
              <option>gemini-3.1-flash-lite</option>
              <option value="aus">aus</option>
            </select>
          }
        />
        <ListRow
          title="Tempo"
          subtitle={tempo === 'langsam' ? 'Die Live API bekommt die Anweisung, langsam und deutlich mit kleinen Pausen zu sprechen' : 'Normale Vorlese-Anweisung'}
          right={
            <select className="input !w-auto" value={tempo} onChange={(e) => setTempo(e.target.value as 'normal' | 'langsam')} aria-label="Tempo">
              <option value="normal">normal</option>
              <option value="langsam">langsam (Anweisung)</option>
            </select>
          }
        />
        <ListRow
          title="Stimme"
          right={
            <select className="input !w-auto" value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="Stimme">
              {LIVE_VOICES.map((v) => <option key={v}>{v}</option>)}
            </select>
          }
        />
      </List>
      <section className="mb-6">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-4">
          <h2 className="text-xs font-medium text-label-2">Texte (eine Zeile pro Text)</h2>
          <span className="flex gap-1.5">
            <button className="btn-soft !min-h-8 !px-2.5 !py-0.5 text-xs" onClick={() => setText(DEFAULT_WORDS)}>Wörter</button>
            <button className="btn-soft !min-h-8 !px-2.5 !py-0.5 text-xs" onClick={() => setText(SENTENCE_SET)}>Sätze (kurz bis lang)</button>
          </span>
        </div>
        <textarea className="input min-h-40 font-medium" lang="ko" value={text} onChange={(e) => setText(e.target.value)} />
      </section>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={running || !liveModel || !lines.length} onClick={() => void runLive()}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />} Live API testen
        </button>
        <button className="btn-soft" disabled={running || !ttsModel || !lines.length} onClick={() => void runTts()} title="Verbraucht 2 der 10 Anfragen pro Tag">
          Vergleich: TTS-Modell (2 Wörter)
        </button>
        {results.length > 0 && (
          <button className="btn-soft" onClick={() => download(`hangul-labor-stimme-${new Date().toISOString().slice(0, 10)}.json`, { kind: 'voice', verbatimRate, heardRate, cleanRate, avgTries, avgFirst, results: results.map(({ pcm: _pcm, ...r }) => r) })}>
            <Download size={16} /> Ergebnis speichern
          </button>
        )}
      </div>
      {status && <p className="mb-4 px-4 text-sm text-label-2">{status}{verbatimRate !== null && ` · Selbst-Mitschrift wörtlich: ${verbatimRate} %`}{heardRate !== null && ` · Gegenprüfung wörtlich: ${heardRate} %`}{cleanRate !== null && ` · am Ende sauber angenommen: ${cleanRate} % · Ø ${avgTries} Versuche · Ø ${avgFirst} ms bis Ton`}</p>}
      {results.length > 0 && (
        <List title="Ergebnis">
          {results.map((r, i) => (
            <ListRow
              key={i}
              title={<span lang="ko">{r.text}</span>}
              subtitle={r.error ? <span className="text-red">{r.error}</span> : `Selbst: „${r.transcript || '–'}“${r.heard !== undefined ? ` · gehört: „${r.heard || '–'}“` : ''} · Audio ${((r.audioMs ?? 0) / 1000).toFixed(1)} s${r.tailRatio !== undefined ? ` · Ende ${r.tailCut ? 'abgeschnitten' : 'sauber'} (${Math.round(r.tailRatio * 100)} %)` : ''}${r.attempts && r.attempts > 1 ? ` · ${r.attempts} Versuche` : ''}${r.lateChunks ? ` (+${r.lateChunks} nachgereicht)` : ''} · ${r.firstAudioMs ?? '–'} ms bis Ton · ${r.source}`}
              right={
                <span className="flex shrink-0 items-center gap-2">
                  {!r.error && (() => { const ok = (r.heardOk ?? r.verbatim) && !r.tailCut; return <span className={`text-sm font-semibold ${ok ? 'text-green' : 'text-orange'}`}>{ok ? '✓ sauber' : r.tailCut ? '✂ abgeschnitten' : '≠ abweichend'}</span> })()}
                  <button className="btn-soft !min-h-9 !px-2 !py-1 text-xs" disabled={!r.pcm.length} onClick={() => playPcmAtSpeed(r.pcm, r.sampleRate, 0.75)} title="Dieselbe Aufnahme mit 75 % Tempo, Tonhöhe bleibt gleich">0,75×</button>
                  <button className="btn-soft !min-h-9 !px-2 !py-1 text-xs" onClick={() => speakSystem(r.text, /[가-힣]/.test(r.text) ? 'ko' : 'de')} title="Zum Vergleich: Systemstimme">System</button>
                  <button className="grid h-11 w-11 place-items-center rounded-full text-blue transition hover:bg-fill-3 disabled:opacity-30" disabled={!r.pcm.length} onClick={() => playPcm(r.pcm, r.sampleRate)} aria-label={`${r.text} abspielen`}>
                    <Play size={18} fill="currentColor" />
                  </button>
                </span>
              }
            />
          ))}
        </List>
      )}
    </div>
  )
}
