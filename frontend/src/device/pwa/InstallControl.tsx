import { useEffect, useId, useRef, useState } from 'react'
import { PageMessage, TopbarNotice } from '../../app/ui'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type Platform = 'ios' | 'android' | 'other'

/**
 * A link button of the top bar. «Cómo instalar» opens its help as an info message under the bar, in the flow of the page; the
 * same button or Escape closes it. `audience="employee"` leaves out the push alerts note: only the ADMIN receives push alerts.
 */
export function InstallControl({ audience = 'admin' }: { audience?: 'admin' | 'employee' }) {
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [platform, setPlatform] = useState<Platform>('other')
  const trigger = useRef<HTMLButtonElement>(null)
  const help = useRef<HTMLDivElement>(null)
  const helpId = useId()
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
  useEffect(() => {
    if (!helpOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // From the button, the help or nowhere (Safari does not focus a clicked button); an Escape typed in a field elsewhere
      // belongs to that field and must not pull the focus up to the top bar.
      const focused = document.activeElement
      if (focused && focused !== document.body && focused !== trigger.current && !help.current?.contains(focused)) return
      setHelpOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [helpOpen])
  if (installed) return null
  if (promptEvent) return <button type="button" className="button button-link" onClick={async () => { await promptEvent.prompt(); await promptEvent.userChoice; setPromptEvent(null) }}>Instalar app</button>
  if (platform === 'other') return null
  return <>
    <button ref={trigger} type="button" className="button button-link" aria-expanded={helpOpen} aria-controls={helpOpen ? helpId : undefined} onClick={() => setHelpOpen((open) => !open)}>Cómo instalar</button>
    {helpOpen && <TopbarNotice><div className="install-help" id={helpId} ref={help}><PageMessage>{platform === 'ios'
      ? <>En Safari, tocá <strong>Compartir</strong> y elegí <strong>Agregar a pantalla de inicio</strong>.{audience === 'admin' && ' Los avisos se activan desde la app instalada.'}</>
      : <>En Chrome, tocá el menú <strong><span aria-hidden="true">⋮</span> (tres puntos)</strong> y elegí <strong>Agregar a pantalla de inicio</strong>.</>}</PageMessage></div></TopbarNotice>}
  </>
}
