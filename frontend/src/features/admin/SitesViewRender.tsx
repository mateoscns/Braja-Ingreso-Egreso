// The sites (Sedes) render: the list, the location edit and create forms, their draft, map and audit types, and the location history of a site.
import { type FormEvent, type ReactNode } from 'react'
import { Empty, Fieldset, FieldsSummary, FormField, LoadFailure, Loading, PageHeading, PageMessage, Panel, Status } from '../../app/ui'
import type { FieldErrors } from '../../app/useFieldErrors'
import { Icon } from '../../app/icons'
import type { Site, SiteCoordinates } from '../../shared/api/types'
import type { SiteLocationErrorKind } from './siteLocation'
import type { GeocodeResult } from '../../shared/api/geocode'
import { SiteMapPanel, type SiteMapPanelState } from './SiteMapPanel'
import { mapRadiusMeters, openStreetMapHref } from './siteMap'
import { SiteZoneField } from './SiteZoneField'
import { timeZoneLabel } from './siteZone'
import { dateTime, SectionLink } from './adminRenderShared'
import type { AdminSection } from './setupStatus'

/**
 * The geofence radius (D-20261109-01): how far from the site's point a mark still counts as on site. Worded as a distance around
 * the local and what happens to a mark farther away, never as a condition to mark: the location never blocks a mark (rule 2).
 */
const RADIUS_LABEL = 'Distancia alrededor del local (metros)'
const RADIUS_HINT = 'Una marca hecha más lejos se guarda igual y queda en Para revisar como «Fuera del local».'
const LIST_HEADING_ID = 'sites-title'

/** Where the result of a form shows (design system 4.7): the add form, or the location change of one local. */
export const siteMessageKeys = { create: 'create', edit: (siteId: string) => `edit:${siteId}` }

/**
 * «Cambiar ubicación» and its form: the form takes the focus when it opens, and the button gets it back when it closes (slice F1).
 * A failed submit focuses inside its form (slice F2b). «Elegir en el mapa» gets the focus back when the map closes, and
 * «Capturar ubicación del dispositivo» takes it when «Quitar ubicación» leaves with the point (T12): one of each per form.
 */
export const siteFocusIds = {
  locationButton: (siteId: string) => `site-${siteId}-location`, locationForm: (siteId: string) => `site-${siteId}-location-form`, createForm: 'site-create-form',
  mapButton: (target: SiteMapTarget) => target.kind === 'create' ? 'site-create-map' : `site-${target.siteId}-map`,
  captureButton: (target: SiteMapTarget) => target.kind === 'create' ? 'site-create-capture' : `site-${target.siteId}-capture`
}

/** What a submit of a site form can find wrong: the name, the distance, and the point or its confirmation (the location group). */
export type SiteField = 'name' | 'radius' | 'coordinates' | 'confirmation'

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

const locationErrorTitle = (kind: SiteLocationErrorKind | null) => kind === 'permission-denied' ? 'Permiso de ubicación' :
  kind === 'insecure-context' ? 'Conexión no segura' :
    kind === 'timeout' ? 'La ubicación tardó demasiado' :
      kind === 'unsupported' ? 'Geolocalización no disponible' :
        kind === 'precision-insufficient' ? 'Precisión insuficiente' :
          kind === 'invalid-position' ? 'Datos de ubicación inválidos' :
            kind === 'request-failed' ? 'No se pudo iniciar la captura' : 'No se pudo determinar la ubicación'

/**
 * What the capture or the map said, as a message of the system (design system 4.8). An error is an alert, read as it appears; any
 * other line is a Status, so the search and its result are announced; a search in progress shows a spinner in place of the icon.
 */
function LocationLine({ status, message, errorKind }: { status: SiteLocationEditDraft['locationStatus']; message: string; errorKind: SiteLocationErrorKind | null }) {
  if (!message) return null
  if (status === 'error') {
    return <div className="message message-error" role="alert" aria-live="assertive" aria-atomic="true"><Icon name="error" />
      <div className="message-body"><strong>{locationErrorTitle(errorKind)}: </strong>{message}</div></div>
  }
  return <Status as="div" className="message message-info">
    {status === 'loading' ? <span className="spinner" aria-hidden="true" /> : <Icon name="info" />}<div className="message-body">{message}</div>
  </Status>
}

