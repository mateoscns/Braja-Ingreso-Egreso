import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../shared/api/client'
import type { Site, SiteCoordinates } from '../../shared/api/types'
import { formatDateTime } from '../../shared/format'
import { SitesView } from './AdminViews'
import { SitesViewRender } from './AdminViewsRender'
import type { SiteLocationAuditResponse, SiteLocationEditDraft } from './AdminViewsRender'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function renderSitesView(siteLocation: SiteCoordinates | null = null, locating = false, onCancelLocationCapture = vi.fn(), options: {
  sites?: Site[]; createRadiusMeters?: string; locationEdit?: SiteLocationEditDraft | null; siteLocationAuditFor?: string; locationAccuracyMeters?: number | null
  siteLocationAudit?: SiteLocationAuditResponse | null
} = {}) {
  return render(<SitesViewRender
    sites={options.sites ?? []} loading={false} loadError="" error="" notice="" name="Local Centro" timeZone="America/Argentina/Buenos_Aires" busy={false}
    siteLocation={siteLocation} locationStatus={siteLocation ? 'selected' : locating ? 'loading' : 'idle'}
    locationMessage={siteLocation ? 'Ubicación capturada. Se guardará con esta sede.' : locating ? 'Buscando la ubicación del dispositivo…' : ''} locating={locating}
    locationAccuracyMeters={options.locationAccuracyMeters} createRadiusMeters={options.createRadiusMeters} locationEdit={options.locationEdit} siteLocationAuditFor={options.siteLocationAuditFor} siteLocationAudit={options.siteLocationAudit}
    onReload={vi.fn()} onSubmit={vi.fn()} onNameChange={vi.fn()} onTimeZoneChange={vi.fn()} onCaptureLocation={vi.fn()} onCancelLocationCapture={onCancelLocationCapture} onClearLocation={vi.fn()}
  />)
}

