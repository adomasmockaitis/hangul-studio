import { useState, type ReactNode } from 'react'
import { PageHeader, Segmented } from '../components/ui'
import { navigate } from '../lib/route'
import { useApp } from '../store'
import { ConjugationTrainer } from './Conjugation'
import { Browse } from './Learn'
import { QuizSetup } from './Quiz'
import { DictationSetup } from './Dictation'
import { ParticleTrainer } from './Particles'

type Mode = 'lernen' | 'quiz' | 'diktat' | 'partikel' | 'beugung'
const MODES: Mode[] = ['lernen', 'quiz', 'diktat', 'partikel', 'beugung']

const SUBTITLE: Record<Mode, string> = {
  lernen: 'Karteikarten durchgehen und Schreiben üben',
  quiz: 'Abfragemodus – stelle dein Quiz zusammen',
  diktat: 'Koreanisch hören und aufschreiben oder verstehen',
  partikel: 'Partikeln verstehen und sicher einsetzen',
  beugung: 'Verben & Adjektive in die gefragte Form bringen',
}

/** Ein Tab für alles Üben: Karteikarten, Quiz, Diktat, Partikeln und Beugung. */
export function Practice({ sub, rest = '' }: { sub: string; rest?: string }) {
  const { words } = useApp()
  const mode: Mode = (MODES as string[]).includes(sub) ? (sub as Mode) : 'lernen'
  const toStart = () => navigate('/start')
  // Besuchte Übungsarten bleiben geladen (nur ausgeblendet) – ein Wechsel Quiz → Lernen → Quiz verliert nichts
  const [visited, setVisited] = useState<Mode[]>([mode])
  if (!visited.includes(mode)) setVisited([...visited, mode])

  const body = (m: Mode): ReactNode =>
    m === 'partikel' ? <ParticleTrainer chapter={rest} />
    : m === 'beugung' ? <ConjugationTrainer onDashboard={toStart} />
    : words.length === 0 ? <div className="card p-8 text-center text-label-2">Noch keine Vokabeln – füge unter „Wörter“ welche hinzu.</div>
    : m === 'lernen' ? <Browse onDashboard={toStart} />
    : m === 'diktat' ? <DictationSetup onDashboard={toStart} />
    : <QuizSetup onDashboard={toStart} extra={rest === 'extra'} />

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Üben"
        subtitle={SUBTITLE[mode]}
        collapsible={false}
        below={
          // Nur Text (Apple: in einem Umschalter nicht Symbole und Text mischen)
          <Segmented<Mode>
            label="Übungsart"
            value={mode}
            onChange={(m) => navigate(m === 'lernen' ? '/ueben' : `/ueben/${m}`)}
            options={[
              { value: 'lernen', label: 'Lernen' },
              { value: 'quiz', label: 'Quiz' },
              { value: 'diktat', label: 'Diktat' },
              { value: 'partikel', label: 'Partikel' },
              { value: 'beugung', label: 'Beugung' },
            ]}
          />
        }
      />
      {visited.map((m) => (
        <div key={m} className={m === mode ? 'page-in' : 'hidden'}>{body(m)}</div>
      ))}
    </div>
  )
}
