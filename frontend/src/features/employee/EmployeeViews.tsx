import { Fragment, useId, type FormEvent, type RefObject } from 'react'
import { Icon, type IconName } from '../../app/icons'
import { Empty, FormField, Loading, PageMessage, Panel, StatusTag } from '../../app/ui'
import type { Deviation, Jornada, MarkAction, Site } from '../../shared/api/types'
import { formatBlock, formatDateTime, formatLocalDate, jornadaStateLabel } from '../../shared/format'
import { forEmployee } from '../../shared/labels'
import {
  actionLabel, confirmationText, daySlots, describeDeviation, deviationName, locationOutcomeText,
  type DaySlotNote, type LocationOutcome, type MarkOptions
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

/** The icon that goes with each mark on its button: the pair of a break shares one. */
const MARK_ICONS: Record<MarkAction, IconName> = {
  INGRESO: 'enter', EGRESO: 'exit', SALIDA_DESAYUNO: 'coffee', VUELTA_DESAYUNO: 'coffee', SALIDA_ALMUERZO: 'lunch', VUELTA_ALMUERZO: 'lunch'
}

/** The greeting is the h1 of the page; the state of the day is said in the "now" block under it. */
export function DayHeading({ name }: { name: string }) {
  return <div className="employee-heading"><h1>Hola, {name}</h1></div>
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

/**
 * The slot above the "now" block that takes focus after a mark (design system 4.9). Its three states never look alike: sending
 * is an info message with a spinner and never says the mark was saved; not saved or unknown is an error; saved is the receipt,
 * which exists only once the server accepted the mark and shows the time it returned.
 */
export function MarkFeedback({ feedbackRef, sending, error, showRefresh, onRefresh, confirmation, timeZone }: {
  feedbackRef: RefObject<HTMLDivElement | null>; sending: boolean; error: string; showRefresh: boolean; onRefresh: () => void
  confirmation: MarkConfirmation | null; timeZone?: string
}) {
  return <div className="mark-feedback" ref={feedbackRef} tabIndex={-1}>
    {sending && <div className="message message-info" role="status" aria-live="polite" aria-atomic="true">
      <span className="spinner" aria-hidden="true" /><div className="message-body">Enviando tu marca… esperá un momento.</div>
    </div>}
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {showRefresh && <button type="button" className="button button-secondary" onClick={onRefresh}>Actualizar</button>}
    {confirmation && <MarkReceipt confirmation={confirmation} timeZone={timeZone} />}
  </div>
}

/** A saved mark. The location line is its own state: a missing location is a warning inside the receipt, never a success. */
function MarkReceipt({ confirmation, timeZone }: { confirmation: MarkConfirmation; timeZone?: string }) {
  const { location } = confirmation
  return <div className="receipt" role="status" aria-atomic="true">
    <span className="receipt-icon" aria-hidden="true"><Icon name="check" /></span>
    <div className="receipt-body">
      <p className="receipt-title">{confirmationText(confirmation.action, confirmation.acceptedAt, timeZone)}</p>
      {location && <p className={`receipt-location receipt-location-${location.toLowerCase()}`}>
        {location === 'PENDING' ? <span className="spinner" aria-hidden="true" /> : <Icon name={location === 'SENT' ? 'pin' : 'alert'} />}
        <span>{locationOutcomeText[location]}{location === 'SENT' && <span aria-hidden="true"> ✔</span>}</span>
      </p>}
    </div>
  </div>
}

/** The next mark is the one filled button, 80 px tall; every other mark is a secondary button of 56 px. All full width. */
function MarkButton({ action, next = false, busy, onMark }: { action: MarkAction; next?: boolean; busy: boolean; onMark: (action: MarkAction) => void }) {
  return <button type="button" className={next ? 'button button-primary button-block button-clock' : 'button button-secondary button-block button-large'}
    disabled={busy} onClick={() => onMark(action)}><Icon name={MARK_ICONS[action]} />{actionLabel[action]}</button>
}

/**
 * The "now" block (design system 4.13): the state of the day, the next mark and the schedule in one place. It is the section
 * «Marcar» only while there is something to mark; a finished, cancelled or missing day keeps the sentence and the schedule.
 */
export function NowBlock({ sentence, jornada, site, options, busy, step, stepRef, onMark, onConfirmStep, onCancelStep }: {
  sentence: string; jornada?: Jornada; site?: Site; options: MarkOptions | null; busy: boolean; step: MarkStep | null
  stepRef: RefObject<HTMLDivElement | null>; onMark: (action: MarkAction) => void; onConfirmStep: () => void; onCancelStep: () => void
}) {
  const headingId = useId()
  const marking = Boolean(options && (options.primary || step))
  return <section className="now" aria-labelledby={marking ? headingId : undefined} aria-busy={marking ? busy : undefined}>
    {marking && <h2 id={headingId} className="visually-hidden">Marcar</h2>}
    {sentence && <p className="now-state">{sentence}</p>}
    {marking && options && (step ? <div className="now-step" ref={stepRef} tabIndex={-1}>
      <p className="now-step-text">{step.text}</p>
      <div className="button-row">
        <button type="button" className="button button-primary button-large" onClick={onConfirmStep}>{step.kind === 'exit' ? 'Sí, marcar salida' : 'Continuar'}</button>
        <button type="button" className="button button-link" onClick={onCancelStep}>{step.kind === 'exit' ? 'No, seguir trabajando' : 'Volver'}</button>
      </div>
    </div> : <div className="now-actions">
      {options.primary && <MarkButton action={options.primary} next busy={busy} onMark={onMark} />}
      {options.others.map((action) => <MarkButton key={action} action={action} busy={busy} onMark={onMark} />)}
      {options.exit && <div className="now-apart"><MarkButton action={options.exit} busy={busy} onMark={onMark} /></div>}
    </div>)}
    {jornada && <div className="now-context"><Icon name="clock" /><div>
      <p className="now-schedule"><strong>Tu horario</strong>{' '}{jornada.scheduleSnapshot.blocks.map((block, index) => <span key={`${block.start}-${index}`}>{formatBlock(block)}</span>)}</p>
      <p className="now-place">{site ? `${site.name} · ` : ''}Tenés {jornada.toleranceMinutes} minutos de tolerancia para entrar.</p>
    </div></div>}
  </section>
}

/** The icon of a row's note: the location as the receipt draws it; a mark the ADMIN loaded has none. */
const NOTE_ICONS: Record<DaySlotNote['kind'], IconName | null> = { sent: 'pin', missing: 'pinoff', pending: 'waiting', loaded: null }

/**
 * The day sheet (design system 4.14): four fixed rows, so what is done and what is missing reads at a glance. An empty row is a
 * dash for the eye and «sin marcar» for a screen reader; a voided mark gets a row of its own under its row, struck.
 */
export function DayMarksPanel({ title, jornada, site }: { title: string; jornada: Jornada; site?: Site }) {
  return <Panel title={title} action={<span className={`status-chip status-${jornada.state.toLowerCase()}`}>{jornadaStateLabel(jornada.state)}</span>}>
    <table className="day-sheet">
      <caption className="visually-hidden">Marcas del día</caption>
      <tbody>{daySlots(jornada, site?.timeZone).map((slot) => <Fragment key={slot.kind}>
        <tr>
          <th scope="row">{slot.name}</th>
          <td><div className="day-sheet-cell">
            {slot.times.length ? <span className="day-sheet-times">{slot.times.map((time, index) => <span className="day-sheet-time" key={index}>{time}</span>)}</span>
              : <span className="day-sheet-time day-sheet-empty"><span aria-hidden="true">—</span><span className="visually-hidden">sin marcar</span></span>}
            {slot.note && <span className="day-sheet-note">{NOTE_ICONS[slot.note.kind] && <Icon name={NOTE_ICONS[slot.note.kind]!} />}{slot.note.text}</span>}
          </div></td>
        </tr>
        {slot.voided.map((time, index) => <tr className="day-sheet-voided" key={`voided-${index}`}>
          <th scope="row"><span className="visually-hidden">{slot.name}</span></th>
          <td><div className="day-sheet-cell"><s className="day-sheet-time">{time}</s><StatusTag tone="neutral" icon="ban">Anulada</StatusTag></div></td>
        </tr>)}
      </Fragment>)}</tbody>
    </table>
    {/* «Todavía» would tell a cancelled day to mark; the "now" block already says there is nothing to mark. */}
    {!jornada.marks.length && jornada.state !== 'CANCELADA' && <p className="muted">Todavía no marcaste nada.</p>}
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
