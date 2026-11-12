import { useId, type FormEvent } from 'react'
import { Icon } from '../../app/icons'
import { Fieldset, FieldsSummary, FormField, PageMessage, Panel } from '../../app/ui'
import type { FieldErrors } from '../../app/useFieldErrors'
import type { Employee, Site, Template } from '../../shared/api/types'
import { EVERY_DAY, MONDAY_TO_FRIDAY, MONDAY_TO_SATURDAY, sameDays, type BulkResultSummary, type WorkPeriod } from './workDays'

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' }, { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' }, { value: 7, label: 'Domingo' }
]
const WEEKDAY_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Lunes a viernes', days: MONDAY_TO_FRIDAY }, { label: 'Lunes a sábado', days: MONDAY_TO_SATURDAY }, { label: 'Todos', days: EVERY_DAY }
]
const PERIODS: { value: WorkPeriod; label: string }[] = [
  { value: 'this-week', label: 'Esta semana' }, { value: 'two-weeks', label: 'Próximas 2 semanas' },
  { value: 'rest-of-month', label: 'Lo que queda del mes' }, { value: 'next-month', label: 'Mes que viene' }, { value: 'custom', label: 'Elegir fechas' }
]
export const ONCE_NOTE = 'Se cargan una sola vez. Para el mes siguiente, volvé a esta pantalla.'

export type WorkDaysFormValues = {
  siteId: string; weekdays: number[]; period: WorkPeriod; from: string; to: string
  selectedIds: string[]; templateId: string
}
/** The groups of the form a problem can be about. */
export type WorkDaysField = 'weekdays' | 'period' | 'people'
/** The form, where the focus goes when it fails. */
export const WORK_DAYS_FORM_ID = 'work-days'
/** The result of a load, where the focus goes once it is on screen (slice G2). */
export const WORK_DAYS_RESULT_ID = 'work-days-result'

function listNames(names: string[]) { return names.length > 6 ? `${names.slice(0, 5).join(', ')} y ${names.length - 5} más` : names.join(', ') }

/**
 * D-20261027-11 in the owner's words: which weekdays, for which period (at most 31 days), for whom. Each day is created once;
 * no weekly rule is stored (D-20261015-01). The request is the same POST /jornadas/bulk as before.
 */