export function SitesViewRender({ sites, loading, loadError, error, notice, messageAt = '', createdSite = null, onNavigate, name, timeZone, busy, locationStatus, locationMessage, locating, locationErrorKind = null, locationAccuracyMeters = null, locationConfirmed = false, createRadiusMeters = '100', createLatitude = '', createLongitude = '', createLocationSource = null, locationEdit = null, siteLocationAuditFor = '', siteLocationAudit = null, siteLocationAuditLoading = false, siteLocationAuditError = '', siteMap = null, createPointFromMap = false, createErrors = {}, editErrors = {}, onOpenMap = () => undefined, onCloseMap = () => undefined, onMapPick = () => undefined, onMapQueryChange = () => undefined, onMapSearch = () => undefined, onChooseMapResult = () => undefined, onConfirmMapPoint = () => undefined, onLocationConfirmedChange = () => undefined, onCancelLocationCapture = () => undefined, onCreateRadiusMetersChange = () => undefined, onCreateCoordinateChange = () => undefined, onBeginLocationEdit = () => undefined, onCancelLocationEdit = () => undefined, onLocationEditChange = () => undefined, onCaptureEditLocation = () => undefined, onClearEditLocation = () => undefined, onSaveLocationEdit = () => undefined, onToggleSiteLocationAudit = () => undefined, onRetrySiteLocationAudit = () => undefined, onReload, onSubmit, onNameChange, onTimeZoneChange, onCaptureLocation, onClearLocation }: {
  sites: Site[]; loading: boolean; loadError: string; error: string; notice: string; name: string; timeZone: string; busy: boolean
  /** The form whose result `error` and `notice` are (siteMessageKeys); they show there, or at the top of the page without one. */
  messageAt?: string
  /** The local the add form just created: its result says it still needs its horario, which lives in «Horarios» (#177). */
  createdSite?: Site | null
  /** Follows the link to «Horarios» (AdminApp.navigate); without it the link changes the address. */
  onNavigate?: (section: AdminSection) => void
  siteLocation: SiteCoordinates | null; locationStatus: 'idle' | 'loading' | 'selected' | 'error'; locationMessage: string; locating: boolean
  locationErrorKind?: SiteLocationErrorKind | null; locationAccuracyMeters?: number | null; locationConfirmed?: boolean
  createRadiusMeters?: string; createLatitude?: string; createLongitude?: string; createLocationSource?: 'CAPTURED' | 'MANUAL' | null
  locationEdit?: SiteLocationEditDraft | null; siteLocationAuditFor?: string; siteLocationAudit?: SiteLocationAuditResponse | null
  siteLocationAuditLoading?: boolean; siteLocationAuditError?: string
  /** D-20261109-01: the open map picker, if any, and the form it belongs to; createPointFromMap labels a create point picked on it. */
  siteMap?: SiteMapState | null; createPointFromMap?: boolean
  /** What the last submit of the add form, or of the open location change, found wrong. */
  createErrors?: FieldErrors<SiteField>; editErrors?: FieldErrors<SiteField>
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
  const messages = <>{error && <PageMessage kind="error">{error}</PageMessage>}{notice && <PageMessage kind="success">{notice}</PageMessage>}</>
  const messagesAt = (key: string) => messageAt === key && (error || notice) ? messages : null
  // A result whose form is not on the screen any more still shows: at the top of the page, as before slice E4.
  const placed = messageAt === siteMessageKeys.create || sites.some((site) => messageAt === siteMessageKeys.edit(site.id))
  // With more than one local, «Horarios» opens on the first one: the step says which one to choose there.
  const nextStep = createdSite && messageAt === siteMessageKeys.create && notice && !error ? <div className="form-stack">
    <p className="muted">{`Para que tu equipo marque en ${createdSite.name}, falta crear su horario.${sites.length > 1 ? ` En Horarios, elegí ${createdSite.name} en «Local».` : ''}`}</p>
    <div className="button-row"><SectionLink section="plantillas" onNavigate={onNavigate}>Crear su horario en Horarios</SectionLink></div>
  </div> : null
  const createResult = messagesAt(siteMessageKeys.create) && <>{messagesAt(siteMessageKeys.create)}{nextStep}</>

  // The point that will be saved, with what says where it came from and, for a captured or typed point, its confirmation.
  const chosenPoint = (coordinates: SiteCoordinates, origin: string, confirmation: ReactNode) => <div className="site-location-selection">
    <span className="site-location-coordinates">Latitud {coordinates.latitude.toFixed(7)} · Longitud {coordinates.longitude.toFixed(7)}</span>
    <a href={openStreetMapHref(coordinates)} target="_blank" rel="noreferrer noopener">Revisar este punto en el mapa</a>
    <span className="field-hint">{origin}</span>
    {confirmation}
  </div>
  // A wrong pair marks the two boxes (the group says why); the focus goes to the first of them when its fold is open.
  const manualCoordinates = (latitude: string, longitude: string, disabled: boolean, invalid: boolean, onChange: (field: 'latitude' | 'longitude', value: string) => void) => <details className="fold">
    <summary>Escribir las coordenadas a mano</summary>
    <div className="form-grid">
      <FormField label="Latitud" hint="Entre -90 y 90."><input type="number" step="any" min="-90" max="90" value={latitude} aria-invalid={invalid || undefined} disabled={disabled} onChange={(event) => onChange('latitude', event.target.value)} /></FormField>
      <FormField label="Longitud" hint="Entre -180 y 180."><input type="number" step="any" min="-180" max="180" value={longitude} aria-invalid={invalid || undefined} disabled={disabled} onChange={(event) => onChange('longitude', event.target.value)} /></FormField>
    </div>
  </details>
  /** The help of the location group: read before the buttons it explains, as the hint of a field. */
  const locationHelp = 'Lo más fácil: tocá «Elegir en el mapa», buscá la dirección y tocá la puerta del local. La ubicación de este dispositivo solo sirve si es precisa (hasta 25 m).'

  const editForm = (site: Site, edit: SiteLocationEditDraft) => {
    const capturing = edit.locationStatus === 'loading'
    return <form id={siteFocusIds.locationForm(site.id)} className="inline-form" aria-label={`Cambiar ubicación de ${site.name}`} noValidate onSubmit={onSaveLocationEdit}>
      <Fieldset legend="¿Dónde queda el local?" hint={locationHelp} error={editErrors.coordinates || editErrors.confirmation}>
        <div className="button-row">
          {!editMapOpen && <button type="button" id={siteFocusIds.mapButton({ kind: 'edit', siteId: site.id })} className="button button-secondary" disabled={busy || capturing} onClick={() => onOpenMap({ kind: 'edit', siteId: site.id })}>Elegir en el mapa</button>}
          <button type="button" id={siteFocusIds.captureButton({ kind: 'edit', siteId: site.id })} className="button button-secondary" disabled={busy} onClick={() => capturing ? onCancelLocationCapture() : onCaptureEditLocation(site.id)}>{capturing ? 'Cancelar búsqueda' : edit.latitude && edit.longitude ? 'Capturar otra ubicación' : 'Capturar ubicación del dispositivo'}</button>
          {(edit.latitude || edit.longitude) && <button type="button" className="button button-danger" disabled={busy || capturing} onClick={onClearEditLocation}>Quitar ubicación</button>}
        </div>
        {editMapOpen && siteMap && <SiteMapPanel state={siteMap} radiusMeters={mapRadiusMeters(edit.geofenceRadiusMeters)} disabled={busy} {...mapCallbacks} />}
        <LocationLine status={edit.locationStatus} message={edit.locationMessage} errorKind={edit.locationErrorKind} />
        {editCoordinates && chosenPoint(editCoordinates, edit.locationSource === 'CAPTURED'
          ? `Precisión informada por el dispositivo: ±${edit.locationAccuracyMeters?.toFixed(1) ?? '—'} m (estimación; no garantiza exactitud).`
          : edit.locationSource === 'MANUAL' ? edit.locationFromMap ? 'Punto elegido en el mapa.' : 'Punto escrito a mano.' : 'Es el punto guardado ahora para este local.',
        edit.locationSource !== null && <label className="check"><input type="checkbox" checked={edit.locationConfirmed} aria-invalid={Boolean(editErrors.confirmation) || undefined} disabled={busy || capturing} onChange={(event) => onLocationEditChange({ locationConfirmed: event.target.checked })} />Confirmo que este punto corresponde al local.</label>)}
        {manualCoordinates(edit.latitude, edit.longitude, busy || capturing, Boolean(editErrors.coordinates), (field, value) => onLocationEditChange(field === 'latitude' ? { latitude: value } : { longitude: value }))}
      </Fieldset>
      <FormField label={RADIUS_LABEL} hint={`${RADIUS_HINT} Desde el punto elegido: entre 50 y 500 m, en números enteros.`} error={editErrors.radius}><input type="number" required min="50" max="500" step="1" value={edit.geofenceRadiusMeters} onChange={(event) => onLocationEditChange({ geofenceRadiusMeters: event.target.value })} /></FormField>
      {/* The result of saving, right above the buttons (design system 4.7). */}
      {messagesAt(siteMessageKeys.edit(site.id)) && <div className="form-result">{messagesAt(siteMessageKeys.edit(site.id))}</div>}
      <div className="button-row"><button className="button button-primary" disabled={busy || capturing}>{busy ? 'Guardando…' : 'Guardar ubicación'}</button><button type="button" className="button button-link" disabled={busy} onClick={onCancelLocationEdit}>Cancelar</button></div>
    </form>
  }

  return <>
    {/* The horarios of a local are made in «Horarios», not here (#177). */}
    <PageHeading title="Locales" subtitle="Cada local tiene su nombre, la hora que usa y dónde queda. Sus horarios se arman en Horarios." />
    {!placed && messages}
    <div className="content-grid">
      {/* Written out instead of Panel: its title names the list. */}
      <section className="panel" aria-labelledby={LIST_HEADING_ID}>
        <div className="panel-heading"><h2 id={LIST_HEADING_ID}>Locales registrados</h2></div>
        {loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : sites.length ? <ul className="record-list" aria-labelledby={LIST_HEADING_ID}>{sites.map((site) => {
          const editing = locationEdit?.siteId === site.id ? locationEdit : null
          return <li key={site.id} className="record" aria-labelledby={`site-${site.id}-name`}>
            <p className="record-title"><strong id={`site-${site.id}-name`}>{site.name}</strong></p>
            <p className="record-meta">{`Hora de ${timeZoneLabel(site.timeZone)}`}</p>
            {/* Without a point the distance measures from nowhere: the local says only that it has no location. */}
            {typeof site.latitude === 'number' && typeof site.longitude === 'number' ? <>
              <p className="record-meta">Ubicación cargada</p>
              {typeof site.geofenceRadiusMeters === 'number' && <p className="record-meta">{`Distancia alrededor del local: ${site.geofenceRadiusMeters} m`}</p>}
            </> : <p className="record-meta">Sin ubicación cargada</p>}
            {/* Link buttons: they open something under the record; the filled button belongs to the form they open. */}
            <div className="record-actions">
              <button type="button" id={siteFocusIds.locationButton(site.id)} className="button button-link" disabled={busy} aria-label={`Cambiar ubicación de ${site.name}`} onClick={() => onBeginLocationEdit(site)}>Cambiar ubicación</button>
              <button type="button" className="button button-link" disabled={busy} aria-expanded={siteLocationAuditFor === site.id} aria-controls={`site-location-audit-${site.id}`} onClick={() => onToggleSiteLocationAudit(site.id)}>{siteLocationAuditFor === site.id ? 'Ocultar historial' : 'Ver historial de ubicación'}</button>
            </div>
            {/* The open form, or the result of the one that just closed, where it was. */}
            {editing ? editForm(site, editing) : messagesAt(siteMessageKeys.edit(site.id))}
            {siteLocationAuditFor === site.id && <SiteLocationAuditSection siteId={site.id} siteName={site.name} timeZone={site.timeZone} audit={siteLocationAudit} loading={siteLocationAuditLoading} error={siteLocationAuditError} onRetry={onRetrySiteLocationAudit} />}
          </li>
        })}</ul> : <Empty>Todavía no hay locales.</Empty>}
      </section>
      <Panel title="Agregar local"><form id={siteFocusIds.createForm} className="form-stack" noValidate onSubmit={onSubmit}>
        <FormField label="Nombre del local" hint="Ej. Local Centro" error={createErrors.name}><input required maxLength={120} value={name} onChange={(event) => onNameChange(event.target.value)} /></FormField>
        <Fieldset legend="¿Dónde queda el local?" hint={`Opcional. ${locationHelp} También podés crear el local sin ubicación.`} error={createErrors.coordinates || createErrors.confirmation}>
          <div className="button-row">
            {!createMapOpen && <button type="button" id={siteFocusIds.mapButton({ kind: 'create' })} className="button button-secondary" disabled={busy || locating} onClick={() => onOpenMap({ kind: 'create' })}>Elegir en el mapa</button>}
            <button type="button" id={siteFocusIds.captureButton({ kind: 'create' })} className="button button-secondary" disabled={busy} onClick={locating ? onCancelLocationCapture : onCaptureLocation}>{locating ? 'Cancelar búsqueda' : createLatitude || createLongitude ? 'Capturar otra ubicación' : 'Capturar ubicación del dispositivo'}</button>
            {(createLatitude || createLongitude) && <button type="button" className="button button-danger" disabled={busy || locating} onClick={onClearLocation}>Quitar ubicación</button>}
          </div>
          {createMapOpen && siteMap && <SiteMapPanel state={siteMap} radiusMeters={mapRadiusMeters(createRadiusMeters)} disabled={busy} {...mapCallbacks} />}
          <LocationLine status={locationStatus} message={locationMessage} errorKind={locationErrorKind} />
          {createCoordinates && chosenPoint(createCoordinates, createLocationSource === 'CAPTURED'
            ? `Precisión informada por el dispositivo: ±${locationAccuracyMeters?.toFixed(1) ?? '—'} m (estimación; no garantiza exactitud).`
            : createPointFromMap ? 'Punto elegido en el mapa.' : 'Punto escrito a mano.',
          <label className="check"><input type="checkbox" checked={locationConfirmed} aria-invalid={Boolean(createErrors.confirmation) || undefined} disabled={busy || locating} onChange={(event) => onLocationConfirmedChange(event.target.checked)} />Confirmo que este punto corresponde al local.</label>)}
          {manualCoordinates(createLatitude, createLongitude, busy || locating, Boolean(createErrors.coordinates), onCreateCoordinateChange)}
        </Fieldset>
        <FormField label={RADIUS_LABEL} hint={`${RADIUS_HINT} Desde el punto elegido: entre 50 y 500 m. Si no sabés, dejá 100 m.`} error={createErrors.radius}><input type="number" required min="50" max="500" step="1" value={createRadiusMeters} onChange={(event) => onCreateRadiusMetersChange(event.target.value)} /></FormField>
        <SiteZoneField value={timeZone} onChange={onTimeZoneChange} />
        {/* The result of the form, right above its button (design system 4.7); while a capture runs, its line with
            «Cancelar búsqueda» in the group above says why «Crear local» waits. */}
        {(Object.keys(createErrors).length > 1 || createResult) && <div className="form-result"><FieldsSummary count={Object.keys(createErrors).length} />{createResult}</div>}
        <div className="button-row"><button className="button button-primary" disabled={busy || locating}>{busy ? 'Guardando…' : 'Crear local'}</button></div>
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


/** The changes of a local's location, opened under its record: a part of that record, so an h3 over a list of records (4.12). */
export function SiteLocationAuditSection({ siteId, siteName, timeZone, audit, loading, error, onRetry }: {
  siteId: string; siteName: string; timeZone: string; audit: SiteLocationAuditResponse | null; loading: boolean; error: string; onRetry: () => void
}) {
  return <section id={`site-location-audit-${siteId}`} aria-label={`Historial de ubicación de ${siteName}`} className="inline-form">
    <h3>Historial de ubicación</h3>
    {loading ? <Loading label="Cargando historial de ubicación…" /> : error ? <LoadFailure message={error} onRetry={onRetry} /> : !audit ? null : audit.entries.length === 0 ? <Empty>Este local todavía no tiene cambios de ubicación auditados.</Empty> : <ol className="record-list" aria-label={`Cambios de ubicación de ${siteName}`}>{audit.entries.map((entry) => {
      const initial = entry.beforeLatitude == null && entry.beforeLongitude == null && entry.beforeRadiusMeters == null
      return <li key={entry.id} className="record">
        <p className="record-title"><strong>{initial ? 'Configuración inicial de ubicación' : 'Ubicación y radio actualizados'}</strong></p>
        <p className="record-meta"><time dateTime={entry.changedAt}>{dateTime(entry.changedAt, timeZone)}</time></p>
        <p className="record-meta">Por {entry.actorDisplayName?.trim() || 'un administrador'}</p>
        {entry.locationSource && <p className="record-meta">Origen del punto: {entry.locationSource === 'CAPTURED' ? 'captura automática' : 'carga manual'}</p>}
        <p className="record-meta">Centro anterior: {siteCenter(entry.beforeLatitude, entry.beforeLongitude)} · radio: {radiusText(entry.beforeRadiusMeters)}</p>
        <p className="record-meta">Centro nuevo: {siteCenter(entry.afterLatitude, entry.afterLongitude)} · radio: {radiusText(entry.afterRadiusMeters)}</p>
      </li>
    })}</ol>}
  </section>
}
