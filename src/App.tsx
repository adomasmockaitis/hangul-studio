import { useEffect, useState } from 'react'
import { BookOpen, GraduationCap, House, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { AiStatusPill } from './components/AiStatusPill'
import { isOnboarded, Onboarding } from './components/Onboarding'
import { WhatsNew } from './components/WhatsNew'
import { releasePopup } from './lib/releases'
import { playSound } from './lib/sounds'
import { warmup } from './lib/gemini'
import { navigate, useRoute, type Tab } from './lib/route'
import { AppProvider, useApp } from './store'
import { SyncProvider } from './sync'
import { AccountProvider } from './account'
import { ToastProvider } from './components/Toasts'
import { ConfirmProvider } from './components/ui'
import { Dashboard } from './views/Dashboard'
import { Dictionary } from './views/Dictionary'
import { Practice } from './views/Practice'
import { Lab } from './views/Lab'
import { SettingsView } from './views/SettingsView'

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'start', label: 'Start', icon: House },
  { id: 'ueben', label: 'Üben', icon: GraduationCap },
  { id: 'woerter', label: 'Wörter', icon: BookOpen },
  { id: 'einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

function Shell() {
  const { settings } = useApp()
  const { tab, sub, rest } = useRoute()
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

  const idx = NAV.findIndex((n) => n.id === tab)
  const go = (id: Tab) => {
    if (id === tab) setNavKey((k) => k + 1)
    else playSound('nav')
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
          <nav aria-label="Hauptnavigation" className="relative space-y-1">
            {/* Auswahl gleitet zur gewählten Zeile (44 px Zeile + 4 px Abstand) */}
            <span aria-hidden className="ease-spring pointer-events-none absolute inset-x-0 top-0 h-11 rounded-full bg-fill-2 transition-transform duration-300" style={{ transform: `translateY(${idx * 48}px)`, opacity: idx < 0 ? 0 : 1 }} />
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                aria-current={tab === n.id ? 'page' : undefined}
                className={`relative flex min-h-11 w-full items-center gap-3 rounded-full px-3.5 text-left text-base transition-colors active:opacity-60 ${
                  tab === n.id ? 'font-semibold text-label' : 'font-medium text-label-2 hover:bg-fill-4'
                }`}
              >
                <n.icon key={tab === n.id ? 'on' : 'off'} size={20} className={tab === n.id ? 'tab-bounce text-blue' : ''} /> {n.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-4"><AiStatusPill className="w-full" /></div>
        </div>
      </aside>

      <AiStatusPill compact className="glass fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 md:hidden" />
      <main id="main" className="min-w-0 flex-1 overflow-y-auto px-4 pb-32 pt-16 sm:px-8 md:pb-10 md:pt-10">
        <div key={`${tab}-${navKey}`} className="page-in">
          {tab === 'start' && <Dashboard />}
          {tab === 'woerter' && <Dictionary />}
          {tab === 'ueben' && <Practice sub={sub} rest={rest} />}
          {tab === 'labor' && <Lab />}
          {tab === 'einstellungen' && <SettingsView sub={sub} onRestartOnboarding={() => setOnboarding(true)} onShowWhatsNew={() => setWhatsNew(true)} />}
        </div>
      </main>

      {!onboarding && whatsNew && <WhatsNew onClose={() => setWhatsNew(false)} />}
      {onboarding && <Onboarding onClose={() => { setOnboarding(false); navigate('/start') }} />}

      {/* Tableiste (Handy / Tablet hoch): schwebende Glas-Kapsel */}
      <nav
        aria-label="Hauptnavigation"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-full p-1 md:hidden"
      >
        <div className="relative flex">
        <span aria-hidden className="ease-spring pointer-events-none absolute inset-y-0 left-0 w-1/4 rounded-full bg-fill-2 transition-transform duration-300" style={{ transform: `translateX(${idx * 100}%)`, opacity: idx < 0 ? 0 : 1 }} />
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            aria-current={tab === n.id ? 'page' : undefined}
            className={`relative flex min-h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[0.6875rem] font-medium transition-colors active:opacity-60 ${
              tab === n.id ? 'text-blue' : 'text-label-2'
            }`}
          >
            <n.icon key={tab === n.id ? 'on' : 'off'} size={22} strokeWidth={tab === n.id ? 2.4 : 1.9} className={tab === n.id ? 'tab-bounce' : ''} />
            <span className="max-w-full truncate">{n.label}</span>
          </button>
        ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <SyncProvider>
          <AccountProvider>
            <ConfirmProvider>
              <Shell />
            </ConfirmProvider>
          </AccountProvider>
        </SyncProvider>
      </ToastProvider>
    </AppProvider>
  )
}
