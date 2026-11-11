import { PageMessage } from '../../app/ui'
import { useAdminPush, type AdminPushState } from './useAdminPush'

export type AdminPushControlRenderProps = AdminPushState & {
  companyName: string
  onActivate: () => void
  onDeactivate: () => void
  onRetryConfig: () => void
}

/** The markup of the alerts control. It holds no state and calls nothing: everything it shows and does comes by props. */
export function AdminPushControlRender({
  companyName, availability, enabled, busy, configLoading, configReady, configError, error, message, onActivate, onDeactivate, onRetryConfig
}: AdminPushControlRenderProps) {
  const [unavailable, unavailableShort] = availability === 'unsupported'
    ? ['Este navegador no admite avisos. En iPhone, instalá la app desde Safari (Compartir, Agregar a pantalla de inicio) y abrila desde el ícono.', 'Avisos: no disponibles en este navegador']
    : availability === 'unconfigured'
      ? ['Los avisos todavía no están habilitados en Fichaje.', 'Avisos: no disponibles']
      : availability === 'blocked'
        ? ['No podemos avisarte porque bloqueaste los avisos en este navegador. Habilitalos desde los permisos del sitio.', 'Avisos: bloqueados en este navegador']
        : ['', '']
  // On phones and small tablets (styles.css, 760 px or less) only the short status shows, so the fixed bar stays one or two lines tall.
  const copy = (detail: string, short: string) => <div className="push-copy"><strong className="push-title">Alertas en este dispositivo</strong>
    <strong className="push-status-short">{short}</strong><span className="push-detail">{detail}</span></div>
  if (unavailable) return <aside className="push-control" aria-label="Avisos de la aplicación">{copy(unavailable, unavailableShort)}</aside>
  return <aside className="push-control" aria-label="Avisos de la aplicación" aria-busy={configLoading}>
    {configLoading && <PageMessage>Consultando la configuración de avisos…</PageMessage>}
    {configError && <PageMessage kind="error">{configError}</PageMessage>}
    {error && <PageMessage kind="error">{error}</PageMessage>}{message && <PageMessage kind="success">{message}</PageMessage>}
    {copy(`${enabled ? `Activadas para ${companyName}.` : `Desactivadas para ${companyName}; cada empresa se activa por separado.`} Solo avisan sobre ingresos pendientes o llegadas tarde.`,
      enabled ? 'Avisos: activados' : 'Avisos: desactivados')}
    {enabled ? <button className="button button-small button-quiet" onClick={onDeactivate} disabled={busy}>{busy ? 'Actualizando…' : 'Desactivar'}</button>
      : configError
        ? <button className="button button-small button-outline" onClick={onRetryConfig} disabled={configLoading}>Reintentar consulta</button>
        : <button className="button button-small button-outline" onClick={onActivate} disabled={busy || configLoading || !configReady}>{busy ? 'Activando…' : configLoading ? 'Cargando configuración…' : 'Activar avisos'}</button>}
  </aside>
}

/** The control wired to this device and the active company. Remount it per company (see `useAdminPush`). */
export function AdminPushControl({ companyName }: { companyName: string }) {
  const { activate, deactivate, retryConfig, ...state } = useAdminPush(companyName)
  return <AdminPushControlRender {...state} companyName={companyName}
    onActivate={() => void activate()} onDeactivate={() => void deactivate()} onRetryConfig={retryConfig} />
}
