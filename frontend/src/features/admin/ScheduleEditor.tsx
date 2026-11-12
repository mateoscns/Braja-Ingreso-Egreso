import { useId, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../app/icons'
import { Empty, Fieldset, FieldsSummary, FormField, Loading, PageMessage, Panel, StatusTag } from '../../app/ui'
import type { FieldErrors } from '../../app/useFieldErrors'
import type { Employee, Site, Template } from '../../shared/api/types'
import { LoadFailure, PageHeading } from './AdminViewsRender'
import { checkScheduleDraft, type ScheduleDraft } from './scheduleDraft'
import { joinNames, MAX_TRAMOS, SCHEDULE_TYPES, scheduleChips, tramoHints, type DayOffsets, type ScheduleTypeId, type Tramo } from './scheduleTramos'

const PAUSE_HINT = 'Si la pausa dura más, te avisamos en Para revisar. Con 0, te avisamos de cualquier pausa.'
export const EDIT_WARNING = 'Los días que ya cargaste mantienen el horario anterior.'

/** Where the result of saving a horario shows: the form that created it, or the record of the one that changed. */
export const scheduleMessageKeys = { create: 'create', edit: (templateId: string) => `edit:${templateId}` }

/**
 * Where the container moves the focus (slice F1): into a form or the assignment step when they open, and back to what opened
 * them when they close. Only one assignment step is open at a time.
 */
export const scheduleFocusIds = {
  createForm: 'schedule-create-form',
  assignStep: 'schedule-assign-step',
  editButton: (templateId: string) => `schedule-${templateId}-edit`,
  editForm: (templateId: string) => `schedule-${templateId}-edit-form`
}

/**
 * A horario in words: its tramos first, in the text colour, then its pause limits, muted. `blockCount` says how many of the
 * parts are tramos (scheduleChips puts them first).
 */
export function ScheduleParts({ parts, blockCount, label }: { parts: string[]; blockCount: number; label: string }) {
  return <ul className="schedule-parts" aria-label={label}>{parts.map((part, index) => <li className={index < blockCount ? 'schedule-time' : undefined} key={`${index}-${part}`}>{part}</li>)}</ul>
}

export type ScheduleEditorProps = {
  draft: ScheduleDraft; busy: boolean; disabled?: boolean; error: string; submitLabel: string; formLabel: string
  /** Why the button is disabled while nothing is sent (no local, a failed load): shown next to it and read with it. */
  disabledReason?: string
  /** The id of the form, by which the container moves the focus into it (scheduleFocusIds). */
  id?: string
  /** What the last save of this form did («Horario … creado.»): a result of the form, above its buttons. */
  notice?: string
  /** The Local field, first in the form; it is hidden with a single local (create only). */
  sites?: Site[]; siteId?: string; onSiteChange?: (siteId: string) => void
  /** The three types of horario as option tiles (create only). */
  showTypes?: boolean
  /** Edit in place, under the record: an inline form with the warning that loaded days keep their old schedule. */
  editing?: boolean
  onNameChange: (value: string) => void; onPickType: (id: ScheduleTypeId) => void
  onTramoChange: (index: number, patch: Partial<Tramo>) => void; onAddTramo: () => void; onRemoveTramo: (index: number) => void
  onBreakfastChange: (value: string) => void; onLunchChange: (value: string) => void
  onManualOffsetChange: (index: number, patch: Partial<DayOffsets>) => void; onUseComputedDays: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel?: () => void
}

export function ScheduleEditor({ draft, busy, disabled = false, disabledReason = '', error, submitLabel, formLabel, id, notice = '', sites = [], siteId = '', onSiteChange, showTypes = false, editing = false,
  onNameChange, onPickType, onTramoChange, onAddTramo, onRemoveTramo, onBreakfastChange, onLunchChange, onManualOffsetChange, onUseComputedDays, onSubmit, onCancel }: ScheduleEditorProps) {
  const ids = useId()
  const pauseHintId = `${ids}-pause`
  const typesHintId = `${ids}-types`
  const reasonId = `${ids}-disabled`
  const check = checkScheduleDraft(draft)
  const show = draft.showErrors
  const { blocks, errors } = check.computation
  const preview = check.computation.valid ? scheduleChips(blocks, check.breakfastMinutes, check.lunchMinutes) : []
  // Errors show once the owner tried to save, then live; the summary waits for two of them (design system 4.7).
  const invalidFields = show ? [check.nameError, check.breakfastError, check.lunchError, ...errors.flatMap((entry) => [entry.start, entry.end])].filter(Boolean).length : 0
  const reason = disabled && !busy ? disabledReason : ''
  return <form id={id} className={editing ? 'inline-form' : 'form-stack'} aria-label={formLabel} noValidate onSubmit={onSubmit}>
    {editing && <PageMessage>{EDIT_WARNING}</PageMessage>}
    {onSiteChange && sites.length > 1 && <FormField label="Local" hint="Tus datos se mantienen si cambiás de local.">
      <select value={siteId} disabled={busy} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
    </FormField>}
    {/* One choice among three, each with a line of explanation: radios in option tiles (design system 4.5). */}
    {showTypes && <fieldset className="field" aria-describedby={typesHintId}>
      <legend className="field-label">¿Cómo es este horario?</legend>
      <span id={typesHintId} className="field-hint">Elegí el que más se parece. Después podés cambiar las horas.</span>
      <div className="choice-list">{SCHEDULE_TYPES.map((type) => <label key={type.id} className="choice">
        <input type="radio" name={`${ids}-type`} value={type.id} checked={draft.type === type.id} disabled={busy} onChange={() => onPickType(type.id)} />
        {/* The colon is only heard: the tile shows the word over its help, and its name still reads «Cortado: De 09:00…». */}
        <span className="choice-text"><strong>{type.title}<span className="visually-hidden">:</span></strong> <small>{type.description}</small></span>
      </label>)}</div>
    </fieldset>}
    <FormField label="Nombre del horario" hint="Ej.: Mañana, Turno noche" error={show ? check.nameError : ''}>
      <input maxLength={120} value={draft.name} onChange={(event) => onNameChange(event.target.value)} />
    </FormField>
    <div className="subsection-head"><h3>¿A qué hora entran y salen?</h3><span className="field-hint">{draft.tramos.length} de {MAX_TRAMOS} tramos</span></div>
    {draft.tramos.map((tramo, index) => {
      const tramoErrors = show ? errors[index] ?? {} : {}
      const hints = blocks[index] && !errors[index]?.start && !errors[index]?.end ? tramoHints(blocks[index]) : {}
      return <fieldset className="field-group tramo" key={index}><legend>Tramo {index + 1}</legend><div className="tramo-fields">
        <FormField label="Entra a las" hint={hints.start} error={tramoErrors.start}><input type="time" value={tramo.start} disabled={busy} onChange={(event) => onTramoChange(index, { start: event.target.value })} /></FormField>
        <FormField label="Sale a las" hint={hints.end} error={tramoErrors.end}><input type="time" value={tramo.end} disabled={busy} onChange={(event) => onTramoChange(index, { end: event.target.value })} /></FormField>
        {/* A light edit of the draft, undone with «Agregar otro tramo»: a link, not a red button per tramo. */}
        {draft.tramos.length > 1 && <button type="button" className="button button-link" disabled={busy} onClick={() => onRemoveTramo(index)}>Quitar este tramo</button>}
      </div></fieldset>
    })}
    <div><button type="button" className="button button-secondary" disabled={busy || draft.tramos.length >= MAX_TRAMOS} onClick={onAddTramo}><Icon name="plus" />Agregar otro tramo</button></div>
    <div className="form-grid">
      {/* With an error the shared hint gives way to it, as before: the error says what to type. */}
      <FormField label="Minutos para desayunar" error={show ? check.breakfastError : ''}><input type="number" inputMode="numeric" min="0" max="240" value={draft.breakfast} aria-describedby={show && check.breakfastError ? undefined : pauseHintId} disabled={busy} onChange={(event) => onBreakfastChange(event.target.value)} /></FormField>
      <FormField label="Minutos para almorzar" error={show ? check.lunchError : ''}><input type="number" inputMode="numeric" min="0" max="240" value={draft.lunch} aria-describedby={show && check.lunchError ? undefined : pauseHintId} disabled={busy} onChange={(event) => onLunchChange(event.target.value)} /></FormField>
      <span id={pauseHintId} className="field-hint field-wide">{PAUSE_HINT}</span>
    </div>
    <div className="field"><span className="field-label">Así queda</span>
      {preview.length ? <ScheduleParts parts={preview} blockCount={blocks.length} label="Así queda el horario" /> : <span className="field-hint">Completá las horas de entrada y salida para ver cómo queda.</span>}
    </div>
    {draft.manualOffsets && <details className="fold" open>
      <summary>Opciones avanzadas</summary>
      <div className="form-stack">
        <p className="field-hint">Este horario se guardó con los días elegidos a mano. Los dejamos como estaban; si preferís, podés calcularlos solos.</p>
        {draft.tramos.map((_, index) => <div className="form-grid" key={index}>
          <FormField label={`Tramo ${index + 1}: entra el día`}><select value={draft.manualOffsets?.[index]?.startDayOffset ?? 0} disabled={busy} onChange={(event) => onManualOffsetChange(index, { startDayOffset: Number(event.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
          <FormField label={`Tramo ${index + 1}: sale el día`}><select value={draft.manualOffsets?.[index]?.endDayOffset ?? 0} disabled={busy} onChange={(event) => onManualOffsetChange(index, { endDayOffset: Number(event.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
        </div>)}
        <div><button type="button" className="button button-secondary" disabled={busy} onClick={onUseComputedDays}>Calcular los días solos</button></div>
      </div>
    </details>}
    {/* The result of saving, right above the buttons (design system 4.7). */}
    {(invalidFields > 1 || error || notice) && <div className="form-result">
      <FieldsSummary count={invalidFields} />
      {error && <PageMessage kind="error">{error}</PageMessage>}
      {notice && <PageMessage kind="success">{notice}</PageMessage>}
    </div>}
    <div className="button-row">
      <button className="button button-primary" aria-describedby={reason ? reasonId : undefined} disabled={busy || disabled}>{busy ? 'Guardando…' : submitLabel}</button>
      {onCancel && <button type="button" className="button button-link" disabled={busy} onClick={onCancel}>Cancelar</button>}
      {reason && <span className="field-hint" id={reasonId}>{reason}</span>}
    </div>
  </form>
}

export type AssignmentResult = { assigned: string[]; existing: string[]; failed: { name: string; message: string }[] }
export type AssignErrors = FieldErrors<'people' | 'validFrom'>

export type ScheduleAssignStepProps = {
  templateName: string; employees: Employee[]; employeesLoading: boolean; employeesError: string; checked: string[]; validFrom: string; busy: boolean
  result: AssignmentResult | null; asPanel?: boolean
  /** What saving the horario did («… creado.», «… actualizado.»): this step follows from it, so it opens with it. */
  notice?: string
  /** The errors of the last «Asignar», by field (the container checks them on submit). */
  errors?: AssignErrors
  onToggle: (employeeId: string) => void; onValidFromChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRetryEmployees: () => void; onClose: () => void
}

const TITLE = '¿Quién trabaja con este horario?'

/**
 * After saving a horario: assign it to the active employees of its local from a day, or skip. It opens where the horario was
 * saved: in place of the create form, or under the record of the horario that changed.
 */
export function ScheduleAssignStep({ templateName, employees, employeesLoading, employeesError, checked, validFrom, busy, result, asPanel = false, notice = '', errors = {}, onToggle, onValidFromChange, onSubmit, onRetryEmployees, onClose }: ScheduleAssignStepProps) {
  const headingId = useId()
  const results = result && (result.assigned.length || result.existing.length || result.failed.length) ? <div className="form-result">
    {result.assigned.length ? <PageMessage kind="success">{`Listo: asignado a ${joinNames(result.assigned)}.`}</PageMessage> : null}
    {result.existing.length ? <PageMessage>{`${joinNames(result.existing)} ${result.existing.length === 1 ? 'ya tenía' : 'ya tenían'} un horario desde ese día. Para cambiarlo, elegí otro día.`}</PageMessage> : null}
    {result.failed.map((failure) => <PageMessage kind="error" key={failure.name}>{`No se pudo asignar a ${failure.name}: ${failure.message}`}</PageMessage>)}
  </div> : null
  const body = <>
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <p className="muted">Marcá a quienes trabajan con «{templateName}». Desde ese día, cuando cargues sus días de trabajo se usa este horario. Los días que ya cargaste no cambian.</p>
    {employeesLoading ? <Loading label="Cargando empleados…" /> : employeesError ? <LoadFailure message={employeesError} onRetry={onRetryEmployees} /> : employees.length === 0
      ? <><Empty>Este local todavía no tiene empleados activos. Los podés agregar en Equipo.</Empty><div className="button-row"><button type="button" className="button button-secondary" onClick={onClose}>Listo</button></div></>
      : <form className="form-stack" noValidate onSubmit={onSubmit}>
        <Fieldset legend="Empleados de este local" error={errors.people}>
          <div className="check-list">{employees.map((person) => <label key={person.id} className="check"><input type="checkbox" checked={checked.includes(person.id)} disabled={busy} onChange={() => onToggle(person.id)} />{person.displayName}</label>)}</div>
        </Fieldset>
        <FormField label="Desde el día" error={errors.validFrom}><input type="date" required value={validFrom} disabled={busy} onChange={(event) => onValidFromChange(event.target.value)} /></FormField>
        {/* The result of assigning, right above the buttons (design system 4.7). */}
        {results}
        <div className="button-row">
          <button className="button button-primary" disabled={busy}>{busy ? 'Asignando…' : 'Asignar'}</button>
          <button type="button" className="button button-link" disabled={busy} onClick={onClose}>{result ? 'Listo' : 'Ahora no'}</button>
        </div>
      </form>}
  </>
  // The parts of the step are spaced by one gap, in a panel as in the inline form.
  if (asPanel) return <Panel title={TITLE}><div className="schedule-step" id={scheduleFocusIds.assignStep}>{body}</div></Panel>
  return <section className="inline-form" id={scheduleFocusIds.assignStep} aria-labelledby={headingId}><h3 id={headingId}>{TITLE}</h3>{body}</section>
}

export function SchedulesViewRender({ sites, siteId, siteTemplates, loading, loadError, notice, messageAt = '', busy, openCardId, cardSlot, createPanel, onReload, onBeginEdit }: {
  sites: Site[]; siteId: string; siteTemplates: Template[]; loading: boolean; loadError: string; notice: string
  /** The form whose result `notice` is (scheduleMessageKeys); the container hands it to that form, so it shows nowhere else. */
  messageAt?: string
  busy: boolean
  /** The record whose slot is open (edit in place or the assignment after an edit) and what it shows. */
  openCardId: string; cardSlot: ReactNode
  /** The create form, or the assignment step after creating a horario. */
  createPanel: ReactNode
  onReload: () => void; onBeginEdit: (template: Template) => void
}) {
  const siteName = sites.find((site) => site.id === siteId)?.name
  // A result whose form is not on the screen (the horario belongs to another local now) still shows: at the top of the page.
  const placed = messageAt === scheduleMessageKeys.create || siteTemplates.some((template) => messageAt === scheduleMessageKeys.edit(template.id))
  return <>
    <PageHeading title="Horarios" subtitle="Armá los horarios de cada local: a qué hora entran, a qué hora salen y cuánto pueden tardar en desayunar y almorzar." />
    {notice && !placed && <PageMessage kind="success">{notice}</PageMessage>}
    <div className="content-grid">
      <Panel title="Horarios de este local">
        {sites.length > 1 && siteName && <p className="muted">{siteName}</p>}
        {loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : !sites.length ? <Empty>Primero creá un local en Locales.</Empty> : siteTemplates.length ? <ul className="record-list">{siteTemplates.map((template) => {
          const open = openCardId === template.id
          const nameId = `schedule-${template.id}-name`
          return <li className="record" key={template.id} aria-labelledby={nameId}>
            <p className="record-title"><strong id={nameId}>{template.name}</strong>{!template.active && <StatusTag tone="wait" icon="ban">Inactivo</StatusTag>}</p>
            <ScheduleParts parts={scheduleChips(template.blocks, template.breakfastLimitMinutes, template.lunchLimitMinutes)} blockCount={template.blocks.length} label={`Horario ${template.name}`} />
            {/* A link button: it opens the form under the record; the filled button belongs to that form. */}
            {!open && <div className="record-actions"><button type="button" id={scheduleFocusIds.editButton(template.id)} className="button button-link" aria-label={`Cambiar horario ${template.name}`} disabled={busy} onClick={() => onBeginEdit(template)}>Cambiar horario</button></div>}
            {/* The open form or step, or the result of the change that just closed, where it was made. */}
            {open ? cardSlot : notice && messageAt === scheduleMessageKeys.edit(template.id) ? <PageMessage kind="success">{notice}</PageMessage> : null}
          </li>
        })}</ul> : <Empty>Este local todavía no tiene horarios. Creá el primero.</Empty>}
      </Panel>
      {createPanel}
    </div>
  </>
}
