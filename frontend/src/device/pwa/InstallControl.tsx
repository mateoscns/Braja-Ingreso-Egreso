import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function InstallControl() {
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [isIos, setIsIos] = useState(false)
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    const platform = navigator.userAgent
    setInstalled(standalone)
    setIsIos(/iPhone|iPad|iPod/i.test(platform) || (/Macintosh/i.test(platform) && navigator.maxTouchPoints > 1))
    const onPrompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPrompt) }
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); setHelpOpen(false) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (installed) return null
  if (promptEvent) return <button className="button button-small button-outline" onClick={async () => { await promptEvent.prompt(); await promptEvent.userChoice; setPromptEvent(null) }}>Instalar app</button>
  if (!isIos) return null
  return <div className="install-control"><button className="button button-small button-quiet" aria-expanded={helpOpen} onClick={() => setHelpOpen((open) => !open)}>Cómo instalar</button>
    {helpOpen && <div className="install-help" role="status">En Safari, tocá <strong>Compartir</strong> y elegí <strong>Agregar a pantalla de inicio</strong>. Los avisos push se activan desde la app instalada.</div>}
  </div>
}
