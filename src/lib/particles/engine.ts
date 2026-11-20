/**
 * Partikel-Trainer: Fortschritt, Rundenaufbau, Auto-Stufe, Satzprüfung und Abgleich.
 * Reine Funktionen (getestet in particles.test.ts).
 */
import { CHAPTERS, type Level } from './content'
import {
  NO_E_TIME_WORDS, PARTICLE_IDS, choiceOptions, familyOf, formFor, isAlternating, parseSentence, restrictGaps, shuffle, wrongForm,
  type Gap, type ParticleId,
} from './forms'
import { POOL, type PoolSentence } from './pool'
import type { NewWord, RoundVocab } from './vocab'

// ---------- Zustand ----------

/** new = noch nicht geöffnet · known = Check bestanden · learning = Erklärung gesehen · passed = Mini-Test bestanden */
export type ChapterStatus = 'new' | 'known' | 'learning' | 'passed'

export interface ChapterProgress {
  status: ChapterStatus
  updatedAt: number
  /** Treffer je Lektion */
  lessons: Record<string, { right: number; wrong: number }>
}

export interface SentenceStat {
  seen: number
  wrong: number
  last: number
}

export interface RecentResult {
  p: ParticleId
  ok: boolean
  t: number
  level: Level
}

export interface ParticleState {
  progress: Partial<Record<ParticleId, ChapterProgress>>
  recent: RecentResult[]
  /** Von der KI erzeugte Sätze (Satz-Datenbank) */
  ai: PoolSentence[]
  stats: Record<string, SentenceStat>
  level: 'auto' | Level
  autoLevel: Level
  /** Zeitpunkt der letzten Auto-Stufenänderung (danach zählt das Fenster neu) */
  levelChangedAt: number
  metaUpdatedAt: number
}

export const MAX_RECENT = 60
export const MAX_AI = 600

export function emptyParticleState(): ParticleState {
  return { progress: {}, recent: [], ai: [], stats: {}, level: 'auto', autoLevel: 1, levelChangedAt: 0, metaUpdatedAt: 0 }
}

export function sanitizeParticleState(raw: unknown): ParticleState {
  const e = emptyParticleState()
  if (!raw || typeof raw !== 'object') return e
  const r = raw as Partial<ParticleState>
  const lvl = (v: unknown): Level | null => (v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : null)
  return {
    progress: r.progress && typeof r.progress === 'object' ? r.progress : {},
    recent: Array.isArray(r.recent) ? r.recent.filter((x) => x && PARTICLE_IDS.includes(x.p)).slice(-MAX_RECENT) : [],
    ai: Array.isArray(r.ai) ? r.ai.filter((s) => s && typeof s.id === 'string' && typeof s.ko === 'string' && !validateSentence(s)) : [],
    stats: r.stats && typeof r.stats === 'object' ? r.stats : {},
    level: r.level === 'auto' ? 'auto' : lvl(r.level) ?? 'auto',
    autoLevel: lvl(r.autoLevel) ?? 1,
    levelChangedAt: typeof r.levelChangedAt === 'number' ? r.levelChangedAt : 0,
    metaUpdatedAt: typeof r.metaUpdatedAt === 'number' ? r.metaUpdatedAt : 0,
  }
}

export function chapterProgress(s: ParticleState, p: ParticleId): ChapterProgress {
  return s.progress[p] ?? { status: 'new', updatedAt: 0, lessons: {} }
}

/** Trefferquote einer Partikel (oder Lektion); null bei zu wenig Daten */
export function accuracy(cp: ChapterProgress, lesson?: string, min = 3): number | null {
  const entries = lesson ? [cp.lessons[lesson]].filter(Boolean) : Object.values(cp.lessons)
  const right = entries.reduce((a, l) => a + l!.right, 0)
  const wrong = entries.reduce((a, l) => a + l!.wrong, 0)
  return right + wrong >= min ? right / (right + wrong) : null
}

export const isLearned = (st: ChapterStatus) => st === 'known' || st === 'passed'

// ---------- Ergebnisse festhalten ----------

export interface TaskResult {
  sentence: PoolSentence
  ok: boolean
  level: Level
}

