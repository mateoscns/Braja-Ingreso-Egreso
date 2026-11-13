// The inbox (Bandeja de desvíos) render: filters, the list of deviations and the correction form, with its types and local helpers.
// Each case is a row of a list (design system 4.11): the person first (the owner, 2026-11-11: "Persona primero"), then the case
// with its tag, when and the motive, then the decision.
import { type ReactNode } from 'react'
import { Icon, type IconName } from '../../app/icons'
import { Empty, FormField, LoadFailure, Loading, PageMessage, Panel, StatusTag, type StatusTone } from '../../app/ui'
import type { FieldErrors } from '../../app/useFieldErrors'
import type { Deviation, Employee, Site } from '../../shared/api/types'
import { describeDeviation } from '../../shared/deviationFacts'
import { formatLocalDate } from '../../shared/format'
import { adminCategoryName as categoryName, adminDeviationName as deviationName, adminDeviationStatusName as statusName, adminMarkName as actionName } from '../../shared/labels'
import { dateTime } from './adminRenderShared'

export type DeviationClassification = 'JUSTIFICADO' | 'NO_JUSTIFICADO'

export type InboxFilterValues = { employeeId: string; siteId: string; from: string; to: string }
export const EMPTY_INBOX_FILTERS: InboxFilterValues = { employeeId: '', siteId: '', from: '', to: '' }
/** The filter form, where the focus goes when its dates are wrong. */
export const INBOX_FILTERS_ID = 'inbox-filters'

type Correction = { deviationId: string; classification: DeviationClassification } | null
/** A decision the server refused: its message goes inside the row of that case, not at the top of the page. */
export type FailedDecision = { deviationId: string; message: string } | null
/** The case whose decision was just saved: the row says what it was saved as (T12; it was a line at the top of the section). */
export type SavedDecision = { deviationId: string } | null

/**
 * One line over the cases: how many wait for the ADMIN (a motive to decide on) and how many for the employee (no motive yet),
 * counted from the cases loaded. While more can be loaded the line says it counts this list, so it never claims a total (T12).
 */
export function caseCount(items: Deviation[], more: boolean): string {
  const toDecide = items.filter((item) => item.status === 'PENDIENTE_REVISION').length
  const waiting = items.filter((item) => item.status === 'MOTIVO_PENDIENTE').length
  const line = `${toDecide} para decidir · ${waiting} ${waiting === 1 ? 'espera' : 'esperan'} explicación`
  return more ? `En esta lista: ${line}` : line
}

/** The row of a case, which takes the focus when a notification opens it; the container moves the focus by these ids. */
export const caseRowId = (deviationId: string) => `deviation-${deviationId}`
/** The «Corregir a …» button of a decided case: it opens the correction form and gets the focus back when it closes. */
export const caseCorrectButtonId = (deviationId: string) => `deviation-${deviationId}-correct`
export const caseCorrectionFormId = (deviationId: string) => `deviation-${deviationId}-correction`

// The tag and the state bar of a case say whose turn it is. For the ADMIN a missing motive waits for the employee (wait) and a
// motive to review waits for him (todo): the opposite tone of the employee's screen, with the same icons (design system 4.10).
const CASE_TAGS: Record<Deviation['status'], { tone: StatusTone; icon: IconName }> = {
  MOTIVO_PENDIENTE: { tone: 'wait', icon: 'bubble' }, PENDIENTE_REVISION: { tone: 'todo', icon: 'eye' },
  JUSTIFICADO: { tone: 'ok', icon: 'check' }, NO_JUSTIFICADO: { tone: 'bad', icon: 'x' }
}

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

