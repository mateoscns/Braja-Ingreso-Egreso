import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../app/icons'

type RegisterOptions = {
  immediate?: boolean; onNeedRefresh?: () => void
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
}
/** How often an open app asks for a new version (2026-11-13 audit: a resumed installed app never asked). */
export const UPDATE_CHECK_MS = 60 * 60 * 1000
/** Same shape as `registerSW` from `virtual:pwa-register`, injected so the banner can be tested without the plugin. */
export type RegisterServiceWorker = (options: RegisterOptions) => (reloadPage?: boolean) => Promise<void>

/**
 * With `registerType: 'prompt'` a new service worker waits until the user accepts it.
 * `updateSW(true)` posts SKIP_WAITING (handled in sw.ts) and reloads once the new worker takes control.
 * The notice is an info message, the first thing in the page and in its flow, above the top bar. Its region is always there,
 * empty and without room until a version waits: a status is announced reliably only when its text appears in a region that
 * already exists (the pattern of PageMessage).
 */
export function ServiceWorkerUpdate({ register }: { register: RegisterServiceWorker }) {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updating, setUpdating] = useState(false)
  const updateSW = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)

  const registration = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (updateSW.current) return
    updateSW.current = register({ immediate: true, onNeedRefresh: () => setNeedRefresh(true), onRegisteredSW: (_url, found) => { registration.current = found ?? null } })
  }, [register])
  // An installed app resumed from the background never navigates, so the browser never looks for a new version: it asks every
  // hour and each time the app comes back to the screen. A failed check (no signal) is simply tried again later.
  useEffect(() => {
    const check = () => { void registration.current?.update().catch(() => undefined) }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    const timer = window.setInterval(check, UPDATE_CHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  return <div className="update-banner message message-info" role="status" aria-atomic="true">
    {needRefresh && <>
      <Icon name="info" />
      <div className="message-body">Hay una versión nueva</div>
      <button type="button" className="button button-secondary" disabled={updating} onClick={() => {
        setUpdating(true)
        void updateSW.current?.(true).catch(() => setUpdating(false))
      }}>{updating ? 'Actualizando…' : 'Actualizar'}</button>
    </>}
  </div>
}
