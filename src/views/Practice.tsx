import { Layers, Repeat2, Trophy } from 'lucide-react'
import { PageHeader, Segmented } from '../components/ui'
import { navigate } from '../lib/route'
import { useApp } from '../store'
import { ConjugationTrainer } from './Conjugation'
import { Browse } from './Learn'
import { QuizSetup } from './Quiz'

type Mode = 'lernen' | 'quiz' | 'beugung'

const SUBTITLE: Record<Mode, string> = {
  lernen: 'Karteikarten durchgehen und Schreiben üben',
  quiz: 'Abfragemodus – stelle dein Quiz zusammen',
  beugung: 'Verben & Adjektive in die gefragte Form bringen',
}

/** Ein Tab für alles Üben: Karteikarten, Quiz und Beugungs-Trainer. */
export function Practice({ sub }: { sub: string }) {
  const { words } = useApp()
  const mode: Mode = sub === 'quiz' || sub === 'beugung' ? sub : 'lernen'
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
              { value: 'lernen', label: <><Layers size={15} /> Lernen</> },
              { value: 'quiz', label: <><Trophy size={15} /> Quiz</> },
              { value: 'beugung', label: <><Repeat2 size={15} /> Beugung</> },
            ]}
          />
        }
      />
      <div key={mode} className="page-in">
      {mode === 'beugung' ? (
        <ConjugationTrainer onDashboard={toStart} />
      ) : words.length === 0 ? (
        <div className="card p-8 text-center text-label-2">Noch keine Vokabeln – füge unter „Wörter“ welche hinzu.</div>
      ) : mode === 'lernen' ? (
        <Browse onDashboard={toStart} />
      ) : (
        <QuizSetup onDashboard={toStart} />
      )}
      </div>
    </div>
  )
}
