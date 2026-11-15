import { useEffect, useState } from 'react'
import { BookOpen, GraduationCap, House, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { AiStatusPill } from './components/AiStatusPill'
import { isOnboarded, Onboarding } from './components/Onboarding'
import { WhatsNew } from './components/WhatsNew'
import { releasePopup } from './lib/releases'
import { warmup } from './lib/gemini'
import { navigate, useRoute, type Tab } from './lib/route'
import { AppProvider, useApp } from './store'
import { SyncProvider } from './sync'
import { ToastProvider } from './components/Toasts'
import { ConfirmProvider } from './components/ui'
import { Dashboard } from './views/Dashboard'
import { Dictionary } from './views/Dictionary'
import { Practice } from './views/Practice'
import { SettingsView } from './views/SettingsView'

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'start', label: 'Start', icon: House },
  { id: 'ueben', label: 'Üben', icon: GraduationCap },
  { id: 'woerter', label: 'Wörter', icon: BookOpen },
  { id: 'einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

function Shell() {
  const { settings } = useApp()
  const { tab, sub } = useRoute()
  const [onboarding, setOnboarding] = useState(() => !isOnboarded())
  // Update-Fenster: nur für bestehende Nutzer, einmal pro neuem Release
  const [whatsNew, setWhatsNew] = useState(() => isOnboarded() && releasePopup() !== null)
  // Erneuter Tipp auf den aktiven Tab setzt die Seite zurück (z. B. laufendes Quiz → Auswahl)
  const [navKey, setNavKey] = useState(0)

  // Start-Check im Hintergrund (höchstens alle 30 Min. ein Request)
  useEffect(() => {
    const id = setTimeout(() => void warmup(settings.geminiApiKey), 600)
    return () => clearTimeout(id)
  }, [settings.geminiApiKey])

  // Beim Seitenwechsel nach oben scrollen
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 })
  }, [tab, sub, navKey])

  const go = (id: Tab) => {
    if (id === tab) setNavKey((k) => k + 1)
    navigate('/' + id)
  }

  return (
    <div className="flex h-full">
      {/* Seitenleiste (ab Tablet quer): schwebendes Glas */}
      <aside className="hidden shrink-0 p-3 pr-0 md:block">
        <div className="glass flex h-full w-60 flex-col rounded-[26px] p-3">
          <div className="mb-5 flex items-center gap-3 px-2 pt-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue to-indigo text-xl font-bold text-white shadow-md" aria-hidden>한</div>
            <div>
              <p className="font-bold leading-tight">Hangul Studio</p>
              <p className="text-xs text-label-2">Koreanisch lernen</p>
            </div>
          </div>
          <nav aria-label="Hauptnavigation" className="space-y-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                aria-current={tab === n.id ? 'page' : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-full px-3.5 text-left text-base transition ${
                  tab === n.id ? 'bg-fill-2 font-semibold text-label' : 'font-medium text-label-2 hover:bg-fill-4'
                }`}
              >
                <n.icon size={20} className={tab === n.id ? 'text-blue' : ''} /> {n.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-4"><AiStatusPill className="w-full" /></div>
        </div>
      </aside>

      <AiStatusPill compact className="glass fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 md:hidden" />
      <main id="main" className="min-w-0 flex-1 overflow-y-auto px-4 pb-32 pt-16 sm:px-8 md:pb-10 md:pt-10">
        {tab === 'start' && <Dashboard />}
        {tab === 'woerter' && <Dictionary key={navKey} />}
        {tab === 'ueben' && <Practice key={`${sub}-${navKey}`} sub={sub} />}
        {tab === 'einstellungen' && <SettingsView onRestartOnboarding={() => setOnboarding(true)} onShowWhatsNew={() => setWhatsNew(true)} />}
      </main>

      {!onboarding && whatsNew && <WhatsNew onClose={() => setWhatsNew(false)} />}
      {onboarding && <Onboarding onClose={() => { setOnboarding(false); navigate('/start') }} />}

      {/* Tableiste (Handy / Tablet hoch): schwebende Glas-Kapsel */}
      <nav
        aria-label="Hauptnavigation"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md rounded-full p-1 md:hidden"
      >
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            aria-current={tab === n.id ? 'page' : undefined}
            className={`flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[0.6875rem] font-medium transition ${
              tab === n.id ? 'bg-fill-2 text-blue' : 'text-label-2'
            }`}
          >
            <n.icon size={22} strokeWidth={tab === n.id ? 2.4 : 1.9} />
            <span className="max-w-full truncate">{n.label}</span>
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
          <ConfirmProvider>
            <Shell />
          </ConfirmProvider>
        </SyncProvider>
      </ToastProvider>
    </AppProvider>
  )
}
