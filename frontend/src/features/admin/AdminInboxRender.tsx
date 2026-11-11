// The inbox (Bandeja de desvíos) render: filters, the list of deviations and the correction form, with its types and local helpers.
import { type ReactNode } from 'react'
import { Empty, FormField, LoadFailure, Loading, PageMessage, Panel } from '../../app/ui'
import type { Deviation, Employee, Site } from '../../shared/api/types'
import { formatLocalDate } from '../../shared/format'
import { adminCategoryName as categoryName, adminDeviationName as deviationName, adminDeviationStatusName as statusName, adminMarkName as actionName } from '../../shared/labels'
import { dateTime } from './adminRenderShared'

export type DeviationClassification = 'JUSTIFICADO' | 'NO_JUSTIFICADO'

export type InboxFilterValues = { employeeId: string; siteId: string; from: string; to: string }
export const EMPTY_INBOX_FILTERS: InboxFilterValues = { employeeId: '', siteId: '', from: '', to: '' }

type Correction = { deviationId: string; classification: DeviationClassification } | null

/** "Filtros: Lucía Pérez · Local Centro · desde 1 nov 2026": the filters in force, for the folded filter line on phones. */
function inboxFilterSummary(applied: InboxFilterValues, employees: Employee[], sites: Site[]): string {
  const parts = [
    applied.employeeId && (employees.find((person) => person.id === applied.employeeId)?.displayName ?? 'Un empleado'),
    applied.siteId && (sites.find((site) => site.id === applied.siteId)?.name ?? 'Un local'),
    applied.from && `desde ${formatLocalDate(applied.from)}`,
    applied.to && `hasta ${formatLocalDate(applied.to)}`
  ].filter(Boolean)
  return `Filtros: ${parts.length ? parts.join(' · ') : 'todos'}`
}

export function AdminInboxRender({ narrow = false, appliedFilters = EMPTY_INBOX_FILTERS, coverage, onOpenJornada, items, employees, sites, filters, filterError, filtered, onFiltersChange, onApplyFilters, onClearFilters, timeZones, nextCursor, loading, inboxLoadError, timeZoneLoadError, error, notice, busy, correction, correctionReason, targetDeviation, onReload, onClassify, onRetry, onLoadMore, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  /** Phone width: the filters fold under one line that says which ones are applied, so the first case is in sight. */
  narrow?: boolean; appliedFilters?: InboxFilterValues
  /** The notice of days loaded (CoverageNotice) and the way to a deviation's jornada, both given by AdminApp. */
  coverage?: ReactNode; onOpenJornada?: (item: Deviation) => void
  items: Deviation[]; employees: Employee[]; sites: Site[]; filters: InboxFilterValues; filterError: string; filtered: boolean
  onFiltersChange: (patch: Partial<InboxFilterValues>) => void; onApplyFilters: () => void; onClearFilters: () => void
  timeZones: Map<string, string>; nextCursor: string | null; loading: boolean; inboxLoadError: string; timeZoneLoadError: string
  error: string; notice: string; busy: string; correction: Correction; correctionReason: string; targetDeviation: string
  onReload: () => void; onClassify: (item: Deviation, classification: DeviationClassification) => void; onRetry: () => void; onLoadMore: () => void
  onCorrectionReasonChange: (reason: string) => void; onSubmitCorrection: (item: Deviation) => void; onCancelCorrection: () => void
}) {
  const filterForm = <form className="filter-bar" aria-label="Filtros de los casos" noValidate onSubmit={(event) => { event.preventDefault(); onApplyFilters() }}>
    <FormField label="Empleado"><select value={filters.employeeId} onChange={(event) => onFiltersChange({ employeeId: event.target.value })}><option value="">Todos</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></FormField>
    <FormField label="Local"><select value={filters.siteId} onChange={(event) => onFiltersChange({ siteId: event.target.value })}><option value="">Todos</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField>
    <FormField label="Desde"><input type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} /></FormField>
    <FormField label="Hasta"><input type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} /></FormField>
    <div className="button-row filter-actions"><button className="button button-primary" disabled={loading}>Aplicar</button><button type="button" className="button button-quiet" disabled={loading} onClick={onClearFilters}>Limpiar</button></div>
    {filterError && <div className="filter-error"><PageMessage kind="error">{filterError}</PageMessage></div>}
  </form>
  return <>
    <div className="page-title-row"><div><p className="eyebrow">CENTRO DE CONTROL</p><h1>Para revisar</h1><p className="muted">Revisá motivos y resolvé cada caso. Los avisos no incluyen datos privados.</p></div><button className="button button-quiet" disabled={loading} onClick={onReload}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    {timeZoneLoadError && <PageMessage kind="error">No se pudieron cargar las zonas horarias de los locales: {timeZoneLoadError} Las horas se muestran en la zona horaria de este dispositivo.</PageMessage>}
    {targetDeviation && items.some((item) => item.id === targetDeviation) && <PageMessage kind="success">Abriste el caso indicado por el aviso.</PageMessage>}
    {coverage}
    {narrow ? <details className="fold filter-fold"><summary>{inboxFilterSummary(appliedFilters, employees, sites)}</summary>{filterForm}</details> : filterForm}
    <Panel title="Casos recientes">{inboxLoadError ? <LoadFailure message={inboxLoadError} onRetry={onRetry} /> : <>
      <DeviationList items={items} onOpenJornada={onOpenJornada} filtered={filtered} loading={loading} busy={busy} onClassify={onClassify} targetId={targetDeviation} timeZones={timeZones}
        correction={correction} correctionReason={correctionReason} onCorrectionReasonChange={onCorrectionReasonChange}
        onSubmitCorrection={onSubmitCorrection} onCancelCorrection={onCancelCorrection} />
      {nextCursor && <div className="load-more"><button className="button button-quiet" disabled={busy === 'page'} onClick={onLoadMore}>{busy === 'page' ? 'Cargando…' : 'Cargar anteriores'}</button></div>}
    </>}
    </Panel>
  </>
}

