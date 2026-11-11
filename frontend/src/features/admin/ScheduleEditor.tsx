import { useId, type FormEvent, type ReactNode } from 'react'
import { Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import type { Employee, Site, Template } from '../../shared/api/types'
import { LoadFailure, PageHeading } from './AdminViewsRender'
import { checkScheduleDraft, type ScheduleDraft } from './scheduleDraft'
import { joinNames, MAX_TRAMOS, SCHEDULE_TYPES, scheduleChips, tramoHints, type DayOffsets, type ScheduleTypeId, type Tramo } from './scheduleTramos'

const PAUSE_HINT = 'Si la pausa dura más, te avisamos en Para revisar. Con 0, te avisamos de cualquier pausa.'
export const EDIT_WARNING = 'Los días que ya cargaste mantienen el horario anterior.'

/** A field hint that turns into the field's error; FormField links it to the control with aria-describedby. */
function hintOrError(error: string | undefined, hint?: string): ReactNode {
  if (error) return <span className="field-hint-error">{error}</span>
  return hint
}

export function ScheduleChips({ chips, label }: { chips: string[]; label: string }) {
  return <ul className="schedule-chips" aria-label={label}>{chips.map((chip, index) => <li className="schedule-block" key={`${index}-${chip}`}>{chip}</li>)}</ul>
}

export type ScheduleEditorProps = {
  draft: ScheduleDraft; busy: boolean; disabled?: boolean; error: string; submitLabel: string; formLabel: string
  /** The Local field, first in the form; it is hidden with a single local (create only). */
  sites?: Site[]; siteId?: string; onSiteChange?: (siteId: string) => void
  /** The three type cards (create only). */
  showTypes?: boolean
  /** Edit in place: the warning that loaded days keep their old schedule. */
  editing?: boolean
  onNameChange: (value: string) => void; onPickType: (id: ScheduleTypeId) => void
  onTramoChange: (index: number, patch: Partial<Tramo>) => void; onAddTramo: () => void; onRemoveTramo: (index: number) => void
  onBreakfastChange: (value: string) => void; onLunchChange: (value: string) => void
  onManualOffsetChange: (index: number, patch: Partial<DayOffsets>) => void; onUseComputedDays: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel?: () => void
}

export function ScheduleEditor({ draft, busy, disabled = false, error, submitLabel, formLabel, sites = [], siteId = '', onSiteChange, showTypes = false, editing = false,
  onNameChange, onPickType, onTramoChange, onAddTramo, onRemoveTramo, onBreakfastChange, onLunchChange, onManualOffsetChange, onUseComputedDays, onSubmit, onCancel }: ScheduleEditorProps) {
  const pauseHintId = useId()
  const check = checkScheduleDraft(draft)
  const show = draft.showErrors
  const { blocks, errors } = check.computation
  const preview = check.computation.valid ? scheduleChips(blocks, check.breakfastMinutes, check.lunchMinutes) : []
  return <form className="form-stack" aria-label={formLabel} noValidate onSubmit={onSubmit}>
    {editing && <PageMessage>{EDIT_WARNING}</PageMessage>}
    {onSiteChange && sites.length > 1 && <FormField label="Local" hint="Tus datos se mantienen si cambiás de local.">
      <select value={siteId} disabled={busy} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
    </FormField>}
    {showTypes && <fieldset className="field fieldset-plain">
      <legend className="field-label">¿Cómo es este horario?</legend>
      <div className="journey-picker schedule-types">{SCHEDULE_TYPES.map((type) => <button type="button" key={type.id} className={`journey-option ${draft.type === type.id ? 'journey-option-active' : ''}`} aria-pressed={draft.type === type.id} disabled={busy} onClick={() => onPickType(type.id)}>
        <strong>{type.title}</strong><small>{type.description}</small>
      </button>)}</div>
      <span className="field-hint">Elegí el que más se parece. Después podés cambiar las horas.</span>
    </fieldset>}
    <FormField label="Nombre del horario" hint={hintOrError(show ? check.nameError : '')}>
      <input maxLength={120} value={draft.name} aria-invalid={show && Boolean(check.nameError)} placeholder="Ej.: Mañana, Turno noche" onChange={(event) => onNameChange(event.target.value)} />
    </FormField>
    <div className="form-subhead"><strong>¿A qué hora entran y salen?</strong><span>{draft.tramos.length} de {MAX_TRAMOS} tramos</span></div>
    {draft.tramos.map((tramo, index) => {
      const tramoErrors = show ? errors[index] ?? {} : {}
      const hints = blocks[index] && !errors[index]?.start && !errors[index]?.end ? tramoHints(blocks[index]) : {}
      return <fieldset className="block-editor" key={index}><legend>Tramo {index + 1}</legend><div className="block-fields block-fields-tramo">
        <FormField label="Entra a las" hint={hintOrError(tramoErrors.start, hints.start)}><input type="time" value={tramo.start} aria-invalid={Boolean(tramoErrors.start)} disabled={busy} onChange={(event) => onTramoChange(index, { start: event.target.value })} /></FormField>
        <FormField label="Sale a las" hint={hintOrError(tramoErrors.end, hints.end)}><input type="time" value={tramo.end} aria-invalid={Boolean(tramoErrors.end)} disabled={busy} onChange={(event) => onTramoChange(index, { end: event.target.value })} /></FormField>
        {draft.tramos.length > 1 && <button type="button" className="button button-small button-quiet remove-block" disabled={busy} onClick={() => onRemoveTramo(index)}>Quitar este tramo</button>}
      </div></fieldset>
    })}
    <div><button type="button" className="button button-quiet" disabled={busy || draft.tramos.length >= MAX_TRAMOS} onClick={onAddTramo}><span aria-hidden="true">+</span> Agregar otro tramo</button></div>
    <div className="form-grid">
      <FormField label="Minutos para desayunar" hint={hintOrError(show ? check.breakfastError : '')}><input type="number" inputMode="numeric" min="0" max="240" value={draft.breakfast} aria-invalid={show && Boolean(check.breakfastError)} aria-describedby={show && check.breakfastError ? undefined : pauseHintId} disabled={busy} onChange={(event) => onBreakfastChange(event.target.value)} /></FormField>
      <FormField label="Minutos para almorzar" hint={hintOrError(show ? check.lunchError : '')}><input type="number" inputMode="numeric" min="0" max="240" value={draft.lunch} aria-invalid={show && Boolean(check.lunchError)} aria-describedby={show && check.lunchError ? undefined : pauseHintId} disabled={busy} onChange={(event) => onLunchChange(event.target.value)} /></FormField>
      <p id={pauseHintId} className="field-hint field-wide">{PAUSE_HINT}</p>
    </div>
    <div className="field"><span className="field-label">Así queda</span>
      {preview.length ? <ScheduleChips chips={preview} label="Así queda el horario" /> : <span className="field-hint">Completá las horas de entrada y salida para ver cómo queda.</span>}
    </div>
    {draft.manualOffsets && <details className="site-location-manual" open>
      <summary>Opciones avanzadas</summary>
      <div className="form-stack">
        <p className="field-hint">Este horario se guardó con los días elegidos a mano. Los dejamos como estaban; si preferís, podés calcularlos solos.</p>
        {draft.tramos.map((_, index) => <div className="site-location-coordinate-inputs" key={index}>
          <FormField label={`Tramo ${index + 1}: entra el día`}><select value={draft.manualOffsets?.[index]?.startDayOffset ?? 0} disabled={busy} onChange={(event) => onManualOffsetChange(index, { startDayOffset: Number(event.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
          <FormField label={`Tramo ${index + 1}: sale el día`}><select value={draft.manualOffsets?.[index]?.endDayOffset ?? 0} disabled={busy} onChange={(event) => onManualOffsetChange(index, { endDayOffset: Number(event.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
        </div>)}
        <div><button type="button" className="button button-small button-quiet" disabled={busy} onClick={onUseComputedDays}>Calcular los días solos</button></div>
      </div>
    </details>}
    {show && !check.valid && <PageMessage kind="error">Revisá lo que está marcado debajo de cada campo.</PageMessage>}
    {error && <PageMessage kind="error">{error}</PageMessage>}
    <div className="button-row">
      <button className="button button-primary" disabled={busy || disabled}>{busy ? 'Guardando…' : submitLabel}</button>
      {onCancel && <button type="button" className="button button-quiet" disabled={busy} onClick={onCancel}>Cancelar</button>}
    </div>
  </form>
}

export type AssignmentResult = { assigned: string[]; existing: string[]; failed: { name: string; message: string }[] }

export type ScheduleAssignStepProps = {
  templateName: string; employees: Employee[]; employeesLoading: boolean; employeesError: string; checked: string[]; validFrom: string; busy: boolean
  result: AssignmentResult | null; asPanel?: boolean
  onToggle: (employeeId: string) => void; onValidFromChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onRetryEmployees: () => void; onClose: () => void
}

const TITLE = '¿Quién trabaja con este horario?'

/** After saving a horario: assign it to the active employees of its local from a day, or skip. */
export function ScheduleAssignStep({ templateName, employees, employeesLoading, employeesError, checked, validFrom, busy, result, asPanel = false, onToggle, onValidFromChange, onSubmit, onRetryEmployees, onClose }: ScheduleAssignStepProps) {
  const headingId = useId()
  const body = <>
    <p className="muted">Marcá a quienes trabajan con «{templateName}». Desde ese día, cuando cargues sus días de trabajo se usa este horario. Los días que ya cargaste no cambian.</p>
    {result?.assigned.length ? <PageMessage kind="success">{`Listo: asignado a ${joinNames(result.assigned)}.`}</PageMessage> : null}
    {result?.existing.length ? <PageMessage>{`${joinNames(result.existing)} ${result.existing.length === 1 ? 'ya tenía' : 'ya tenían'} un horario desde ese día. Para cambiarlo, elegí otro día.`}</PageMessage> : null}
    {result?.failed.map((failure) => <PageMessage kind="error" key={failure.name}>{`No se pudo asignar a ${failure.name}: ${failure.message}`}</PageMessage>)}
    {employeesLoading ? <Loading label="Cargando empleados…" /> : employeesError ? <LoadFailure message={employeesError} onRetry={onRetryEmployees} /> : employees.length === 0
      ? <><Empty>Este local todavía no tiene empleados activos. Los podés agregar en Equipo.</Empty><div className="button-row"><button type="button" className="button button-quiet" onClick={onClose}>Listo</button></div></>
      : <form className="form-stack" noValidate onSubmit={onSubmit}>
        <fieldset className="field fieldset-plain"><legend className="field-label">Empleados de este local</legend>
          <div className="check-grid">{employees.map((person) => <label key={person.id}><input type="checkbox" checked={checked.includes(person.id)} disabled={busy} onChange={() => onToggle(person.id)} />{person.displayName}</label>)}</div>
        </fieldset>
        <FormField label="Desde el día"><input type="date" required value={validFrom} disabled={busy} onChange={(event) => onValidFromChange(event.target.value)} /></FormField>
        <div className="button-row">
          <button className="button button-primary" disabled={busy || checked.length === 0 || !validFrom}>{busy ? 'Asignando…' : 'Asignar'}</button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>{result ? 'Listo' : 'Ahora no'}</button>
        </div>
      </form>}
  </>
  if (asPanel) return <Panel title={TITLE}>{body}</Panel>
  return <section className="form-stack template-card-slot" aria-labelledby={headingId}><h3 id={headingId}>{TITLE}</h3>{body}</section>
}

export function SchedulesViewRender({ sites, siteId, siteTemplates, loading, loadError, notice, busy, openCardId, cardSlot, createPanel, onReload, onBeginEdit }: {
  sites: Site[]; siteId: string; siteTemplates: Template[]; loading: boolean; loadError: string; notice: string; busy: boolean
  /** The card whose slot is open (edit in place or the assignment after an edit) and what it shows. */
  openCardId: string; cardSlot: ReactNode
  /** The create form, or the assignment step after creating a horario. */
  createPanel: ReactNode
  onReload: () => void; onBeginEdit: (template: Template) => void
}) {
  const siteName = sites.find((site) => site.id === siteId)?.name
  return <>
    <PageHeading eyebrow="CONFIGURACIÓN" title="Horarios" subtitle="Armá los horarios de cada local: a qué hora entran, a qué hora salen y cuánto pueden tardar en desayunar y almorzar." />
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <div className="content-grid">
      <Panel title="Horarios de este local">
        {sites.length > 1 && siteName && <p className="muted small-copy">{siteName}</p>}
        {loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : !sites.length ? <Empty>Primero creá un local en Locales.</Empty> : siteTemplates.length ? <div className="template-list">{siteTemplates.map((template) => {
          const open = openCardId === template.id
          return <article className={`template-card ${open ? 'template-card-open' : ''}`} key={template.id} aria-labelledby={`schedule-${template.id}-name`}>
            <div>
              <div className="template-title"><strong id={`schedule-${template.id}-name`}>{template.name}</strong>{!template.active && <span className="status-chip status-inactivo">Inactivo</span>}</div>
              <ScheduleChips chips={scheduleChips(template.blocks, template.breakfastLimitMinutes, template.lunchLimitMinutes)} label={`Horario ${template.name}`} />
            </div>
            {!open && <button type="button" className="button button-small button-quiet" aria-label={`Cambiar horario ${template.name}`} disabled={busy} onClick={() => onBeginEdit(template)}>Cambiar horario</button>}
            {open && cardSlot}
          </article>
        })}</div> : <Empty>Este local todavía no tiene horarios. Creá el primero.</Empty>}
      </Panel>
      {createPanel}
    </div>
  </>
}
