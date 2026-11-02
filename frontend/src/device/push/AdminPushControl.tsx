import { useEffect, useRef, useState } from 'react'
import { api } from '../../shared/api/client'
import type { CurrentPushSubscription, PublicConfig } from '../../shared/api/types'
import { PageMessage } from '../../app/ui'
import { decodeVapidKey, isSubscriptionChangedMessage } from './subscriptionChange'

type SubscriptionRecord = { id: string }
type BrowserSubscription = PushSubscription

const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/**
 * Alerts are per company (D-20261027-04): the server keeps one subscription per company, so mounting only asks
 * whether this device is subscribed in the active company and never registers it. Remount it per company.
 */
export function AdminPushControl({ companyName }: { companyName: string }) {
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
  // Endpoint the server confirmed for this company on this device; kept in memory only, never in browser storage.
  const knownEndpoint = useRef('')

  async function registerWithServer(subscription: BrowserSubscription, notice = `Avisos activados para ${companyName} en este dispositivo.`) {
    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('La suscripción del navegador está incompleta.')
    const saved = await api.put<SubscriptionRecord>('/push/subscriptions', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
    })
    knownEndpoint.current = json.endpoint
    setSubscriptionId(saved.id)
    setEnabled(true)
    setMessage(notice)
  }

  /**
   * The browser can renew a subscription (pushsubscriptionchange) and the old endpoint stops receiving alerts. The current
   * one is re-registered only where the device was subscribed: the endpoint this panel saw confirmed, or the old endpoint
   * the service worker reports, checked with the server. A company where alerts were never enabled stays off (D-20261027-04).
   */
  async function syncRenewedSubscription(oldEndpoint: string | null) {
    const registration = await navigator.serviceWorker.ready
    const current = await registration.pushManager.getSubscription()
    if (!current?.endpoint || current.endpoint === knownEndpoint.current) return
    let wasSubscribed = Boolean(knownEndpoint.current)
    if (!wasSubscribed && oldEndpoint) {
      wasSubscribed = (await api.post<CurrentPushSubscription>('/push/subscriptions/current', { endpoint: oldEndpoint })).subscribed
    }
    if (wasSubscribed) await registerWithServer(current, `El navegador renovó la suscripción; los avisos siguen activos para ${companyName}.`)
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
        if (!active || !existing?.endpoint) return
        const current = await api.post<CurrentPushSubscription>('/push/subscriptions/current', { endpoint: existing.endpoint })
        if (!active) return
        setEnabled(current.subscribed && Boolean(current.id))
        setSubscriptionId(current.subscribed && current.id ? current.id : '')
        knownEndpoint.current = current.subscribed && current.id ? existing.endpoint : ''
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudo consultar la suscripción de avisos.')
      }
    })()
    return () => { active = false }
  }, [configAttempt])

  // Renewal notices from the service worker, and a re-check whenever the app comes back to the foreground.
  useEffect(() => {
    const container = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined
    if (!container || typeof container.addEventListener !== 'function') return
    let active = true
    const sync = (oldEndpoint: string | null) => {
      syncRenewedSubscription(oldEndpoint).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudo renovar la suscripción de avisos.')
      })
    }
    const onMessage = (event: MessageEvent) => { if (isSubscriptionChangedMessage(event.data)) sync(event.data.oldEndpoint) }
    const onVisible = () => { if (document.visibilityState === 'visible' && knownEndpoint.current) sync(null) }
    container.addEventListener('message', onMessage)
    container.startMessages?.()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      container.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  // The listeners live as long as the panel, which is remounted per company; syncRenewedSubscription reads the endpoint from a ref.
  }, [])

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

  // Only this company's subscription is removed; the browser subscription stays for the other companies.
  async function deactivate() {
    setBusy(true); setError(''); setMessage('')
    try {
      if (subscriptionId) await api.delete(`/push/subscriptions/${encodeURIComponent(subscriptionId)}`)
      knownEndpoint.current = ''; setSubscriptionId(''); setEnabled(false); setMessage(`Avisos desactivados para ${companyName} en este dispositivo.`)
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
    <div className="push-copy"><strong>Alertas en este dispositivo</strong><span>
      {enabled ? `Activadas para ${companyName}.` : `Desactivadas para ${companyName}; cada empresa se activa por separado.`} Solo avisan sobre ingresos pendientes o llegadas tarde.
    </span></div>
    {enabled ? <button className="button button-small button-quiet" onClick={() => void deactivate()} disabled={busy}>{busy ? 'Actualizando…' : 'Desactivar'}</button>
      : configError
        ? <button className="button button-small button-outline" onClick={retryConfig} disabled={configLoading}>Reintentar consulta</button>
        : <button className="button button-small button-outline" onClick={() => void activate()} disabled={busy || configLoading || !config}>{busy ? 'Activando…' : configLoading ? 'Cargando configuración…' : 'Activar avisos'}</button>}
  </aside>
}