export function recordResults(s: ParticleState, results: TaskResult[], now = Date.now()): ParticleState {
  const progress = { ...s.progress }
  const stats = { ...s.stats }
  const recent = [...s.recent]
  for (const r of results) {
    const p = r.sentence.particle
    const cp = chapterProgress({ ...s, progress }, p)
    const l = cp.lessons[r.sentence.lesson] ?? { right: 0, wrong: 0 }
    progress[p] = {
      ...cp,
      updatedAt: now,
      lessons: { ...cp.lessons, [r.sentence.lesson]: { right: l.right + (r.ok ? 1 : 0), wrong: l.wrong + (r.ok ? 0 : 1) } },
    }
    const st = stats[r.sentence.id] ?? { seen: 0, wrong: 0, last: 0 }
    stats[r.sentence.id] = { seen: st.seen + 1, wrong: st.wrong + (r.ok ? 0 : 1), last: now }
    recent.push({ p, ok: r.ok, t: now, level: r.level })
  }
  return autoAdjust({ ...s, progress, stats, recent: recent.slice(-MAX_RECENT) }, now)
}

export function setStatus(s: ParticleState, p: ParticleId, status: ChapterStatus, now = Date.now()): ParticleState {
  const cp = chapterProgress(s, p)
  return { ...s, progress: { ...s.progress, [p]: { ...cp, status, updatedAt: now } } }
}

// ---------- Stufen ----------

/** Startstufe aus dem allgemeinen Lernstand (1–10) */
export function levelFromLearnLevel(learnLevel: number): Level {
  return Math.min(5, Math.max(1, Math.ceil(learnLevel / 2))) as Level
}

/** Auto: über die letzten 20 Aufgaben seit dem letzten Wechsel – über 85 % → höher, unter 60 % → tiefer */
export function autoAdjust(s: ParticleState, now = Date.now()): ParticleState {
  const win = s.recent.filter((r) => r.t > s.levelChangedAt).slice(-20)
  if (win.length < 10) return s
  const rate = win.filter((r) => r.ok).length / win.length
  let next = s.autoLevel
  if (rate > 0.85 && s.autoLevel < 5) next = (s.autoLevel + 1) as Level
  else if (rate < 0.6 && s.autoLevel > 1) next = (s.autoLevel - 1) as Level
  if (next === s.autoLevel) return s
  return { ...s, autoLevel: next, levelChangedAt: now, metaUpdatedAt: now }
}

export const effectiveLevel = (s: ParticleState): Level => (s.level === 'auto' ? s.autoLevel : s.level)

// ---------- Aufgaben ----------

export type TaskKind = 'choice' | 'form' | 'write' | 'translate'

export interface Task {
  key: string
  sentence: PoolSentence
  kind: TaskKind
  /** Abgefragte Lücken (Index in parseSentence(...).gaps) */
  ask: number[]
  /** Antwortmöglichkeiten je abgefragter Lücke (choice/form) */
  options: string[][]
  /** Form-Tipp direkt zeigen (Einsteiger, Aufwärmen) */
  showTip: boolean
  level: Level
  /** Wörter, die nicht im eigenen Wörterbuch stehen (vorher vorgestellt, im Satz unterstrichen) */
  newWords?: NewWord[]
}

/** Welche Lücken werden gefragt? Bis Stufe 3 nur die der geübten Partikel, ab Stufe 4 alle */
export function gapsToAsk(s: PoolSentence, level: Level, focus?: ParticleId[]): number[] {
  const { gaps } = parseSentence(s.ko)
  if (level >= 4) return gaps.map((_, i) => i)
  const want = focus?.length ? focus : [s.particle]
  const own = gaps.map((g, i) => (want.includes(g.particle) ? i : -1)).filter((i) => i >= 0)
  const pick = own.length ? own : gaps.map((_, i) => i)
  return level <= 2 ? pick.slice(0, 1) : pick.slice(0, 2)
}

function optionsFor(gap: Gap, kind: TaskKind, n: number, contrast: boolean, rnd: () => number, allowed?: ParticleId[]): string[] {
  if (kind === 'form') {
    if (gap.base) return choiceOptions(gap, 3, { rnd, allowed })
    const wf = wrongForm(gap.particle, gap.noun)
    return shuffle(wf ? [gap.answer, wf] : [gap.answer], rnd)
  }
  return choiceOptions(gap, n, { contrast, rnd, allowed })
}