export function AdminInboxRender({ narrow = false, appliedFilters = EMPTY_INBOX_FILTERS, coverage, onOpenJornada, items, employees, sites, filters, filterErrors = {}, filtered, onFiltersChange, onApplyFilters, onClearFilters, timeZones, nextCursor, loading, inboxLoadError, timeZoneLoadError, error, savedDecision = null, busy, savingAs = null, correction, correctionReason, correctionError, targetDeviation, failedDecision = null, onReload, onClassify, onRetry, onLoadMore, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  /** Phone width: the filters fold under one line that says which ones are applied, so the first case is in sight. */
  narrow?: boolean; appliedFilters?: InboxFilterValues
  /** The notice of days loaded (CoverageNotice) and the way to a deviation's jornada, both given by AdminApp. */
  coverage?: ReactNode; onOpenJornada?: (item: Deviation) => void
  items: Deviation[]; employees: Employee[]; sites: Site[]; filters: InboxFilterValues; filtered: boolean
  /** A wrong range of dates, under the date to change (dateRangeErrors). */
  filterErrors?: FieldErrors<'from' | 'to'>
  /** The reason of a correction sent empty. */
  correctionError?: string
  onFiltersChange: (patch: Partial<InboxFilterValues>) => void; onApplyFilters: () => void; onClearFilters: () => void
  timeZones: Map<string, string>; nextCursor: string | null; loading: boolean; inboxLoadError: string; timeZoneLoadError: string
  error: string; busy: string; correction: Correction; correctionReason: string; targetDeviation: string; failedDecision?: FailedDecision
  savedDecision?: SavedDecision
  /** The decision being saved, so only its button reads «Guardando…» (issue #177: both did). */
  savingAs?: DeviationClassification | null
  onReload: () => void; onClassify: (item: Deviation, classification: DeviationClassification) => void; onRetry: () => void; onLoadMore: () => void
  onCorrectionReasonChange: (reason: string) => void; onSubmitCorrection: (item: Deviation) => void; onCancelCorrection: () => void
}) {
  const filterForm = <form id={INBOX_FILTERS_ID} className="filter-bar" aria-label="Filtros de los casos" noValidate onSubmit={(event) => { event.preventDefault(); onApplyFilters() }}>
    <FormField label="Empleado"><select value={filters.employeeId} onChange={(event) => onFiltersChange({ employeeId: event.target.value })}><option value="">Todos</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></FormField>
    <FormField label="Local"><select value={filters.siteId} onChange={(event) => onFiltersChange({ siteId: event.target.value })}><option value="">Todos</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField>
    <FormField label="Desde" error={filterErrors.from}><input type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} /></FormField>
    <FormField label="Hasta" error={filterErrors.to}><input type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} /></FormField>
    <div className="button-row"><button className="button button-primary" disabled={loading}>Aplicar</button><button type="button" className="button button-secondary" disabled={loading} onClick={onClearFilters}>Limpiar</button></div>
  </form>
  return <>
    <div className="page-title-row"><div><h1 tabIndex={-1}>Para revisar</h1><p className="muted">Llegadas tarde, salidas antes, pausas largas y marcas fuera del local. Leé qué pasó y decidí si está justificado.</p></div><button className="button button-secondary" disabled={loading} onClick={onReload}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {timeZoneLoadError && <PageMessage kind="error">No se pudieron cargar las zonas horarias de los locales: {timeZoneLoadError} Las horas se muestran en la zona horaria de este dispositivo.</PageMessage>}
    {targetDeviation && items.some((item) => item.id === targetDeviation) && <PageMessage kind="success">Abriste el caso indicado por el aviso.</PageMessage>}
    {coverage}
    {narrow ? <details className="fold filter-fold"><summary>{inboxFilterSummary(appliedFilters, employees, sites)}</summary>{filterForm}</details> : filterForm}
    <Panel title="Casos recientes">{inboxLoadError ? <LoadFailure message={inboxLoadError} onRetry={onRetry} /> : <>
      {!loading && items.length > 0 && <p className="muted">{caseCount(items, Boolean(nextCursor))}</p>}
      <DeviationList items={items} onOpenJornada={onOpenJornada} filtered={filtered} loading={loading} busy={busy} savingAs={savingAs} onClassify={onClassify} targetId={targetDeviation} timeZones={timeZones}
        correction={correction} correctionReason={correctionReason} correctionError={correctionError} failedDecision={failedDecision} savedDecision={savedDecision} onCorrectionReasonChange={onCorrectionReasonChange}
        onSubmitCorrection={onSubmitCorrection} onCancelCorrection={onCancelCorrection} />
      {nextCursor && <div className="button-row case-more"><button className="button button-secondary" disabled={busy === 'page'} onClick={onLoadMore}>{busy === 'page' ? 'Cargando…' : 'Cargar anteriores'}</button></div>}
    </>}
    </Panel>
  </>
}

