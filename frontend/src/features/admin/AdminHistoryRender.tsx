// The search of earlier days render, a fold of «Hoy» (it was the «Historial» page): the filters and the days found, with their
// marks and cases; «Ver marcas» opens a day in the detail of «Hoy».
import { Empty, FormField, LoadFailure, Loading, PageMessage, Panel } from '../../app/ui'
import type { Employee, JornadaSummary, Site } from '../../shared/api/types'
import { formatLocalDate } from '../../shared/format'
import { adminCategoryName as categoryName, adminDeviationName as deviationName, adminDeviationStatusName as statusName, adminMarkLocationName as locationName, adminMarkName as actionName } from '../../shared/labels'
import { dateTime, stateLabel } from './adminRenderShared'

export type HistoryFilterValues = { employeeId: string; siteId: string; from: string; to: string }

export function AdminHistoryRender({ open, onOpenChange, employees, sites, loadingOptions, filters, filterError, rows, loading, error, opening, onFiltersChange, onSearch, onOpenDay }: {
  /** The fold is open; onOpenChange follows the owner opening or closing it. */
  open: boolean; onOpenChange: (open: boolean) => void
  employees: Employee[]; sites: Site[]; loadingOptions: boolean; filters: HistoryFilterValues; filterError: string
  rows: JornadaSummary[] | null; loading: boolean; error: string
  /** A day is being read for the detail: «Ver marcas» waits. */
  opening: boolean
  onFiltersChange: (patch: Partial<HistoryFilterValues>) => void; onSearch: () => void; onOpenDay: (jornadaId: string) => void
}) {
  const siteById = new Map(sites.map((site) => [site.id, site]))
  const nameById = new Map(employees.map((person) => [person.id, person.displayName]))
  // A fold like the single day of «Días de trabajo»: the list of the date stays the first thing on «Hoy».
  return <section className="panel" aria-labelledby="day-search-title"><details className="fold" open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
    <summary><h2 id="day-search-title">Buscar días anteriores</h2></summary>
    <p className="muted">Días de trabajo, marcas y casos de un empleado o un local en un rango de fechas.</p>
    <form className="filter-bar" aria-label="Filtros del historial" noValidate onSubmit={(event) => { event.preventDefault(); onSearch() }}>
      <FormField label="Empleado"><select value={filters.employeeId} disabled={loadingOptions} onChange={(event) => onFiltersChange({ employeeId: event.target.value })}><option value="">Todos</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></FormField>
      <FormField label="Local"><select value={filters.siteId} disabled={loadingOptions} onChange={(event) => onFiltersChange({ siteId: event.target.value })}><option value="">Todos</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField>
      <FormField label="Desde"><input type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} /></FormField>
      <FormField label="Hasta"><input type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} /></FormField>
      <div className="button-row filter-actions"><button className="button button-primary" disabled={loading || loadingOptions}>{loading ? 'Buscando…' : 'Buscar'}</button></div>
      {filterError && <div className="filter-error"><PageMessage kind="error">{filterError}</PageMessage></div>}
    </form>
    <Panel title={rows && !loading && !error ? `Días encontrados (${rows.length})` : 'Días encontrados'}>
      {loading ? <Loading label="Consultando el historial…" /> : error ? <LoadFailure message={error} onRetry={onSearch} /> : rows === null ? <Empty>Elegí un empleado o un local y un rango de fechas, y tocá Buscar.</Empty> : rows.length === 0 ? <Empty>No hay días de trabajo para esos filtros en el rango elegido.</Empty> : <div className="history-list">{rows.map((row) => {
        const timeZone = siteById.get(row.siteId)?.timeZone
        const person = row.employeeDisplayName?.trim() || nameById.get(row.employeeId) || 'Empleado'
        const marks = row.marks ?? []
        const deviations = row.deviations ?? []
        return <article className="history-card" key={row.id} aria-label={`Día de trabajo del ${formatLocalDate(row.localDate)} de ${person}`}>
          <div className="history-head"><strong>{formatLocalDate(row.localDate)}</strong><span>{person}</span><span className="muted">{siteById.get(row.siteId)?.name ?? 'Local'}</span><span className={`status-chip status-${row.state.toLowerCase()}`}>{stateLabel(row.state)}</span></div>
          {marks.length ? <ul className="history-items" aria-label="Marcas">{marks.map((mark) => <li key={mark.id} className={mark.voided ? 'mark-voided' : undefined}><strong>{mark.voided ? <s>{actionName(mark.action)}</s> : actionName(mark.action)}</strong><span>{dateTime(mark.occurredAt ?? mark.acceptedAt, timeZone)}</span><small>{mark.voided ? `Anulada${mark.voidReason ? ` · ${mark.voidReason}` : ''}` : locationName(mark.locationStatus)}</small></li>)}</ul> : <p className="muted small-copy">Sin marcas.</p>}
          {deviations.length ? <ul className="history-items history-deviations" aria-label="Casos">{deviations.map((item) => <li key={item.id}><strong>{deviationName(item.type)}</strong><span>{dateTime(item.occurredAt ?? item.createdAt, timeZone)}</span>{item.sourceMarkAction && <small>Marca: {actionName(item.sourceMarkAction)}</small>}<span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span>{item.category && <small>{categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</small>}</li>)}</ul> : <p className="muted small-copy">Sin casos.</p>}
          {/* The same detail as a day of the list: its marks and the actions on them. */}
          <button className="button button-small button-quiet" aria-label={`Ver marcas de ${person} del ${formatLocalDate(row.localDate)}`} disabled={opening} onClick={() => onOpenDay(row.id)}>Ver marcas</button>
        </article>
      })}</div>}
    </Panel>
  </details></section>
}