/** Aufgabenart je Stufe */
function kindFor(level: Level, s: PoolSentence, rnd: () => number): TaskKind {
  const { gaps } = parseSentence(s.ko)
  const alt = gaps.some((g) => isAlternating(g.particle) || !!g.base)
  const r = rnd()
  switch (level) {
    case 1: return alt && r < 0.5 ? 'form' : 'choice'
    case 2: return alt && r < 0.3 ? 'form' : 'choice'
    case 3: return r < 0.5 ? 'choice' : 'write'
    case 4: return r < 0.5 ? 'choice' : 'write'
    default: return r < 0.3 ? 'choice' : 'write'
  }
}

export function makeTask(
  s: PoolSentence, level: Level, kind: TaskKind,
  opts: { showTip?: boolean; focus?: ParticleId[]; rnd?: () => number; allowed?: ParticleId[]; fallback?: ParticleId[]; newWords?: NewWord[] } = {},
): Task {
  const rnd = opts.rnd ?? Math.random
  const { gaps } = parseSentence(s.ko)
  const ask = gapsToAsk(s, level, opts.focus)
  const n = level <= 1 ? 3 : 4
  const build = (allowed?: ParticleId[]) => (kind === 'choice' || kind === 'form' ? ask.map((i) => optionsFor(gaps[i], kind, n, !!s.contrast, rnd, allowed)) : [])
  let options = build(opts.allowed)
  // Nur eine gewählte Partikel ohne zweite Form (z. B. nur 도): erst schon gelernte Partikeln als Ablenker, sonst schreiben
  if (options.some((o) => o.length < 2) && opts.fallback?.length) options = build([...(opts.allowed ?? []), ...opts.fallback])
  if (options.some((o) => o.length < 2)) {
    kind = 'write'
    options = []
  }
  return {
    key: `${s.id}-${kind}-${Math.floor(rnd() * 1e9)}`,
    sentence: s,
    kind,
    ask,
    options,
    showTip: opts.showTip ?? level === 1,
    level,
    ...(opts.newWords?.length ? { newWords: opts.newWords } : {}),
  }
}

/** Satz auf die gewählten Partikeln beschränken (andere Lücken werden ausgefüllt); null, wenn keine Lücke bleibt */
export function restrictSentence(s: PoolSentence, allowed: ParticleId[]): PoolSentence | null {
  const ko = restrictGaps(s.ko, allowed)
  if (ko === s.ko) return s
  return ko.includes('{') ? { ...s, ko } : null
}

/** Alle Sätze (Pool + KI) */
export function allSentences(s: ParticleState): PoolSentence[] {
  return [...POOL, ...s.ai]
}

/**
 * Sätze für eine Runde wählen: passende Stufe (sonst Nachbarstufen), Schwächen und neue Sätze bevorzugt,
 * kürzlich gesehene seltener, bei mehreren Partikeln nach Trefferquote gewichtet.
 */