function DeviationList({ items, onOpenJornada, filtered, loading, busy, savingAs, onClassify, targetId, timeZones, correction, correctionReason, correctionError, failedDecision, savedDecision, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  items: Deviation[]; onOpenJornada?: (item: Deviation) => void; filtered: boolean; loading: boolean; busy: string; savingAs: DeviationClassification | null; onClassify: (item: Deviation, classification: DeviationClassification) => void
  targetId: string; timeZones: Map<string, string>; correction: Correction; correctionReason: string; correctionError?: string; failedDecision: FailedDecision; savedDecision: SavedDecision
  onCorrectionReasonChange: (reason: string) => void; onSubmitCorrection: (item: Deviation) => void; onCancelCorrection: () => void
}) {
  if (loading) return <Loading label="Cargando casos…" />
  if (!items.length) return <Empty>{filtered ? 'Ningún caso coincide con los filtros aplicados.' : 'No hay casos para mostrar.'}</Empty>
  return <ul className="case-list">{items.map((item) => {
    const named = item.employeeDisplayName?.trim()
    const tag = CASE_TAGS[item.status] ?? CASE_TAGS.MOTIVO_PENDIENTE
    const saving = busy === item.id
    const occurredAt = item.occurredAt ?? item.createdAt
    const timeZone = item.siteId ? timeZones.get(item.siteId) : undefined
    const correcting = correction?.deviationId === item.id
    const failure = failedDecision?.deviationId === item.id ? <PageMessage kind="error">{failedDecision.message}</PageMessage> : null
    const decided = item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO'
    const saved = savedDecision?.deviationId === item.id && decided ? <PageMessage kind="success">{`Guardado: ${statusName(item.status)}.`}</PageMessage> : null
    // Nothing in a row at rest is filled: the two decisions weigh the same, and the only filled button is the save of an open form.
    const decide = (classification: DeviationClassification, label: string, icon?: IconName, id?: string) =>
      <button type="button" id={id} className="button button-secondary" disabled={saving} onClick={() => onClassify(item, classification)}>{saving && savingAs === classification ? 'Guardando…' : <>{icon && <Icon name={icon} />}{label}</>}</button>
    const target = targetId === item.id
    // tabIndex -1 on the case a notification opened: it takes the focus once, by script (design system 4.11).
    return <li className={`case case-${tag.tone}${target ? ' case-target' : ''}`} key={item.id} id={caseRowId(item.id)} tabIndex={target ? -1 : undefined} aria-labelledby={`deviation-${item.id}-person`}>
      <div className="case-body">
        <div className="case-head">
          <p className="case-person" id={`deviation-${item.id}-person`}>{named || 'Registro del día de trabajo'}</p>
          {onOpenJornada && <button type="button" className="button button-link" aria-label={`Ver el día de ${named || 'la persona'}`} onClick={() => onOpenJornada(item)}>Ver el día</button>}
        </div>
        <p className="case-title"><strong>{deviationName(item.type)}</strong><StatusTag {...tag}>{statusName(item.status)}</StatusTag></p>
        {/* What happened, in the third person (issue #177). The inbox loads no day of work, so the sentence uses the time of the
            fact, as the employee's does when their day is not loaded. */}
        <p className="motive-fact">{describeDeviation(item, undefined, timeZone, 'admin')}</p>
        <p className="record-meta"><time dateTime={occurredAt}>{dateTime(occurredAt, timeZone)}</time>{item.sourceMarkAction && <span>Marca: {actionName(item.sourceMarkAction)}</span>}</p>
        {item.category && <p className="motive-said"><b>Motivo:</b> {categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
        {/* D-20261027-02: decided before the explanation arrives, the case goes back to review when it does. */}
        {item.status === 'MOTIVO_PENDIENTE' && <p className="muted">Todavía puede explicarlo; si lo hace, vuelve a revisión.</p>}
      </div>
      <div className="case-actions">
        {item.status === 'JUSTIFICADO' ? decide('NO_JUSTIFICADO', 'Corregir a no justificado', undefined, caseCorrectButtonId(item.id)) :
          item.status === 'NO_JUSTIFICADO' ? decide('JUSTIFICADO', 'Corregir a justificado', undefined, caseCorrectButtonId(item.id)) :
            <div className="button-pair" role="group" aria-label={`Decidir el caso de ${named || 'la persona'}`}>{decide('JUSTIFICADO', 'Justificado', 'check')}{decide('NO_JUSTIFICADO', 'No justificado', 'x')}</div>}
      </div>
      {correcting && <form id={caseCorrectionFormId(item.id)} className="inline-form" noValidate onSubmit={(event) => { event.preventDefault(); onSubmitCorrection(item) }}>
        <FormField label="Motivo de corrección" error={correctionError}><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
        {failure}
        <div className="button-row"><button className="button button-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar corrección'}</button><button type="button" className="button button-link" disabled={saving} onClick={onCancelCorrection}>Cancelar</button></div>
      </form>}
      {!correcting && failure}
      {!correcting && saved}
    </li>
  })}</ul>
}
