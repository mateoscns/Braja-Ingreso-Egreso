import { useId, type FormEvent, type RefObject } from 'react'
import { Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import type { Deviation, Jornada, MarkAction, Site } from '../../shared/api/types'
import { formatBlock, formatDateTime, formatLocalDate, jornadaStateLabel } from '../../shared/format'
import { forEmployee } from '../../shared/labels'
import {
  actionLabel, confirmationText, describeDeviation, deviationName, formatTime, locationOutcomeText, markInstant, markLocationLabel, markName,
  type LocationOutcome, type MarkOptions
} from './employeeDay'

/** Render components of the employee screen (rule 36): data and callbacks by props, no state of their own beyond ids. */

export type MarkConfirmation = { markId: string; action: MarkAction; acceptedAt: string; location: LocationOutcome | null }
export type MarkStep = { kind: 'exit' | 'location'; action: MarkAction; text: string }
export type MotiveCategory = NonNullable<Deviation['category']>
export type MotiveValues = { category: MotiveCategory | ''; text: string }
export type MotiveError = { field: 'category' | 'text' | 'form'; message: string }

const CATEGORIES: { value: MotiveCategory; label: string; help: string }[] = [
  { value: 'SALUD', label: forEmployee.motiveCategory.SALUD, help: 'estuviste enfermo o en el médico' },
  { value: 'TRANSPORTE', label: forEmployee.motiveCategory.TRANSPORTE, help: 'el colectivo, el tren o el tránsito te demoraron' },
  { value: 'EMERGENCIA', label: forEmployee.motiveCategory.EMERGENCIA, help: 'pasó algo urgente en tu casa o con tu familia' },
  { value: 'OTRA', label: forEmployee.motiveCategory.OTRA, help: 'cualquier otra razón' }
]
const categoryLabel = (category: MotiveCategory) => forEmployee.motiveCategory[category] ?? category
const statusName = forEmployee.deviationStatus

export function DayHeading({ name, sentence }: { name: string; sentence: string }) {
  return <div className="employee-heading"><h1>Hola, {name}</h1>{sentence && <p className="employee-day-state">{sentence}</p>}</div>
}

export function JourneyPicker({ jornadas, sites, selectedId, disabled, onSelect }: {
  jornadas: Jornada[]; sites: Site[]; selectedId: string; disabled: boolean; onSelect: (id: string) => void
}) {
  // The one place «turno» stays: two days of work on the same date cannot be told apart by the word «día».
  return <Panel title="Elegí tu turno"><div className="journey-picker" role="group" aria-label="Turnos de este día">{jornadas.map((jornada) =>
    <button key={jornada.id} type="button" aria-pressed={selectedId === jornada.id} disabled={disabled} onClick={() => onSelect(jornada.id)} className={`journey-option ${selectedId === jornada.id ? 'journey-option-active' : ''}`}>
      <strong>{jornada.scheduleSnapshot.name}</strong><small>{formatLocalDate(jornada.localDate)} · {sites.find((site) => site.id === jornada.siteId)?.name ?? 'Local'} · {jornadaStateLabel(jornada.state)}</small>
    </button>)}</div></Panel>
}

export function MarkFeedback({ feedbackRef, error, showRefresh, onRefresh, confirmation, timeZone }: {
  feedbackRef: RefObject<HTMLDivElement | null>; error: string; showRefresh: boolean; onRefresh: () => void
  confirmation: MarkConfirmation | null; timeZone?: string
}) {
  return <div className="mark-feedback" ref={feedbackRef} tabIndex={-1}>
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {showRefresh && <button type="button" className="button button-quiet button-small" onClick={onRefresh}>Actualizar</button>}
    {confirmation && <PageMessage kind="success">
      <span className="employee-confirmation">{confirmationText(confirmation.action, confirmation.acceptedAt, timeZone)}</span>
      {confirmation.location && <span className="employee-location-note">{locationOutcomeText[confirmation.location]}{confirmation.location === 'SENT' && <span aria-hidden="true"> ✔</span>}</span>}
    </PageMessage>}
  </div>
}

export function MarkPanel({ options, busy, step, stepRef, onMark, onConfirmStep, onCancelStep }: {
  options: MarkOptions; busy: boolean; step: MarkStep | null; stepRef: RefObject<HTMLDivElement | null>
  onMark: (action: MarkAction) => void; onConfirmStep: () => void; onCancelStep: () => void
}) {
  return <Panel title="Marcar">
    {step ? <div className="message message-info mark-feedback" ref={stepRef} tabIndex={-1}>
      <p className="employee-step-text">{step.text}</p>
      <div className="button-row">
        <button type="button" className="button button-primary" onClick={onConfirmStep}>{step.kind === 'exit' ? 'Sí, marcar salida' : 'Continuar'}</button>
        <button type="button" className="button button-quiet" onClick={onCancelStep}>{step.kind === 'exit' ? 'No, seguir trabajando' : 'Volver'}</button>
      </div>
    </div> : <div aria-busy={busy}>
      {options.primary && <button type="button" className="button button-primary button-wide employee-next-action" disabled={busy} onClick={() => onMark(options.primary!)}>{actionLabel[options.primary]}</button>}
      {options.others.length > 0 && <div className="mark-actions employee-more-actions">{options.others.map((action) =>
        <button key={action} type="button" className="mark-action" disabled={busy} onClick={() => onMark(action)}><span aria-hidden="true">◷</span><strong>{actionLabel[action]}</strong></button>)}
      </div>}
      {options.exit && <div className="employee-exit"><button type="button" className="button button-outline button-wide" disabled={busy} onClick={() => onMark(options.exit!)}>{actionLabel[options.exit]}</button></div>}
      {busy && <p className="muted employee-sending" role="status" aria-live="polite" aria-atomic="true">Enviando tu marca… esperá un momento.</p>}
    </div>}
  </Panel>
}

export function DayMarksPanel({ title, jornada, site }: { title: string; jornada: Jornada; site?: Site }) {
  return <Panel title={title} action={<span className={`status-chip status-${jornada.state.toLowerCase()}`}>{jornadaStateLabel(jornada.state)}</span>}>
    <div className="schedule-summary"><div className="schedule-icon" aria-hidden="true">◷</div><div><strong>Tu horario</strong>
      <p>{jornada.scheduleSnapshot.blocks.map((block, index) => <span className="schedule-block" key={`${block.start}-${index}`}>{formatBlock(block)}</span>)}</p>
      <small>{site ? `${site.name} · ` : ''}Tenés {jornada.toleranceMinutes} minutos de tolerancia para entrar.</small></div></div>
    <div className="mark-timeline">{jornada.marks.length ? jornada.marks.map((mark) => {
      const location = mark.voided ? '' : markLocationLabel(mark.locationStatus)
      return <div className={`mark-row ${mark.voided ? 'mark-row-voided' : ''}`} key={mark.id}><span className="timeline-point" aria-hidden="true" />
        <strong>{mark.voided ? <s>{markName[mark.action]}</s> : markName[mark.action]}</strong><time>{formatTime(markInstant(mark), site?.timeZone)}</time>
        {mark.voided && <span className="status-chip">Anulada</span>}
        {location && <small className="mark-row-location">{location}</small>}
      </div>
    }) : <p className="muted">Todavía no marcaste nada.</p>}</div>
  </Panel>
}

function siteZone(item: Deviation, jornadas: Jornada[], sites: Site[]) {
  const siteId = item.siteId ?? jornadas.find((jornada) => jornada.id === item.jornadaId)?.siteId
  return sites.find((site) => site.id === siteId)?.timeZone
}

export type MotivePanelProps = {
  loading: boolean; loadFailed: boolean; pendingError: string; retrying: boolean; truncated: boolean; limit: number
  items: Deviation[]; notice: string; jornadas: Jornada[]; sites: Site[]
  values: Record<string, MotiveValues>; errors: Record<string, MotiveError>; savingId: string; editingIds: string[]
  onChange: (id: string, patch: Partial<MotiveValues>) => void; onSubmit: (event: FormEvent, item: Deviation) => void
  onCancel: (id: string) => void; onRetry: () => void
}

export function MotivePanel(props: MotivePanelProps) {
  const { loading, loadFailed, pendingError, retrying, truncated, limit, items, notice } = props
  return <Panel title="Para explicar"><p className="muted small-copy">Contale a tu encargado qué pasó. Podés cambiarlo hasta que lo revise. Lo que escribas solo lo ven vos y tu encargado.</p>
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    {!loading && !loadFailed && pendingError && <><PageMessage kind="error">No pudimos cargar lo que tenés para explicar. {pendingError}</PageMessage>
      <button type="button" className="button button-quiet button-small" onClick={props.onRetry}>Reintentar</button></>}
    {!loading && !loadFailed && !retrying && truncated && <p className="muted small-copy">Te mostramos los {limit} más recientes. Cuando los completes vas a ver los anteriores.</p>}
    {loading || retrying ? <Loading label="Cargando…" /> : loadFailed ? <Empty>No pudimos cargar lo que tenés para explicar.</Empty>
      : items.length === 0 ? (pendingError ? null : <Empty>No tenés nada para explicar.</Empty>)
      : <div className="motive-list">{items.map((item) => <MotiveCard key={item.id} item={item} {...props} />)}</div>}
  </Panel>
}

function MotiveCard({ item, jornadas, sites, values, errors, savingId, editingIds, onChange, onSubmit, onCancel }: MotivePanelProps & { item: Deviation }) {
  const ids = useId()
  const value = values[item.id] ?? { category: '', text: '' }
  const error = errors[item.id]
  const saving = savingId === item.id
  const zone = siteZone(item, jornadas, sites)
  const categoryErrorId = `${ids}-category-error`
  const textErrorId = `${ids}-text-error`
  return <form className="motive-card" noValidate aria-busy={saving} onSubmit={(event) => onSubmit(event, item)}>
    <div><strong>{deviationName[item.type]}</strong><span className="status-chip">{formatDateTime(item.occurredAt ?? item.createdAt, zone)}</span></div>
    <p className="employee-motive-question">{describeDeviation(item, jornadas.find((jornada) => jornada.id === item.jornadaId), zone)} ¿Qué pasó?</p>
    <fieldset className="field fieldset-plain" aria-describedby={error?.field === 'category' ? categoryErrorId : undefined}>
      <legend className="field-label">¿Qué tipo de motivo es?</legend>
      <div className="employee-category-list">{CATEGORIES.map((category) =>
        <label key={category.value} className="employee-category-option">
          <input type="radio" name={`${ids}-category`} value={category.value} checked={value.category === category.value} onChange={() => onChange(item.id, { category: category.value })} />
          <span><strong>{category.label}</strong>: {category.help}</span>
        </label>)}</div>
      {error?.field === 'category' && <p className="employee-field-error" id={categoryErrorId} role="alert">{error.message}</p>}
    </fieldset>
    <FormField label="Contá qué pasó"><textarea maxLength={4000} rows={3} value={value.text} aria-invalid={error?.field === 'text' || undefined}
      aria-describedby={error?.field === 'text' ? textErrorId : undefined} onChange={(event) => onChange(item.id, { text: event.target.value })} placeholder="Por ejemplo: hubo paro de colectivos." /></FormField>
    {error?.field === 'text' && <p className="employee-field-error" id={textErrorId} role="alert">{error.message}</p>}
    {error?.field === 'form' && <PageMessage kind="error">{error.message}</PageMessage>}
    <div className="button-row">
      <button className="button button-primary button-small" disabled={saving}>{saving ? 'Enviando…' : item.status === 'PENDIENTE_REVISION' ? 'Guardar corrección' : 'Enviar motivo'}</button>
      {editingIds.includes(item.id) && <button type="button" className="button button-quiet button-small" disabled={saving} onClick={() => onCancel(item.id)}>Cancelar</button>}
    </div>
    {saving && <p className="muted small-copy" role="status" aria-live="polite">Enviando lo que escribiste…</p>}
  </form>
}

export function DeviationsPanel({ loading, loadFailed, deviations, jornadas, sites, editingIds, onEdit }: {
  loading: boolean; loadFailed: boolean; deviations: Deviation[]; jornadas: Jornada[]; sites: Site[]; editingIds: string[]; onEdit: (item: Deviation) => void
}) {
  const canAddFirstMotive = (item: Deviation) => (item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO') && !item.category
  // The employee is given no noun for a deviation (D-20261111-01). «Para explicar» is the panel above; slice D3 makes them one.
  return <Panel title="Lo que pasó este día">{loading ? <Loading label="Cargando…" /> : loadFailed ? <Empty>No pudimos mostrar lo que pasó este día.</Empty> : deviations.length ? <div className="deviation-list">{deviations.map((item) => {
    const zone = siteZone(item, jornadas, sites)
    return <article className="deviation-card" key={item.id}><div className="deviation-symbol" aria-hidden="true">!</div><div className="deviation-main">
      <div className="deviation-title"><strong>{deviationName[item.type]}</strong><span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName[item.status]}</span></div>
      <p>{describeDeviation(item, jornadas.find((jornada) => jornada.id === item.jornadaId), zone)}</p>
      {item.category && <p className="reason-line"><b>Tu explicación:</b> {categoryLabel(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
      {!editingIds.includes(item.id) && item.status === 'PENDIENTE_REVISION' && <button type="button" className="button button-quiet button-small" onClick={() => onEdit(item)}>Corregir motivo</button>}
      {!editingIds.includes(item.id) && canAddFirstMotive(item) && <button type="button" className="button button-quiet button-small" onClick={() => onEdit(item)}>Agregar motivo</button>}
    </div></article>
  })}</div> : <Empty>Este día no hubo nada para explicar.</Empty>}</Panel>
}

export function OtherDayPanel({ date, disabled, onDate, onToday }: { date: string; disabled: boolean; onDate: (date: string) => void; onToday: () => void }) {
  return <Panel title="Ver otros días">
    <FormField label="Día" hint="Elegí un día para ver sus marcas."><input type="date" value={date} disabled={disabled} onChange={(event) => onDate(event.target.value)} /></FormField>
    {date && <button type="button" className="button button-outline button-wide employee-today-button" disabled={disabled} onClick={onToday}>Volver a hoy</button>}
  </Panel>
}