export function pickSentences(
  state: ParticleState, particles: ParticleId[], level: Level, n: number,
  opts: { now?: number; rnd?: () => number; lessons?: string[]; exclude?: Set<string>; vocab?: RoundVocab } = {},
): PoolSentence[] {
  const now = opts.now ?? Date.now()
  const rnd = opts.rnd ?? Math.random
  // Nur gewählte Partikeln: andere Lücken werden ausgefüllt, Sätze ohne verbleibende Lücke fallen weg
  const pool = allSentences(state)
    .filter((x) => particles.includes(x.particle) && (!opts.lessons || opts.lessons.includes(x.lesson)) && !opts.exclude?.has(x.id))
    .map((x) => restrictSentence(x, particles))
    .filter((x): x is PoolSentence => !!x)
  const vocab = opts.vocab
  const introduced = new Set<string>()
  const weightOf = (x: PoolSentence) => {
    const dist = Math.abs(x.level - level)
    if (dist > 1) return 0
    const st = state.stats[x.id]
    const acc = accuracy(chapterProgress(state, x.particle))
    let w = dist === 0 ? 4 : 1
    if (!st) w *= 2 // noch nie gesehen
    else {
      w *= 1 + (st.wrong / st.seen) * 3 // oft falsch → öfter
      const hours = (now - st.last) / 3_600_000
      if (hours < 1) w *= 0.15
      else if (hours < 24) w *= 0.5
    }
    if (acc !== null) w *= 1 + (1 - acc) * 2 // schwache Partikel öfter
    if (x.source === 'ai') w *= 1.3 // eigene Sätze etwas bevorzugen
    return w
  }
  const cand = pool.map((x) => ({ x, w: weightOf(x) })).filter((c) => c.w > 0)
  const out: PoolSentence[] = []
  // Bei mehreren Partikeln: reihum, damit jede vorkommt
  const per = new Map<ParticleId, number>()
  while (out.length < n && cand.length) {
    const minCount = Math.min(...particles.map((p) => per.get(p) ?? 0))
    const fair = cand.filter((c) => (per.get(c.x.particle) ?? 0) === minCount)
    const from = fair.length ? fair : cand
    const total = from.reduce((a, c) => a + c.w, 0)
    let r = rnd() * total
    let idx = 0
    for (; idx < from.length - 1; idx++) {
      r -= from[idx].w
      if (r <= 0) break
    }
    const chosen = from[idx]
    if (vocab) {
      // Neue Wörter: höchstens perSentence je Satz und perRound in der ganzen Runde (schon eingeführte zählen nicht doppelt)
      const nw = vocab.newOf(chosen.x)
      const fresh = nw ? nw.filter((w) => !introduced.has(w.ko)) : []
      if (!nw || nw.length > vocab.perSentence || introduced.size + fresh.length > vocab.perRound) {
        cand.splice(cand.indexOf(chosen), 1)
        continue
      }
      fresh.forEach((w) => introduced.add(w.ko))
    }
    out.push(chosen.x)
    per.set(chosen.x.particle, (per.get(chosen.x.particle) ?? 0) + 1)
    cand.splice(cand.indexOf(chosen), 1)
  }
  return out
}

/** Ganze Sätze zum Übersetzen pro Runde je Stufe */
export const TRANSLATE_PER_ROUND: Record<Level, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 }
const fillLen = (t: Task) => t.sentence.ko.replace(/\{[^}]*\}/g, 'x').length

/** Eine Trainingsrunde */
export function buildRound(
  state: ParticleState, particles: ParticleId[],
  opts: { n?: number; level?: Level; hasKey?: boolean; translate?: boolean; rnd?: () => number; now?: number; vocab?: RoundVocab } = {},
): Task[] {
  const rnd = opts.rnd ?? Math.random
  const level = opts.level ?? effectiveLevel(state)
  const sentences = pickSentences(state, particles, level, opts.n ?? 10, { rnd, now: opts.now, vocab: opts.vocab })
  const learned = PARTICLE_IDS.filter((p) => !particles.includes(p) && isLearned(chapterProgress(state, p).status))
  const tasks = sentences.map((s) =>
    makeTask(s, level, kindFor(level, s, rnd), { rnd, focus: particles, allowed: particles, fallback: learned, newWords: opts.vocab?.newOf(s) ?? undefined }))
  // Ganze Sätze übersetzen (Deutsch → Koreanisch), ab Stufe 2 und mit der Stufe zunehmend.
  // Mit Key bewertet Gemini am Ende gesammelt, ohne Key gibt es Selbstkontrolle.
  const k = Math.min(TRANSLATE_PER_ROUND[level], Math.floor(tasks.length / 2))
  if (opts.translate !== false && k > 0) {
    // Stufe 2: der kürzeste Satz; sonst über die Runde verteilt, nach hinten hin
    const idxs = level === 2
      ? [tasks.reduce((best, t, i) => (fillLen(t) < fillLen(tasks[best]) ? i : best), 0)]
      : Array.from({ length: k }, (_, i) => tasks.length - 1 - i * 2)
    for (const idx of idxs) tasks[idx] = { ...tasks[idx], kind: 'translate', options: [] }
  }
  return tasks
}

/** Check „kenne ich schon“: 5 Aufgaben Stufe 2–3 */
export function buildCheck(state: ParticleState, p: ParticleId, rnd: () => number = Math.random): Task[] {
  const s2 = pickSentences(state, [p], 2, 3, { rnd })
  const s3 = pickSentences(state, [p], 3, 2, { rnd, exclude: new Set(s2.map((x) => x.id)) })
  return [...s2, ...s3].map((s) => makeTask(s, s.level as Level, 'choice', { rnd, showTip: false }))
}

