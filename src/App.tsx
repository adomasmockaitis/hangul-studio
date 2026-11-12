import { useEffect, useState } from 'react'
import { BookOpen, GraduationCap, LayoutDashboard, Repeat2, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { AiStatusPill } from './components/AiStatusPill'
import { isOnboarded, Onboarding } from './components/Onboarding'
import { WhatsNew } from './components/WhatsNew'
import { releasePopup } from './lib/releases'
import { warmup } from './lib/gemini'
import { AppProvider, useApp } from './store'
import { SyncProvider } from './sync'
import { ToastProvider } from './components/Toasts'
import { Dashboard } from './views/Dashboard'
import { Dictionary } from './views/Dictionary'
import { Learn } from './views/Learn'
import { ConjugationTrainer } from './views/Conjugation'
import { SettingsView } from './views/SettingsView'
import type { ViewId } from './types'

const NAV: { id: ViewId; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { id: 'dictionary', label: 'Wörterbuch & Upload', short: 'Wörter', icon: BookOpen },
  { id: 'learn', label: 'Lernen & Quiz', short: 'Lernen', icon: GraduationCap },
  { id: 'conjugation', label: 'Beugungs-Trainer', short: 'Beugung', icon: Repeat2 },
  { id: 'settings', label: 'Einstellungen', short: 'Mehr', icon: SettingsIcon },
]

function Shell() {
  const { settings } = useApp()
  const [view, setView] = useState<ViewId>('dashboard')
  const [onboarding, setOnboarding] = useState(() => !isOnboarded())
  // Update-Fenster: nur für bestehende Nutzer, einmal pro neuem Release
  const [whatsNew, setWhatsNew] = useState(() => isOnboarded() && releasePopup() !== null)

  // Start-Check im Hintergrund (höchstens alle 30 Min. ein Request)
  useEffect(() => {
    const id = setTimeout(() => void warmup(settings.geminiApiKey), 600)
    return () => clearTimeout(id)
  }, [settings.geminiApiKey])
  const [quizKey, setQuizKey] = useState(0)
  const [quiz, setQuiz] = useState(false)

  const go = (v: ViewId, opts?: { quiz?: boolean }) => {
    setQuiz(!!opts?.quiz)
    setQuizKey((k) => k + 1)
    setView(v)
  }

  return (
    <div className="flex h-full">
      {/* Sidebar (Desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-black/[0.06] bg-white/60 p-4 backdrop-blur-md md:flex dark:border-white/10 dark:bg-[#1c1c1e]/60">
        <div className="mb-6 flex items-center gap-3 px-2 pt-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] text-xl font-bold text-white shadow-md">한</div>
          <div>
            <p className="font-bold leading-tight">Hangul Studio</p>
            <p className="text-xs text-black/45 dark:text-white/45">Koreanisch lernen</p>
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition ${
                view === n.id ? 'bg-[#007aff] text-white shadow-sm' : 'text-black/70 hover:bg-black/[0.06] dark:text-white/75 dark:hover:bg-white/10'
              }`}
            >
              <n.icon size={19} /> {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-4"><AiStatusPill className="w-full" /></div>
      </aside>

      <AiStatusPill className="fixed right-3 top-3 z-30 max-w-[70vw] shadow-sm md:hidden" />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-14 sm:px-8 md:pb-10 md:pt-10">
        {view === 'dashboard' && <Dashboard go={go} />}
        {view === 'dictionary' && <Dictionary />}
        {view === 'learn' && <Learn key={quizKey} initialQuiz={quiz} onDashboard={() => go('dashboard')} />}
        {view === 'conjugation' && <ConjugationTrainer key={quizKey} onDashboard={() => go('dashboard')} />}
        {view === 'settings' && <SettingsView onRestartOnboarding={() => setOnboarding(true)} onShowWhatsNew={() => setWhatsNew(true)} />}
      </main>

      {!onboarding && whatsNew && <WhatsNew onClose={() => setWhatsNew(false)} />}
      {onboarding && <Onboarding onClose={() => { setOnboarding(false); setView('dashboard') }} />}

      {/* Bottom-Tab-Bar (Mobile/Tablet) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-black/[0.08] bg-white/75 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-[#1c1c1e]/75">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${view === n.id ? 'text-[#007aff]' : 'text-black/45 dark:text-white/50'}`}
          >
            <n.icon size={22} strokeWidth={view === n.id ? 2.4 : 1.8} />
            {n.short}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <SyncProvider>
          <Shell />
        </SyncProvider>
      </ToastProvider>
    </AppProvider>
  )
}
