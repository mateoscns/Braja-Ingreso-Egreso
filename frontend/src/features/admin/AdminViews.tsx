import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Deviation, Employee, Jornada, JornadaAudit, JornadaSummary, Mark, MarkAction, PasswordReset, Site, SiteCoordinates, Template, TemplateAssignment } from '../../shared/api/types'
import { deviceDate, validateDateRange, DATE_PAIR_MESSAGE } from '../../shared/dateRange'
import { declarationFailureMessage } from './bulkDeclaration'
import type { AdminSection } from './setupStatus'
import { useWideTable } from '../../app/useBreakpoint'
import { WorkDaysPanel } from './WorkDaysPanel'
import { isRegionTimeZone, REGION_TIME_ZONE_MESSAGE } from './siteZone'
import { PASSWORD_TOO_LONG_MESSAGE, passwordTooLong } from '../../shared/password'
import { captureSiteCoordinates, parseGeofenceRadiusMeters, SiteLocationError, type SiteLocationErrorKind } from './siteLocation'
import { approximateDevicePosition, normalizePickedPoint, SEARCH_RESULT_ZOOM, siteMapInitialView } from './siteMap'
import { GeocodeError, searchAddress, type GeocodeResult } from '../../shared/api/geocode'
import {
  AdminHistoryRender,
  AdminInboxRender,
  EMPTY_INBOX_FILTERS,
  JourneysViewRender,
  SitesViewRender,
  type SiteLocationAuditResponse,
  type SiteLocationEditDraft,
  type SiteMapState,
  type DeviationClassification,
  type HistoryFilterValues,
  type InboxFilterValues,
  type JourneyRow
} from './AdminViewsRender'
import { EmployeesViewRender, employeeDetailId, ISSUED_PASSWORD_ID, TemplateAssignmentsRender, type IssuedPassword } from './EmployeesViewRender'
import { generateTemporaryPassword } from './temporaryPassword'

const dateInBrowserZone = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const errText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.'
// The server reuses the employee mark-order codes on ADMIN forms; there they mean the typed time or action breaks the jornada order.
const MARK_ORDER_CODES = new Set(['INVALID_MARK_ORDER', 'INVALID_MARK_HISTORY', 'INVALID_MARK_TRANSITION'])
const markFormErrText = (error: unknown) => MARK_ORDER_CODES.has((error as { code?: string } | null)?.code ?? '')
  ? 'La hora o la acción no encajan con las demás marcas de la jornada. Revisá el orden.'
  : errText(error)
function dateTimeParts(value: string, timeZone: string) {
  const entries = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value))
  return Object.fromEntries(entries.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function instantForSiteTime(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const desired = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0) }
  const target = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second)
  if (new Date(target).getUTCFullYear() !== desired.year || new Date(target).getUTCMonth() + 1 !== desired.month || new Date(target).getUTCDate() !== desired.day) return null
  try {
    const candidates = new Set<number>()
    for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
      const sample = target + hours * 60 * 60 * 1000
      const parts = dateTimeParts(new Date(sample).toISOString(), timeZone)
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
      const candidate = target - (asUtc - sample)
      const final = dateTimeParts(new Date(candidate).toISOString(), timeZone)
      if (final.year === desired.year && final.month === desired.month && final.day === desired.day && final.hour === desired.hour && final.minute === desired.minute && final.second === desired.second) candidates.add(candidate)
    }
    if (candidates.size !== 1) return null
    return new Date([...candidates][0]).toISOString()
  } catch { return null }
}

function siteTimeInput(value: string, timeZone: string): string {
  try {
    const parts = dateTimeParts(value, timeZone)
    // Minutes only: the time inputs have no seconds, and a value with seconds would fail the browser's step check.
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  } catch { return '' }
}

type LocationCaptureTarget = { kind: 'create' } | { kind: 'edit'; siteId: string }

