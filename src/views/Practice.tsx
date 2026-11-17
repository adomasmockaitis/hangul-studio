import { Ear, Layers, Puzzle, Repeat2, Trophy } from 'lucide-react'
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

  return (
    <div className={`mx-auto ${mode === 'beugung' ? 'max-w-2xl' : 'max-w-3xl'}`}>
      <PageHeader
        title="Üben"
        subtitle={SUBTITLE[mode]}
        collapsible={false}
        right={
          <Segmented<Mode>
            label="Übungsart"
            value={mode}
            onChange={(m) => navigate(m === 'lernen' ? '/ueben' : `/ueben/${m}`)}
            options={[
              { value: 'lernen', label: <><Layers size={15} className="hidden sm:block" /> Lernen</> },
              { value: 'quiz', label: <><Trophy size={15} className="hidden sm:block" /> Quiz</> },
              { value: 'diktat', label: <><Ear size={15} className="hidden sm:block" /> Diktat</> },
              { value: 'partikel', label: <><Puzzle size={15} className="hidden sm:block" /> Partikel</> },
              { value: 'beugung', label: <><Repeat2 size={15} className="hidden sm:block" /> Beugung</> },
            ]}
          />
        }
      />
      <div key={mode} className="page-in">
      {mode === 'partikel' ? (
        <ParticleTrainer chapter={rest} />
      ) : mode === 'beugung' ? (
        <ConjugationTrainer onDashboard={toStart} />
      ) : words.length === 0 ? (
        <div className="card p-8 text-center text-label-2">Noch keine Vokabeln – füge unter „Wörter“ welche hinzu.</div>
      ) : mode === 'lernen' ? (
        <Browse onDashboard={toStart} />
      ) : mode === 'diktat' ? (
        <DictationSetup onDashboard={toStart} />
      ) : (
        <QuizSetup onDashboard={toStart} />
      )}
      </div>
    </div>
  )
}
