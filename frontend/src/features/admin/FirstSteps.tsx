import { Loading, PageMessage, Panel } from '../../app/ui'
import type { AdminSection, CoverageNotice, SetupStep } from './setupStatus'

function readyText(count: number): string {
  if (count === 0) return 'Listo: ya está todo configurado. Volvé cada mes a cargar los días.'
  return `Listo: mañana ${count === 1 ? 'puede marcar 1 persona' : `pueden marcar ${count} personas`}. Volvé cada mes a cargar los días.`
}

/** The setup guide: five steps in order, each with its status and a way to the section where it is done. */
export function FirstStepsRender({ steps, loading, error, readyCount, onGo, onRetry }: {
  steps: SetupStep[] | null; loading: boolean; error: string; readyCount: number
  onGo: (section: AdminSection) => void; onRetry: () => void
}) {
  const done = steps?.filter((step) => step.done !== false).length ?? 0
  const next = steps?.findIndex((step) => step.done === false) ?? -1
  return <>
    <div className="page-title-row"><div><p className="eyebrow">PARA EMPEZAR</p><h1>Primeros pasos</h1><p className="muted">Seguí estos pasos en orden. Cuando estén todos listos, tu equipo ya puede marcar.</p></div></div>
    {error && <div className="form-stack"><PageMessage kind="error">{error}</PageMessage><button type="button" className="button button-quiet" disabled={loading} onClick={onRetry}>Reintentar</button></div>}
    {steps && next === -1 && <PageMessage kind="success">{readyText(readyCount)}</PageMessage>}
    {!steps ? !error && <Loading label="Revisando qué falta…" /> : <Panel title={`${done} de ${steps.length} pasos listos`}>
      <ol className="simple-list first-steps" aria-label="Pasos para empezar">{steps.map((step, index) => <li key={step.title} className="simple-row first-step">
        <span className="row-avatar" aria-hidden="true">{step.done === true ? '✓' : index + 1}</span>
        <span className="first-step-copy"><strong>{`${index + 1}. ${step.title}`}</strong><small>{step.explanation}</small>{step.detail && <small>{step.detail}</small>}</span>
        <span className={`status-chip ${step.done === true ? 'status-justificado' : 'status-motivo_pendiente'}`}>{step.done === true ? 'Listo' : step.done === 'unknown' ? 'Revisalo' : 'Falta'}</span>
        <button type="button" className={`button button-small ${index === next ? 'button-primary' : 'button-quiet'}`} aria-label={`Ir a ${step.sectionLabel}: ${step.title}`} onClick={() => onGo(step.section)}>Ir</button>
      </li>)}</ol>
    </Panel>}
  </>
}

/**
 * Days loaded from tomorrow on. Shown when the page loads, not in answer to an action, so it is a polite status even when it is
 * an error: an alert on arrival would interrupt every screen reader on Bandeja and Jornadas.
 */
export function CoverageNoticeRender({ notice, actionLabel, onAction }: { notice: CoverageNotice; actionLabel: string; onAction: () => void }) {
  return <div className={`message message-${notice.kind} coverage-notice`} role="status" aria-atomic="true">
    <span>{notice.text}</span>
    <button type="button" className="button button-small button-outline" onClick={onAction}>{actionLabel}</button>
  </div>
}
