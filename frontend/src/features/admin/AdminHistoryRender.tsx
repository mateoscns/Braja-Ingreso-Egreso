// The history search (Historial) render: filters and the days found, with their marks and deviations.
import { Empty, FormField, LoadFailure, Loading, PageHeading, PageMessage, Panel } from '../../app/ui'
import type { Employee, JornadaSummary, Site } from '../../shared/api/types'
import { formatLocalDate } from '../../shared/format'
import { adminCategoryName as categoryName, adminDeviationName as deviationName, adminDeviationStatusName as statusName, adminMarkLocationName as locationName, adminMarkName as actionName } from '../../shared/labels'
import { dateTime, stateLabel } from './adminRenderShared'

export type HistoryFilterValues = { employeeId: string; siteId: string; from: string; to: string }

export function AdminHistoryRender({ employees, sites, loadingOptions, optionsError, filters, filterError, rows, loading, error, onFiltersChange, onSearch, onRetryOptions }: {
  employees: Employee[]; sites: Site[]; loadingOptions: boolean; optionsError: string; filters: HistoryFilterValues; filterError: string
  rows: JornadaSummary[] | null; loading: boolean; error: string
  onFiltersChange: (patch: Partial<HistoryFilterValues>) => void; onSearch: () => void; onRetryOptions: () => void
}) {
  const siteById = new Map(sites.map((site) => [site.id, site]))
  const nameById = new Map(employees.map((person) => [person.id, person.displayName]))
  return <>
    <PageHeading eyebrow="CONSULTA" title="Historial" subtitle="Jornadas, marcas y desvíos de un empleado o una sede en un rango de fechas." />
    {optionsError && <div className="form-stack"><PageMessage kind="error">{optionsError}</PageMessage><button type="button" className="button button-quiet" disabled={loadingOptions} onClick={onRetryOptions}>Reintentar datos</button></div>}
    <form className="filter-bar" aria-label="Filtros del historial" noValidate onSubmit={(event) => { event.preventDefault(); onSearch() }}>
      <FormField label="Empleado"><select value={filters.employeeId} disabled={loadingOptions} onChange={(event) => onFiltersChange({ employeeId: event.target.value })}><option value="">Todos</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></FormField>
      <FormField label="Sede"><select value={filters.siteId} disabled={loadingOptions} onChange={(event) => onFiltersChange({ siteId: event.target.value })}><option value="">Todas</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField>
      <FormField label="Desde"><input type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} /></FormField>
      <FormField label="Hasta"><input type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} /></FormField>
      <div className="button-row filter-actions"><button className="button button-primary" disabled={loading || loadingOptions}>{loading ? 'Buscando…' : 'Buscar'}</button></div>
      {filterError && <div className="filter-error"><PageMessage kind="error">{filterError}</PageMessage></div>}
    </form>
    <Panel title={rows && !loading && !error ? `Jornadas encontradas (${rows.length})` : 'Jornadas encontradas'}>
      {loading ? <Loading label="Consultando el historial…" /> : error ? <LoadFailure message={error} onRetry={onSearch} /> : rows === null ? <Empty>Elegí un empleado o una sede y un rango de fechas, y tocá Buscar.</Empty> : rows.length === 0 ? <Empty>No hay jornadas para esos filtros en el rango elegido.</Empty> : <div className="history-list">{rows.map((row) => {
        const timeZone = siteById.get(row.siteId)?.timeZone
        const person = row.employeeDisplayName?.trim() || nameById.get(row.employeeId) || 'Empleado'
        const marks = row.marks ?? []
        const deviations = row.deviations ?? []
        return <article className="history-card" key={row.id} aria-label={`Jornada del ${formatLocalDate(row.localDate)} de ${person}`}>
          <div className="history-head"><strong>{formatLocalDate(row.localDate)}</strong><span>{person}</span><span className="muted">{siteById.get(row.siteId)?.name ?? 'Sede'}</span><span className={`status-chip status-${row.state.toLowerCase()}`}>{stateLabel(row.state)}</span></div>
          {marks.length ? <ul className="history-items" aria-label="Marcas">{marks.map((mark) => <li key={mark.id} className={mark.voided ? 'mark-voided' : undefined}><strong>{mark.voided ? <s>{actionName(mark.action)}</s> : actionName(mark.action)}</strong><span>{dateTime(mark.occurredAt ?? mark.acceptedAt, timeZone)}</span><small>{mark.voided ? `Anulada${mark.voidReason ? ` · ${mark.voidReason}` : ''}` : locationName(mark.locationStatus)}</small></li>)}</ul> : <p className="muted small-copy">Sin marcas.</p>}
          {deviations.length ? <ul className="history-items history-deviations" aria-label="Desvíos">{deviations.map((item) => <li key={item.id}><strong>{deviationName(item.type)}</strong><span>{dateTime(item.occurredAt ?? item.createdAt, timeZone)}</span>{item.sourceMarkAction && <small>Marca: {actionName(item.sourceMarkAction)}</small>}<span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span>{item.category && <small>{categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</small>}</li>)}</ul> : <p className="muted small-copy">Sin desvíos.</p>}
        </article>
      })}</div>}
    </Panel>
  </>
}
