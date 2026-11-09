import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../shared/api/client'
import type { Site, SiteCoordinates } from '../../shared/api/types'
import { formatDateTime } from '../../shared/format'
import { SitesView } from './AdminViews'
import { SitesViewRender } from './AdminViewsRender'
import type { SiteLocationAuditResponse, SiteLocationEditDraft } from './AdminViewsRender'
import type { SiteMapPickerProps } from './siteMap'

// jsdom cannot lay out a Leaflet map: the lazy picker is replaced by a stand-in that shows its props and taps an unrounded point.
vi.mock('./SiteMapPicker', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ view, point, radiusMeters, onPick }: SiteMapPickerProps) => createElement('div', {
      'data-testid': 'site-map',
      'data-view': `${view.latitude},${view.longitude},${view.zoom}`,
      'data-point': point ? `${point.latitude},${point.longitude}` : '',
      'data-radius': String(radiusMeters)
    }, createElement('button', { type: 'button', onClick: () => onPick({ latitude: -34.603722449, longitude: -58.38159255 }) }, 'Tocar el mapa'))
  }
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function renderSitesView(siteLocation: SiteCoordinates | null = null, locating = false, onCancelLocationCapture = vi.fn(), options: {
  sites?: Site[]; createRadiusMeters?: string; createLatitude?: string; createLongitude?: string; locationEdit?: SiteLocationEditDraft | null; siteLocationAuditFor?: string; locationAccuracyMeters?: number | null
  siteLocationAudit?: SiteLocationAuditResponse | null
} = {}) {
  return render(<SitesViewRender
    sites={options.sites ?? []} loading={false} loadError="" error="" notice="" name="Local Centro" timeZone="America/Argentina/Buenos_Aires" busy={false}
    siteLocation={siteLocation} locationStatus={siteLocation ? 'selected' : locating ? 'loading' : 'idle'}
    locationMessage={siteLocation ? 'Ubicación capturada. Se guardará con esta sede.' : locating ? 'Buscando la ubicación del dispositivo…' : ''} locating={locating}
    locationAccuracyMeters={options.locationAccuracyMeters} createRadiusMeters={options.createRadiusMeters}
    createLatitude={options.createLatitude ?? (siteLocation ? String(siteLocation.latitude) : '')} createLongitude={options.createLongitude ?? (siteLocation ? String(siteLocation.longitude) : '')}
    createLocationSource={siteLocation ? 'CAPTURED' : null} locationEdit={options.locationEdit} siteLocationAuditFor={options.siteLocationAuditFor} siteLocationAudit={options.siteLocationAudit}
    onReload={vi.fn()} onSubmit={vi.fn()} onNameChange={vi.fn()} onTimeZoneChange={vi.fn()} onCaptureLocation={vi.fn()} onCancelLocationCapture={onCancelLocationCapture} onClearLocation={vi.fn()}
  />)
}

