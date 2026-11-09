import { useId, type FormEvent } from 'react'
import { FormField, PageMessage, Panel } from '../../app/ui'
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

function listNames(names: string[]) { return names.length > 6 ? `${names.slice(0, 5).join(', ')} y ${names.length - 5} más` : names.join(', ') }

/**
 * D-20261027-11 in the owner's words: which weekdays, for which period (at most 31 days), for whom. Each day is created once;
 * no weekly rule is stored (D-20261015-01). The request is the same POST /jornadas/bulk as before.
 */
export function WorkDaysFormRender({ sites, employees, templates, values, preview, busy, disabled, error, dateError, result, onSiteChange, onWeekdaysChange, onPeriodChange, onFromChange, onToChange, onToggleEmployee, onToggleAll, onTemplateChange, onSubmit, onAssignSchedules, onReviewSchedules }: {
  sites: Site[]; employees: Employee[]; templates: Template[]; values: WorkDaysFormValues; preview: string
  busy: boolean; disabled: boolean; error: string; dateError: boolean; result: BulkResultSummary | null
  onSiteChange: (value: string) => void; onWeekdaysChange: (days: number[]) => void; onPeriodChange: (period: WorkPeriod) => void
  onFromChange: (value: string) => void; onToChange: (value: string) => void; onToggleEmployee: (id: string) => void; onToggleAll: () => void
  onTemplateChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onAssignSchedules: () => void; onReviewSchedules: () => void
}) {
  const errorId = useId()
  const allSelected = employees.length > 0 && employees.every((person) => values.selectedIds.includes(person.id))
  const toggleDay = (day: number) => onWeekdaysChange(values.weekdays.includes(day) ? values.weekdays.filter((entry) => entry !== day) : [...values.weekdays, day].sort((a, b) => a - b))
  return <Panel title="Cargar días de trabajo"><form id="work-days" className="form-stack" noValidate onSubmit={onSubmit}>
    <p className="muted">Elegí el local, qué días trabajan y para qué período. Cada persona usa el horario que tiene asignado.</p>
    <FormField label="Local"><select value={values.siteId} disabled={disabled} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></FormField>
    <fieldset className="field fieldset-plain">
      <legend className="field-label">¿Qué días trabajan?</legend>
      <div className="button-row choice-row">{WEEKDAY_PRESETS.map((preset) => <button key={preset.label} type="button" className="button button-small button-quiet" aria-pressed={sameDays(values.weekdays, preset.days)} onClick={() => onWeekdaysChange(preset.days)}>{preset.label}</button>)}</div>
      <div className="check-grid">{WEEKDAYS.map((day) => <label key={day.value}><input type="checkbox" checked={values.weekdays.includes(day.value)} onChange={() => toggleDay(day.value)} />{day.label}</label>)}</div>
    </fieldset>
    <fieldset className="field fieldset-plain">
      <legend className="field-label">¿Para qué período?</legend>
      <div className="button-row choice-row">{PERIODS.map((period) => <button key={period.value} type="button" className="button button-small button-quiet" aria-pressed={values.period === period.value} onClick={() => onPeriodChange(period.value)}>{period.label}</button>)}</div>
      {values.period === 'custom' && <div className="form-grid">
        <FormField label="Primer día"><input type="date" value={values.from} aria-invalid={dateError || undefined} aria-describedby={dateError ? errorId : undefined} onChange={(event) => onFromChange(event.target.value)} /></FormField>
        <FormField label="Último día" hint="Hasta 31 días por vez."><input type="date" value={values.to} aria-invalid={dateError || undefined} aria-describedby={dateError ? errorId : undefined} onChange={(event) => onToChange(event.target.value)} /></FormField>
      </div>}
    </fieldset>
    <fieldset className="field fieldset-plain">
      <legend className="field-label">¿Quiénes? ({values.selectedIds.length} de {employees.length})</legend>
      {employees.length ? <>
        <div className="check-grid"><label><input type="checkbox" checked={allSelected} onChange={onToggleAll} /><strong>Seleccionar todos</strong></label></div>
        <div className="check-grid">{employees.map((person) => <label key={person.id}><input type="checkbox" checked={values.selectedIds.includes(person.id)} onChange={() => onToggleEmployee(person.id)} />{person.displayName}</label>)}</div>
      </> : <span className="field-hint">No hay personas activas en este local. Dalas de alta en Empleados.</span>}
    </fieldset>
    <details className="fold">
      <summary>Usar otro horario para todos</summary>
      <FormField label="Horario para todos" hint="Si no elegís uno, cada persona usa el horario que tiene asignado."><select value={values.templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">El que tiene asignado cada persona</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></FormField>
    </details>
    <div className="work-days-preview">
      <p role="status" aria-live="polite" aria-atomic="true"><strong>{preview}</strong></p>
      <p className="field-hint">{ONCE_NOTE}</p>
    </div>
    {error && <div id={errorId}><PageMessage kind="error">{error}</PageMessage></div>}
    <div><button className="button button-primary" disabled={busy || disabled}>{busy ? 'Cargando…' : 'Cargar días'}</button></div>
    {result && <div className="form-stack" aria-label="Resultado de la carga" role="group">
      <PageMessage kind={result.created > 0 ? 'success' : 'info'}>
        {result.created === 0 ? 'No se cargó ningún día.' : result.created === 1 ? 'Se cargó 1 día.' : `Se cargaron ${result.created} días.`}
        {result.skipped > 0 && (result.skipped === 1 ? ' No se cargó 1:' : ` No se cargaron ${result.skipped}:`)}
      </PageMessage>
      {result.skipped > 0 && <ul className="simple-list work-days-skips" aria-label="Días que no se cargaron">
        {result.existing > 0 && <li className="simple-row">{result.existing === 1 ? 'Ya tenía día cargado' : 'Ya tenían día cargado'} ({result.existing})</li>}
        {result.noSchedule.count > 0 && <li className="simple-row work-days-skip"><span>Sin horario asignado: {listNames(result.noSchedule.names)} ({result.noSchedule.count})</span>
          <button type="button" className="button button-small button-outline" onClick={onAssignSchedules}>Asignar horario</button></li>}
        {result.inactiveSchedule.count > 0 && <li className="simple-row work-days-skip"><span>Con el horario desactivado: {listNames(result.inactiveSchedule.names)} ({result.inactiveSchedule.count})</span>
          <button type="button" className="button button-small button-outline" onClick={onReviewSchedules}>Revisar horarios</button></li>}
      </ul>}
    </div>}
  </form></Panel>
}