/** The form's coordinate pair when both are numbers in range, else null (the map then starts elsewhere). */
function validCoordinates(latitudeText: string, longitudeText: string): SiteCoordinates | null {
  if (!latitudeText.trim() || !longitudeText.trim()) return null
  const latitude = Number(latitudeText)
  const longitude = Number(longitudeText)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

export function AdminInbox({ coverage, onOpenJornada }: { coverage?: ReactNode; onOpenJornada?: (item: Deviation) => void } = {}) {
  const [items, setItems] = useState<Deviation[]>([])
  const [timeZones, setTimeZones] = useState<Map<string, string>>(new Map())
  const [sites, setSites] = useState<Site[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filters, setFilters] = useState<InboxFilterValues>(EMPTY_INBOX_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<InboxFilterValues>(EMPTY_INBOX_FILTERS)
  const [filterError, setFilterError] = useState('')
  const generation = useRef(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inboxLoadError, setInboxLoadError] = useState('')
  const [timeZoneLoadError, setTimeZoneLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [correction, setCorrection] = useState<{ deviationId: string; classification: DeviationClassification } | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [targetDeviation] = useState(() => new URLSearchParams(window.location.search).get('deviation') ?? '')
  const narrow = !useWideTable()
  // A new filter set always starts from the first page: a cursor is only valid for the filters that produced it.
  const reload = async (active: InboxFilterValues = appliedFilters) => {
    const requestId = ++generation.current
    setLoading(true); setInboxLoadError(''); setTimeZoneLoadError(''); setError(''); setNotice(''); setNextCursor(null)
    try {
      const [page, sitesResult] = await Promise.all([
        api.get<{ items: Deviation[]; nextCursor?: string | null }>(`/inbox${queryString({ limit: 50, ...active })}`),
        api.get<Site[]>('/sites').then(
          (sites) => ({ sites, error: '' }),
          (reason) => ({ sites: [] as Site[], error: errText(reason) })
        )
      ])
      if (requestId !== generation.current) return
      setItems(page.items); setNextCursor(page.nextCursor ?? null)
      setSites(sitesResult.sites)
      setTimeZones(new Map(sitesResult.sites.map((site) => [site.id, site.timeZone])))
      setTimeZoneLoadError(sitesResult.error)
    }
    catch (reason) { if (requestId !== generation.current) return; setItems([]); setNextCursor(null); setInboxLoadError(errText(reason)) } finally { if (requestId === generation.current) setLoading(false) }
  }
  useEffect(() => { void reload(EMPTY_INBOX_FILTERS) }, [])
  useEffect(() => { api.get<Employee[]>('/employees').then(setEmployees, () => setEmployees([])) }, [])
  function applyFilters() {
    const problem = validateDateRange(filters.from, filters.to)
    if (problem) { setFilterError(problem); return }
    setFilterError(''); setAppliedFilters(filters); void reload(filters)
  }
  function clearFilters() {
    setFilters(EMPTY_INBOX_FILTERS); setAppliedFilters(EMPTY_INBOX_FILTERS); setFilterError(''); void reload(EMPTY_INBOX_FILTERS)
  }
  useEffect(() => {
    if (!loading && targetDeviation) {
      const target = document.getElementById(`deviation-${targetDeviation}`)
      if (!target) return
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    }
  }, [loading, items, targetDeviation])
  async function classify(item: Deviation, classification: DeviationClassification, reason?: string) {
    setBusy(item.id); setError(''); setNotice('')
    try {
      const updated = await api.put<Deviation>(`/admin/deviations/${encodeURIComponent(item.id)}/classification`, {
        classification, ...(reason?.trim() ? { correctionReason: reason.trim() } : {})
      })
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setCorrection(null); setCorrectionReason('')
      setNotice('Clasificación guardada.')
    } catch (reason) { setError(errText(reason)) } finally { setBusy('') }
  }
  function requestClassification(item: Deviation, classification: DeviationClassification) {
    if (item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO') {
      setCorrection({ deviationId: item.id, classification }); setCorrectionReason('')
    } else void classify(item, classification)
  }
  async function loadMore() {
    if (!nextCursor) return
    const requestId = generation.current
    setBusy('page'); setError('')
    try {
      const page = await api.get<{ items: Deviation[]; nextCursor?: string | null }>(`/inbox${queryString({ limit: 50, ...appliedFilters, cursor: nextCursor })}`)
      if (requestId !== generation.current) return
      setItems((current) => [...current, ...page.items]); setNextCursor(page.nextCursor ?? null)
    } catch (reason) { if (requestId === generation.current) setError(errText(reason)) } finally { setBusy('') }
  }
  const filtered = Object.values(appliedFilters).some(Boolean)
  return <AdminInboxRender narrow={narrow} appliedFilters={appliedFilters} coverage={coverage} onOpenJornada={onOpenJornada} items={items} employees={employees} sites={sites} filters={filters} filterError={filterError} filtered={filtered} onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onApplyFilters={applyFilters} onClearFilters={clearFilters} timeZones={timeZones} nextCursor={nextCursor} loading={loading} inboxLoadError={inboxLoadError} timeZoneLoadError={timeZoneLoadError} error={error} notice={notice} busy={busy} correction={correction} correctionReason={correctionReason} targetDeviation={targetDeviation}
    onReload={() => void reload()} onClassify={requestClassification} onRetry={() => void reload()} onLoadMore={() => void loadMore()} onCorrectionReasonChange={setCorrectionReason}
    onSubmitCorrection={(item) => void classify(item, correction!.classification, correctionReason)} onCancelCorrection={() => { setCorrection(null); setCorrectionReason('') }} />
}

export function AdminHistory() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [filters, setFilters] = useState<HistoryFilterValues>(() => ({ employeeId: '', siteId: '', from: deviceDate(6), to: deviceDate() }))
  const [filterError, setFilterError] = useState('')
  const [rows, setRows] = useState<JornadaSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  async function loadOptions() {
    setLoadingOptions(true); setOptionsError('')
    try {
      const [people, availableSites] = await Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites')])
      setEmployees(people); setSites(availableSites)
    } catch (reason) { setOptionsError(errText(reason)) } finally { setLoadingOptions(false) }
  }
  useEffect(() => { void loadOptions() }, [])
  async function search() {
    const problem = !filters.employeeId && !filters.siteId ? 'Elegí un empleado o una sede.' : !filters.from || !filters.to ? DATE_PAIR_MESSAGE : validateDateRange(filters.from, filters.to)
    if (problem) { setFilterError(problem); return }
    const requestId = ++request.current
    setFilterError(''); setError(''); setLoading(true)
    try {
      const result = await api.get<JornadaSummary[]>(`/jornadas${queryString({ from: filters.from, to: filters.to, employeeId: filters.employeeId, siteId: filters.siteId, includeDetail: 'true' })}`)
      if (requestId === request.current) setRows(result)
    } catch (reason) {
      if (requestId !== request.current) return
      setRows(null)
      setError((reason as { status?: number } | null)?.status === 422
        ? 'Son demasiados datos para una sola consulta: acotá el rango de fechas o elegí un empleado o una sede (hasta 366 días y 500 jornadas).'
        : errText(reason))
    } finally { if (requestId === request.current) setLoading(false) }
  }
  return <AdminHistoryRender employees={employees} sites={sites} loadingOptions={loadingOptions} optionsError={optionsError} filters={filters} filterError={filterError} rows={rows} loading={loading} error={error}
    onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onSearch={() => void search()} onRetryOptions={() => void loadOptions()} />
}

export function SitesView() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState('America/Argentina/Buenos_Aires')
  const [siteLocation, setSiteLocation] = useState<SiteCoordinates | null>(null)
  const [createLatitude, setCreateLatitude] = useState('')
  const [createLongitude, setCreateLongitude] = useState('')
  const [createLocationSource, setCreateLocationSource] = useState<'CAPTURED' | 'MANUAL' | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'selected' | 'error'>('idle')
  const [locationMessage, setLocationMessage] = useState('')
  const [locationErrorKind, setLocationErrorKind] = useState<SiteLocationErrorKind | null>(null)
  const [locationAccuracyMeters, setLocationAccuracyMeters] = useState<number | null>(null)
  const [locationConfirmed, setLocationConfirmed] = useState(false)
  const [createRadiusMeters, setCreateRadiusMeters] = useState('100')
  const [locationEdit, setLocationEdit] = useState<SiteLocationEditDraft | null>(null)
  const [siteLocationAuditFor, setSiteLocationAuditFor] = useState('')
  const [siteLocationAudit, setSiteLocationAudit] = useState<SiteLocationAuditResponse | null>(null)
  const [siteLocationAuditLoading, setSiteLocationAuditLoading] = useState(false)
  const [siteLocationAuditError, setSiteLocationAuditError] = useState('')
  const locationCaptureController = useRef<AbortController | null>(null)
  const locationCaptureTarget = useRef<LocationCaptureTarget | null>(null)
  const siteLocationAuditRequest = useRef(0)
  // D-20261109-01: the map picker of one form at a time; its controller cancels the rough device position and the address search.
  const [siteMap, setSiteMap] = useState<SiteMapState | null>(null)
  const [createPointFromMap, setCreatePointFromMap] = useState(false)
  const siteMapController = useRef<AbortController | null>(null)
  const lastMapSearchAt = useRef<number | null>(null)
  const mapSearchInFlight = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => {
    locationCaptureController.current?.abort()
    locationCaptureController.current = null
    locationCaptureTarget.current = null
    siteMapController.current?.abort()
    siteMapController.current = null
    siteLocationAuditRequest.current += 1
  }, [])
  async function reload() {
    setLoading(true); setLoadError(''); setError(''); setNotice('')
    try { setSites(await api.get<Site[]>('/sites')) } catch (reason) { setSites([]); setLoadError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])
  async function captureLocation() {
    return captureLocationFor({ kind: 'create' })
  }
  async function captureLocationFor(target: LocationCaptureTarget) {
    cancelLocationCapture()
    if (siteMap) closeSiteMap()
    const controller = new AbortController()
    locationCaptureController.current = controller
    locationCaptureTarget.current = target
    if (target.kind === 'create') {
      setLocationConfirmed(false)
      setLocationStatus('loading'); setLocationErrorKind(null); setLocationMessage('Buscando la ubicación actual del dispositivo…')
    } else {
      setLocationEdit((current) => current?.siteId === target.siteId ? {
        ...current, locationConfirmed: current.locationSource === 'CAPTURED' ? false : current.locationConfirmed,
        locationStatus: 'loading', locationErrorKind: null,
        locationMessage: 'Buscando la ubicación actual del dispositivo…'
      } : current)
    }
    try {
      const coordinates = await captureSiteCoordinates(undefined, controller.signal)
      if (locationCaptureController.current !== controller || locationCaptureTarget.current !== target) return
      if (target.kind === 'create') {
        setSiteLocation({ latitude: coordinates.latitude, longitude: coordinates.longitude })
        setCreateLatitude(String(coordinates.latitude)); setCreateLongitude(String(coordinates.longitude)); setCreateLocationSource('CAPTURED'); setCreatePointFromMap(false)
        setLocationAccuracyMeters(coordinates.accuracyMeters); setLocationConfirmed(false); setLocationStatus('selected')
        setLocationMessage('Ubicación recibida. Revisá las coordenadas, la precisión y el mapa; confirmá que el punto corresponde a esta sede antes de guardarla.')
      } else {
        setLocationEdit((current) => current?.siteId === target.siteId ? {
          ...current, latitude: String(coordinates.latitude), longitude: String(coordinates.longitude),
          locationSource: 'CAPTURED', locationFromMap: false, locationAccuracyMeters: coordinates.accuracyMeters, locationConfirmed: false,
          locationStatus: 'selected', locationErrorKind: null,
          locationMessage: 'Ubicación recibida. Revisá las coordenadas, la precisión y el mapa; confirmá que el nuevo punto corresponde a esta sede antes de guardarlo.'
        } : current)
      }
    } catch (reason) {
      if (controller.signal.aborted || locationCaptureController.current !== controller || locationCaptureTarget.current !== target) return
      const kind = reason instanceof SiteLocationError ? reason.kind : 'unavailable'
      if (target.kind === 'create') {
        setLocationStatus('error'); setLocationErrorKind(kind)
        const fallback = createLatitude || createLongitude ? ' Se conserva el punto que ya habías elegido; revisalo y confirmalo de nuevo antes de guardar.' : ''
        setLocationMessage(`${reason instanceof Error ? reason.message : 'No se pudo obtener la ubicación. Volvé a intentar.'}${fallback}`)
      } else {
        setLocationEdit((current) => current?.siteId === target.siteId ? {
          ...current, locationStatus: 'error', locationErrorKind: kind,
          locationMessage: `${reason instanceof Error ? reason.message : 'No se pudo obtener la ubicación. Volvé a intentar.'}${current.latitude && current.longitude ? ` Se conserva el punto que ya habías elegido.${current.locationSource === 'CAPTURED' ? ' Revisalo y confirmalo de nuevo antes de guardar.' : ''}` : ''}`
        } : current)
      }
    } finally {
      if (locationCaptureController.current === controller) {
        locationCaptureController.current = null
        locationCaptureTarget.current = null
      }
    }
  }
  function cancelLocationCapture() {
    const controller = locationCaptureController.current
    if (!controller) return
    const target = locationCaptureTarget.current
    locationCaptureController.current = null
    locationCaptureTarget.current = null
    controller.abort()
    if (target?.kind === 'edit') {
      setLocationEdit((current) => current?.siteId === target.siteId ? {
        ...current, locationStatus: current.latitude && current.longitude ? 'selected' : 'idle', locationErrorKind: null,
        locationMessage: current.latitude && current.longitude
          ? `Se canceló la búsqueda; se conserva el punto seleccionado.${current.locationSource === 'CAPTURED' ? ' Revisalo y confirmalo de nuevo antes de guardar.' : ''}`
          : 'Búsqueda cancelada. Podés dejar el centro vacío.'
      } : current)
    } else {
      const hasPoint = Boolean(createLatitude || createLongitude)
      setLocationStatus(hasPoint ? 'selected' : 'idle'); setLocationErrorKind(null)
      setLocationMessage(hasPoint
        ? 'Se canceló la búsqueda; se conserva el punto elegido. Revisalo y confirmalo de nuevo antes de guardar.'
        : 'Búsqueda cancelada. Podés crear la sede sin centro.')
    }
  }
  function clearLocation() {
    cancelLocationCapture()
    if (siteMap?.target.kind === 'create') closeSiteMap()
    setSiteLocation(null); setLocationStatus('idle'); setLocationMessage(''); setLocationErrorKind(null)
    setCreateLatitude(''); setCreateLongitude(''); setCreateLocationSource(null); setCreatePointFromMap(false)
    setLocationAccuracyMeters(null); setLocationConfirmed(false)
  }
  function updateCreateCoordinate(field: 'latitude' | 'longitude', value: string) {
    if (locationStatus === 'loading') return
    const nextLatitude = field === 'latitude' ? value : createLatitude
    const nextLongitude = field === 'longitude' ? value : createLongitude
    setCreateLatitude(nextLatitude); setCreateLongitude(nextLongitude)
    setSiteLocation(null); setLocationAccuracyMeters(null); setLocationConfirmed(false)
    const hasPoint = Boolean(nextLatitude.trim() || nextLongitude.trim())
    setCreateLocationSource(hasPoint ? 'MANUAL' : null); setCreatePointFromMap(false)
    setLocationStatus(hasPoint ? 'selected' : 'idle'); setLocationErrorKind(null)
    setLocationMessage(hasPoint ? 'Carga manual. Revisá el punto en el mapa y confirmá que corresponde a esta sede antes de guardarla.' : '')
  }
  function beginLocationEdit(site: Site) {
    cancelLocationCapture()
    if (siteMap?.target.kind === 'edit') closeSiteMap()
    siteLocationAuditRequest.current += 1
    setSiteLocationAuditFor(''); setSiteLocationAudit(null); setSiteLocationAuditError(''); setSiteLocationAuditLoading(false)
    setLocationEdit({
      siteId: site.id,
      latitude: site.latitude == null ? '' : String(site.latitude),
      longitude: site.longitude == null ? '' : String(site.longitude),
      geofenceRadiusMeters: String(site.geofenceRadiusMeters ?? 100),
      locationStatus: site.latitude != null && site.longitude != null ? 'selected' : 'idle',
      locationMessage: '', locationErrorKind: null, locationAccuracyMeters: null, locationConfirmed: true, locationSource: null
    })
    setError(''); setNotice('')
  }
  function cancelLocationEdit() {
    cancelLocationCapture()
    if (siteMap?.target.kind === 'edit') closeSiteMap()
    setLocationEdit(null); setError('')
  }
  function clearEditLocation() {
    cancelLocationCapture()
    setLocationEdit((current) => current ? {
      ...current, latitude: '', longitude: '', locationStatus: 'idle',
      locationMessage: 'El centro quedará vacío cuando guardes los cambios.', locationErrorKind: null,
      locationAccuracyMeters: null, locationConfirmed: true, locationSource: null, locationFromMap: false,
    } : current)
  }
  function updateLocationEdit(patch: Partial<SiteLocationEditDraft>) {
    setLocationEdit((current) => {
      if (!current) return current
      const updated = { ...current, ...patch }
      if ('latitude' in patch || 'longitude' in patch) {
        if (current.locationStatus === 'loading') return current
        const hasPoint = Boolean(updated.latitude.trim() || updated.longitude.trim())
        return {
          ...updated,
          locationSource: hasPoint ? 'MANUAL' : null,
          locationFromMap: false,
          locationAccuracyMeters: null,
          locationConfirmed: false,
          locationStatus: hasPoint ? 'selected' : 'idle',
          locationErrorKind: null,
          locationMessage: hasPoint ? 'Carga manual. Revisá el punto en el mapa y confirmá que corresponde a esta sede antes de guardarlo.' : ''
        }
      }
      return updated
    })
  }
  function closeSiteMap() {
    siteMapController.current?.abort()
    siteMapController.current = null
    mapSearchInFlight.current = null
    setSiteMap(null)
  }
  function openSiteMap(target: LocationCaptureTarget) {
    cancelLocationCapture()
    closeSiteMap()
    const center = target.kind === 'create'
      ? validCoordinates(createLatitude, createLongitude)
      : locationEdit?.siteId === target.siteId ? validCoordinates(locationEdit.latitude, locationEdit.longitude) : null
    const controller = new AbortController()
    siteMapController.current = controller
    const initialView = siteMapInitialView(center, null)
    setSiteMap({ target, view: initialView, point: center, query: '', searchStatus: 'idle', searchMessage: '', results: [] })
    if (center) return
    // Only to center the map, whatever its accuracy; it is never saved. A tap or a search result wins over a late answer.
    void approximateDevicePosition(undefined, controller.signal).then((position) => {
      if (!position || siteMapController.current !== controller) return
      setSiteMap((current) => current && current.point === null && current.view === initialView
        ? { ...current, view: siteMapInitialView(null, position) } : current)
    })
  }
  function pickSiteMapPoint(raw: SiteCoordinates) {
    const point = normalizePickedPoint(raw.latitude, raw.longitude)
    if (point) setSiteMap((current) => current ? { ...current, point } : current)
  }
  async function searchSiteMap() {
    const controller = siteMapController.current
    if (!siteMap || !controller || mapSearchInFlight.current === controller) return
    const query = siteMap.query.trim()
    if (!query) {
      setSiteMap((current) => current ? { ...current, searchStatus: 'error', searchMessage: 'Escribí la dirección del local para buscarla.', results: [] } : current)
      return
    }
    // Nominatim's usage policy: at most one request per second and per explicit search, never while typing.
    const now = Date.now()
    if (lastMapSearchAt.current !== null && now - lastMapSearchAt.current < 1000) return
    lastMapSearchAt.current = now
    mapSearchInFlight.current = controller
    setSiteMap((current) => current ? { ...current, searchStatus: 'loading', searchMessage: '', results: [] } : current)
    try {
      const results = await searchAddress(query, { signal: controller.signal })
      if (siteMapController.current !== controller) return
      setSiteMap((current) => current ? {
        ...current, searchStatus: 'done', results,
        searchMessage: results.length ? 'Elegí el resultado que corresponde al local.' : 'No encontramos esa dirección. Probá con calle, número y localidad, o mové el mapa y tocá el lugar.'
      } : current)
    } catch (reason) {
      if (controller.signal.aborted || siteMapController.current !== controller) return
      setSiteMap((current) => current ? { ...current, searchStatus: 'error', results: [], searchMessage: (reason instanceof GeocodeError ? reason : new GeocodeError()).message } : current)
    } finally {
      if (mapSearchInFlight.current === controller) mapSearchInFlight.current = null
    }
  }
  function chooseSiteMapResult(result: GeocodeResult) {
    const point = { latitude: result.latitude, longitude: result.longitude }
    setSiteMap((current) => current ? {
      ...current, view: { ...point, zoom: SEARCH_RESULT_ZOOM }, point, results: [], searchStatus: 'done',
      searchMessage: 'Revisá el punto en el mapa; si no es la puerta del local, tocá el lugar exacto.'
    } : current)
  }
  function confirmSiteMapPoint() {
    if (!siteMap?.point) return
    const { latitude, longitude } = siteMap.point
    const target = siteMap.target
    if (target.kind === 'create') {
      setCreateLatitude(String(latitude)); setCreateLongitude(String(longitude)); setCreateLocationSource('MANUAL'); setCreatePointFromMap(true)
      // "Confirmar ubicación" on the map is the owner's confirmation of the point (D-20261109-01): asking again with the
      // checkbox was a second confirmation for the same thing. The checkbox stays for captured and hand-typed points.
      setSiteLocation(null); setLocationAccuracyMeters(null); setLocationConfirmed(true)
      setLocationStatus('selected'); setLocationErrorKind(null)
      setLocationMessage('Punto elegido en el mapa. Ya podés guardar la sede.')
    } else {
      setLocationEdit((current) => current?.siteId === target.siteId ? {
        ...current, latitude: String(latitude), longitude: String(longitude), locationSource: 'MANUAL', locationFromMap: true,
        locationAccuracyMeters: null, locationConfirmed: true, locationStatus: 'selected', locationErrorKind: null,
        locationMessage: 'Punto elegido en el mapa. Ya podés guardar la ubicación.'
      } : current)
    }
    closeSiteMap()
  }
  function closeSiteLocationAudit() {
    siteLocationAuditRequest.current += 1
    setSiteLocationAuditFor(''); setSiteLocationAudit(null); setSiteLocationAuditError(''); setSiteLocationAuditLoading(false)
  }
  async function loadSiteLocationAudit(siteId: string) {
    const requestId = ++siteLocationAuditRequest.current
    setSiteLocationAuditFor(siteId); setSiteLocationAudit(null); setSiteLocationAuditError(''); setSiteLocationAuditLoading(true)
    try {
      const result = await api.get<SiteLocationAuditResponse>(`/sites/${encodeURIComponent(siteId)}/location-audit`)
      if (requestId === siteLocationAuditRequest.current) setSiteLocationAudit(result)
    } catch (reason) {
      if (requestId === siteLocationAuditRequest.current) setSiteLocationAuditError(errText(reason))
    } finally {
      if (requestId === siteLocationAuditRequest.current) setSiteLocationAuditLoading(false)
    }
  }
  function toggleSiteLocationAudit(siteId: string) {
    if (siteLocationAuditFor === siteId) { closeSiteLocationAudit(); return }
    void loadSiteLocationAudit(siteId)
  }
  async function saveLocationEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!locationEdit) return
    setError(''); setNotice('')
    let geofenceRadiusMeters: number
    try { geofenceRadiusMeters = parseGeofenceRadiusMeters(locationEdit.geofenceRadiusMeters) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Revisá la distancia permitida para marcar.'); return }
    const hasLatitude = Boolean(locationEdit.latitude.trim())
    const hasLongitude = Boolean(locationEdit.longitude.trim())
    if (hasLatitude !== hasLongitude) {
      setError('Ingresá latitud y longitud juntas, o dejá ambas vacías para quitar el centro guardado.')
      return
    }
    let coordinates: SiteCoordinates | null = null
    if (hasLatitude && hasLongitude) {
      const latitude = Number(locationEdit.latitude)
      const longitude = Number(locationEdit.longitude)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        setError('Ingresá una latitud entre -90 y 90 y una longitud entre -180 y 180; también podés capturar el punto o dejar el centro vacío.')
        return
      }
      coordinates = { latitude, longitude }
      if (locationEdit.locationSource !== null && !locationEdit.locationConfirmed) {
        setError('Confirmá que el nuevo punto corresponde a esta sede antes de guardarlo.')
        return
      }
    }
    setBusy(true)
    try {
      const updated = await api.put<Site>(`/sites/${encodeURIComponent(locationEdit.siteId)}/location`, {
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        locationSource: coordinates ? locationEdit.locationSource : null,
        geofenceRadiusMeters
      })
      setSites((current) => current.map((site) => site.id === updated.id ? updated : site))
      if (siteMap?.target.kind === 'edit') closeSiteMap()
      setLocationEdit(null)
      setNotice('Ubicación de la sede actualizada.')
      closeSiteLocationAudit()
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    let geofenceRadiusMeters: number
    try { geofenceRadiusMeters = parseGeofenceRadiusMeters(createRadiusMeters) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Revisá la distancia permitida para marcar.'); return }
    const hasLatitude = Boolean(createLatitude.trim())
    const hasLongitude = Boolean(createLongitude.trim())
    if (hasLatitude !== hasLongitude) {
      setError('Ingresá latitud y longitud juntas, o dejá ambas vacías para crear la sede sin centro.')
      return
    }
    let coordinates: SiteCoordinates | null = null
    if (hasLatitude && hasLongitude) {
      const latitude = Number(createLatitude)
      const longitude = Number(createLongitude)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        setError('Ingresá una latitud entre -90 y 90 y una longitud entre -180 y 180.')
        return
      }
      coordinates = { latitude, longitude }
      if (!locationConfirmed) {
        setError('Revisá el punto en el mapa y confirmá que corresponde a esta sede antes de guardarla.')
        return
      }
    }
    if (!isRegionTimeZone(timeZone)) { setError(REGION_TIME_ZONE_MESSAGE); return }
    setBusy(true)
    try {
      const created = await api.post<Site>('/sites', {
        name: name.trim(), timeZone,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        locationSource: coordinates ? createLocationSource : null,
        geofenceRadiusMeters
      })
      setSites((current) => [...current, created]); setLoadError(''); setName(''); setCreateRadiusMeters('100'); clearLocation(); setNotice('Sede creada.')
    }
    catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  return <SitesViewRender sites={sites} loading={loading} loadError={loadError} error={error} notice={notice} name={name} timeZone={timeZone} busy={busy}
    createRadiusMeters={createRadiusMeters} createLatitude={createLatitude} createLongitude={createLongitude} createLocationSource={createLocationSource}
    siteMap={siteMap} createPointFromMap={createPointFromMap} onOpenMap={openSiteMap} onCloseMap={closeSiteMap} onMapPick={pickSiteMapPoint}
    onMapQueryChange={(query) => setSiteMap((current) => current ? { ...current, query } : current)} onMapSearch={() => void searchSiteMap()}
    onChooseMapResult={chooseSiteMapResult} onConfirmMapPoint={confirmSiteMapPoint}
    locationEdit={locationEdit} siteLocationAuditFor={siteLocationAuditFor} siteLocationAudit={siteLocationAudit} siteLocationAuditLoading={siteLocationAuditLoading} siteLocationAuditError={siteLocationAuditError}
    siteLocation={siteLocation} locationStatus={locationStatus} locationMessage={locationMessage} locating={locationStatus === 'loading'}
    locationErrorKind={locationErrorKind} locationAccuracyMeters={locationAccuracyMeters} locationConfirmed={locationConfirmed}
    onLocationConfirmedChange={setLocationConfirmed} onCancelLocationCapture={cancelLocationCapture}
    onCreateCoordinateChange={updateCreateCoordinate}
    onCreateRadiusMetersChange={setCreateRadiusMeters} onBeginLocationEdit={beginLocationEdit} onCancelLocationEdit={cancelLocationEdit}
    onCaptureEditLocation={(siteId) => void captureLocationFor({ kind: 'edit', siteId })} onClearEditLocation={clearEditLocation}
    onLocationEditChange={updateLocationEdit} onSaveLocationEdit={saveLocationEdit}
    onToggleSiteLocationAudit={toggleSiteLocationAudit} onRetrySiteLocationAudit={() => { if (siteLocationAuditFor) void loadSiteLocationAudit(siteLocationAuditFor) }}
    onCaptureLocation={() => void captureLocation()} onClearLocation={clearLocation}
    onReload={() => void reload()} onSubmit={submit} onNameChange={setName} onTimeZoneChange={setTimeZone} />
}

