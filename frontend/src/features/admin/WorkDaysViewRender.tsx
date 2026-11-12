// The «Días de trabajo» render (section 'workdays', D-20261111-02 step 2): the notice of days loaded, the monthly load and the
// single-day form, taken as they were from the bottom of the days screen. The list of a date and its detail are «Hoy».
import type { FormEvent, ReactNode } from 'react'
import { FormField, LoadFailure, PageHeading, PageMessage } from '../../app/ui'
import type { Employee, Site, Template } from '../../shared/api/types'

export function WorkDaysViewRender({ workDaysPanel, coverage, sites, eligibleEmployees, siteTemplates, loading, dependencyError, busy, employeeId, siteId, templateId, singleDate, singleError = '', singleNotice = '', onSingleDateChange, onEmployeeChange, onSiteChange, onTemplateChange, onDeclare, onRetryDependencies }: {
  /** "Cargar días de trabajo" (WorkDaysPanel), the main form of the page; coverage is the notice of days loaded. */
  workDaysPanel?: ReactNode; coverage?: ReactNode
  sites: Site[]; eligibleEmployees: Employee[]; siteTemplates: Template[]
  loading: boolean; dependencyError: string; busy: boolean; employeeId: string; siteId: string; templateId: string
  /** The single day ("Cargar o cambiar un solo día") has its own date and messages. */
  singleDate: string; singleError?: string; singleNotice?: string; onSingleDateChange: (value: string) => void
  onEmployeeChange: (value: string) => void; onSiteChange: (value: string) => void; onTemplateChange: (value: string) => void
  onDeclare: (event: FormEvent<HTMLFormElement>) => void; onRetryDependencies: () => void
}) {
  return <>
    <PageHeading title="Días de trabajo" subtitle="Cargá los días que trabaja cada persona. Cada día sigue el calendario de su local." />
    {dependencyError && <LoadFailure message={dependencyError} retryLabel="Reintentar datos del día" disabled={loading} onRetry={onRetryDependencies} />}
    {coverage}
    {workDaysPanel}
    <section className="panel" aria-labelledby="single-day-title"><details className="fold">
      <summary><h2 id="single-day-title">Cargar o cambiar un solo día</h2></summary>
      {/* The list of a date is in another section now, so the hint names it. */}
      <p className="muted">Para una excepción: un día suelto o un horario distinto. Para cambiar un día ya cargado, abrilo en «Hoy», cancelalo y cargalo de nuevo.</p>
      <form className="form-grid" onSubmit={onDeclare}>
        <FormField label="Local"><select required value={siteId} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></FormField>
        <FormField label="Empleado" hint={eligibleEmployees.length === 0 ? 'No hay personas activas en este local.' : undefined}><select required value={employeeId} onChange={(event) => onEmployeeChange(event.target.value)}>{eligibleEmployees.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select></FormField>
        <FormField label="Día"><input type="date" required disabled={loading} value={singleDate} onChange={(event) => onSingleDateChange(event.target.value)} /></FormField>
        <FormField label="Horario" hint="Si no elegís otro, se usa el horario que la persona tiene asignado para ese día."><select value={templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">El que tiene asignado</option>{siteTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></FormField>
        {singleError && <div className="field-wide"><PageMessage kind="error">{singleError}</PageMessage></div>}
        {singleNotice && <div className="field-wide"><PageMessage kind="success">{singleNotice}</PageMessage></div>}
        <div className="field-wide"><button className="button button-primary" disabled={busy || loading || !singleDate || !employeeId}>{busy ? 'Guardando…' : 'Cargar este día'}</button></div>
      </form>
    </details></section>
  </>
}