describe('SitesViewRender location picker', () => {
  it('places the optional GPS action in the create-site form', () => {
    renderSitesView()

    expect(screen.getByRole('heading', { name: 'Agregar sede' })).toBeInTheDocument()
    expect(screen.getByText('¿Dónde queda el local?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Latitud' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Longitud' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear sede' })).toBeInTheDocument()
  })

  it('shows selected coordinates and offers to update or remove them', () => {
    renderSitesView({ latitude: -34.603722, longitude: -58.381592 }, false, vi.fn(), { locationAccuracyMeters: 8 })

    expect(screen.getByText('Latitud -34.6037220 · Longitud -58.3815920')).toBeInTheDocument()
    expect(screen.getByText('Precisión informada por el dispositivo: ±8.0 m (estimación; no garantiza exactitud).')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar este punto en el mapa' })).toHaveAttribute('href', expect.stringContaining('mlat=-34.603722'))
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

    const radius = screen.getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' })
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
      locationConfirmed: false, locationSource: 'CAPTURED'
    }
    const audit: SiteLocationAuditResponse = { entries: [{
      id: 'audit-1', changedAt: '2026-10-28T15:30:00Z', actorDisplayName: 'Mateo',
      beforeLatitude: null, beforeLongitude: null, beforeRadiusMeters: null,
      afterLatitude: site.latitude!, afterLongitude: site.longitude!, afterRadiusMeters: 100, locationSource: 'MANUAL'
    }] }
    renderSitesView(null, false, vi.fn(), { sites: [site], locationEdit, siteLocationAuditFor: site.id, siteLocationAudit: audit })

    expect(screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })).toBeInTheDocument()
    expect(within(screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })).getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' })).toHaveValue(175)
    expect(screen.getByRole('button', { name: 'Capturar otra ubicación' })).toBeInTheDocument()
    expect(screen.getByText('Precisión informada por el dispositivo: ±8.0 m (estimación; no garantiza exactitud).')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' })).not.toBeChecked()
    expect(screen.getByText('Configuración inicial de ubicación')).toBeInTheDocument()
    expect(screen.getByText('Por Mateo')).toBeInTheDocument()
    expect(screen.getByText('Origen del punto: carga manual')).toBeInTheDocument()
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

  // 2026-11-09 (integrated check of PR #107): the form asked for "la zona por región de la base IANA".
  it('chooses the site hour by province, Buenos Aires first, and sends its region id', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Cordoba', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    const { container } = render(<SitesView />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    const zone = screen.getByRole('combobox', { name: 'Hora del local' })

    expect(zone).toHaveValue('America/Argentina/Buenos_Aires')
    expect(within(zone).getByRole('option', { name: 'Buenos Aires' })).toBeInTheDocument()
    expect(within(zone).getByRole('option', { name: 'Otra (fuera de Argentina)' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/IANA|America\/Argentina/)
    expect(screen.queryByRole('textbox', { name: /otro país/ })).not.toBeInTheDocument()

    fireEvent.change(zone, { target: { value: 'America/Argentina/Cordoba' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ timeZone: 'America/Argentina/Cordoba' }))
    expect(screen.getByText('Hora de Córdoba')).toBeInTheDocument()
  })

  it('accepts another country zone written by hand and rejects an abbreviation or a fixed offset before calling the server', async () => {
    const created: Site = { id: 'site-new', name: 'Local Santiago', timeZone: 'America/Santiago', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    render(<SitesView />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Santiago' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Hora del local' }), { target: { value: 'other' } })
    const zone = screen.getByRole('textbox', { name: 'Zona horaria de otro país' })
    expect(zone).toHaveValue('')

    for (const invalid of ['EST', '-03:00']) {
      fireEvent.change(zone, { target: { value: invalid } })
      fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
      expect(await screen.findByText('Esa zona horaria no sirve. Elegí una provincia de la lista o escribí la zona de una ciudad, por ejemplo America/Santiago.')).toBeInTheDocument()
    }
    expect(post).not.toHaveBeenCalled()

    fireEvent.change(zone, { target: { value: 'America/Santiago' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ timeZone: 'America/Santiago' }))
  })

  it('creates a site from manually entered coordinates after map review', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '-34.603722' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Longitud' }), { target: { value: '-58.381592' } })
    const mapLink = screen.getByRole('link', { name: 'Revisar este punto en el mapa' })
    expect(mapLink).toHaveAttribute('href', expect.stringContaining('mlon=-58.381592'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)

    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({
      latitude: -34.603722, longitude: -58.381592, locationSource: 'MANUAL'
    }))
  })

  it('rejects a partial or out-of-range manual coordinate pair before creating', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '91' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá latitud y longitud juntas')
    expect(post).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Longitud' }), { target: { value: '181' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('latitud entre -90 y 90')
    expect(post).not.toHaveBeenCalled()
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

  it('locks manual coordinate inputs during capture while keeping cancellation available', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    let finishCapture: PositionCallback | undefined
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (success: PositionCallback) => { finishCapture = success } } })
    render(<SitesView />)

    const latitude = await screen.findByRole('spinbutton', { name: 'Latitud' })
    const longitude = screen.getByRole('spinbutton', { name: 'Longitud' })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))

    expect(latitude).toBeDisabled()
    expect(longitude).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar búsqueda' })).toBeEnabled()
    fireEvent.change(latitude, { target: { value: '-34.6' } })
    expect(latitude).toHaveValue(null)

    await act(async () => {
      finishCapture?.({ coords: { latitude: -34.603722, longitude: -58.381592, accuracy: 8 } } as GeolocationPosition)
    })
    expect(latitude).toHaveValue(-34.603722)
    expect(longitude).toHaveValue(-58.381592)
    expect(screen.getByText(/Ubicación recibida/)).toBeInTheDocument()
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
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí el punto en el mapa')
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
    expect(await screen.findByText(/Revisá el punto en el mapa y confirmá que corresponde a esta sede/i)).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar ubicación' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' }), { target: { value: '250' } })
    fireEvent.submit(form)

    await screen.findByText('Ubicación de la sede actualizada.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: null, longitude: null, locationSource: null, geofenceRadiusMeters: 250 })
  })

  it('updates a site with manually entered coordinates after map review', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    const updated: Site = { ...existing, latitude: -34.6, longitude: -58.38 }
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    const put = vi.spyOn(api, 'put').mockResolvedValue(updated as never)
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '-34.6' } })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Longitud' }), { target: { value: '-58.38' } })
    expect(within(form).getByRole('link', { name: 'Revisar este punto en el mapa' })).toHaveAttribute('href', expect.stringContaining('mlat=-34.6'))
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' }))
    fireEvent.submit(form)

    await screen.findByText('Ubicación de la sede actualizada.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', {
      latitude: -34.6, longitude: -58.38, locationSource: 'MANUAL', geofenceRadiusMeters: 100
    })
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

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Capturar otra ubicación' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
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
    await screen.findByText('Ubicación de la sede actualizada.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: -34.603722, longitude: -58.381592, locationSource: 'CAPTURED', geofenceRadiusMeters: 100 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('keeps the editor usable without a center when browser location is denied', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    const put = vi.spyOn(api, 'put').mockResolvedValue(existing as never)
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError) } })
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    fireEvent.click(within(form).getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Permiso de ubicación')
    expect(within(form).getByRole('spinbutton', { name: 'Latitud' })).toBeInTheDocument()
    expect(within(form).getByRole('spinbutton', { name: 'Longitud' })).toBeInTheDocument()
    fireEvent.submit(form)
    await screen.findByText('Ubicación de la sede actualizada.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: null, longitude: null, locationSource: null, geofenceRadiusMeters: 100 })
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

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    fireEvent.click(within(form).getByRole('button', { name: 'Capturar otra ubicación' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Permiso de ubicación')
    expect(within(form).getByText('Latitud -34.6000000 · Longitud -58.3800000')).toBeInTheDocument()
    fireEvent.submit(form)

    await screen.findByText('Ubicación de la sede actualizada.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: -34.6, longitude: -58.38, locationSource: null, geofenceRadiusMeters: 100 })
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

describe('SitesView map picker', () => {
  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('offers the map first and leaves the device capture and manual coordinates in place', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    render(<SitesView />)

    const createForm = (await screen.findByRole('button', { name: 'Crear sede' })).closest('form')!
    const actions = within(createForm).getAllByRole('button')
    expect(actions[0]).toHaveTextContent('Elegir en el mapa')
    expect(within(createForm).getByRole('button', { name: 'Capturar ubicación del dispositivo' })).toBeInTheDocument()
    const manual = within(createForm).getByRole('spinbutton', { name: 'Latitud' }).closest('details')
    expect(manual).not.toHaveAttribute('open')
    expect(within(manual!).getByText('Escribir las coordenadas a mano')).toBeInTheDocument()
    expect(within(createForm).getByRole('group', { name: '¿Dónde queda el local?' })).toBeInTheDocument()
    expect(within(createForm).getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' })).toHaveValue(100)
    expect(screen.queryByTestId('site-map')).not.toBeInTheDocument()
  })

  it('creates a site from a point tapped on the map, rounded to seven decimals and saved as a manual point', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6037224, longitude: -58.3815926, geofenceRadiusMeters: 250 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Elegir en el mapa' }))
    const map = await screen.findByTestId('site-map')
    expect(map).toHaveAttribute('data-view', '-34.6,-58.4,12')
    expect(map).toHaveAttribute('data-radius', '100')
    expect(screen.getByRole('button', { name: 'Confirmar ubicación' })).toBeDisabled()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' }), { target: { value: '250' } })
    expect(map).toHaveAttribute('data-radius', '250')
    fireEvent.click(within(map).getByRole('button', { name: 'Tocar el mapa' }))
    expect(map).toHaveAttribute('data-point', '-34.6037224,-58.3815926')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ubicación' }))

    expect(screen.queryByTestId('site-map')).not.toBeInTheDocument()
    expect(screen.getByText('Latitud -34.6037224 · Longitud -58.3815926')).toBeInTheDocument()
    expect(screen.getByText('Punto elegido en el mapa.')).toBeInTheDocument()
    // Confirming on the map is the confirmation: the checkbox comes already ticked and the site saves at once.
    expect(screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' })).toBeChecked()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({
      latitude: -34.6037224, longitude: -58.3815926, locationSource: 'MANUAL', geofenceRadiusMeters: 250
    }))
  })

  it('centers the map on a rough device position without saving it', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: -32.95, longitude: -60.65, accuracy: 124 } } as GeolocationPosition) } })
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre de la sede' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Elegir en el mapa' }))
    const map = await screen.findByTestId('site-map')
    await vi.waitFor(() => expect(map).toHaveAttribute('data-view', '-32.95,-60.65,16'))
    expect(map).toHaveAttribute('data-point', '')
    expect(screen.getByRole('button', { name: 'Confirmar ubicación' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar mapa' }))
    expect(screen.queryByTestId('site-map')).not.toBeInTheDocument()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear sede' }).closest('form')!)
    await screen.findByText('Sede creada.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ latitude: null, longitude: null, locationSource: null }))
  })

  it('searches the address once per click, and the chosen result centers the map and sets the point to save', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 150 }
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    const put = vi.spyOn(api, 'put').mockResolvedValue(existing as never)
    let answer: (response: Response) => void = () => undefined
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { answer = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    fireEvent.click(within(form).getByRole('button', { name: 'Elegir en el mapa' }))
    const map = await within(form).findByTestId('site-map')
    expect(map).toHaveAttribute('data-view', '-34.6,-58.38,17')
    expect(map).toHaveAttribute('data-point', '-34.6,-58.38')
    expect(map).toHaveAttribute('data-radius', '150')

    const query = within(form).getByRole('textbox', { name: 'Buscá la dirección del local' })
    // Short enough to read whole in a 360 px wide field.
    expect(query).toHaveAttribute('placeholder', 'Calle y número')
    fireEvent.change(query, { target: { value: 'Av. Corrientes 1234, CABA' } })
    fireEvent.keyDown(query, { key: 'Enter' })
    const search = within(form).getByRole('button', { name: 'Buscando…' })
    fireEvent.click(search); fireEvent.click(search)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(put).not.toHaveBeenCalled()
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('q=Av.+Corrientes+1234%2C+CABA')

    await act(async () => {
      answer(jsonResponse([
        { lat: '-34.603722449', lon: '-58.38159255', display_name: 'Avenida Corrientes 1234, San Nicolás, Buenos Aires' },
        { lat: 'nada', lon: '-58.4', display_name: 'Resultado roto' }
      ]))
    })
    const results = within(form).getByRole('list', { name: 'Resultados de la búsqueda' })
    expect(within(results).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(results).getByRole('button', { name: 'Avenida Corrientes 1234, San Nicolás, Buenos Aires' }))
    expect(map).toHaveAttribute('data-view', '-34.6037224,-58.3815926,18')
    expect(map).toHaveAttribute('data-point', '-34.6037224,-58.3815926')

    fireEvent.click(within(form).getByRole('button', { name: 'Confirmar ubicación' }))
    expect(within(form).getByRole('checkbox', { name: 'Confirmo que este punto corresponde a la sede.' })).toBeChecked()
    fireEvent.submit(form)
    await screen.findByText('Ubicación de la sede actualizada.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: -34.6037224, longitude: -58.3815926, locationSource: 'MANUAL', geofenceRadiusMeters: 150 })
  })

  it('says so in plain words when the address is not found or the search fails', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503))
    vi.stubGlobal('fetch', fetchMock)
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Elegir en el mapa' }))
    await screen.findByTestId('site-map')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText('Escribí la dirección del local para buscarla.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscá la dirección del local' }), { target: { value: 'Calle que no existe 99999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText(/No encontramos esa dirección/)).toBeInTheDocument()

    now.mockReturnValue(1_002_000)
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText(/No se pudo buscar la dirección/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