export function EmployeesView() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [dni, setDni] = useState(''); const [displayName, setDisplayName] = useState(''); const [siteIds, setSiteIds] = useState<string[]>([])
  const [tolerance, setTolerance] = useState('5'); const [temporaryPassword, setTemporaryPassword] = useState('')
  // A password made with «Generar contraseña»: the form says it is shown after creating the employee.
  const [generatedPassword, setGeneratedPassword] = useState(false)
  const cards = !useWideTable()
  // Edits live in a draft copy; the list only changes with what the server returns.
  const [draft, setDraft] = useState<Employee | null>(null)
  // Template assignments of one employee (D-20261015-02), loaded when its panel opens.
  const [assignmentsFor, setAssignmentsFor] = useState(''); const [assignments, setAssignments] = useState<TemplateAssignment[]>([]); const [assignmentTemplates, setAssignmentTemplates] = useState<Template[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false); const [assignmentsLoadError, setAssignmentsLoadError] = useState(''); const [assignmentError, setAssignmentError] = useState('')
  const [assignmentTemplateId, setAssignmentTemplateId] = useState(''); const [assignmentValidFrom, setAssignmentValidFrom] = useState(''); const [assignmentBusy, setAssignmentBusy] = useState(false)
  const assignmentRequest = useRef(0)
  async function openAssignments(id: string) {
    const requestId = ++assignmentRequest.current
    setAssignmentsFor(id); setAssignments([]); setAssignmentsLoadError(''); setAssignmentError(''); setAssignmentTemplateId(''); setAssignmentValidFrom(deviceDate()); setAssignmentsLoading(true)
    try {
      const [history, available] = await Promise.all([api.get<TemplateAssignment[]>(`/employees/${encodeURIComponent(id)}/template-assignments`), api.get<Template[]>('/templates')])
      if (requestId !== assignmentRequest.current) return
      setAssignments(history); setAssignmentTemplates(available.filter((template) => template.active))
    } catch (reason) { if (requestId === assignmentRequest.current) setAssignmentsLoadError(errText(reason)) }
    finally { if (requestId === assignmentRequest.current) setAssignmentsLoading(false) }
  }
  function closeAssignments() { assignmentRequest.current += 1; setAssignmentsFor(''); setAssignmentsLoading(false) }
  async function assignTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const employeeId = assignmentsFor
    if (!employeeId || !assignmentTemplateId || !assignmentValidFrom) return
    setAssignmentBusy(true); setAssignmentError(''); setNotice('')
    try {
      const created = await api.post<TemplateAssignment>(`/employees/${encodeURIComponent(employeeId)}/template-assignments`, { templateId: assignmentTemplateId, validFrom: assignmentValidFrom })
      setAssignments((current) => [created, ...current].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.localeCompare(a.createdAt)))
      setAssignmentTemplateId(''); setAssignmentValidFrom(deviceDate()); setNotice('Horario asignado.')
    } catch (reason) { setAssignmentError(errText(reason)) } finally { setAssignmentBusy(false) }
  }
  // The horarios open next to the employee; on a long list or a phone they may start off screen.
  useEffect(() => {
    if (!assignmentsFor) return
    const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(employeeDetailId(assignmentsFor))?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [assignmentsFor])
  async function reload() {
    closeAssignments()
    setLoading(true); setLoadError(''); setError(''); setDraft(null)
    try {
      const [people, availableSites] = await Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites')])
      setEmployees(people); setSites(availableSites)
      setSiteIds((current) => current.length === 0 ? onlySite(availableSites) : current)
    } catch (reason) { setEmployees([]); setSites([]); setLoadError(errText(reason)) } finally { setLoading(false) }
  }
  // 2026-11-10 (#110): with a single site its box came unticked and "Crear empleado" stayed blocked until the owner found it.
  function onlySite(available: Site[]) { return available.length === 1 ? [available[0].id] : [] }
  useEffect(() => { void reload() }, [])
  function toggleSite(id: string) { setSiteIds((current) => current.includes(id) ? current.filter((siteId) => siteId !== id) : [...current, id]) }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (temporaryPassword && passwordTooLong(temporaryPassword)) { setError(PASSWORD_TOO_LONG_MESSAGE); return }
    setBusy(true)
    try {
      const sentPassword = temporaryPassword
      const created = await api.post<Employee>('/employees', { dni: dni.trim(), displayName: displayName.trim(), siteIds, toleranceMinutes: Number(tolerance), ...(sentPassword ? { temporaryPassword: sentPassword } : {}) })
      setEmployees((current) => [...current, created]); setDni(''); setDisplayName(''); setSiteIds(onlySite(sites)); setTolerance('5'); setTemporaryPassword(''); setGeneratedPassword(false)
      // An account that already existed keeps its password and the one sent is not used (OrganizationService.createEmployee).
      if (sentPassword && created.mustChangePassword === false) setNotice('Empleado creado. Ese DNI ya tenía cuenta: sigue entrando con su contraseña de siempre.')
      else {
        setNotice('Empleado creado.')
        if (sentPassword) setIssuedPassword({ displayName: created.displayName, temporaryPassword: sentPassword, reason: 'created' })
      }
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  function generatePassword() { setTemporaryPassword(generateTemporaryPassword()); setGeneratedPassword(true) }
  function typePassword(value: string) { setTemporaryPassword(value); setGeneratedPassword(false) }
  async function saveEmployee() {
    if (!draft) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await api.patch<Employee>(`/employees/${encodeURIComponent(draft.id)}`, { displayName: draft.displayName, siteIds: draft.siteIds, toleranceMinutes: draft.toleranceMinutes, active: draft.active })
      setEmployees((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); setDraft(null); setNotice('Cambios del empleado guardados.')
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  function startEditing(id: string) {
    const person = employees.find((entry) => entry.id === id)
    setDraft(person ? { ...person, siteIds: [...person.siteIds] } : null); setError(''); setNotice('')
  }
  function updateDraft(patch: Partial<Employee>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  const assignmentsEmployee = employees.find((person) => person.id === assignmentsFor)
  const assignmentsPanel = assignmentsEmployee ? <TemplateAssignmentsRender employee={assignmentsEmployee} sites={sites}
    templates={assignmentTemplates.filter((template) => assignmentsEmployee.siteIds.includes(template.siteId))} assignments={assignments}
    loading={assignmentsLoading} loadError={assignmentsLoadError} error={assignmentError} busy={assignmentBusy} templateId={assignmentTemplateId} validFrom={assignmentValidFrom}
    onTemplateChange={setAssignmentTemplateId} onValidFromChange={setAssignmentValidFrom} onSubmit={(event) => void assignTemplate(event)}
    onRetry={() => void openAssignments(assignmentsEmployee.id)} onClose={closeAssignments} /> : null
  // D-20261027-09: the temporary password lives only in this state; it is never written to browser storage and is
  // gone when the ADMIN dismisses the panel or leaves the view.
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [issuedPassword, setIssuedPassword] = useState<IssuedPassword | null>(null)
  // After creating an employee the password panel sits next to the form, below the list; bring it into view. The keyboard
  // focus goes there too (also after a reset, whose confirm button disappears), so it can be read out right away.
  useEffect(() => {
    if (!issuedPassword) return
    const panel = document.getElementById(ISSUED_PASSWORD_ID)
    if (issuedPassword.reason === 'created') panel?.scrollIntoView?.({ block: 'nearest' })
    panel?.focus({ preventScroll: issuedPassword.reason === 'created' })
  }, [issuedPassword])
  function askReset(id: string) { setResetTarget(id); setIssuedPassword(null); setError(''); setNotice('') }
  async function confirmReset() {
    const person = employees.find((entry) => entry.id === resetTarget)
    if (!person) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { temporaryPassword: issued } = await api.post<PasswordReset>(`/employees/${encodeURIComponent(person.id)}/password-reset`)
      setIssuedPassword({ displayName: person.displayName, temporaryPassword: issued })
      setEmployees((current) => current.map((entry) => entry.id === person.id ? { ...entry, mustChangePassword: true } : entry))
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false); setResetTarget(null) }
  }
  return <EmployeesViewRender employees={employees} sites={sites} loading={loading} loadError={loadError} error={error} notice={notice} busy={busy} dni={dni} displayName={displayName} siteIds={siteIds} tolerance={tolerance} temporaryPassword={temporaryPassword} draft={draft}
    generatedPassword={generatedPassword} cards={cards} assignmentsFor={assignmentsFor} assignmentsPanel={assignmentsPanel} onOpenAssignments={(id) => void openAssignments(id)}
    onReload={() => void reload()} onCreate={create} onDniChange={setDni} onDisplayNameChange={setDisplayName} onToggleSite={toggleSite} onToleranceChange={setTolerance} onTemporaryPasswordChange={typePassword} onGeneratePassword={generatePassword}
    onSave={() => void saveEmployee()} onDraftChange={updateDraft} onStartEditing={startEditing} onCancelEditing={() => { setDraft(null); setError('') }}
    resetTarget={resetTarget} issuedPassword={issuedPassword} onAskReset={askReset} onConfirmReset={() => void confirmReset()} onCancelReset={() => setResetTarget(null)} onDismissIssuedPassword={() => setIssuedPassword(null)} />
}

/** Horarios (the UI name of schedule templates, issue #103) live in SchedulesView. */
export { SchedulesView as TemplatesView } from './SchedulesView'

/** A jornada to open on arrival (from a deviation in Bandeja); forgottenAction preselects the mark that is missing. */
export type OpenJornadaRequest = { jornadaId: string; forgottenAction?: MarkAction }

export function JourneysView({ openJornada, coverage, onNavigate, onDaysLoaded }: {
  openJornada?: OpenJornadaRequest; coverage?: ReactNode; onNavigate?: (section: AdminSection) => void; onDaysLoaded?: () => void
} = {}) {
  const [employees, setEmployees] = useState<Employee[]>([]); const [sites, setSites] = useState<Site[]>([]); const [templates, setTemplates] = useState<Template[]>([])
  const [jornadas, setJornadas] = useState<JourneyRow[]>([]); const [loading, setLoading] = useState(true); const [journeysLoading, setJourneysLoading] = useState(false); const [journeysDate, setJourneysDate] = useState(''); const [journeysError, setJourneysError] = useState(''); const [dependencyError, setDependencyError] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<Jornada | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [markBusy, setMarkBusy] = useState('')
  const [date, setDate] = useState(dateInBrowserZone); const [dateError, setDateError] = useState(''); const [employeeId, setEmployeeId] = useState(''); const [siteId, setSiteId] = useState(''); const [templateId, setTemplateId] = useState('')
  // The single day has its own date, error and notice: it is folded at the bottom, far from the page messages.
  const [singleDate, setSingleDate] = useState(dateInBrowserZone); const [singleError, setSingleError] = useState(''); const [singleNotice, setSingleNotice] = useState('')
  const narrow = !useWideTable()
  const journeyRequest = useRef(0)
  const detailRequest = useRef(0)
  const [scrollToDetail, setScrollToDetail] = useState(false)
  const [forgotAction, setForgotAction] = useState<MarkAction>('INGRESO'); const [forgotOccurredAt, setForgotOccurredAt] = useState(''); const [forgotReason, setForgotReason] = useState('')
  const [editingMarkId, setEditingMarkId] = useState(''); const [correctedAction, setCorrectedAction] = useState<MarkAction>('INGRESO'); const [correctedOccurredAt, setCorrectedOccurredAt] = useState(''); const [correctionReason, setCorrectionReason] = useState('')
  // Cancelling a jornada (D-20261027-07) and voiding a mark (D-20261027-08) both ask for a reason in a second, confirming step.
  const [cancelOpen, setCancelOpen] = useState(false); const [cancelReason, setCancelReason] = useState('')
  const [voidingMarkId, setVoidingMarkId] = useState(''); const [voidReason, setVoidReason] = useState('')
  // Change history (issue #60): collapsed by default and loaded only when the ADMIN opens it; auditFor is the open jornada.
  const [auditFor, setAuditFor] = useState(''); const [audit, setAudit] = useState<JornadaAudit | null>(null); const [auditLoading, setAuditLoading] = useState(false); const [auditError, setAuditError] = useState('')
  const auditRequest = useRef(0)
  async function loadAudit(jornadaId: string) {
    const requestId = ++auditRequest.current
    setAudit(null); setAuditError(''); setAuditLoading(true)
    try {
      const result = await api.get<JornadaAudit>(`/admin/jornadas/${encodeURIComponent(jornadaId)}/audit`)
      if (requestId === auditRequest.current) setAudit(result)
    } catch (reason) {
      if (requestId === auditRequest.current) setAuditError(errText(reason))
    } finally { if (requestId === auditRequest.current) setAuditLoading(false) }
  }
  function closeAudit() { auditRequest.current += 1; setAuditFor(''); setAudit(null); setAuditError(''); setAuditLoading(false) }
  function toggleAudit() {
    if (!detail) return
    if (auditFor === detail.id) { closeAudit(); return }
    setAuditFor(detail.id); void loadAudit(detail.id)
  }
  async function loadJourneys(requestedDate = date, preserveNotice = false) {
    const requestId = ++journeyRequest.current
    detailRequest.current += 1
    setJourneysLoading(true); setJourneysError(''); setError(''); if (!preserveNotice) setNotice(''); setDetail(null); setDetailLoading(false)
    try {
      const rows = await api.get<JourneyRow[]>(`/jornadas${queryString({ from: requestedDate, to: requestedDate })}`)
      if (requestId !== journeyRequest.current) return
      setJornadas(rows); setJourneysDate(requestedDate)
    } catch (reason) {
      if (requestId !== journeyRequest.current) return
      setJornadas([]); setJourneysDate(requestedDate); setJourneysError(errText(reason))
    } finally { if (requestId === journeyRequest.current) setJourneysLoading(false) }
  }
  async function loadDependencies(requestedDate: string) {
    setLoading(true); setDependencyError(''); setError('')
    try {
      const [people, availableSites, availableTemplates] = await Promise.all([
        api.get<Employee[]>('/employees'), api.get<Site[]>('/sites'), api.get<Template[]>('/templates')
      ])
      setEmployees(people); setSites(availableSites); setTemplates(availableTemplates.filter((item) => item.active))
      setEmployeeId(people[0]?.id ?? ''); setSiteId(availableSites[0]?.id ?? '')
    } catch (reason) { setDependencyError(errText(reason)) }
    finally { setLoading(false) }
    await loadJourneys(requestedDate)
  }
  /** From a deviation: the list opens on the jornada's own date with its detail, and the missing mark preselected. */
  async function openRequested(request: OpenJornadaRequest) {
    let target = date
    try {
      target = (await api.get<Jornada>(`/jornadas/${encodeURIComponent(request.jornadaId)}`)).localDate
      setDate(target)
    } catch { /* The list stays on today; showDetail below reports the failure. */ }
    await loadDependencies(target)
    if (request.forgottenAction) setForgotAction(request.forgottenAction)
    setScrollToDetail(true)
    await showDetail(request.jornadaId)
  }
  useEffect(() => { if (openJornada) void openRequested(openJornada); else void loadDependencies(date) }, [])
  useEffect(() => {
    if (!scrollToDetail || !detail) return
    setScrollToDetail(false)
    const target = document.getElementById('jornada-detail')
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [scrollToDetail, detail])
  // No template is preselected: "El que tiene asignado" (empty) sends none and the server uses the employee's assignment in force
  // on that date (D-20261015-02), as the hint says. Choosing a site clears a template of another site.
  const eligibleEmployees = useMemo(() => employees.filter((person) => person.active && person.siteIds.includes(siteId)), [employees, siteId])
  useEffect(() => { setEmployeeId((current) => eligibleEmployees.some((person) => person.id === current) ? current : eligibleEmployees[0]?.id ?? '') }, [eligibleEmployees])
  async function declare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSingleError(''); setSingleNotice(''); setBusy(true)
    try {
      await api.post('/jornadas', { employeeId, siteId, localDate: singleDate, ...(templateId ? { templateId } : {}) })
      setSingleNotice('Día cargado.')
      onDaysLoaded?.()
      setDate(singleDate); setDateError('')
      await loadJourneys(singleDate, true)
    }
    catch (reason) { setSingleError(declarationFailureMessage(reason, 'single') ?? errText(reason)) } finally { setBusy(false) }
  }
  /** refreshAudit: after a change made from the detail, an open history is reloaded; opening a jornada starts it collapsed. */
  async function showDetail(jornadaId: string, refreshAudit = false) {
    const requestId = ++detailRequest.current
    if (refreshAudit && auditFor === jornadaId) void loadAudit(jornadaId)
    else closeAudit()
    setDetail(null); setCancelOpen(false); setCancelReason(''); setVoidingMarkId(''); setVoidReason('')
    setDetailLoading(true); setError('')
    try {
      const jornada = await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`)
      if (requestId === detailRequest.current) setDetail(jornada)
    } catch (reason) {
      if (requestId === detailRequest.current) setError(errText(reason))
    } finally { if (requestId === detailRequest.current) setDetailLoading(false) }
  }
  const detailSite = detail ? sites.find((site) => site.id === detail.siteId) : undefined
  // Without the site's zone a typed time cannot be converted safely; the device zone would silently shift it.
  const detailTimeZone = detailSite?.timeZone
  async function addForgottenMark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || !detailTimeZone) return
    const occurredAt = instantForSiteTime(forgotOccurredAt, detailTimeZone)
    if (!occurredAt) { setError('Esa hora no existe en la zona horaria de la sede. Revisá la fecha y la hora.'); return }
    if (!forgotReason.trim()) { setError('Escribí por qué agregás la marca.'); return }
    setMarkBusy('forgotten'); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/jornadas/${encodeURIComponent(detail.id)}/forgotten-marks`, { action: forgotAction, occurredAt, auditReason: forgotReason.trim() })
      setForgotOccurredAt(''); setForgotReason(''); setNotice('Marca agregada.'); await showDetail(detail.id, true)
    } catch (reason) { setError(markFormErrText(reason)) } finally { setMarkBusy('') }
  }
  function beginMarkCorrection(mark: Mark) {
    if (!detailTimeZone) return
    setVoidingMarkId(''); setEditingMarkId(mark.id); setCorrectedAction(mark.action); setCorrectedOccurredAt(siteTimeInput(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)); setCorrectionReason('')
  }
  async function correctMark(event: FormEvent<HTMLFormElement>, mark: Mark) {
    event.preventDefault()
    if (!detail || !detailTimeZone) return
    const correctedAt = instantForSiteTime(correctedOccurredAt, detailTimeZone)
    if (!correctedAt) { setError('Esa hora no existe en la zona horaria de la sede. Revisá la fecha y la hora.'); return }
    if (!correctionReason.trim()) { setError('Escribí el motivo de corrección.'); return }
    setMarkBusy(mark.id); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/marks/${encodeURIComponent(mark.id)}/correction`, { correctedAction, correctedOccurredAt: correctedAt, auditReason: correctionReason.trim() })
      setEditingMarkId(''); setCorrectionReason(''); setNotice('Marca corregida.'); await showDetail(detail.id, true)
    } catch (reason) { setError(markFormErrText(reason)) } finally { setMarkBusy('') }
  }
  function beginVoid(mark: Mark) { setEditingMarkId(''); setVoidingMarkId(mark.id); setVoidReason('') }
  async function voidMark(event: FormEvent<HTMLFormElement>, mark: Mark) {
    event.preventDefault()
    if (!detail) return
    if (!voidReason.trim()) { setError('Escribí el motivo de anulación.'); return }
    setMarkBusy(mark.id); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/marks/${encodeURIComponent(mark.id)}/void`, { reason: voidReason.trim() })
      setVoidingMarkId(''); setVoidReason(''); setNotice('Marca anulada.'); await showDetail(detail.id, true)
    } catch (reason) {
      // A retry whose first attempt committed (response lost) answers MARK_VOIDED: the void is done, show it as done.
      if ((reason as { code?: string } | null)?.code === 'MARK_VOIDED') {
        setVoidingMarkId(''); setVoidReason(''); setNotice('La marca ya estaba anulada.'); await showDetail(detail.id, true)
        return
      }
      // The server reuses INVALID_MARK_HISTORY; for a void it means the marks left would not form a valid jornada.
      setError((reason as { code?: string } | null)?.code === 'INVALID_MARK_HISTORY'
        ? 'No se puede anular esa marca: las marcas que quedan no forman una jornada válida (por ejemplo, un ingreso con marcas posteriores). Anulá o corregí antes las posteriores.'
        : errText(reason))
    } finally { setMarkBusy('') }
  }
  async function cancelJornada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    if (!cancelReason.trim()) { setError('Escribí el motivo de cancelación.'); return }
    const jornadaId = detail.id
    setMarkBusy('cancel'); setError(''); setNotice('')
    try {
      await api.post(`/admin/jornadas/${encodeURIComponent(jornadaId)}/cancellation`, { reason: cancelReason.trim() })
      setCancelOpen(false); setCancelReason(''); setNotice('Jornada cancelada.')
      await loadJourneys(date, true); await showDetail(jornadaId, true)
    } catch (reason) {
      // A retry whose first attempt committed answers JORNADA_CANCELLED: the cancellation is done, show it as done.
      if ((reason as { code?: string } | null)?.code === 'JORNADA_CANCELLED') {
        setCancelOpen(false); setCancelReason(''); setNotice('La jornada ya estaba cancelada.')
        await loadJourneys(date, true); await showDetail(jornadaId, true)
      } else setError(errText(reason))
    } finally { setMarkBusy('') }
  }
  function changeDate(value: string) {
    setDate(value)
    if (!value) {
      journeyRequest.current += 1; detailRequest.current += 1
      setDateError('Elegí una fecha para ver los días cargados.'); setJornadas([]); setJourneysError(''); setJourneysLoading(false); setDetail(null); setDetailLoading(false)
      return
    }
    setDateError('')
    void loadJourneys(value)
  }
  const peopleById = useMemo(() => new Map(employees.map((person) => [person.id, person.displayName])), [employees])
  const siteTemplates = templates.filter((template) => template.siteId === siteId)
  const workDaysPanel = <WorkDaysPanel sites={sites} employees={employees} templates={templates} disabled={loading}
    onLoaded={() => { onDaysLoaded?.(); if (date) void loadJourneys(date, true) }}
    onAssignSchedules={() => onNavigate?.('empleados')} onReviewSchedules={() => onNavigate?.('plantillas')} />
  return <JourneysViewRender workDaysPanel={workDaysPanel} coverage={coverage} narrow={narrow} sites={sites} eligibleEmployees={eligibleEmployees} siteTemplates={siteTemplates} jornadas={jornadas} loading={loading} journeysLoading={journeysLoading} journeysDate={journeysDate} journeysError={journeysError} dependencyError={dependencyError} error={error} notice={notice} busy={busy} detail={detail} detailLoading={detailLoading} markBusy={markBusy} date={date} employeeId={employeeId} siteId={siteId} templateId={templateId} peopleById={peopleById} dateError={dateError} detailSite={detailSite} detailTimeZone={detailTimeZone} forgotAction={forgotAction} forgotOccurredAt={forgotOccurredAt} forgotReason={forgotReason} editingMarkId={editingMarkId} correctedAction={correctedAction} correctedOccurredAt={correctedOccurredAt} correctionReason={correctionReason}
    singleDate={singleDate} singleError={singleError} singleNotice={singleNotice} onSingleDateChange={setSingleDate}
    cancelOpen={cancelOpen} cancelReason={cancelReason} voidingMarkId={voidingMarkId} voidReason={voidReason}
    auditOpen={Boolean(detail) && auditFor === detail?.id} audit={audit} auditLoading={auditLoading} auditError={auditError} onToggleAudit={toggleAudit} onRetryAudit={() => { if (auditFor) void loadAudit(auditFor) }}
    onBeginCancel={() => { setCancelOpen(true); setCancelReason('') }} onCancelReasonChange={setCancelReason} onConfirmCancel={(event) => void cancelJornada(event)} onAbortCancel={() => { setCancelOpen(false); setCancelReason('') }}
    onBeginVoid={beginVoid} onVoidReasonChange={setVoidReason} onConfirmVoid={(event, mark) => void voidMark(event, mark)} onAbortVoid={() => { setVoidingMarkId(''); setVoidReason('') }}
    onDateChange={changeDate} onEmployeeChange={setEmployeeId} onSiteChange={(id) => { setSiteId(id); setTemplateId('') }} onTemplateChange={setTemplateId} onDeclare={declare} onRetryDependencies={() => void loadDependencies(date)} onReloadJourneys={() => void loadJourneys(date)} onShowDetail={(id) => void showDetail(id)}
    onForgotActionChange={setForgotAction} onForgotOccurredAtChange={setForgotOccurredAt} onForgotReasonChange={setForgotReason} onAddForgottenMark={(event) => void addForgottenMark(event)} onBeginMarkCorrection={beginMarkCorrection} onCorrectedActionChange={setCorrectedAction} onCorrectedOccurredAtChange={setCorrectedOccurredAt} onCorrectionReasonChange={setCorrectionReason} onCorrectMark={(event, mark) => void correctMark(event, mark)} onCancelMarkCorrection={() => setEditingMarkId('')} />
}
