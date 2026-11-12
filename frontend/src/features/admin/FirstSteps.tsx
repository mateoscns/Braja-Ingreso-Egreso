import { Icon } from '../../app/icons'
import { LoadFailure, Loading, PageMessage, Panel, StatusTag } from '../../app/ui'
import type { AdminSection, CoverageNotice, SetupStep } from './setupStatus'

function readyText(count: number): string {
  if (count === 0) return 'Listo: ya está todo configurado. Volvé cada mes a cargar los días.'
  return `Listo: mañana ${count === 1 ? 'puede marcar 1 persona' : `pueden marcar ${count} personas`}. Volvé cada mes a cargar los días.`
}

/** The tag of a step (design system 4.10): done is confirmed; missing and to check wait for the ADMIN, who is reading. */
function StepTag({ done }: { done: SetupStep['done'] }) {
  if (done === true) return <StatusTag tone="ok" icon="check">Listo</StatusTag>
  if (done === 'unknown') return <StatusTag tone="todo" icon="eye">Revisalo</StatusTag>
  return <StatusTag tone="todo" icon="alert">Falta</StatusTag>
}

/**
 * The setup guide: five steps in order, each a record with its number, its status and a way to the section where it is done
 * (design system 4.19). The next step is the one filled «Ir» of the page and carries the amber bar; a done step keeps one line,
 * its explanation folded away, and «Ir» as a link.
 */
export function FirstStepsRender({ steps, loading, error, readyCount, onGo, onRetry }: {
  steps: SetupStep[] | null; loading: boolean; error: string; readyCount: number
  onGo: (section: AdminSection) => void; onRetry: () => void
}) {
  const done = steps?.filter((step) => step.done !== false).length ?? 0
  const next = steps?.findIndex((step) => step.done === false) ?? -1
  return <>
    <div className="page-title-row"><div><h1>Primeros pasos</h1><p className="muted">Seguí estos pasos en orden. Cuando estén todos listos, tu equipo ya puede marcar.</p></div></div>
    {error && <LoadFailure message={error} disabled={loading} onRetry={onRetry} />}
    {steps && next === -1 && <PageMessage kind="success">{readyText(readyCount)}</PageMessage>}
    {!steps ? !error && <Loading label="Revisando qué falta…" /> : <Panel title={`${done} de ${steps.length} pasos listos`}>
      <ol className="record-list" aria-label="Pasos para empezar">{steps.map((step, index) => {
        const isDone = step.done === true
        const kind = isDone ? ' step-done' : index === next ? ' step-next' : ''
        return <li key={step.title} className={`record step${kind}`}>
          {/* The title already says the number; the box repeats it for the eye. */}
          <span className="step-number" aria-hidden="true">{isDone ? <Icon name="check" /> : index + 1}</span>
          <div className="step-body">
            <p className="record-title"><strong>{`${index + 1}. ${step.title}`}</strong></p>
            {!isDone && <p className="record-meta">{step.explanation}</p>}
            {step.detail && <p className="step-detail">{step.detail}</p>}
          </div>
          <div className="step-foot">
            <StepTag done={step.done} />
            <button type="button" className={`button ${isDone ? 'button-link' : index === next ? 'button-primary' : 'button-secondary'}`} aria-label={`Ir a ${step.sectionLabel}: ${step.title}`} onClick={() => onGo(step.section)}>Ir</button>
          </div>
        </li>
      })}</ol>
    </Panel>}
  </>
}

/**
 * Days loaded from tomorrow on. Shown when the page loads, not in answer to an action, so it is a polite status even when it is
 * an error: an alert on arrival would interrupt every screen reader on Bandeja and Jornadas. Written as a message of the system
 * (PageMessage would make the error an alert): the icon of its kind, then the words and, under them, the link to the load.
 */
export function CoverageNoticeRender({ notice, actionLabel, onAction }: { notice: CoverageNotice; actionLabel: string; onAction: () => void }) {
  return <div className={`message message-${notice.kind}`} role="status" aria-atomic="true">
    <Icon name={notice.kind === 'error' ? 'error' : 'info'} />
    <div className="message-body">
      <p>{notice.text}</p>
      <button type="button" className="button button-link" onClick={onAction}>{actionLabel}</button>
    </div>
  </div>
}