/** Aufwärmen: 3 leichte Aufgaben mit sichtbarem Tipp, je Lektion eine */
export function buildWarmup(state: ParticleState, p: ParticleId, rnd: () => number = Math.random): Task[] {
  const lessons = CHAPTERS.find((c) => c.id === p)!.lessons.map((l) => l.id)
  const out: PoolSentence[] = []
  for (let i = 0; out.length < 3 && i < 6; i++) {
    const lesson = lessons[i % lessons.length]
    const got = pickSentences(state, [p], 1, 1, { rnd, lessons: [lesson], exclude: new Set(out.map((x) => x.id)) })
    if (got[0]) out.push(got[0])
  }
  return out.map((s) => makeTask(s, 1, 'choice', { rnd, showTip: true }))
}

/** Mini-Test: 5 Aufgaben Stufe 1–2 */
export function buildMiniTest(state: ParticleState, p: ParticleId, rnd: () => number = Math.random): Task[] {
  const s1 = pickSentences(state, [p], 1, 2, { rnd })
  const s2 = pickSentences(state, [p], 2, 3, { rnd, exclude: new Set(s1.map((x) => x.id)) })
  return [...s1, ...s2].map((s) => makeTask(s, s.level as Level, kindFor(s.level as Level, s, rnd), { rnd, showTip: false }))
}

export const PASS_MARK = 4 // von 5

// ---------- Satzprüfung (Pool und KI) ----------

/** Liefert einen Fehlertext oder null, wenn der Satz in Ordnung ist */
export function validateSentence(s: Pick<PoolSentence, 'ko' | 'de' | 'particle' | 'lesson'>): string | null {
  if (!s.ko || !/[가-힣]/.test(s.ko)) return 'kein koreanischer Text'
  if (!s.de?.trim()) return 'keine Übersetzung'
  if (!PARTICLE_IDS.includes(s.particle)) return 'unbekannte Partikel'
  let parsed
  try {
    parsed = parseSentence(s.ko)
  } catch (e) {
    return (e as Error).message
  }
  if (!parsed.gaps.length) return 'keine Lücke'
  if (s.lesson !== 'verwechslung' && !parsed.gaps.some((g) => g.particle === s.particle)) return 'keine Lücke der geübten Partikel'
  for (const g of parsed.gaps) {
    if (g.base) continue
    if (!g.noun) return `Lücke ohne Wort davor (${s.ko})`
    if (isAlternating(g.particle) && g.answer !== '하고' && g.answer !== formFor(g.particle, g.noun)) {
      return `falsche Form: ${g.noun}${g.answer} (richtig: ${g.noun}${formFor(g.particle, g.noun)})`
    }
    if (g.particle === 'e' && NO_E_TIME_WORDS.includes(g.noun)) return `kein 에 nach ${g.noun}`
    if (familyOf(g.answer) !== g.particle) return 'Partikel passt nicht'
  }
  return null
}

// ---------- Abgleich zwischen Geräten ----------

export function mergeParticleStates(a: ParticleState, b: ParticleState): ParticleState {
  const progress: ParticleState['progress'] = { ...a.progress }
  for (const [p, cp] of Object.entries(b.progress) as [ParticleId, ChapterProgress][]) {
    const ex = progress[p]
    progress[p] = !ex || cp.updatedAt > ex.updatedAt ? cp : ex
  }
  const stats: Record<string, SentenceStat> = { ...a.stats }
  for (const [id, st] of Object.entries(b.stats)) {
    const ex = stats[id]
    stats[id] = !ex || st.last > ex.last ? st : ex
  }
  const seen = new Set<string>()
  const recent = [...a.recent, ...b.recent]
    .filter((r) => {
      const k = `${r.t}-${r.p}-${r.ok}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((x, y) => x.t - y.t)
    .slice(-MAX_RECENT)
  const ai = new Map<string, PoolSentence>()
  for (const s of [...a.ai, ...b.ai]) if (!ai.has(s.id)) ai.set(s.id, s)
  const meta = b.metaUpdatedAt > a.metaUpdatedAt ? b : a
  return {
    progress, stats, recent,
    ai: [...ai.values()].sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0)).slice(-MAX_AI),
    level: meta.level, autoLevel: meta.autoLevel, levelChangedAt: meta.levelChangedAt, metaUpdatedAt: meta.metaUpdatedAt,
  }
}
