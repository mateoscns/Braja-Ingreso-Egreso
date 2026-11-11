import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../app/icons'

type RegisterOptions = { immediate?: boolean; onNeedRefresh?: () => void }
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

  useEffect(() => {
    if (updateSW.current) return
    updateSW.current = register({ immediate: true, onNeedRefresh: () => setNeedRefresh(true) })
  }, [register])

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