export function WorkDaysFormRender({ sites, employees, templates, values, preview, busy, disabled, error, fieldErrors = {}, result, onSiteChange, onWeekdaysChange, onPeriodChange, onFromChange, onToChange, onToggleEmployee, onToggleAll, onTemplateChange, onSubmit, onAssignSchedules, onReviewSchedules }: {
  sites: Site[]; employees: Employee[]; templates: Template[]; values: WorkDaysFormValues; preview: string
  /** `disabled`: the page still reads its locals and people, so the local cannot be chosen yet. `error`: the refusal of the server. */
  busy: boolean; disabled: boolean; error: string; result: BulkResultSummary | null
  /** What a submit found wrong, under the group it is about. */
  fieldErrors?: FieldErrors<WorkDaysField>
  onSiteChange: (value: string) => void; onWeekdaysChange: (days: number[]) => void; onPeriodChange: (period: WorkPeriod) => void
  onFromChange: (value: string) => void; onToChange: (value: string) => void; onToggleEmployee: (id: string) => void; onToggleAll: () => void
  onTemplateChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onAssignSchedules: () => void; onReviewSchedules: () => void
}) {
  const periodErrorId = useId()
  const rangeHintId = useId()
  // A problem of the period is about its two dates when they are on screen: they are marked and read it too.
  const dateError = values.period === 'custom' && Boolean(fieldErrors.period)
  const dateDescription = dateError ? `${rangeHintId} ${periodErrorId}` : rangeHintId
  const allSelected = employees.length > 0 && employees.every((person) => values.selectedIds.includes(person.id))
  const toggleDay = (day: number) => onWeekdaysChange(values.weekdays.includes(day) ? values.weekdays.filter((entry) => entry !== day) : [...values.weekdays, day].sort((a, b) => a - b))
  return <Panel title="Cargar días de trabajo"><form id={WORK_DAYS_FORM_ID} className="form-stack work-days-form" noValidate onSubmit={onSubmit}>
    <p className="muted">Elegí el local, qué días trabajan y para qué período. Cada persona usa el horario que tiene asignado.</p>
    <FormField label="Local"><select value={values.siteId} disabled={disabled} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></FormField>
    <Fieldset legend="¿Qué días trabajan?" error={fieldErrors.weekdays}>
      <div className="button-row">{WEEKDAY_PRESETS.map((preset) => <QuickChoice key={preset.label} label={preset.label} pressed={sameDays(values.weekdays, preset.days)} onClick={() => onWeekdaysChange(preset.days)} />)}</div>
      <div className="check-list">{WEEKDAYS.map((day) => <label className="check" key={day.value}><input type="checkbox" checked={values.weekdays.includes(day.value)} onChange={() => toggleDay(day.value)} />{day.label}</label>)}</div>
    </Fieldset>
    <Fieldset legend="¿Para qué período?" error={fieldErrors.period} errorId={periodErrorId}>
      <div className="button-row">{PERIODS.map((period) => <QuickChoice key={period.value} label={period.label} pressed={values.period === period.value} onClick={() => onPeriodChange(period.value)} />)}</div>
      {/* The limit is about the range: one hint before both dates, which also keeps the two boxes level side by side. */}
      {values.period === 'custom' && <>
        <span className="field-hint" id={rangeHintId}>Hasta 31 días por vez.</span>
        <div className="form-grid">
          <FormField label="Primer día"><input type="date" value={values.from} aria-invalid={dateError || undefined} aria-describedby={dateDescription} onChange={(event) => onFromChange(event.target.value)} /></FormField>
          <FormField label="Último día"><input type="date" value={values.to} aria-invalid={dateError || undefined} aria-describedby={dateDescription} onChange={(event) => onToChange(event.target.value)} /></FormField>
        </div>
      </>}
    </Fieldset>
    <Fieldset legend={<>¿Quiénes? ({values.selectedIds.length} de {employees.length})</>} error={fieldErrors.people}>
      {employees.length ? <>
        <div className="check-list"><label className="check"><input type="checkbox" checked={allSelected} onChange={onToggleAll} /><strong>Seleccionar todos</strong></label></div>
        <div className="check-list">{employees.map((person) => <label className="check" key={person.id}><input type="checkbox" checked={values.selectedIds.includes(person.id)} onChange={() => onToggleEmployee(person.id)} />{person.displayName}</label>)}</div>
      </> : <span className="field-hint">No hay personas activas en este local. Dalas de alta en Equipo.</span>}
    </Fieldset>
    <details className="fold">
      <summary>Usar otro horario para todos</summary>
      <FormField label="Horario para todos" hint="Si no elegís uno, cada persona usa el horario que tiene asignado."><select value={values.templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">El que tiene asignado cada persona</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></FormField>
    </details>
    {/* An info message written in place, not a PageMessage: the preview belongs to the form, so it has its words from the first
        render; only the sentence is the live region, so each choice reads the new count and not the note again. */}
    <div className="message message-info">
      <Icon name="info" />
      <div className="message-body">
        <p role="status" aria-live="polite" aria-atomic="true"><strong>{preview}</strong></p>
        <p className="field-hint">{ONCE_NOTE}</p>
      </div>
    </div>
    {/* The answer to a submit, inside the form and right above its button (design system 4.7). */}
    <FieldsSummary count={Object.keys(fieldErrors).length} />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {result && <div id={WORK_DAYS_RESULT_ID} tabIndex={-1} aria-label="Resultado de la carga" role="group">
      {/* The reasons sit inside the result message as records, each group with the people it names and the way to fix it. */}
      <PageMessage kind={result.created > 0 ? 'success' : 'info'}>
        {result.created === 0 ? 'No se cargó ningún día.' : result.created === 1 ? 'Se cargó 1 día.' : `Se cargaron ${result.created} días.`}
        {result.skipped > 0 && (result.skipped === 1 ? ' No se cargó 1:' : ` No se cargaron ${result.skipped}:`)}
        {result.skipped > 0 && <ul className="record-list" aria-label="Días que no se cargaron">
          {result.existing.count > 0 && <li className="record">{result.existing.count === 1 ? 'Ya tenía día cargado' : 'Ya tenían día cargado'}: {listNames(result.existing.names)} ({result.existing.count})</li>}
          {result.noSchedule.count > 0 && <li className="record"><span>Sin horario asignado: {listNames(result.noSchedule.names)} ({result.noSchedule.count})</span>
            <span className="record-actions"><button type="button" className="button button-link" onClick={onAssignSchedules}>Asignar horario</button></span></li>}
          {result.inactiveSchedule.count > 0 && <li className="record"><span>Con el horario desactivado: {listNames(result.inactiveSchedule.names)} ({result.inactiveSchedule.count})</span>
            <span className="record-actions"><button type="button" className="button button-link" onClick={onReviewSchedules}>Revisar horarios</button></span></li>}
        </ul>}
      </PageMessage>
    </div>}
    <div className="button-row"><button className="button button-primary" disabled={busy}>{busy ? 'Cargando…' : 'Cargar días'}</button></div>
  </form></Panel>
}

/** A quick choice: a toggle button that, chosen, takes the selected look and a check before its words (design system 4.1). */
function QuickChoice({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return <button type="button" className="button button-secondary" aria-pressed={pressed} onClick={onClick}>{pressed && <Icon name="check" />}{label}</button>
}
