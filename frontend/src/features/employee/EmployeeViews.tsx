import { Fragment, useEffect, useId, useRef, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Icon, type IconName } from '../../app/icons'
import { reveal } from '../../app/revealAndFocus'
import { Empty, FormField, LoadFailure, Loading, PageMessage, Panel, Status, StatusTag, type StatusTone } from '../../app/ui'
import type { Deviation, Jornada, MarkAction, Site } from '../../shared/api/types'
import { formatBlock, formatDateTime, formatLocalDate, formatWorkDay, jornadaStateLabel } from '../../shared/format'
import { forEmployee } from '../../shared/labels'
import {
  actionLabel, confirmationText, daySlots, describeDeviation, deviationName, locationOutcomeText, pauseAllowance,
  type DaySlotNote, type LocationOutcome, type MarkOptions
} from './employeeDay'

/**
 * Render components of the employee screen (rule 36): data and callbacks by props, no state of their own beyond ids and the
 * refs that move the focus of an inline form.
 */

export type MarkConfirmation = { markId: string; action: MarkAction; acceptedAt: string; location: LocationOutcome | null }
export type MarkStep = { kind: 'exit' | 'location'; action: MarkAction; text: string }
export type MotiveCategory = NonNullable<Deviation['category']>
export type MotiveValues = { category: MotiveCategory | ''; text: string }
/** The errors of one motive form: one per field, checked on submit, and `form` for what the server answered. */
export type MotiveErrors = { category?: string; text?: string; form?: string }

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
  // Without a name the greeting is a neutral «Hola» (issue #177: the fallback was «bienvenido», in the masculine).
  return <div className="employee-heading"><h1>{name ? `Hola, ${name}` : 'Hola'}</h1></div>
}

