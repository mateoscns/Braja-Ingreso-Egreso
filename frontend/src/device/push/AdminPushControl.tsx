import { useEffect, useState } from 'react'
import { api } from '../../shared/api/client'
import type { PublicConfig } from '../../shared/api/types'
import { PageMessage } from '../../app/ui'

type SubscriptionRecord = { id: string }
type BrowserSubscription = PushSubscription

function decodeVapidKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function AdminPushControl() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [subscriptionId, setSubscriptionId] = useState<string>('')
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [configError, setConfigError] = useState('')
  const [configLoading, setConfigLoading] = useState(true)
  const [configAttempt, setConfigAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [supported, setSupported] = useState(pushSupported)

  async function registerWithServer(subscription: BrowserSubscription) {
    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('La suscripción del navegador está incompleta.')
    const saved = await api.put<SubscriptionRecord>('/push/subscriptions', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
    })
    setSubscriptionId(saved.id)
    setEnabled(true)
    setMessage('Avisos activados en este dispositivo.')
  }

  useEffect(() => {
    let active = true
    setSupported(pushSupported())
    setConfigLoading(true)
    setConfigError('')
    void (async () => {
      let publicConfig: PublicConfig | null = null
      try {
        publicConfig = await api.publicConfig<PublicConfig>()
        if (active) setConfig(publicConfig)
      } catch (reason) {
        if (active) setConfigError(reason instanceof Error ? reason.message : 'No se pudo consultar la configuración de avisos.')
      } finally {
        if (active) setConfigLoading(false)
      }

      if (!active || !publicConfig?.pushEnabled || !publicConfig.vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return
      try {
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        if (active && existing) {
          try { await registerWithServer(existing) }
          catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo sincronizar el aviso.') }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudo consultar la suscripción de avisos.')
      }
    })()
    return () => { active = false }
  }, [configAttempt])

  function retryConfig() {
    setError('')
    setMessage('')
    setConfigLoading(true)
    setConfigAttempt((attempt) => attempt + 1)
  }

  async function activate() {
    if (!config?.vapidPublicKey || !config.pushEnabled) return
    setBusy(true); setError(''); setMessage('')
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
      if (permission !== 'granted') { setMessage('Los avisos quedaron desactivados en el navegador. Podés habilitarlos desde sus permisos.'); return }
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(config.vapidPublicKey) as BufferSource })
      await registerWithServer(subscription)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron activar los avisos.') }
    finally { setBusy(false) }
  }

  async function deactivate() {
    setBusy(true); setError(''); setMessage('')
    try {
      if (subscriptionId) await api.delete(`/push/subscriptions/${encodeURIComponent(subscriptionId)}`)
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await subscription.unsubscribe()
      setSubscriptionId(''); setEnabled(false); setMessage('Avisos desactivados en este dispositivo.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron desactivar los avisos.') }
    finally { setBusy(false) }
  }

  const unavailable = !supported
    ? 'Este navegador no admite avisos. En iPhone, instalá la app desde Safari (Compartir, Agregar a pantalla de inicio) y abrila desde el ícono.'
    : config && (!config.pushEnabled || !config.vapidPublicKey)
      ? 'Los avisos no están habilitados en el servidor.'
      : !enabled && Notification.permission === 'denied'
        ? 'No podemos avisarte porque bloqueaste los avisos en este navegador. Habilitalos desde los permisos del sitio.'
        : ''
  if (unavailable) return <aside className="push-control" aria-label="Avisos de la aplicación">
    <div className="push-copy"><strong>Alertas en este dispositivo</strong><span>{unavailable}</span></div>
  </aside>
  return <aside className="push-control" aria-label="Avisos de la aplicación" aria-busy={configLoading}>
    {configLoading && <PageMessage>Consultando la configuración de avisos…</PageMessage>}
    {configError && <PageMessage kind="error">{configError}</PageMessage>}
    {error && <PageMessage kind="error">{error}</PageMessage>}{message && <PageMessage kind="success">{message}</PageMessage>}
    <div className="push-copy"><strong>Alertas en este dispositivo</strong><span>Solo avisan sobre ingresos pendientes o llegadas tarde.</span></div>
    {enabled ? <button className="button button-small button-quiet" onClick={() => void deactivate()} disabled={busy}>{busy ? 'Actualizando…' : 'Desactivar'}</button>
      : configError
        ? <button className="button button-small button-outline" onClick={retryConfig} disabled={configLoading}>Reintentar consulta</button>
        : <button className="button button-small button-outline" onClick={() => void activate()} disabled={busy || configLoading || !config}>{busy ? 'Activando…' : configLoading ? 'Cargando configuración…' : 'Activar avisos'}</button>}
  </aside>
}
