import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type Platform = 'ios' | 'android' | 'other'

/** `audience="employee"` leaves out the push alerts note: only the ADMIN receives push alerts. */
export function InstallControl({ audience = 'admin' }: { audience?: 'admin' | 'employee' }) {
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [platform, setPlatform] = useState<Platform>('other')
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    const agent = navigator.userAgent
    setInstalled(standalone)
    const ios = /iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1)
    setPlatform(ios ? 'ios' : /Android/i.test(agent) ? 'android' : 'other')
    const onPrompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPrompt) }
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); setHelpOpen(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (installed) return null
  if (promptEvent) return <button className="button button-small button-outline" onClick={async () => { await promptEvent.prompt(); await promptEvent.userChoice; setPromptEvent(null) }}>Instalar app</button>
  if (platform === 'other') return null
  return <div className="install-control"><button className="button button-small button-quiet" aria-expanded={helpOpen} onClick={() => setHelpOpen((open) => !open)}>Cómo instalar</button>
    {helpOpen && <div className="install-help" role="status">{platform === 'ios'
      ? <>En Safari, tocá <strong>Compartir</strong> y elegí <strong>Agregar a pantalla de inicio</strong>.{audience === 'admin' && ' Los avisos push se activan desde la app instalada.'}</>
      : <>En Chrome, tocá el menú <strong><span aria-hidden="true">⋮</span> (tres puntos)</strong> y elegí <strong>Agregar a pantalla de inicio</strong>.</>}</div>}
  </div>
}
