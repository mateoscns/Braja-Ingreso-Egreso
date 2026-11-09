import { type FormEvent, type ReactNode } from 'react'
import { Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import type { Deviation, Employee, Jornada, JornadaAudit, JornadaAuditEntry, JornadaSummary, Mark, MarkAction, Site, SiteCoordinates, Template } from '../../shared/api/types'
import { formatDateTime, formatLocalDate, jornadaStateLabel } from '../../shared/format'
import type { SiteLocationErrorKind } from './siteLocation'
import type { GeocodeResult } from '../../shared/api/geocode'
import { SiteMapPanel, type SiteMapPanelState } from './SiteMapPanel'
import { mapRadiusMeters } from './siteMap'
import { SiteZoneField } from './SiteZoneField'
import { timeZoneLabel } from './siteZone'

const stateLabel = jornadaStateLabel
/** The geofence radius in the owner's words (D-20261109-01): how far from the site's point a mark still counts as on site. */
const RADIUS_LABEL = 'Distancia permitida para marcar (metros)'
/** L30: cancel and void reasons are kept as free-text audit, so the form warns against health data. */
const HEALTH_DATA_HINT = 'No escribas datos de salud; alcanza con «Licencia».'

export type DeviationClassification = 'JUSTIFICADO' | 'NO_JUSTIFICADO'
export type JourneyRow = Pick<Jornada, 'id' | 'employeeId' | 'siteId' | 'localDate' | 'state'>
export type SiteLocationEditDraft = {
  siteId: string; latitude: string; longitude: string; geofenceRadiusMeters: string
  locationStatus: 'idle' | 'loading' | 'selected' | 'error'; locationMessage: string; locationErrorKind: SiteLocationErrorKind | null
  locationAccuracyMeters: number | null; locationConfirmed: boolean; locationSource: 'CAPTURED' | 'MANUAL' | null
  /** A MANUAL point that was picked on the map (it is saved as MANUAL; only the hint differs). */
  locationFromMap?: boolean
}
export type SiteMapTarget = { kind: 'create' } | { kind: 'edit'; siteId: string }
export type SiteMapState = SiteMapPanelState & { target: SiteMapTarget }
export type SiteLocationAuditEntry = {
  id: string; changedAt: string; actorDisplayName: string | null
  beforeLatitude: number | null; beforeLongitude: number | null; afterLatitude: number | null; afterLongitude: number | null
  beforeRadiusMeters: number | null; afterRadiusMeters: number | null; locationSource?: 'CAPTURED' | 'MANUAL' | null
}
export type SiteLocationAuditResponse = { entries: SiteLocationAuditEntry[] }

export type InboxFilterValues = { employeeId: string; siteId: string; from: string; to: string }
export const EMPTY_INBOX_FILTERS: InboxFilterValues = { employeeId: '', siteId: '', from: '', to: '' }

type Correction = { deviationId: string; classification: DeviationClassification } | null

function journeysTitle(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Jornadas'
  const parsedDate = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return 'Jornadas'
  const formattedDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'UTC' }).format(parsedDate)
  return `Jornadas del ${formattedDate}`
}

