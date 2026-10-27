import { useEffect, useRef, useState } from 'react'

type RegisterOptions = { immediate?: boolean; onNeedRefresh?: () => void }
/** Same shape as `registerSW` from `virtual:pwa-register`, injected so the banner can be tested without the plugin. */
export type RegisterServiceWorker = (options: RegisterOptions) => (reloadPage?: boolean) => Promise<void>

/**
 * With `registerType: 'prompt'` a new service worker waits until the user accepts it.
 * `updateSW(true)` posts SKIP_WAITING (handled in sw.ts) and reloads once the new worker takes control.
 */
export function ServiceWorkerUpdate({ register }: { register: RegisterServiceWorker }) {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updating, setUpdating] = useState(false)
  const updateSW = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    if (updateSW.current) return
    updateSW.current = register({ immediate: true, onNeedRefresh: () => setNeedRefresh(true) })
  }, [register])

  if (!needRefresh) return null
  return <div className="update-banner" role="status" aria-atomic="true">
    <span>Hay una versión nueva</span>
    <button type="button" className="button button-small button-primary" disabled={updating} onClick={() => {
      setUpdating(true)
      void updateSW.current?.(true).catch(() => setUpdating(false))
    }}>{updating ? 'Actualizando…' : 'Actualizar'}</button>
  </div>
}
