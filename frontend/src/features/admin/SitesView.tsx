// The sites (Sedes) container: the list, the create form, the location edit with capture and map, and the location history.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import type { Site, SiteCoordinates } from '../../shared/api/types'
import { isRegionTimeZone, REGION_TIME_ZONE_MESSAGE } from './siteZone'
import { captureSiteCoordinates, parseGeofenceRadiusMeters, SiteLocationError, type SiteLocationErrorKind } from './siteLocation'
import { approximateDevicePosition, normalizePickedPoint, SEARCH_RESULT_ZOOM, siteMapInitialView } from './siteMap'
import { GeocodeError, searchAddress, type GeocodeResult } from '../../shared/api/geocode'
import { SitesViewRender, type SiteLocationAuditResponse, type SiteLocationEditDraft, type SiteMapState } from './SitesViewRender'
import { errText } from './adminShared'

type LocationCaptureTarget = { kind: 'create' } | { kind: 'edit'; siteId: string }

/** The form's coordinate pair when both are numbers in range, else null (the map then starts elsewhere). */
function validCoordinates(latitudeText: string, longitudeText: string): SiteCoordinates | null {
  if (!latitudeText.trim() || !longitudeText.trim()) return null
  const latitude = Number(latitudeText)
  const longitude = Number(longitudeText)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
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