/** "Filtros: Lucía Pérez · Local Centro · desde 1 nov 2026": the filters in force, for the folded filter line on phones. */
function inboxFilterSummary(applied: InboxFilterValues, employees: Employee[], sites: Site[]): string {
  const parts = [
    applied.employeeId && (employees.find((person) => person.id === applied.employeeId)?.displayName ?? 'Un empleado'),
    applied.siteId && (sites.find((site) => site.id === applied.siteId)?.name ?? 'Una sede'),
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
  const filterForm = <form className="filter-bar" aria-label="Filtros de la bandeja" noValidate onSubmit={(event) => { event.preventDefault(); onApplyFilters() }}>
    <FormField label="Empleado"><select value={filters.employeeId} onChange={(event) => onFiltersChange({ employeeId: event.target.value })}><option value="">Todos</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></FormField>
    <FormField label="Sede"><select value={filters.siteId} onChange={(event) => onFiltersChange({ siteId: event.target.value })}><option value="">Todas</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField>
    <FormField label="Desde"><input type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} /></FormField>
    <FormField label="Hasta"><input type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} /></FormField>
    <div className="button-row filter-actions"><button className="button button-primary" disabled={loading}>Aplicar</button><button type="button" className="button button-quiet" disabled={loading} onClick={onClearFilters}>Limpiar</button></div>
    {filterError && <div className="filter-error"><PageMessage kind="error">{filterError}</PageMessage></div>}
  </form>
  return <>
    <div className="page-title-row"><div><p className="eyebrow">CENTRO DE CONTROL</p><h1>Bandeja de desvíos</h1><p className="muted">Revisá motivos y resolvé cada caso. Las notificaciones no incluyen datos privados.</p></div><button className="button button-quiet" disabled={loading} onClick={onReload}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    {timeZoneLoadError && <PageMessage kind="error">No se pudieron cargar las zonas horarias de las sedes: {timeZoneLoadError} Las horas se muestran en la zona horaria de este dispositivo.</PageMessage>}
    {targetDeviation && items.some((item) => item.id === targetDeviation) && <PageMessage kind="success">Abriste el desvío indicado por la notificación.</PageMessage>}
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
  if (loading) return <Loading label="Cargando desvíos…" />
  if (!items.length) return <Empty>{filtered ? 'Ningún desvío coincide con los filtros aplicados.' : 'No hay desvíos para mostrar.'}</Empty>
  return <div className="deviation-list">{items.map((item) => <article className={`deviation-card ${targetId === item.id ? 'deviation-target' : ''}`} key={item.id} id={`deviation-${item.id}`}>
    <div className="deviation-symbol" aria-hidden="true">{item.type === 'SIN_INGRESO' ? '!' : '↗'}</div>
    <div className="deviation-main"><div className="deviation-title"><strong>{deviationName(item.type)}</strong><span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span></div>
      <p>{item.employeeDisplayName?.trim() || 'Registro de jornada'} · {dateTime(item.occurredAt ?? item.createdAt, item.siteId ? timeZones.get(item.siteId) : undefined)}</p>
      {item.sourceMarkAction && <p className="muted small-copy">Marca: {actionName(item.sourceMarkAction)}</p>}
      {item.category && <p className="reason-line"><b>Motivo:</b> {categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
    </div>
    <div className="deviation-actions">
      {onOpenJornada && <button type="button" className="button button-small button-quiet" aria-label={`Ver jornada de ${item.employeeDisplayName?.trim() || 'la persona'}`} onClick={() => onOpenJornada(item)}>Ver jornada</button>}
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

export function SitesViewRender({ sites, loading, loadError, error, notice, name, timeZone, busy, locationStatus, locationMessage, locating, locationErrorKind = null, locationAccuracyMeters = null, locationConfirmed = false, createRadiusMeters = '100', createLatitude = '', createLongitude = '', createLocationSource = null, locationEdit = null, siteLocationAuditFor = '', siteLocationAudit = null, siteLocationAuditLoading = false, siteLocationAuditError = '', siteMap = null, createPointFromMap = false, onOpenMap = () => undefined, onCloseMap = () => undefined, onMapPick = () => undefined, onMapQueryChange = () => undefined, onMapSearch = () => undefined, onChooseMapResult = () => undefined, onConfirmMapPoint = () => undefined, onLocationConfirmedChange = () => undefined, onCancelLocationCapture = () => undefined, onCreateRadiusMetersChange = () => undefined, onCreateCoordinateChange = () => undefined, onBeginLocationEdit = () => undefined, onCancelLocationEdit = () => undefined, onLocationEditChange = () => undefined, onCaptureEditLocation = () => undefined, onClearEditLocation = () => undefined, onSaveLocationEdit = () => undefined, onToggleSiteLocationAudit = () => undefined, onRetrySiteLocationAudit = () => undefined, onReload, onSubmit, onNameChange, onTimeZoneChange, onCaptureLocation, onClearLocation }: {
  sites: Site[]; loading: boolean; loadError: string; error: string; notice: string; name: string; timeZone: string; busy: boolean
  siteLocation: SiteCoordinates | null; locationStatus: 'idle' | 'loading' | 'selected' | 'error'; locationMessage: string; locating: boolean
  locationErrorKind?: SiteLocationErrorKind | null; locationAccuracyMeters?: number | null; locationConfirmed?: boolean
  createRadiusMeters?: string; createLatitude?: string; createLongitude?: string; createLocationSource?: 'CAPTURED' | 'MANUAL' | null
  locationEdit?: SiteLocationEditDraft | null; siteLocationAuditFor?: string; siteLocationAudit?: SiteLocationAuditResponse | null
  siteLocationAuditLoading?: boolean; siteLocationAuditError?: string
  /** D-20261109-01: the open map picker, if any, and the form it belongs to; createPointFromMap labels a create point picked on it. */
  siteMap?: SiteMapState | null; createPointFromMap?: boolean
  onOpenMap?: (target: SiteMapTarget) => void; onCloseMap?: () => void; onMapPick?: (point: SiteCoordinates) => void
  onMapQueryChange?: (value: string) => void; onMapSearch?: () => void; onChooseMapResult?: (result: GeocodeResult) => void; onConfirmMapPoint?: () => void
  onLocationConfirmedChange?: (confirmed: boolean) => void; onCancelLocationCapture?: () => void; onCreateRadiusMetersChange?: (value: string) => void
  onCreateCoordinateChange?: (field: 'latitude' | 'longitude', value: string) => void
  onBeginLocationEdit?: (site: Site) => void; onCancelLocationEdit?: () => void; onLocationEditChange?: (patch: Partial<SiteLocationEditDraft>) => void
  onCaptureEditLocation?: (siteId: string) => void; onClearEditLocation?: () => void
  onSaveLocationEdit?: (event: FormEvent<HTMLFormElement>) => void; onToggleSiteLocationAudit?: (siteId: string) => void; onRetrySiteLocationAudit?: () => void
  onReload: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onNameChange: (value: string) => void; onTimeZoneChange: (value: string) => void
  onCaptureLocation: () => void; onClearLocation: () => void
}) {
  const createCoordinates = siteCoordinates(createLatitude, createLongitude)
  const editCoordinates = locationEdit ? siteCoordinates(locationEdit.latitude, locationEdit.longitude) : null
  const createMapOpen = siteMap?.target.kind === 'create'
  const editMapOpen = siteMap?.target.kind === 'edit' && siteMap.target.siteId === locationEdit?.siteId
  const mapCallbacks = { onPick: onMapPick, onQueryChange: onMapQueryChange, onSearch: onMapSearch, onChooseResult: onChooseMapResult, onConfirm: onConfirmMapPoint, onClose: onCloseMap }
  const locationErrorTitle = (kind: SiteLocationErrorKind | null) => kind === 'permission-denied' ? 'Permiso de ubicación' :
    kind === 'insecure-context' ? 'Conexión no segura' :
      kind === 'timeout' ? 'La ubicación tardó demasiado' :
        kind === 'unsupported' ? 'Geolocalización no disponible' :
          kind === 'precision-insufficient' ? 'Precisión insuficiente' :
            kind === 'invalid-position' ? 'Datos de ubicación inválidos' :
              kind === 'request-failed' ? 'No se pudo iniciar la captura' : 'No se pudo determinar la ubicación'
  return <>
    <PageHeading eyebrow="ORGANIZACIÓN" title="Sedes" subtitle="Cada sede define su zona horaria y sus horarios." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <div className="content-grid"><Panel title="Sedes registradas">{loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : sites.length ? <div className="simple-list">{sites.map((site) => <article key={site.id} className="form-stack">
      <div className="simple-row"><span className="row-avatar" aria-hidden="true">⌖</span><span><strong>{site.name}</strong><small>{`Hora de ${timeZoneLabel(site.timeZone)}`}</small><small>{typeof site.latitude === 'number' && typeof site.longitude === 'number' ? 'Ubicación cargada' : 'Sin ubicación cargada'}</small><small>Distancia permitida para marcar: {site.geofenceRadiusMeters ?? '—'} m</small></span></div>
      <div className="button-row"><button type="button" className="button button-small button-quiet" disabled={busy} aria-label={`Cambiar ubicación de ${site.name}`} onClick={() => onBeginLocationEdit(site)}>Cambiar ubicación</button><button type="button" className="button button-small button-quiet" disabled={busy} aria-expanded={siteLocationAuditFor === site.id} aria-controls={`site-location-audit-${site.id}`} onClick={() => onToggleSiteLocationAudit(site.id)}>{siteLocationAuditFor === site.id ? 'Ocultar historial' : 'Ver historial de ubicación'}</button></div>
      {locationEdit?.siteId === site.id && <form className="form-stack" aria-label={`Cambiar ubicación de ${site.name}`} onSubmit={onSaveLocationEdit}>
        <fieldset className="site-location-field fieldset-plain">
          <legend className="field-label">¿Dónde queda el local?</legend>
          <div className="site-location-actions">
            {!editMapOpen && <button type="button" className="button button-primary" disabled={busy || locationEdit.locationStatus === 'loading'} onClick={() => onOpenMap({ kind: 'edit', siteId: site.id })}>Elegir en el mapa</button>}
            <button type="button" className="button button-outline" disabled={busy} onClick={() => locationEdit.locationStatus === 'loading' ? onCancelLocationCapture() : onCaptureEditLocation(site.id)}>{locationEdit.locationStatus === 'loading' ? 'Cancelar búsqueda' : locationEdit.latitude && locationEdit.longitude ? 'Capturar otra ubicación' : 'Capturar ubicación del dispositivo'}</button>
            {(locationEdit.latitude || locationEdit.longitude) && <button type="button" className="button button-quiet" disabled={busy || locationEdit.locationStatus === 'loading'} onClick={onClearEditLocation}>Quitar ubicación</button>}
          </div>
          {editMapOpen && siteMap && <SiteMapPanel state={siteMap} radiusMeters={mapRadiusMeters(locationEdit.geofenceRadiusMeters)} disabled={busy} {...mapCallbacks} />}
          <span className="field-hint">Lo más fácil: tocá «Elegir en el mapa», buscá la dirección y tocá la puerta del local. La ubicación de este dispositivo solo sirve si es precisa (hasta 25 m).</span>
          {locationEdit.locationMessage && <span className={`site-location-message site-location-message-${locationEdit.locationStatus}`} role={locationEdit.locationStatus === 'error' ? 'alert' : 'status'} aria-live={locationEdit.locationStatus === 'error' ? 'assertive' : 'polite'}>{locationEdit.locationStatus === 'error' && <strong>{locationErrorTitle(locationEdit.locationErrorKind)}: </strong>}{locationEdit.locationMessage}</span>}
          {editCoordinates && <div className="site-location-selection">
            <span className="site-location-coordinates">Latitud {editCoordinates.latitude.toFixed(7)} · Longitud {editCoordinates.longitude.toFixed(7)}</span>
            <a href={siteMapHref(editCoordinates)} target="_blank" rel="noreferrer noopener">Revisar este punto en el mapa</a>
            <span className="field-hint">{locationEdit.locationSource === 'CAPTURED'
              ? `Precisión informada por el dispositivo: ±${locationEdit.locationAccuracyMeters?.toFixed(1) ?? '—'} m (estimación; no garantiza exactitud).`
              : locationEdit.locationSource === 'MANUAL' ? locationEdit.locationFromMap ? 'Punto elegido en el mapa.' : 'Punto escrito a mano.' : 'Es el punto guardado ahora para esta sede.'}</span>
            {locationEdit.locationSource !== null && <label className="site-location-confirmation"><input type="checkbox" checked={locationEdit.locationConfirmed} disabled={busy || locationEdit.locationStatus === 'loading'} onChange={(event) => onLocationEditChange({ locationConfirmed: event.target.checked })} /><span>Confirmo que este punto corresponde a la sede.</span></label>}
          </div>}
          <details className="site-location-manual">
            <summary>Escribir las coordenadas a mano</summary>
            <div className="site-location-coordinate-inputs">
              <FormField label="Latitud" hint="Entre -90 y 90."><input type="number" step="any" min="-90" max="90" value={locationEdit.latitude} disabled={busy || locationEdit.locationStatus === 'loading'} onChange={(event) => onLocationEditChange({ latitude: event.target.value })} /></FormField>
              <FormField label="Longitud" hint="Entre -180 y 180."><input type="number" step="any" min="-180" max="180" value={locationEdit.longitude} disabled={busy || locationEdit.locationStatus === 'loading'} onChange={(event) => onLocationEditChange({ longitude: event.target.value })} /></FormField>
            </div>
          </details>
        </fieldset>
        <FormField label={RADIUS_LABEL} hint="Desde el punto elegido: entre 50 y 500 m, en números enteros."><input type="number" required min="50" max="500" step="1" value={locationEdit.geofenceRadiusMeters} onChange={(event) => onLocationEditChange({ geofenceRadiusMeters: event.target.value })} /></FormField>
        <div className="button-row"><button className="button button-small button-primary" disabled={busy || locationEdit.locationStatus === 'loading'}>{busy ? 'Guardando…' : 'Guardar ubicación'}</button><button type="button" className="button button-small button-quiet" disabled={busy} onClick={onCancelLocationEdit}>Cancelar</button></div>
      </form>}
      {siteLocationAuditFor === site.id && <SiteLocationAuditSection siteId={site.id} siteName={site.name} timeZone={site.timeZone} audit={siteLocationAudit} loading={siteLocationAuditLoading} error={siteLocationAuditError} onRetry={onRetrySiteLocationAudit} />}
    </article>)}</div> : <Empty>Todavía no hay sedes.</Empty>}</Panel>
      <Panel title="Agregar sede"><form className="form-stack" onSubmit={onSubmit}>
        <FormField label="Nombre de la sede"><input required maxLength={120} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ej. Local Centro" /></FormField>
        <fieldset className="site-location-field fieldset-plain" aria-describedby="site-location-help">
          <legend className="field-label">¿Dónde queda el local?</legend>
          <div className="site-location-actions">
            {!createMapOpen && <button type="button" className="button button-primary" disabled={busy || locating} onClick={() => onOpenMap({ kind: 'create' })}>Elegir en el mapa</button>}
            <button type="button" className="button button-outline" disabled={busy} onClick={locating ? onCancelLocationCapture : onCaptureLocation}>{locating ? 'Cancelar búsqueda' : createLatitude || createLongitude ? 'Capturar otra ubicación' : 'Capturar ubicación del dispositivo'}</button>
            {(createLatitude || createLongitude) && <button type="button" className="button button-quiet" disabled={busy || locating} onClick={onClearLocation}>Quitar ubicación</button>}
          </div>
          {createMapOpen && siteMap && <SiteMapPanel state={siteMap} radiusMeters={mapRadiusMeters(createRadiusMeters)} disabled={busy} {...mapCallbacks} />}
          <span id="site-location-help" className="field-hint">Opcional. Lo más fácil: tocá «Elegir en el mapa», buscá la dirección y tocá la puerta del local. La ubicación de este dispositivo solo sirve si es precisa (hasta 25 m). También podés crear la sede sin ubicación.</span>
          {locationMessage && <span className={`site-location-message site-location-message-${locationStatus}`} role={locationStatus === 'error' ? 'alert' : 'status'} aria-live={locationStatus === 'error' ? 'assertive' : 'polite'}>
            {locationStatus === 'error' && <strong>{locationErrorTitle(locationErrorKind)}: </strong>}{locationMessage}
          </span>}
          {createCoordinates && <div className="site-location-selection">
            <span className="site-location-coordinates">Latitud {createCoordinates.latitude.toFixed(7)} · Longitud {createCoordinates.longitude.toFixed(7)}</span>
            <a href={siteMapHref(createCoordinates)} target="_blank" rel="noreferrer noopener">Revisar este punto en el mapa</a>
            <span className="field-hint">{createLocationSource === 'CAPTURED'
              ? `Precisión informada por el dispositivo: ±${locationAccuracyMeters?.toFixed(1) ?? '—'} m (estimación; no garantiza exactitud).`
              : createPointFromMap ? 'Punto elegido en el mapa.' : 'Punto escrito a mano.'}</span>
            <label className="site-location-confirmation"><input type="checkbox" checked={locationConfirmed} disabled={busy || locating} onChange={(event) => onLocationConfirmedChange(event.target.checked)} />
              <span>Confirmo que este punto corresponde a la sede.</span>
            </label>
          </div>}
          <details className="site-location-manual">
            <summary>Escribir las coordenadas a mano</summary>
            <div className="site-location-coordinate-inputs">
              <FormField label="Latitud" hint="Entre -90 y 90."><input type="number" step="any" min="-90" max="90" value={createLatitude} disabled={busy || locating} onChange={(event) => onCreateCoordinateChange('latitude', event.target.value)} /></FormField>
              <FormField label="Longitud" hint="Entre -180 y 180."><input type="number" step="any" min="-180" max="180" value={createLongitude} disabled={busy || locating} onChange={(event) => onCreateCoordinateChange('longitude', event.target.value)} /></FormField>
            </div>
          </details>
        </fieldset>
        <FormField label={RADIUS_LABEL} hint="Desde el punto elegido: entre 50 y 500 m. Si no sabés, dejá 100 m."><input type="number" required min="50" max="500" step="1" value={createRadiusMeters} onChange={(event) => onCreateRadiusMetersChange(event.target.value)} /></FormField>
        <SiteZoneField value={timeZone} onChange={onTimeZoneChange} />
        <button className="button button-primary" disabled={busy || locating}>{busy ? 'Guardando…' : 'Crear sede'}</button>
      </form></Panel>
    </div>
  </>
}

function siteCenter(latitude: number | null, longitude: number | null) {
  if (latitude === null && longitude === null) return 'Sin coordenadas'
  if (latitude === null || longitude === null) return 'Coordenadas incompletas'
  return `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`
}

function siteCoordinates(latitudeText: string, longitudeText: string): SiteCoordinates | null {
  if (!latitudeText.trim() || !longitudeText.trim()) return null
  const latitude = Number(latitudeText)
  const longitude = Number(longitudeText)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

function siteMapHref({ latitude, longitude }: SiteCoordinates) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
}

export function SiteLocationAuditSection({ siteId, siteName, timeZone, audit, loading, error, onRetry }: {
  siteId: string; siteName: string; timeZone: string; audit: SiteLocationAuditResponse | null; loading: boolean; error: string; onRetry: () => void
}) {
  return <section id={`site-location-audit-${siteId}`} aria-label={`Historial de ubicación de ${siteName}`} className="audit-history">
    <h3>Historial de ubicación</h3>
    {loading ? <Loading label="Cargando historial de ubicación…" /> : error ? <LoadFailure message={error} onRetry={onRetry} /> : !audit ? null : audit.entries.length === 0 ? <Empty>Esta sede todavía no tiene cambios de ubicación auditados.</Empty> : <ol className="history-items audit-items" aria-label={`Cambios de ubicación de ${siteName}`}>{audit.entries.map((entry) => {
      const initial = entry.beforeLatitude === null && entry.beforeLongitude === null && entry.beforeRadiusMeters === null
      return <li key={entry.id}>
        <strong>{initial ? 'Configuración inicial de ubicación' : 'Ubicación y radio actualizados'}</strong>
        <span>{dateTime(entry.changedAt, timeZone)}</span>
        <small>Por {entry.actorDisplayName?.trim() || 'un administrador'}</small>
        {entry.locationSource && <small>Origen del punto: {entry.locationSource === 'CAPTURED' ? 'captura automática' : 'carga manual'}</small>}
        <small>Centro anterior: {siteCenter(entry.beforeLatitude, entry.beforeLongitude)} · radio: {entry.beforeRadiusMeters === null ? '—' : `${entry.beforeRadiusMeters} m`}</small>
        <small>Centro nuevo: {siteCenter(entry.afterLatitude, entry.afterLongitude)} · radio: {entry.afterRadiusMeters === null ? '—' : `${entry.afterRadiusMeters} m`}</small>
      </li>
    })}</ol>}
  </section>
}

export function JourneysViewRender({ workDaysPanel, coverage, narrow = false, sites, eligibleEmployees, siteTemplates, jornadas, loading, journeysLoading, journeysDate, journeysError, dependencyError, error, notice, busy, detail, detailLoading, markBusy, date, dateError, employeeId, siteId, templateId, singleDate, singleError = '', singleNotice = '', peopleById, detailSite, detailTimeZone, forgotAction, forgotOccurredAt, forgotReason, editingMarkId, correctedAction, correctedOccurredAt, correctionReason, cancelOpen, cancelReason, voidingMarkId, voidReason, auditOpen, audit, auditLoading, auditError, onToggleAudit, onRetryAudit, onDateChange, onSingleDateChange, onEmployeeChange, onSiteChange, onTemplateChange, onDeclare, onRetryDependencies, onReloadJourneys, onShowDetail, onForgotActionChange, onForgotOccurredAtChange, onForgotReasonChange, onAddForgottenMark, onBeginMarkCorrection, onCorrectedActionChange, onCorrectedOccurredAtChange, onCorrectionReasonChange, onCorrectMark, onCancelMarkCorrection, onBeginCancel, onCancelReasonChange, onConfirmCancel, onAbortCancel, onBeginVoid, onVoidReasonChange, onConfirmVoid, onAbortVoid }: {
  /** "Cargar días de trabajo" (WorkDaysPanel), the main form of the page; coverage is the notice of days loaded. */
  workDaysPanel?: ReactNode; coverage?: ReactNode
  /** Phone width: the marks of a jornada are shown as cards instead of a table. */
  narrow?: boolean
  sites: Site[]; eligibleEmployees: Employee[]; siteTemplates: Template[]; jornadas: JourneyRow[]
  loading: boolean; journeysLoading: boolean; journeysDate: string; journeysError: string; dependencyError: string; error: string; notice: string; busy: boolean
  detail: Jornada | null; detailLoading: boolean; markBusy: string; date: string; dateError: string; employeeId: string; siteId: string; templateId: string; peopleById: Map<string, string>
  /** The single day ("Cargar o cambiar un solo día") has its own date and messages. */
  singleDate: string; singleError?: string; singleNotice?: string; onSingleDateChange: (value: string) => void
  detailSite?: Site; detailTimeZone?: string; forgotAction: MarkAction; forgotOccurredAt: string; forgotReason: string; editingMarkId: string
  correctedAction: MarkAction; correctedOccurredAt: string; correctionReason: string
  onDateChange: (value: string) => void; onEmployeeChange: (value: string) => void; onSiteChange: (value: string) => void; onTemplateChange: (value: string) => void
  onDeclare: (event: FormEvent<HTMLFormElement>) => void; onRetryDependencies: () => void; onReloadJourneys: () => void; onShowDetail: (id: string) => void
  onForgotActionChange: (value: MarkAction) => void; onForgotOccurredAtChange: (value: string) => void; onForgotReasonChange: (value: string) => void; onAddForgottenMark: (event: FormEvent<HTMLFormElement>) => void
  onBeginMarkCorrection: (mark: Mark) => void; onCorrectedActionChange: (value: MarkAction) => void; onCorrectedOccurredAtChange: (value: string) => void; onCorrectionReasonChange: (value: string) => void
  onCorrectMark: (event: FormEvent<HTMLFormElement>, mark: Mark) => void; onCancelMarkCorrection: () => void
  cancelOpen: boolean; cancelReason: string; voidingMarkId: string; voidReason: string
  onBeginCancel: () => void; onCancelReasonChange: (value: string) => void; onConfirmCancel: (event: FormEvent<HTMLFormElement>) => void; onAbortCancel: () => void
  onBeginVoid: (mark: Mark) => void; onVoidReasonChange: (value: string) => void; onConfirmVoid: (event: FormEvent<HTMLFormElement>, mark: Mark) => void; onAbortVoid: () => void
  auditOpen: boolean; audit: JornadaAudit | null; auditLoading: boolean; auditError: string; onToggleAudit: () => void; onRetryAudit: () => void
}) {
  const cancellable = detail?.state === 'NO_INGRESO' && detail.marks.every((mark) => mark.voided)
  const messages = <>{error && <PageMessage kind="error">{error}</PageMessage>}{notice && <PageMessage kind="success">{notice}</PageMessage>}</>
  const markTime = (mark: Mark) => dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)
  const markLocation = (mark: Mark) => <>{locationName(mark.locationStatus)}{typeof mark.latitude === 'number' && typeof mark.longitude === 'number' && <small className="mark-coordinates">{`${mark.latitude.toFixed(5)}, ${mark.longitude.toFixed(5)}`}</small>}</>
  const markButtons = (mark: Mark) => <div className="button-row"><button className="button button-small button-quiet" aria-label={`Corregir marca ${actionName(mark.action)} de ${markTime(mark)}`} disabled={markBusy !== '' || !detailTimeZone} onClick={() => onBeginMarkCorrection(mark)}>Corregir</button><button className="button button-small button-danger-outline" aria-label={`Anular marca ${actionName(mark.action)} de ${markTime(mark)}`} disabled={markBusy !== ''} onClick={() => onBeginVoid(mark)}>Anular</button></div>
  const voidedNote = (mark: Mark) => `${mark.voidedAt ? `Anulada el ${dateTime(mark.voidedAt, detailTimeZone)}` : 'Anulada'}${mark.voidReason ? ` · ${mark.voidReason}` : ''}`
  const editingMark = detail?.marks.find((mark) => mark.id === editingMarkId && !mark.voided)
  const voidingMark = detail?.marks.find((mark) => mark.id === voidingMarkId && !mark.voided)
  return <>
    <PageHeading eyebrow="DÍAS DE TRABAJO" title="Jornadas" subtitle="Cargá los días que trabaja cada persona y revisá sus marcas. Cada día sigue el calendario de su local." />
    {!detail && messages}
    {dependencyError && <div className="form-stack"><PageMessage kind="error">{dependencyError}</PageMessage><button type="button" className="button button-quiet" disabled={loading || journeysLoading} onClick={onRetryDependencies}>Reintentar datos de la jornada</button></div>}
    {coverage}
    {workDaysPanel}
    <section className="panel" aria-labelledby="single-day-title"><details className="fold">
      <summary><h2 id="single-day-title">Cargar o cambiar un solo día</h2></summary>
      <p className="muted">Para una excepción: un día suelto o un horario distinto. Para cambiar un día ya cargado, abrilo en la lista de abajo, cancelalo y cargalo de nuevo.</p>
      <form className="form-grid" onSubmit={onDeclare}>
        <FormField label="Local"><select required value={siteId} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></FormField>
        <FormField label="Empleado" hint={eligibleEmployees.length === 0 ? 'No hay personas activas en este local.' : undefined}><select required value={employeeId} onChange={(event) => onEmployeeChange(event.target.value)}>{eligibleEmployees.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select></FormField>
        <FormField label="Día"><input type="date" required disabled={loading} value={singleDate} onChange={(event) => onSingleDateChange(event.target.value)} /></FormField>
        <FormField label="Horario" hint="Si no elegís otro, se usa el horario que la persona tiene asignado para ese día."><select value={templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">El que tiene asignado</option>{siteTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></FormField>
        {singleError && <div className="field-wide"><PageMessage kind="error">{singleError}</PageMessage></div>}
        {singleNotice && <div className="field-wide"><PageMessage kind="success">{singleNotice}</PageMessage></div>}
        <div className="field-wide"><button className="button button-primary" disabled={busy || loading || journeysLoading || !singleDate || !employeeId}>{busy ? 'Guardando…' : 'Cargar este día'}</button></div>
      </form>
    </details></section>
    <Panel title={journeysTitle(date)} action={<button className="button button-small button-quiet" disabled={journeysLoading} onClick={onReloadJourneys}>{journeysLoading ? 'Actualizando…' : 'Actualizar'}</button>}>
      <div className="toolbar"><FormField label="Fecha" hint={dateError || undefined}><input type="date" required aria-invalid={Boolean(dateError)} disabled={loading} value={date} onChange={(event) => onDateChange(event.target.value)} /></FormField></div>
      {!date ? <Empty>{dateError}</Empty> : loading || journeysLoading || journeysDate !== date ? <Loading label={loading || !journeysDate ? 'Cargando jornadas…' : 'Actualizando jornadas…'} /> : journeysError ? <LoadFailure message={journeysError} onRetry={onReloadJourneys} /> : jornadas.length ? narrow ? <div className="history-list">{jornadas.map((jornada) => {
        // Phones: one card per day loaded, so "Ver marcas" is in sight without swiping a table sideways.
        const person = peopleById.get(jornada.employeeId) ?? 'Empleado'
        return <article className="history-card" key={jornada.id} aria-labelledby={`jornada-${jornada.id}-person`}>
          <div className="history-head"><strong id={`jornada-${jornada.id}-person`}>{person}</strong><span className="muted">{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'}</span><span className={`status-chip status-${jornada.state.toLowerCase()}`}>{stateLabel(jornada.state)}</span></div>
          <button className="button button-small button-quiet" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button>
        </article>
      })}</div> : <div className="table-scroll"><table><thead><tr><th>Empleado</th><th>Sede</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{jornadas.map((jornada) => <tr key={jornada.id}><td>{peopleById.get(jornada.employeeId) ?? 'Empleado'}</td><td>{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'}</td><td><span className={`status-chip status-${jornada.state.toLowerCase()}`}>{stateLabel(jornada.state)}</span></td><td><button className="button button-small button-quiet" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button></td></tr>)}</tbody></table></div> : <Empty>No hay días cargados para esta fecha.</Empty>}
    </Panel>
    {detailLoading && <Panel title="Detalle"><Loading label="Consultando marcas…" /></Panel>}
    {detail && !detailLoading && <div id="jornada-detail"><Panel title={`Marcas de ${peopleById.get(detail.employeeId) ?? 'empleado'}`}>
      {messages}
      <p className="muted">Horario asignado: {detail.scheduleSnapshot.name} · tolerancia {detail.toleranceMinutes} min</p>
      {!detailTimeZone && <PageMessage kind="error">No se pudo cargar la zona horaria de la sede. Reintentá los datos de la jornada antes de incorporar o corregir marcas.</PageMessage>}
      {detail.state === 'CANCELADA' && <PageMessage>Jornada cancelada el {dateTime(detail.cancelledAt ?? '', detailTimeZone)}.{detail.cancelReason ? ` Motivo: ${detail.cancelReason}` : ''}</PageMessage>}
      {cancellable && (cancelOpen ? <form className="form-stack correction-form" onSubmit={onConfirmCancel}>
        <FormField label="Motivo de cancelación" hint={`La jornada queda cancelada con tu nombre, la hora y este motivo; sus desvíos se cierran y podés volver a cargarla. ${HEALTH_DATA_HINT}`}><textarea required maxLength={2000} value={cancelReason} onChange={(event) => onCancelReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-danger-outline" disabled={markBusy !== '' || !cancelReason.trim()}>{markBusy === 'cancel' ? 'Cancelando…' : 'Confirmar cancelación'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === 'cancel'} onClick={onAbortCancel}>Volver</button></div>
      </form> : <div className="button-row"><button type="button" className="button button-small button-danger-outline" disabled={markBusy !== ''} onClick={onBeginCancel}>Cancelar jornada</button></div>)}
      {!detail.marks.length ? <Empty>{detail.state === 'CANCELADA' ? 'Esta jornada fue cancelada y no tiene marcas.' : 'Esta jornada todavía no tiene marcas.'}</Empty>
        : narrow ? <ul className="history-items" aria-label="Marcas de la jornada">{detail.marks.map((mark) => <li key={mark.id} className={mark.voided ? 'mark-voided' : undefined}>
          <strong>{mark.voided ? <s>{actionName(mark.action)}</s> : actionName(mark.action)}</strong><span>{mark.voided ? <s>{markTime(mark)}</s> : markTime(mark)}</span>
          <small>{mark.voided ? voidedNote(mark) : markLocation(mark)}</small>
          {!mark.voided && markButtons(mark)}
        </li>)}</ul>
        : <div className="table-scroll"><table><thead><tr><th>Marca</th><th>Hora</th><th>Registrada</th><th>Ubicación</th><th>Acciones</th></tr></thead><tbody>{detail.marks.map((mark) => mark.voided
          ? <tr key={mark.id} className="mark-voided"><td><s>{actionName(mark.action)}</s> <span className="status-chip">Anulada</span></td><td><s>{markTime(mark)}</s></td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{markLocation(mark)}</td><td><small>{voidedNote(mark)}</small></td></tr>
          : <tr key={mark.id}><td>{actionName(mark.action)}</td><td>{markTime(mark)}</td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{markLocation(mark)}</td><td>{markButtons(mark)}</td></tr>)}</tbody></table></div>}
      {voidingMark && <form className="form-stack correction-form" aria-label={`Anular la marca ${actionName(voidingMark.action)} de ${markTime(voidingMark)}`} onSubmit={(event) => onConfirmVoid(event, voidingMark)}>
        <FormField label="Motivo de anulación" hint={`La marca no se borra: queda visible como anulada, con tu nombre, la hora y este motivo, y deja de contar para la jornada y los desvíos. ${HEALTH_DATA_HINT}`}><textarea required maxLength={2000} value={voidReason} onChange={(event) => onVoidReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-danger-outline" disabled={markBusy === voidingMark.id || !voidReason.trim()}>{markBusy === voidingMark.id ? 'Anulando…' : 'Confirmar anulación'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === voidingMark.id} onClick={onAbortVoid}>Volver</button></div>
      </form>}
      {editingMark && <form className="form-stack correction-form" aria-label={`Corregir la marca ${actionName(editingMark.action)} de ${markTime(editingMark)}`} onSubmit={(event) => onCorrectMark(event, editingMark)}>
        <FormField label="Tipo de marca corregida"><select value={correctedAction} onChange={(event) => onCorrectedActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora corregida (${detailSite?.name ?? 'zona horaria de la sede'})`}><input type="datetime-local" required value={correctedOccurredAt} onChange={(event) => onCorrectedOccurredAtChange(event.target.value)} /></FormField>
        <FormField label="Motivo de corrección de marca"><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-primary" disabled={markBusy === editingMark.id || !correctionReason.trim()}>{markBusy === editingMark.id ? 'Guardando…' : 'Guardar corrección de marca'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === editingMark.id} onClick={onCancelMarkCorrection}>Cancelar</button></div>
      </form>}
      {detail.state !== 'CANCELADA' && <form className="forgotten-mark-form" onSubmit={onAddForgottenMark}><fieldset className="form-grid fieldset-plain" disabled={!detailTimeZone}>
        <div className="field-wide"><h3>Agregar una marca que faltó</h3><p className="field-hint">Escribí la hora de {detailSite?.name ?? 'la sede'}. Queda guardado que la agregaste vos y por qué.</p></div>
        <FormField label="¿Qué marca faltó?"><select value={forgotAction} onChange={(event) => onForgotActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora (${detailSite?.name ?? 'sede'})`}><input type="datetime-local" required value={forgotOccurredAt} onChange={(event) => onForgotOccurredAtChange(event.target.value)} /></FormField>
        <FormField label="¿Por qué la agregás?"><textarea required maxLength={2000} value={forgotReason} onChange={(event) => onForgotReasonChange(event.target.value)} /></FormField>
        <div className="field-wide"><button className="button button-primary" disabled={markBusy !== '' || !forgotReason.trim()}>{markBusy === 'forgotten' ? 'Guardando…' : 'Agregar marca'}</button></div>
      </fieldset></form>}
      <JornadaAuditSection open={auditOpen} audit={audit} loading={auditLoading} error={auditError} onToggle={onToggleAudit} onRetry={onRetryAudit} />
    </Panel></div>}
  </>
}

/** Issue #60: the jornada's change history, collapsed until the ADMIN asks for it; times in the jornada's time zone. */
export function JornadaAuditSection({ open, audit, loading, error, onToggle, onRetry }: {
  open: boolean; audit: JornadaAudit | null; loading: boolean; error: string; onToggle: () => void; onRetry: () => void
}) {
  return <section className="audit-history" aria-labelledby="audit-history-title">
    <div className="form-subhead"><h3 id="audit-history-title">Historial de cambios</h3>
      <button type="button" className="button button-small button-quiet" aria-expanded={open} aria-controls="audit-history-body" onClick={onToggle}>{open ? 'Ocultar historial' : 'Ver historial'}</button></div>
    {open && <div id="audit-history-body">{loading ? <Loading label="Cargando historial de cambios…" /> : error ? <LoadFailure message={error} onRetry={onRetry} /> : !audit ? null : audit.entries.length === 0 ? <Empty>Esta jornada no tiene cambios registrados.</Empty> : <>
      {audit.truncated && <PageMessage>Se muestran los primeros {audit.entries.length} cambios de esta jornada.</PageMessage>}
      <ol className="history-items audit-items" aria-label="Cambios de la jornada">{audit.entries.map((entry, index) => <li key={`${entry.kind}-${entry.changedAt}-${index}`}>
        <strong>{auditTitle(entry, audit.timeZone)}</strong><span>{dateTime(entry.changedAt, audit.timeZone)}</span>
        <small>{entry.actorAccountId ? `Por ${entry.actorDisplayName?.trim() || 'una persona sin nombre registrado'}` : 'Automático del sistema'}</small>
        {entry.reason && showsReason(entry) && <small>Motivo: {entry.reason}</small>}
      </li>)}</ol>
    </>}</div>}
  </section>
}

/** Reasons written by people; the system's own reconciliation notes are not shown. */
function showsReason(entry: JornadaAuditEntry) { return entry.kind !== 'DEVIATION' || entry.changeType === 'CLASSIFICATION_CHANGED' }

function auditTitle(entry: JornadaAuditEntry, timeZone: string): string {
  const markAt = (action?: MarkAction | null, at?: string | null) => `${action ? actionName(action) : 'Marca'}${at ? ` de ${dateTime(at, timeZone)}` : ''}`
  const type = (value?: Deviation['type'] | null) => value ? deviationName(value) : 'Desvío'
  const classification = (value?: 'JUSTIFICADO' | 'NO_JUSTIFICADO' | null) => value ? statusName(value).toLowerCase() : 'sin clasificar'
  const category = (value?: Deviation['category']) => value ? categoryName(value) : 'sin categoría'
  switch (entry.kind) {
    case 'JORNADA_CANCELLATION': return 'Jornada cancelada'
    case 'FORGOTTEN_MARK': return `Marca olvidada incorporada: ${markAt(entry.afterAction, entry.afterOccurredAt)}`
    case 'MARK_CORRECTION': return `Marca corregida: ${markAt(entry.beforeAction, entry.beforeOccurredAt)} → ${markAt(entry.afterAction, entry.afterOccurredAt)}`
    case 'MARK_VOID': return `Marca anulada: ${markAt(entry.beforeAction, entry.beforeOccurredAt)}`
    case 'DEVIATION': break
  }
  const current = type(entry.deviationType)
  switch (entry.changeType) {
    case 'CREATED': return `Desvío detectado: ${type(entry.afterType ?? entry.deviationType)}`
    case 'TYPE_REPLACED': return `Desvío actualizado: ${type(entry.beforeType)} → ${type(entry.afterType)}`
    case 'RETRACTED': return `Desvío cerrado: ${type(entry.beforeType ?? entry.deviationType)}`
    case 'CLASSIFICATION_CHANGED': return entry.beforeClassification
      ? `${current}: clasificación corregida de ${classification(entry.beforeClassification)} a ${classification(entry.afterClassification)}`
      : `${current}: clasificado como ${classification(entry.afterClassification)}`
    case 'CLASSIFICATION_RESET': return `${current}: vuelve a revisión (se quitó la clasificación ${classification(entry.beforeClassification)})`
    case 'MOTIVE_SUBMITTED': return `${current}: motivo cargado, categoría ${category(entry.afterMotiveCategory)}`
    case 'MOTIVE_CORRECTED': return `${current}: motivo corregido, categoría ${category(entry.beforeMotiveCategory)} → ${category(entry.afterMotiveCategory)}`
    default: return `${current}: cambio registrado`
  }
}

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

export function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="form-stack"><PageMessage kind="error">{message}</PageMessage><button type="button" className="button button-quiet" onClick={onRetry}>Reintentar</button></div>
}


export function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="page-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{subtitle}</p></div></div>
}

const dateTime = formatDateTime
const MARK_ACTIONS: MarkAction[] = ['INGRESO', 'EGRESO', 'SALIDA_DESAYUNO', 'VUELTA_DESAYUNO', 'SALIDA_ALMUERZO', 'VUELTA_ALMUERZO']
function actionName(action: MarkAction) { return ({ INGRESO: 'Ingreso', EGRESO: 'Egreso', SALIDA_DESAYUNO: 'Salida desayuno', VUELTA_DESAYUNO: 'Vuelta desayuno', SALIDA_ALMUERZO: 'Salida almuerzo', VUELTA_ALMUERZO: 'Vuelta almuerzo' } as const)[action] }
function deviationName(type: Deviation['type']) { return ({ SIN_INGRESO: 'Sin ingreso', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Egreso temprano', EGRESO_TARDIO: 'Egreso tardío', MARCA_FALTANTE: 'Egreso sin marcar', EXCESO_DESAYUNO: 'Exceso de desayuno', EXCESO_ALMUERZO: 'Exceso de almuerzo', FUERA_DE_SEDE: 'Fuera de sede' } as const)[type] }
function statusName(status: Deviation['status']) { return ({ MOTIVO_PENDIENTE: 'Falta motivo', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado' } as const)[status] }
function categoryName(category: NonNullable<Deviation['category']>) { return ({ SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' } as const)[category] }
function locationName(status: string) { return ({ PENDIENTE: 'Ubicación pendiente', RECIBIDA: 'Ubicación recibida', SIN_UBICACION: 'Sin ubicación', PURGADA: 'Ubicación depurada', NO_APLICA: 'No aplica' } as Record<string, string>)[status] ?? '—' }
