import { Bell, CheckCircle2, Clock, Cloud, MousePointerClick, Pin, ShieldCheck, type LucideIcon } from 'lucide-react'
import { LATEST_RELEASE, markReleaseSeen, releasePopup, type ReleaseIcon } from '../lib/releases'
import { playSound } from '../lib/sounds'
import { useSync } from '../sync'

const ICONS: Record<ReleaseIcon, LucideIcon> = {
  cloud: Cloud, shield: ShieldCheck, bell: Bell, clock: Clock, pin: Pin, check: CheckCircle2, pointer: MousePointerClick,
}

/**
 * Großes „Das ist neu“-Fenster im Apple-Stil. Ein Fenster pro Besuch: bis zu drei große Updates
 * untereinander, dazu kleine Verbesserungen als Zeilen unter „Außerdem“.
 */
export function WhatsNew({ onClose }: { onClose: () => void }) {
  const sync = useSync()
  const popup = releasePopup(true)
  const majors = popup?.majors ?? []
  const minors = popup?.minors ?? []
  const wantsSync = majors.some((r) => r.cta === 'sync')
  const canConnect = wantsSync && !!sync.clientId && !(sync.enabled && sync.state !== 'needs-auth')

  const close = () => {
    markReleaseSeen(LATEST_RELEASE.id)
    playSound('tap')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/40 backdrop-blur-md sm:place-items-center sm:p-6">
      <div className="fade-up max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-[32px] border border-black/10 bg-[#f2f2f7]/95 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:rounded-[32px] dark:border-white/10 dark:bg-[#1c1c1e]/95">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[18px] bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] text-3xl font-bold text-white shadow-lg">한</div>
          <h2 className="text-3xl font-bold tracking-tight">Neu in Hangul Studio</h2>
        </div>

        <div className="space-y-7">
          {majors.map((r) => (
            <section key={r.id}>
              <h3 className="mb-3 text-center text-[15px] font-semibold text-[#007aff]">{r.subtitle}</h3>
              <ul className="space-y-5">
                {r.features.map((f) => {
                  const Icon = ICONS[f.icon]
                  return (
                    <li key={f.title} className="flex gap-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: f.color }}>
                        <Icon size={22} />
                      </span>
                      <div>
                        <p className="font-semibold leading-tight">{f.title}</p>
                        <p className="mt-0.5 text-sm leading-snug text-black/60 dark:text-white/60">{f.text}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {minors.length > 0 && (
            <section>
              <h3 className="mb-2 text-center text-[15px] font-semibold text-black/50 dark:text-white/50">Außerdem</h3>
              <ul className="space-y-1.5 rounded-2xl bg-black/[0.04] p-3 text-sm text-black/65 dark:bg-white/5 dark:text-white/65">
                {minors.map((r) => (
                  <li key={r.id} className="flex gap-2">
                    <span className="text-[#007aff]">•</span>
                    <span>{r.summary}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {wantsSync && (
          <p className="mt-6 rounded-2xl bg-black/[0.04] p-3 text-xs leading-relaxed text-black/50 dark:bg-white/5 dark:text-white/50">
            Ohne Verbindung bleibt alles wie bisher lokal in deinem Browser. Du kannst deine Daten jederzeit unter <b>Einstellungen → Backup</b> selbst exportieren und importieren.
          </p>
        )}

        <div className="mt-5 space-y-2">
          {canConnect && (
            <button
              className="btn-primary w-full !rounded-2xl !py-3.5 !text-base"
              onClick={() => {
                close()
                void sync.connect()
              }}
            >
              <Cloud size={18} /> Jetzt mit Google verbinden
            </button>
          )}
          <button className={`${canConnect ? 'btn-soft' : 'btn-primary'} w-full !rounded-2xl !py-3.5 !text-base`} onClick={close}>
            {canConnect ? 'Später' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  )
}