function DeviationList({ items, onOpenJornada, filtered, loading, busy, onClassify, targetId, timeZones, correction, correctionReason, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  items: Deviation[]; onOpenJornada?: (item: Deviation) => void; filtered: boolean; loading: boolean; busy: string; onClassify: (item: Deviation, classification: DeviationClassification) => void
  targetId: string; timeZones: Map<string, string>; correction: Correction; correctionReason: string
  onCorrectionReasonChange: (reason: string) => void; onSubmitCorrection: (item: Deviation) => void; onCancelCorrection: () => void
}) {
  if (loading) return <Loading label="Cargando casos…" />
  if (!items.length) return <Empty>{filtered ? 'Ningún caso coincide con los filtros aplicados.' : 'No hay casos para mostrar.'}</Empty>
  return <div className="deviation-list">{items.map((item) => <article className={`deviation-card ${targetId === item.id ? 'deviation-target' : ''}`} key={item.id} id={`deviation-${item.id}`}>
    <div className="deviation-symbol" aria-hidden="true">{item.type === 'SIN_INGRESO' ? '!' : '↗'}</div>
    <div className="deviation-main"><div className="deviation-title"><strong>{deviationName(item.type)}</strong><span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span></div>
      <p>{item.employeeDisplayName?.trim() || 'Registro del día de trabajo'} · {dateTime(item.occurredAt ?? item.createdAt, item.siteId ? timeZones.get(item.siteId) : undefined)}</p>
      {item.sourceMarkAction && <p className="muted small-copy">Marca: {actionName(item.sourceMarkAction)}</p>}
      {item.category && <p className="reason-line"><b>Motivo:</b> {categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
    </div>
    <div className="deviation-actions">
      {onOpenJornada && <button type="button" className="button button-small button-quiet" aria-label={`Ver el día de ${item.employeeDisplayName?.trim() || 'la persona'}`} onClick={() => onOpenJornada(item)}>Ver el día</button>}
      {item.status === 'JUSTIFICADO' ? <button className="button button-small button-danger-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'NO_JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'Corregir a no justificado'}</button> :
        item.status === 'NO_JUSTIFICADO' ? <button className="button button-small button-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'Corregir a justificado'}</button> : <>
          <button className="button button-small button-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'Justificado'}</button>
          <button className="button button-small button-danger-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'NO_JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'No justificado'}</button>
        </>}
      {correction?.deviationId === item.id && <form className="form-stack correction-form" onSubmit={(event) => { event.preventDefault(); onSubmitCorrection(item) }}>
        <FormField label="Motivo de corrección"><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-primary" disabled={busy === item.id || !correctionReason.trim()}>{busy === item.id ? 'Guardando…' : 'Guardar corrección'}</button><button type="button" className="button button-small button-quiet" disabled={busy === item.id} onClick={onCancelCorrection}>Cancelar</button></div>
      </form>}
    </div>
  </article>)}</div>
}