export function JourneyPicker({ jornadas, sites, selectedId, disabled, onSelect }: {
  jornadas: Jornada[]; sites: Site[]; selectedId: string; disabled: boolean; onSelect: (id: string) => void
}) {
  // The one place «turno» stays: two days of work on the same date cannot be told apart by the word «día».
  return <Panel title="Elegí tu turno"><div className="choice-list" role="group" aria-label="Turnos de este día">{jornadas.map((jornada) =>
    <button key={jornada.id} type="button" aria-pressed={selectedId === jornada.id} disabled={disabled} onClick={() => onSelect(jornada.id)} className="choice">
      <span className="choice-text"><strong>{jornada.scheduleSnapshot.name}</strong><small>{formatLocalDate(jornada.localDate)} · {sites.find((site) => site.id === jornada.siteId)?.name ?? 'Local'} · {jornadaStateLabel(jornada.state)}</small></span>
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
    {sending && <Status as="div" className="message message-info">
      <span className="spinner" aria-hidden="true" /><div className="message-body">Enviando tu marca… esperá un momento.</div>
    </Status>}
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
        <span>{locationOutcomeText[location]}</span>
      </p>}
    </div>
  </div>
}

/** The button of a mark in the "now" block: a question that it opened gives the focus back to it when it closes. */
export const markButtonId = (action: MarkAction) => `now-mark-${action}`
/** «Lo enviamos…»: it takes the focus when the case sent leaves the list with its form (slice G2). */
export const MOTIVE_NOTICE_ID = 'motive-notice'
/** The form of one case: a refused send takes the focus to its first problem (app/useFieldErrors, T12). */
export const motiveFormId = (id: string) => `motive-form-${id}`

/** The next mark is the one filled button, 80 px tall; every other mark is a secondary button of 56 px. All full width. */
function MarkButton({ action, next = false, busy, onMark }: { action: MarkAction; next?: boolean; busy: boolean; onMark: (action: MarkAction) => void }) {
  return <button type="button" id={markButtonId(action)} className={next ? 'button button-primary button-block button-clock' : 'button button-secondary button-block button-large'}
    disabled={busy} onClick={() => onMark(action)}><Icon name={MARK_ICONS[action]} />{actionLabel[action]}</button>
}

/**
 * The "now" block (design system 4.13): the state of the day, the next mark and the schedule in one place. It is the section
 * «Marcar» only while there is something to mark; a finished, cancelled or missing day keeps the sentence and the schedule.
 * `onToday` is given while another day is shown: that day is only for looking (D-20261112-01), so there is nothing to mark and
 * the block says how to get back to marking, right under the sentence.
 */
export function NowBlock({ sentence, jornada, site, options, busy, step, stepRef, onMark, onConfirmStep, onCancelStep, onToday }: {
  sentence: string; jornada?: Jornada; site?: Site; options: MarkOptions | null; busy: boolean; step: MarkStep | null
  stepRef: RefObject<HTMLDivElement | null>; onMark: (action: MarkAction) => void; onConfirmStep: () => void; onCancelStep: () => void
  onToday?: () => void
}) {
  const headingId = useId()
  const marking = Boolean(options && (options.primary || step))
  // The tolerance is said in the present, for today; another day keeps only the name of the local.
  const place = jornada ? [site?.name, onToday ? '' : `Tenés ${jornada.toleranceMinutes} minutos de tolerancia para entrar.`].filter(Boolean).join(' · ') : ''
  // How long each pause is, under the tolerance and also for today only: read before tapping «Me voy a almorzar» (2026-11-13).
  const pauses = jornada && !onToday ? pauseAllowance(jornada) : null
  return <section className="now" aria-labelledby={marking ? headingId : undefined} aria-busy={marking ? busy : undefined}>
    {marking && <h2 id={headingId} className="visually-hidden">Marcar</h2>}
    {sentence && <p className="now-state">{sentence}</p>}
    {onToday && <div className="now-step">
      <p className="now-step-text">Para marcar, volvé a hoy.</p>
      <div className="button-row"><button type="button" className="button button-secondary" disabled={busy} onClick={onToday}>Volver a hoy</button></div>
    </div>}
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
      {place && <p className="now-place">{place}</p>}
      {pauses && <p className="now-place">{pauses}</p>}
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

/** The state of a case as the employee reads it: amber while it waits for him, dashed while it waits for his encargado (4.10). */
const STATUS_TAGS: Record<Deviation['status'], { tone: StatusTone; icon: IconName }> = {
  MOTIVO_PENDIENTE: { tone: 'todo', icon: 'bubble' }, PENDIENTE_REVISION: { tone: 'wait', icon: 'eye' },
  JUSTIFICADO: { tone: 'ok', icon: 'check' }, NO_JUSTIFICADO: { tone: 'bad', icon: 'x' }
}

/** D-20261027-02: a case classified without a motive still takes its first one. */
const canAddFirstMotive = (item: Deviation) => (item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO') && !item.category

export type MotivePanelProps = {
  loading: boolean; loadFailed: boolean; pendingError: string; retrying: boolean; truncated: boolean; limit: number
  /** The cases of any date still waiting for a motive: each one is an open form. */
  items: Deviation[]
  /** The cases of the day on screen: those not pending are records with what was sent and a button to correct it. */
  deviations: Deviation[]
  notice: string; jornadas: Jornada[]; sites: Site[]
  values: Record<string, MotiveValues>; errors: Record<string, MotiveErrors>; savingId: string; editingIds: string[]
  onChange: (id: string, patch: Partial<MotiveValues>) => void; onSubmit: (event: FormEvent, item: Deviation) => void
  onCancel: (id: string) => void; onRetry: () => void; onEdit: (item: Deviation) => void
}

/**
 * «Para explicar» as one task (slice D3): what is left to explain and what was already sent, in one list. The employee is given
 * no noun for a deviation (D-20261111-01). With nothing in it the section is one sentence.
 */
export function MotivePanel(props: MotivePanelProps) {
  const { loading, loadFailed, pendingError, retrying, truncated, limit, items, deviations, notice } = props
  // A case of the day that still waits for its motive is among the pending ones too: it is listed once, as a form. One list
  // keyed by case, so a case that is sent stays the same row and its button can take the focus back.
  const rows = [
    ...(retrying ? [] : items.map((item) => ({ item, pending: true }))),
    ...deviations.filter((item) => !items.some((pending) => pending.id === item.id)).map((item) => ({ item, pending: false }))
  ]
  // The lead invites to write: it is left out when every case listed is already decided.
  const writable = rows.some(({ item, pending }) => pending || item.status === 'PENDIENTE_REVISION' || canAddFirstMotive(item))
  const success = notice && <PageMessage kind="success" id={MOTIVE_NOTICE_ID}>{notice}</PageMessage>
  return <Panel title="Para explicar">
    {loading ? <Loading label="Cargando…" /> : loadFailed ? <Empty>No pudimos cargar lo que tenés para explicar.</Empty>
      : !rows.length && !pendingError && !retrying ? <>{success}<Empty>No tenés nada para explicar.</Empty></>
      : <>
        {writable && <p className="muted small-copy">Contale a tu encargado qué pasó. Podés cambiarlo hasta que lo revise. Lo que escribas solo lo ven vos y tu encargado.</p>}
        {success}
        {pendingError && !retrying && <LoadFailure message={`No pudimos cargar lo que tenés para explicar. ${pendingError}`} onRetry={props.onRetry} />}
        {retrying && <Loading label="Cargando…" />}
        {truncated && !retrying && <p className="muted small-copy">Te mostramos los {limit} más recientes. Cuando los completes vas a ver los anteriores.</p>}
        {rows.length > 0 && <ul className="record-list">{rows.map(({ item, pending }) => <MotiveRecord key={item.id} {...props} item={item} pending={pending} />)}</ul>}
      </>}
  </Panel>
}

/** One case: its name and state, when, what happened; then the form when it is pending or opened, or what was sent. */
function MotiveRecord(props: MotivePanelProps & { item: Deviation; pending: boolean }) {
  const { item, pending, jornadas, sites, editingIds, onEdit } = props
  const open = pending || editingIds.includes(item.id)
  const zone = siteZone(item, jornadas, sites)
  const day = jornadas.find((jornada) => jornada.id === item.jornadaId)
  const openerRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const wasOpen = useRef(open)
  // An inline form takes the focus in its first field when it opens and gives it back to its button when it closes (4.7). A
  // pending form is open from the start, so it never steals the focus; once sent it closes like an opened one.
  useEffect(() => {
    if (open && !wasOpen.current) (formRef.current?.querySelector<HTMLInputElement>('input:checked') ?? formRef.current?.querySelector('input'))?.focus()
    if (!open && wasOpen.current) openerRef.current?.focus()
    wasOpen.current = open
  }, [open])
  const opener = item.status === 'PENDIENTE_REVISION' ? 'Corregir motivo' : canAddFirstMotive(item) ? 'Agregar motivo' : ''
  const summary = <div className="motive-summary">
    <p className="record-title"><strong>{deviationName[item.type]}</strong><StatusTag {...STATUS_TAGS[item.status]}>{statusName[item.status]}</StatusTag></p>
    {/* The day of work the case belongs to, when that day is loaded; otherwise when it happened (issue #177). */}
    <p className="record-meta">{day ? `Día de trabajo del ${formatWorkDay(day.localDate)}` : formatDateTime(item.occurredAt ?? item.createdAt, zone)}</p>
    <p className="motive-fact">{describeDeviation(item, day, zone)}{pending ? ' ¿Qué pasó?' : ''}</p>
  </div>
  if (pending) return <li className="record"><MotiveForm {...props} formRef={formRef} todo>{summary}</MotiveForm></li>
  return <li className="record">
    {summary}
    {item.category && <p className="motive-said"><b>Tu explicación:</b> {categoryLabel(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
    {open ? <MotiveForm {...props} formRef={formRef} />
      : opener && <div className="record-actions"><button ref={openerRef} type="button" className="button button-secondary" onClick={() => onEdit(item)}>{opener}</button></div>}
  </li>
}

function MotiveForm({ item, todo = false, formRef, children, values, errors, savingId, editingIds, onChange, onSubmit, onCancel }: MotivePanelProps & {
  item: Deviation; todo?: boolean; formRef: RefObject<HTMLFormElement | null>; children?: ReactNode
}) {
  const ids = useId()
  const value = values[item.id] ?? { category: '', text: '' }
  const error = errors[item.id]
  const saving = savingId === item.id
  const categoryErrorId = `${ids}-category-error`
  // A refused send takes the focus to the first field it marked, or to the server's answer (design system 4.7): the container
  // asks for it by this form's id, so the request survives the form being drawn again (T12).
  return <form ref={formRef} id={motiveFormId(item.id)} className={todo ? 'inline-form inline-form-todo' : 'inline-form'} noValidate aria-busy={saving}
    onSubmit={(event) => onSubmit(event, item)}>
    {children}
    {/* A group has no FormField: its error is tied by aria-describedby, in the look of a field error. */}
    <fieldset className={error?.category ? 'field field-invalid' : 'field'} aria-invalid={error?.category ? true : undefined} aria-describedby={error?.category ? categoryErrorId : undefined}>
      <legend className="field-label">¿Qué tipo de motivo es?</legend>
      <div className="choice-list">{CATEGORIES.map((category) =>
        <label key={category.value} className="choice">
          <input type="radio" name={`${ids}-category`} value={category.value} checked={value.category === category.value} onChange={() => onChange(item.id, { category: category.value })} />
          {/* The colon is only heard: the tile shows the word over its help, and its name still reads «Salud: estuviste…». */}
          <span className="choice-text"><strong>{category.label}<span className="visually-hidden">:</span></strong> <small>{category.help}</small></span>
        </label>)}</div>
      {error?.category && <span className="field-error" id={categoryErrorId}><Icon name="alert" />{error.category}</span>}
    </fieldset>
    <FormField label="Contá qué pasó" hint="Por ejemplo: hubo paro de colectivos." error={error?.text}>
      <textarea maxLength={4000} rows={3} value={value.text} onChange={(event) => onChange(item.id, { text: event.target.value })} />
    </FormField>
    {error?.form && <PageMessage kind="error">{error.form}</PageMessage>}
    <div className="button-row">
      <button className="button button-primary" disabled={saving}>{saving ? 'Enviando…' : item.status === 'PENDIENTE_REVISION' ? 'Guardar corrección' : 'Enviar motivo'}</button>
      {editingIds.includes(item.id) && <button type="button" className="button button-link" disabled={saving} onClick={() => onCancel(item.id)}>Cancelar</button>}
    </div>
    {saving && <Status className="muted small-copy">Enviando lo que escribiste…</Status>}
  </form>
}

export function OtherDayPanel({ date, disabled, loading, onDate, onToday }: { date: string; disabled: boolean; loading: boolean; onDate: (date: string) => void; onToday: () => void }) {
  const field = useRef<HTMLInputElement>(null)
  // While the chosen day loads, the sections above shrink to one line and the page scrolls up: the field the date is being typed
  // in ended out of sight (slice G2). Once the day is drawn, it comes back into view if it still has the focus.
  useEffect(() => { if (!loading && field.current && document.activeElement === field.current) reveal(field.current) }, [loading])
  return <Panel title="Ver otros días">
    <FormField label="Día" hint="Elegí un día para ver sus marcas."><input ref={field} type="date" value={date} disabled={disabled} onChange={(event) => onDate(event.target.value)} /></FormField>
    {date && <button type="button" className="button button-secondary button-block employee-today-button" disabled={disabled} onClick={onToday}>Volver a hoy</button>}
  </Panel>
}