describe('SitesViewRender location picker', () => {
  it('places the optional GPS action in the create-site form', () => {
    renderSitesView()

    expect(screen.getByRole('heading', { name: 'Agregar sede' })).toBeInTheDocument()
    expect(screen.getByText('Ubicación de la sede')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear sede' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /coordenadas manualmente/i })).not.toBeInTheDocument()
  })

  it('shows selected coordinates and offers to update or remove them', () => {
    renderSitesView({ latitude: -34.603722, longitude: -58.381592 }, false, vi.fn(), { locationAccuracyMeters: 8 })

    expect(screen.getByText('Latitud -34.6037220 · Longitud -58.3815920')).toBeInTheDocument()
    expect(screen.getByText('Precisión informada por el dispositivo: ±8.0 m (estimación; no garantiza exactitud).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Capturar otra ubicación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar ubicación' })).toBeInTheDocument()
  })

  it('prevents a site from being submitted while location is being acquired', () => {
    renderSitesView(null, true)

    expect(screen.getByRole('button', { name: 'Cancelar búsqueda' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Crear sede' })).toBeDisabled()
  })

  it('turns the capture control into cancellation while location is being acquired', () => {
    const onCancelLocationCapture = vi.fn()
    renderSitesView(null, true, onCancelLocationCapture)

    const cancel = screen.getByRole('button', { name: 'Cancelar búsqueda' })
    expect(screen.getAllByRole('button', { name: 'Cancelar búsqueda' })).toHaveLength(1)
    expect(cancel).toBeEnabled()
    fireEvent.click(cancel)
    expect(onCancelLocationCapture).toHaveBeenCalledOnce()
  })

  it('defaults the create radius to 100 meters and constrains it to 50–500', () => {
    renderSitesView()

    const radius = screen.getByRole('spinbutton', { name: 'Radio de la sede (metros)' })
    expect(radius).toHaveValue(100)
    expect(radius).toHaveAttribute('min', '50')
    expect(radius).toHaveAttribute('max', '500')
    expect(radius).toHaveAttribute('step', '1')
  })

  it('shows an existing site edit form and a readable location audit history', () => {
    const site: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'Asia/Tokyo', latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 175 }
    const locationEdit: SiteLocationEditDraft = {
      siteId: site.id, latitude: '-34.603722', longitude: '-58.381592', geofenceRadiusMeters: '175',
      locationStatus: 'selected', locationMessage: 'Ubicación recibida.', locationErrorKind: null, locationAccuracyMeters: 8,
      locationConfirmed: false, locationSource: 'device'
    }
    const audit: SiteLocationAuditResponse = { entries: [{
      id: 'audit-1', changedAt: '2026-10-28T15:30:00Z', actorDisplayName: 'Mateo',
      beforeLatitude: null, beforeLongitude: null, beforeRadiusMeters: null,
      afterLatitude: site.latitude!, afterLongitude: site.longitude!, afterRadiusMeters: 100
    }] }
    renderSitesView(null, false, vi.fn(), { sites: [site], locationEdit, siteLocationAuditFor: site.id, siteLocationAudit: audit })

    expect(screen.getByRole('form', { name: 'Editar ubicación y radio de Local Centro' })).toBeInTheDocument()
    expect(within(screen.getByRole('form', { name: 'Editar ubicación y radio de Local Centro' })).getByRole('spinbutton', { name: 'Radio de la sede (metros)' })).toHaveValue(175)
    expect(screen.getByRole('button', { name: 'Capturar otra ubicación' })).toBeInTheDocument()
    expect(screen.getByText('Precisión informada por el dispositivo: ±8.0 m (estimación; no garantiza exactitud).')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' })).not.toBeChecked()
    expect(screen.getByText('Configuración inicial de ubicación')).toBeInTheDocument()
    expect(screen.getByText('Por Mateo')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(audit.entries[0].changedAt, site.timeZone))).toBeInTheDocument()
    expect(screen.getByText('Centro nuevo: -34.6037220, -58.3815920 · radio: 100 m')).toBeInTheDocument()
  })
})

describe('SitesView location administration API', () => {
  it('creates a site with the default radius and no coordinates when GPS is skipped', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)

    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ latitude: null, longitude: null, geofenceRadiusMeters: 100 }))
  })

  it('allows creating a site without a center after permission is denied', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permiso de ubicación')
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)

    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ latitude: null, longitude: null }))
  })

  it('does not save a captured point whose reported accuracy exceeds the proposed limit', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) => success({
          coords: { latitude: -34.603722, longitude: -58.381592, accuracy: 25.1 }
        } as GeolocationPosition)
      }
    })
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Precisión insuficiente')
    expect(screen.getByRole('alert')).toHaveTextContent('25.1 m')
    expect(screen.queryByText('Latitud -34.6037220 · Longitud -58.3815920')).not.toBeInTheDocument()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)

    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ latitude: null, longitude: null }))
  })

  it('keeps a prior create-form point after a poor recapture but requires confirmation again', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    let captures = 0
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      captures += 1
      success(captures === 1
        ? { coords: { latitude: -34.603722, longitude: -58.381592, accuracy: 8 } } as GeolocationPosition
        : { coords: { latitude: -34.7, longitude: -58.4, accuracy: 25.1 } } as GeolocationPosition)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    const confirmation = await screen.findByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' })
    fireEvent.click(confirmation)
    expect(confirmation).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar otra ubicación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Precisión insuficiente')
    expect(screen.getByText('Latitud -34.6037220 · Longitud -58.3815920')).toBeInTheDocument()
    expect(screen.getByText(/revisalo y confirmalo de nuevo antes de guardar/i)).toBeInTheDocument()
    expect(confirmation).not.toBeChecked()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    expect(await screen.findByText(/Confirmá que las coordenadas corresponden a esta sede/i)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.click(confirmation)
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ latitude: -34.603722, longitude: -58.381592 }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('cancels with the capture control and ignores the late position before creating without a center', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    let lateSuccess: PositionCallback | undefined
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (success: PositionCallback) => { lateSuccess = success } } })
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    const captureControl = await screen.findByRole('button', { name: 'Cancelar búsqueda' })
    fireEvent.click(captureControl)
    await screen.findByText('Búsqueda cancelada. Podés crear la sede sin centro.')
    await act(async () => {
      lateSuccess?.({ coords: { latitude: -34.603722, longitude: -58.381592, accuracy: 8 } } as GeolocationPosition)
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)

    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ latitude: null, longitude: null }))
    expect(screen.queryByText('Latitud -34.6037220 · Longitud -58.3815920')).not.toBeInTheDocument()
  })

  it('updates the existing site through the location endpoint with a nullable coordinate pair', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 100 }
    const updated: Site = { ...existing, latitude: null, longitude: null, geofenceRadiusMeters: 250 }
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    const put = vi.spyOn(api, 'put').mockResolvedValue(updated as never)
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ubicación y radio de Local Centro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar ubicación' }))
    const form = screen.getByRole('form', { name: 'Editar ubicación y radio de Local Centro' })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Radio de la sede (metros)' }), { target: { value: '250' } })
    fireEvent.submit(form)

    await screen.findByText('Ubicación y radio de la sede actualizados.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: null, longitude: null, geofenceRadiusMeters: 250 })
  })

  it('captures a replacement point in the edit form and requires confirmation before saving it', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 100 }
    const updated: Site = { ...existing, latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    const put = vi.spyOn(api, 'put').mockResolvedValue(updated as never)
    let captures = 0
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      captures += 1
      success(captures === 1
        ? { coords: { latitude: -34.603722, longitude: -58.381592, accuracy: 12 } } as GeolocationPosition
        : { coords: { latitude: -34.7, longitude: -58.4, accuracy: 25.1 } } as GeolocationPosition)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ubicación y radio de Local Centro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Capturar otra ubicación' }))
    const form = screen.getByRole('form', { name: 'Editar ubicación y radio de Local Centro' })
    const confirmation = await within(form).findByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' })
    expect(within(form).getByText('Precisión informada por el dispositivo: ±12.0 m (estimación; no garantiza exactitud).')).toBeInTheDocument()

    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirmá que el nuevo punto corresponde a esta sede')
    expect(put).not.toHaveBeenCalled()

    fireEvent.click(confirmation)
    expect(confirmation).toBeChecked()
    fireEvent.click(within(form).getByRole('button', { name: 'Capturar otra ubicación' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Precisión insuficiente')
    expect(confirmation).not.toBeChecked()
    expect(within(form).getByText('Latitud -34.6037220 · Longitud -58.3815920')).toBeInTheDocument()

    fireEvent.submit(form)
    expect(await screen.findByText('Confirmá que el nuevo punto corresponde a esta sede antes de guardarlo.')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()

    fireEvent.click(confirmation)
    fireEvent.submit(form)
    await screen.findByText('Ubicación y radio de la sede actualizados.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 100 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('keeps the editor usable without a center when browser location is denied', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    const put = vi.spyOn(api, 'put').mockResolvedValue(existing as never)
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError) } })
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ubicación y radio de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Editar ubicación y radio de Local Centro' })
    fireEvent.click(within(form).getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Permiso de ubicación')
    expect(within(form).queryByRole('textbox', { name: 'Latitud' })).not.toBeInTheDocument()
    expect(within(form).queryByRole('button', { name: /coordenadas manualmente/i })).not.toBeInTheDocument()
    fireEvent.submit(form)
    await screen.findByText('Ubicación y radio de la sede actualizados.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: null, longitude: null, geofenceRadiusMeters: 100 })
  })

  it('preserves a saved site center when a replacement capture fails', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    const put = vi.spyOn(api, 'put').mockResolvedValue(existing as never)
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError)
      }
    })
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ubicación y radio de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Editar ubicación y radio de Local Centro' })
    fireEvent.click(within(form).getByRole('button', { name: 'Capturar otra ubicación' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Permiso de ubicación')
    expect(within(form).getByText('Latitud -34.6000000 · Longitud -58.3800000')).toBeInTheDocument()
    fireEvent.submit(form)

    await screen.findByText('Ubicación y radio de la sede actualizados.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 100 })
  })

  it('loads scoped location audit entries when the ADMIN opens the history', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    const audit: SiteLocationAuditResponse = { entries: [] }
    const get = vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve((path.endsWith('/location-audit') ? audit : [existing]) as never))
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ver historial de ubicación' }))

    expect(await screen.findByText('Esta sede todavía no tiene cambios de ubicación auditados.')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/sites/site-1/location-audit')
  })

  it('aborts an outstanding browser-location request when the view unmounts', async () => {
    const NativeAbortController = globalThis.AbortController
    const activeSignal: { current: AbortSignal | null } = { current: null }
    class TrackedAbortController extends NativeAbortController {
      constructor() { super(); activeSignal.current = this.signal }
    }
    let lateSuccess: PositionCallback | undefined
    vi.stubGlobal('AbortController', TrackedAbortController)
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (success: PositionCallback) => { lateSuccess = success } } })
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const view = render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    expect(lateSuccess).toBeDefined()
    view.unmount()

    expect(activeSignal.current?.aborted).toBe(true)
    expect(() => lateSuccess?.({ coords: { latitude: -34.603722, longitude: -58.381592, accuracy: 10 } } as GeolocationPosition)).not.toThrow()
  })
})
