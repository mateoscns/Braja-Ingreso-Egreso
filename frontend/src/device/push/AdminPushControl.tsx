import { useId, type ReactNode } from 'react'
import { Icon } from '../../app/icons'
import { PageMessage } from '../../app/ui'
import type { AdminPushState } from './useAdminPush'

export type AdminPushControlRenderProps = AdminPushState & {
  companyName: string
  onActivate: () => void
  onDeactivate: () => void
  onRetryConfig: () => void
}

/**
 * The avisos control as a row of the «Configuración» page (`.setting-row`, design system 4.18): its title, the sentence of its
 * state and one button, with its messages under the row. It holds no state and calls nothing: everything it shows and does comes
 * by props. The state comes from `useAdminPush`, which AdminApp keeps mounted on every screen (slice N4), so this row can come and
 * go with the page while the subscription keeps being followed.
 */
export function AdminPushControlRender({
  companyName, availability, enabled, busy, configLoading, configReady, configError, error, message, onActivate, onDeactivate, onRetryConfig
}: AdminPushControlRenderProps) {
  const titleId = useId()
  const unavailable = availability === 'unsupported'
    ? 'Este navegador no admite avisos. En iPhone, instalá la app desde Safari (Compartir, Agregar a pantalla de inicio) y abrila desde el ícono.'
    : availability === 'unconfigured'
      ? 'Los avisos todavía no están habilitados en Fichaje.'
      : availability === 'blocked'
        ? 'No podemos avisarte porque bloqueaste los avisos en este navegador. Habilitalos desde los permisos del sitio.'
        : ''
  const row = (sentence: string, action?: ReactNode) => <div className="setting-row-main">
    <div className="setting-row-copy">
      <h2 id={titleId} className="setting-row-title"><Icon name="bell" />Avisos en este dispositivo</h2>
      <p>{sentence}</p>
    </div>
    {action}
  </div>
  if (unavailable) return <section className="setting-row" aria-labelledby={titleId}>{row(unavailable)}</section>
  return <section className="setting-row" aria-labelledby={titleId} aria-busy={configLoading}>
    {row(`${enabled ? `Activados para ${companyName}.` : `Desactivados para ${companyName}; cada empresa se activa por separado.`} Solo avisan cuando alguien no marca la entrada o llega tarde.`,
      enabled ? <button className="button button-link" onClick={onDeactivate} disabled={busy}>{busy ? 'Actualizando…' : 'Desactivar'}</button>
        : configError
          ? <button className="button button-secondary" onClick={onRetryConfig} disabled={configLoading}>Reintentar consulta</button>
          : <button className="button button-secondary" onClick={onActivate} disabled={busy || configLoading || !configReady}>{busy ? 'Activando…' : configLoading ? 'Cargando configuración…' : 'Activar avisos'}</button>)}
    {configLoading && <PageMessage>Consultando la configuración de avisos…</PageMessage>}
    {configError && <PageMessage kind="error">{configError}</PageMessage>}
    {error && <PageMessage kind="error">{error}</PageMessage>}{message && <PageMessage kind="success">{message}</PageMessage>}
  </section>
}
