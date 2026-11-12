// The sites (Sedes) render: the list, the location edit and create forms, their draft, map and audit types, and the location history of a site.
import { type FormEvent } from 'react'
import { Empty, FormField, LoadFailure, Loading, PageHeading, PageMessage, Panel, Status } from '../../app/ui'
import type { Site, SiteCoordinates } from '../../shared/api/types'
import type { SiteLocationErrorKind } from './siteLocation'
import type { GeocodeResult } from '../../shared/api/geocode'
import { SiteMapPanel, type SiteMapPanelState } from './SiteMapPanel'
import { mapRadiusMeters } from './siteMap'
import { SiteZoneField } from './SiteZoneField'
import { timeZoneLabel } from './siteZone'
import { dateTime } from './adminRenderShared'

/** The geofence radius in the owner's words (D-20261109-01): how far from the site's point a mark still counts as on site. */
const RADIUS_LABEL = 'Distancia permitida para marcar (metros)'

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
  id: string; changedAt: string; actorDisplayName?: string | null
  // The API leaves an empty field out instead of sending null: the first change of a site has no previous values.
  beforeLatitude?: number | null; beforeLongitude?: number | null; afterLatitude?: number | null; afterLongitude?: number | null
  beforeRadiusMeters?: number | null; afterRadiusMeters?: number | null; locationSource?: 'CAPTURED' | 'MANUAL' | null
}
export type SiteLocationAuditResponse = { entries: SiteLocationAuditEntry[] }

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
    <PageHeading eyebrow="ORGANIZACIÓN" title="Locales" subtitle="Cada local define su zona horaria y sus horarios." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <div className="content-grid"><Panel title="Locales registrados">{loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : sites.length ? <div className="simple-list">{sites.map((site) => <article key={site.id} className="form-stack">
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
          {/* An error is an alert, read as it appears; any other message is a Status, so the search and its result are announced. */}
          {locationEdit.locationMessage && (locationEdit.locationStatus === 'error'
            ? <span className="site-location-message site-location-message-error" role="alert" aria-live="assertive"><strong>{locationErrorTitle(locationEdit.locationErrorKind)}: </strong>{locationEdit.locationMessage}</span>
            : <Status as="span" className={`site-location-message site-location-message-${locationEdit.locationStatus}`}>{locationEdit.locationMessage}</Status>)}
          {editCoordinates && <div className="site-location-selection">
            <span className="site-location-coordinates">Latitud {editCoordinates.latitude.toFixed(7)} · Longitud {editCoordinates.longitude.toFixed(7)}</span>
            <a href={siteMapHref(editCoordinates)} target="_blank" rel="noreferrer noopener">Revisar este punto en el mapa</a>
            <span className="field-hint">{locationEdit.locationSource === 'CAPTURED'
              ? `Precisión informada por el dispositivo: ±${locationEdit.locationAccuracyMeters?.toFixed(1) ?? '—'} m (estimación; no garantiza exactitud).`
              : locationEdit.locationSource === 'MANUAL' ? locationEdit.locationFromMap ? 'Punto elegido en el mapa.' : 'Punto escrito a mano.' : 'Es el punto guardado ahora para este local.'}</span>
            {locationEdit.locationSource !== null && <label className="site-location-confirmation"><input type="checkbox" checked={locationEdit.locationConfirmed} disabled={busy || locationEdit.locationStatus === 'loading'} onChange={(event) => onLocationEditChange({ locationConfirmed: event.target.checked })} /><span>Confirmo que este punto corresponde al local.</span></label>}
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
    </article>)}</div> : <Empty>Todavía no hay locales.</Empty>}</Panel>
      <Panel title="Agregar local"><form className="form-stack" onSubmit={onSubmit}>
        <FormField label="Nombre del local"><input required maxLength={120} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ej. Local Centro" /></FormField>
        <fieldset className="site-location-field fieldset-plain" aria-describedby="site-location-help">
          <legend className="field-label">¿Dónde queda el local?</legend>
          <div className="site-location-actions">
            {!createMapOpen && <button type="button" className="button button-primary" disabled={busy || locating} onClick={() => onOpenMap({ kind: 'create' })}>Elegir en el mapa</button>}
            <button type="button" className="button button-outline" disabled={busy} onClick={locating ? onCancelLocationCapture : onCaptureLocation}>{locating ? 'Cancelar búsqueda' : createLatitude || createLongitude ? 'Capturar otra ubicación' : 'Capturar ubicación del dispositivo'}</button>
            {(createLatitude || createLongitude) && <button type="button" className="button button-quiet" disabled={busy || locating} onClick={onClearLocation}>Quitar ubicación</button>}
          </div>
          {createMapOpen && siteMap && <SiteMapPanel state={siteMap} radiusMeters={mapRadiusMeters(createRadiusMeters)} disabled={busy} {...mapCallbacks} />}
          <span id="site-location-help" className="field-hint">Opcional. Lo más fácil: tocá «Elegir en el mapa», buscá la dirección y tocá la puerta del local. La ubicación de este dispositivo solo sirve si es precisa (hasta 25 m). También podés crear el local sin ubicación.</span>
          {locationMessage && (locationStatus === 'error'
            ? <span className="site-location-message site-location-message-error" role="alert" aria-live="assertive"><strong>{locationErrorTitle(locationErrorKind)}: </strong>{locationMessage}</span>
            : <Status as="span" className={`site-location-message site-location-message-${locationStatus}`}>{locationMessage}</Status>)}
          {createCoordinates && <div className="site-location-selection">
            <span className="site-location-coordinates">Latitud {createCoordinates.latitude.toFixed(7)} · Longitud {createCoordinates.longitude.toFixed(7)}</span>
            <a href={siteMapHref(createCoordinates)} target="_blank" rel="noreferrer noopener">Revisar este punto en el mapa</a>
            <span className="field-hint">{createLocationSource === 'CAPTURED'
              ? `Precisión informada por el dispositivo: ±${locationAccuracyMeters?.toFixed(1) ?? '—'} m (estimación; no garantiza exactitud).`
              : createPointFromMap ? 'Punto elegido en el mapa.' : 'Punto escrito a mano.'}</span>
            <label className="site-location-confirmation"><input type="checkbox" checked={locationConfirmed} disabled={busy || locating} onChange={(event) => onLocationConfirmedChange(event.target.checked)} />
              <span>Confirmo que este punto corresponde al local.</span>
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
        <button className="button button-primary" disabled={busy || locating}>{busy ? 'Guardando…' : 'Crear local'}</button>
      </form></Panel>
    </div>
  </>
}

function siteCenter(latitude?: number | null, longitude?: number | null) {
  if (latitude == null && longitude == null) return 'Sin coordenadas'
  if (latitude == null || longitude == null) return 'Coordenadas incompletas'
  return `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`
}

const radiusText = (meters?: number | null) => meters == null ? '—' : `${meters} m`

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
    {loading ? <Loading label="Cargando historial de ubicación…" /> : error ? <LoadFailure message={error} onRetry={onRetry} /> : !audit ? null : audit.entries.length === 0 ? <Empty>Este local todavía no tiene cambios de ubicación auditados.</Empty> : <ol className="history-items audit-items" aria-label={`Cambios de ubicación de ${siteName}`}>{audit.entries.map((entry) => {
      const initial = entry.beforeLatitude == null && entry.beforeLongitude == null && entry.beforeRadiusMeters == null
      return <li key={entry.id}>
        <strong>{initial ? 'Configuración inicial de ubicación' : 'Ubicación y radio actualizados'}</strong>
        <span>{dateTime(entry.changedAt, timeZone)}</span>
        <small>Por {entry.actorDisplayName?.trim() || 'un administrador'}</small>
        {entry.locationSource && <small>Origen del punto: {entry.locationSource === 'CAPTURED' ? 'captura automática' : 'carga manual'}</small>}
        <small>Centro anterior: {siteCenter(entry.beforeLatitude, entry.beforeLongitude)} · radio: {radiusText(entry.beforeRadiusMeters)}</small>
        <small>Centro nuevo: {siteCenter(entry.afterLatitude, entry.afterLongitude)} · radio: {radiusText(entry.afterRadiusMeters)}</small>
      </li>
    })}</ol>}
  </section>
}
