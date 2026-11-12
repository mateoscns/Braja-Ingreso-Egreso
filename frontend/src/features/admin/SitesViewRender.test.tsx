import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../shared/api/client'
import type { Site, SiteCoordinates } from '../../shared/api/types'
import { formatDateTime } from '../../shared/format'
import { SitesView } from './AdminViews'
import { SitesViewRender } from './AdminViewsRender'
import type { SiteLocationAuditResponse, SiteLocationEditDraft, SiteMapState } from './AdminViewsRender'
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
  siteLocationAudit?: SiteLocationAuditResponse | null; siteMap?: SiteMapState | null
} = {}) {
  return render(<SitesViewRender
    sites={options.sites ?? []} loading={false} loadError="" error="" notice="" name="Local Centro" timeZone="America/Argentina/Buenos_Aires" busy={false}
    siteLocation={siteLocation} locationStatus={siteLocation ? 'selected' : locating ? 'loading' : 'idle'}
    locationMessage={siteLocation ? 'Ubicación capturada. Se guardará con esta sede.' : locating ? 'Buscando la ubicación del dispositivo…' : ''} locating={locating}
    locationAccuracyMeters={options.locationAccuracyMeters} createRadiusMeters={options.createRadiusMeters}
    createLatitude={options.createLatitude ?? (siteLocation ? String(siteLocation.latitude) : '')} createLongitude={options.createLongitude ?? (siteLocation ? String(siteLocation.longitude) : '')}
    createLocationSource={siteLocation ? 'CAPTURED' : null} locationEdit={options.locationEdit} siteLocationAuditFor={options.siteLocationAuditFor} siteLocationAudit={options.siteLocationAudit}
    siteMap={options.siteMap}
    onReload={vi.fn()} onSubmit={vi.fn()} onNameChange={vi.fn()} onTimeZoneChange={vi.fn()} onCaptureLocation={vi.fn()} onCancelLocationCapture={onCancelLocationCapture} onClearLocation={vi.fn()}
  />)
}

describe('SitesViewRender location picker', () => {
  it('places the optional GPS action in the create-site form', () => {
    renderSitesView()

    expect(screen.getByRole('heading', { name: 'Agregar local' })).toBeInTheDocument()
    expect(screen.getByText('¿Dónde queda el local?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Latitud' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Longitud' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear local' })).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Crear local' })).toBeDisabled()
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
    expect(screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' })).not.toBeChecked()
    expect(screen.getByText('Configuración inicial de ubicación')).toBeInTheDocument()
    expect(screen.getByText('Por Mateo')).toBeInTheDocument()
    expect(screen.getByText('Origen del punto: carga manual')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(audit.entries[0].changedAt, site.timeZone))).toBeInTheDocument()
    expect(screen.getByText('Centro nuevo: -34.6037220, -58.3815920 · radio: 100 m')).toBeInTheDocument()
  })

  // 2026-11-10 (#115): the API leaves empty fields out instead of sending null, so the first change of a site has no
  // previous values at all. "Ver historial de ubicación" threw on them and blanked the whole app until reload.
  it('shows the first location change when the server leaves its empty previous values out', () => {
    const site: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 100 }
    const audit: SiteLocationAuditResponse = { entries: [{
      id: 'audit-1', changedAt: '2026-11-10T15:30:00Z', actorDisplayName: 'Mateo',
      afterLatitude: site.latitude!, afterLongitude: site.longitude!, afterRadiusMeters: 100, locationSource: 'MANUAL'
    }] }
    renderSitesView(null, false, vi.fn(), { sites: [site], siteLocationAuditFor: site.id, siteLocationAudit: audit })

    expect(screen.getByText('Configuración inicial de ubicación')).toBeInTheDocument()
    expect(screen.getByText('Centro anterior: Sin coordenadas · radio: —')).toBeInTheDocument()
    expect(screen.getByText('Centro nuevo: -34.6037220, -58.3815920 · radio: 100 m')).toBeInTheDocument()
  })
})

/**
 * Watches the document and tells whether a status region entered it empty and got its text afterwards: screen readers announce
 * a change inside a region they already know, and often say nothing for one that arrives with its text (WCAG 4.1.3, slice F3).
 */
function watchStatusRegions() {
  const records: MutationRecord[] = []
  const observer = new MutationObserver((batch) => { records.push(...batch) })
  observer.observe(document.body, { childList: true, subtree: true })
  return {
    enteredEmpty(region: Element) {
      records.push(...observer.takeRecords())
      observer.disconnect()
      const entered = records.findIndex((record) => [...record.addedNodes].some((node) => node.contains(region)))
      return entered >= 0 && records.slice(entered + 1).some((record) => record.addedNodes.length > 0 && region.contains(record.target))
    }
  }
}

describe('SitesViewRender location messages', () => {
  it('announces the search for the device location in the create form: its region is there before its text', () => {
    const watch = watchStatusRegions()
    renderSitesView(null, true)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Buscando la ubicación del dispositivo…')
    // Slice E4: the line is a message of the system (design system 4.8), with a spinner while the search runs.
    expect(status).toHaveClass('message', 'message-info')
    expect(status.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true')
    expect(watch.enteredEmpty(status)).toBe(true)
  })

  it('announces the search for the device location in the edit form: its region is there before its text', () => {
    const site: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    const locationEdit: SiteLocationEditDraft = {
      siteId: site.id, latitude: '', longitude: '', geofenceRadiusMeters: '100', locationStatus: 'loading',
      locationMessage: 'Buscando la ubicación actual del dispositivo…', locationErrorKind: null, locationAccuracyMeters: null, locationConfirmed: false, locationSource: null
    }
    const watch = watchStatusRegions()
    renderSitesView(null, false, vi.fn(), { sites: [site], locationEdit })

    const status = within(screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })).getByRole('status')
    expect(status).toHaveTextContent('Buscando la ubicación actual del dispositivo…')
    expect(status).toHaveClass('message', 'message-info')
    expect(watch.enteredEmpty(status)).toBe(true)
  })

  it('keeps a failed capture an alert, with its title, from the moment it appears', () => {
    const site: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    const locationEdit: SiteLocationEditDraft = {
      siteId: site.id, latitude: '', longitude: '', geofenceRadiusMeters: '100', locationStatus: 'error',
      locationMessage: 'No se pudo obtener la ubicación. Volvé a intentar.', locationErrorKind: 'permission-denied', locationAccuracyMeters: null, locationConfirmed: false, locationSource: null
    }
    renderSitesView(null, false, vi.fn(), { sites: [site], locationEdit })

    const alert = within(screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })).getByRole('alert')
    expect(alert).toHaveClass('message', 'message-error')
    expect(alert).toHaveAttribute('aria-live', 'assertive')
    expect(alert).toHaveTextContent('No se pudo obtener la ubicación. Volvé a intentar.')
    expect(within(screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })).queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('SitesView location administration API', () => {
  it('creates a site with the default radius and no coordinates when GPS is skipped', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)

    await screen.findByText('Local creado.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ latitude: null, longitude: null, geofenceRadiusMeters: 100 }))
  })

  // 2026-11-09 (integrated check of PR #107): the form asked for "la zona por región de la base IANA".
  it('chooses the site hour by province, Buenos Aires first, and sends its region id', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Cordoba', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    const { container } = render(<SitesView />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    const zone = screen.getByRole('combobox', { name: 'Hora del local' })

    expect(zone).toHaveValue('America/Argentina/Buenos_Aires')
    expect(within(zone).getByRole('option', { name: 'Buenos Aires y CABA' })).toBeInTheDocument()
    expect(within(zone).getByRole('option', { name: 'Otra (fuera de Argentina)' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/IANA|America\/Argentina/)
    expect(screen.queryByRole('textbox', { name: /otro país/ })).not.toBeInTheDocument()

    fireEvent.change(zone, { target: { value: 'America/Argentina/Cordoba' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    await screen.findByText('Local creado.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ timeZone: 'America/Argentina/Cordoba' }))
    expect(screen.getByText('Hora de Córdoba, Santa Fe, Entre Ríos, Corrientes, Misiones, Chaco, Formosa y Santiago del Estero')).toBeInTheDocument()
  })

  it('accepts another country zone written by hand and rejects an abbreviation or a fixed offset before calling the server', async () => {
    const created: Site = { id: 'site-new', name: 'Local Santiago', timeZone: 'America/Santiago', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    render(<SitesView />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Santiago' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Hora del local' }), { target: { value: 'other' } })
    const zone = screen.getByRole('textbox', { name: 'Zona horaria de otro país' })
    expect(zone).toHaveValue('')

    for (const invalid of ['EST', '-03:00']) {
      fireEvent.change(zone, { target: { value: invalid } })
      fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
      expect(await screen.findByText('Esa zona horaria no sirve. Elegí una provincia de la lista o escribí la zona de una ciudad, por ejemplo America/Santiago.')).toBeInTheDocument()
    }
    expect(post).not.toHaveBeenCalled()

    fireEvent.change(zone, { target: { value: 'America/Santiago' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    await screen.findByText('Local creado.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({ timeZone: 'America/Santiago' }))
  })

  it('creates a site from manually entered coordinates after map review', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.603722, longitude: -58.381592, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '-34.603722' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Longitud' }), { target: { value: '-58.381592' } })
    const mapLink = screen.getByRole('link', { name: 'Revisar este punto en el mapa' })
    expect(mapLink).toHaveAttribute('href', expect.stringContaining('mlon=-58.381592'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)

    await screen.findByText('Local creado.')
    expect(post).toHaveBeenCalledWith('/sites', expect.objectContaining({
      latitude: -34.603722, longitude: -58.381592, locationSource: 'MANUAL'
    }))
  })

  it('rejects a partial or out-of-range manual coordinate pair before creating', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '91' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    // Changed in slice F2b: the problem is the error of the location group, read with it, not an alert of the form.
    const group = screen.getByRole('group', { name: '¿Dónde queda el local?' })
    expect(group).toHaveAccessibleDescription(/Ingresá latitud y longitud juntas/)
    expect(post).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Longitud' }), { target: { value: '181' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    expect(group).toHaveAccessibleDescription(/latitud entre -90 y 90/)
    expect(post).not.toHaveBeenCalled()
  })

  it('allows creating a site without a center after permission is denied', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post').mockResolvedValue(created as never)
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => failure({ code: 1 } as GeolocationPositionError))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Permiso de ubicación')
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)

    await screen.findByText('Local creado.')
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

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Precisión insuficiente')
    expect(screen.getByRole('alert')).toHaveTextContent('25.1 m')
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí el punto en el mapa')
    expect(screen.queryByText('Latitud -34.6037220 · Longitud -58.3815920')).not.toBeInTheDocument()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)

    await screen.findByText('Local creado.')
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

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    const confirmation = await screen.findByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' })
    fireEvent.click(confirmation)
    expect(confirmation).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Capturar otra ubicación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Precisión insuficiente')
    expect(screen.getByText('Latitud -34.6037220 · Longitud -58.3815920')).toBeInTheDocument()
    expect(screen.getByText(/revisalo y confirmalo de nuevo antes de guardar/i)).toBeInTheDocument()
    expect(confirmation).not.toBeChecked()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    expect(await screen.findByText(/Revisá el punto en el mapa y confirmá que corresponde a este local/i)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    fireEvent.click(confirmation)
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    await screen.findByText('Local creado.')
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

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación del dispositivo' }))
    const captureControl = await screen.findByRole('button', { name: 'Cancelar búsqueda' })
    fireEvent.click(captureControl)
    await screen.findByText('Búsqueda cancelada. Podés crear el local sin centro.')
    await act(async () => {
      lateSuccess?.({ coords: { latitude: -34.603722, longitude: -58.381592, accuracy: 8 } } as GeolocationPosition)
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)

    await screen.findByText('Local creado.')
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

    await screen.findByText('Ubicación del local actualizada.')
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
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' }))
    fireEvent.submit(form)

    await screen.findByText('Ubicación del local actualizada.')
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
    const confirmation = await within(form).findByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' })
    expect(within(form).getByText('Precisión informada por el dispositivo: ±12.0 m (estimación; no garantiza exactitud).')).toBeInTheDocument()

    fireEvent.submit(form)
    // Changed in slice F2b: the problem is the error of the location group, read with it, not an alert of the form.
    expect(within(form).getByRole('group', { name: '¿Dónde queda el local?' })).toHaveAccessibleDescription(/Confirmá que el nuevo punto corresponde a este local/)
    expect(put).not.toHaveBeenCalled()

    fireEvent.click(confirmation)
    expect(confirmation).toBeChecked()
    fireEvent.click(within(form).getByRole('button', { name: 'Capturar otra ubicación' }))
    // Slice E4: the failed save stays inside the form too, so the form holds two alerts; the capture's is the one with its title.
    expect((await within(form).findByText('Precisión insuficiente:', { selector: 'strong' })).closest('[role="alert"]')).toHaveTextContent('Precisión insuficiente')
    expect(confirmation).not.toBeChecked()
    expect(within(form).getByText('Latitud -34.6037220 · Longitud -58.3815920')).toBeInTheDocument()

    fireEvent.submit(form)
    expect(await screen.findByText('Confirmá que el nuevo punto corresponde a este local antes de guardarlo.')).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()

    fireEvent.click(confirmation)
    fireEvent.submit(form)
    await screen.findByText('Ubicación del local actualizada.')
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
    await screen.findByText('Ubicación del local actualizada.')
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

    await screen.findByText('Ubicación del local actualizada.')
    expect(put).toHaveBeenCalledWith('/sites/site-1/location', { latitude: -34.6, longitude: -58.38, locationSource: null, geofenceRadiusMeters: 100 })
  })

  it('loads scoped location audit entries when the ADMIN opens the history', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    const audit: SiteLocationAuditResponse = { entries: [] }
    const get = vi.spyOn(api, 'get').mockImplementation((path) => Promise.resolve((path.endsWith('/location-audit') ? audit : [existing]) as never))
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ver historial de ubicación' }))

    expect(await screen.findByText('Este local todavía no tiene cambios de ubicación auditados.')).toBeInTheDocument()
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

    const createForm = (await screen.findByRole('button', { name: 'Crear local' })).closest('form')!
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

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
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
    expect(screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' })).toBeChecked()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    await screen.findByText('Local creado.')
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

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Elegir en el mapa' }))
    const map = await screen.findByTestId('site-map')
    await vi.waitFor(() => expect(map).toHaveAttribute('data-view', '-32.95,-60.65,16'))
    expect(map).toHaveAttribute('data-point', '')
    expect(screen.getByRole('button', { name: 'Confirmar ubicación' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar mapa' }))
    expect(screen.queryByTestId('site-map')).not.toBeInTheDocument()
    fireEvent.submit(screen.getByRole('button', { name: 'Crear local' }).closest('form')!)
    await screen.findByText('Local creado.')
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
    // Slice E4: the example is the hint, read before typing, and no longer only a placeholder that typing hides.
    expect(query).toHaveAccessibleDescription('Calle y número')
    expect(query).not.toHaveAttribute('placeholder')
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
    expect(within(form).getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' })).toBeChecked()
    fireEvent.submit(form)
    await screen.findByText('Ubicación del local actualizada.')
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

/** True when `first` comes before `second` in the document. */
const comesBefore = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

// Slice E4 (design system 4.4, 4.7, 4.12, 4.20): «Locales» built with the pieces of the system.
describe('SitesView with the pieces of the system', () => {
  it('shows a failed create and the created local inside the add form, right above its button', async () => {
    const created: Site = { id: 'site-new', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    vi.spyOn(api, 'post').mockResolvedValue(created as never)
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    render(<SitesView />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '91' } })
    const button = screen.getByRole('button', { name: 'Crear local' })
    const form = button.closest('form')!
    fireEvent.submit(form)
    const failure = await screen.findByText(/Ingresá latitud y longitud juntas/)
    expect(form).toContainElement(failure)
    expect(comesBefore(failure, button)).toBe(true)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '' } })
    fireEvent.submit(form)
    const done = await screen.findByText('Local creado.')
    expect(form).toContainElement(done)
    expect(comesBefore(done, button)).toBe(true)
    expect(screen.queryByText(/Ingresá latitud y longitud juntas/)).not.toBeInTheDocument()
    // Slice G2: the button was disabled while it sent and the focus stayed on the page; it goes back to the emptied form, which
    // is brought into view from its top so its first field is not left above a phone's screen.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nombre del local' })).toHaveFocus())
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(form)
    expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ block: 'start' }))
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('shows a failed or saved location change inside the record of that local', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    vi.spyOn(api, 'put').mockResolvedValue({ ...existing, latitude: -34.61 } as never)
    render(<SitesView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '-34.61' } })
    fireEvent.submit(form)
    const failure = await within(form).findByText('Confirmá que el nuevo punto corresponde a este local antes de guardarlo.')
    expect(comesBefore(failure, within(form).getByRole('button', { name: 'Guardar ubicación' }))).toBe(true)

    fireEvent.click(within(form).getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' }))
    fireEvent.submit(form)
    const record = screen.getByRole('listitem', { name: 'Local Centro' })
    expect(await within(record).findByText('Ubicación del local actualizada.')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Cambiar ubicación de Local Centro' })).not.toBeInTheDocument()
  })

  it('makes the location confirmation a check whose whole label is the target', () => {
    renderSitesView({ latitude: -34.603722, longitude: -58.381592 }, false, vi.fn(), { locationAccuracyMeters: 8 })

    const confirmation = screen.getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' })
    expect(confirmation.closest('label')).toHaveClass('check')
  })

  it('lists the locals as records named by the local, without a decorative avatar', () => {
    const sites: Site[] = [
      { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 150 },
      { id: 'site-2', name: 'Local Norte', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
    ]
    const { container } = renderSitesView(null, false, vi.fn(), { sites })

    expect(screen.getByRole('list', { name: 'Locales registrados' })).toHaveClass('record-list')
    const record = screen.getByRole('listitem', { name: 'Local Norte' })
    expect(record).toHaveClass('record')
    expect(within(record).getByText('Sin ubicación cargada')).toHaveClass('record-meta')
    expect(container.querySelector('.row-avatar')).toBeNull()
  })

  it('shows the location history as a record list', () => {
    const site: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6037224, longitude: -58.3815926, geofenceRadiusMeters: 150 }
    const audit: SiteLocationAuditResponse = { entries: [
      { id: 'audit-1', changedAt: '2026-10-28T15:30:00Z', actorDisplayName: 'Mateo', afterLatitude: -34.6, afterLongitude: -58.38, afterRadiusMeters: 100, locationSource: 'CAPTURED' },
      { id: 'audit-2', changedAt: '2026-11-10T12:05:00Z', actorDisplayName: 'Mateo', beforeLatitude: -34.6, beforeLongitude: -58.38, beforeRadiusMeters: 100, afterLatitude: site.latitude, afterLongitude: site.longitude, afterRadiusMeters: 150, locationSource: 'MANUAL' }
    ] }
    renderSitesView(null, false, vi.fn(), { sites: [site], siteLocationAuditFor: site.id, siteLocationAudit: audit })

    const history = screen.getByRole('region', { name: 'Historial de ubicación de Local Centro' })
    expect(history).not.toHaveClass('audit-history')
    const list = within(history).getByRole('list', { name: 'Cambios de ubicación de Local Centro' })
    expect(list).toHaveClass('record-list')
    const changes = within(list).getAllByRole('listitem')
    expect(changes).toHaveLength(2)
    for (const change of changes) expect(change).toHaveClass('record')
    expect(within(changes[1]).getByText('Ubicación y radio actualizados').closest('.record-title')).not.toBeNull()
    expect(within(changes[1]).getByText('Por Mateo')).toHaveClass('record-meta')
  })

  it('groups the location as a field of the system, its help read before its buttons, and the name example as a hint', () => {
    const site: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 150 }
    const locationEdit: SiteLocationEditDraft = {
      siteId: site.id, latitude: '-34.6', longitude: '-58.38', geofenceRadiusMeters: '150', locationStatus: 'selected',
      locationMessage: '', locationErrorKind: null, locationAccuracyMeters: null, locationConfirmed: true, locationSource: null
    }
    renderSitesView(null, false, vi.fn(), { sites: [site], locationEdit })

    const forms = [screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' }), screen.getByRole('button', { name: 'Crear local' }).closest('form')!]
    for (const form of forms) {
      const group = within(form).getByRole('group', { name: '¿Dónde queda el local?' })
      expect(group).toHaveClass('field')
      expect(group).not.toHaveClass('fieldset-plain')
      expect(group).toHaveAccessibleDescription(/Lo más fácil: tocá «Elegir en el mapa»/)
      const help = within(group).getByText(/Lo más fácil: tocá «Elegir en el mapa»/)
      expect(comesBefore(help, within(group).getByRole('button', { name: 'Elegir en el mapa' }))).toBe(true)
      // The coordinates written by hand are a fold of the system.
      expect(within(group).getByText('Escribir las coordenadas a mano').closest('details')).toHaveClass('fold')
    }
    expect(forms[0]).toHaveClass('inline-form')
    const name = screen.getByRole('textbox', { name: 'Nombre del local' })
    expect(name).toHaveAccessibleDescription('Ej. Local Centro')
    expect(name).not.toHaveAttribute('placeholder')
  })

  it('opens the map as a flat part of the form: confirm filled, close as a link, the search answer as a message', async () => {
    const siteMap: SiteMapState = {
      target: { kind: 'create' }, view: { latitude: -34.6, longitude: -58.38, zoom: 17 }, point: { latitude: -34.6, longitude: -58.38 },
      query: 'Calle que no existe 99999', searchStatus: 'done', searchMessage: 'No encontramos esa dirección.', results: []
    }
    renderSitesView(null, false, vi.fn(), { siteMap })

    const panel = screen.getByRole('region', { name: 'Mapa para elegir la ubicación del local' })
    expect(within(panel).getByRole('button', { name: 'Confirmar ubicación' })).toHaveClass('button-primary')
    expect(within(panel).getByRole('button', { name: 'Cerrar mapa' })).toHaveClass('button-link')
    // A status message mounts empty and gets its text one effect later (PageMessage).
    expect((await within(panel).findByText('No encontramos esa dirección.')).closest('.message')).toHaveClass('message-info')
    const search = within(panel).getByRole('textbox', { name: 'Buscá la dirección del local' })
    expect(search).toHaveAccessibleDescription('Calle y número')
  })
})

// Slice F1 (WCAG 2.4.3; finding F-27, gap left by E4): «Cambiar ubicación» takes the focus into its form and gets it back when
// the form closes, saved or cancelled.
describe('SitesView: where the focus goes when the location form opens and closes', () => {
  const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 100 }
  const opener = () => screen.getByRole('button', { name: 'Cambiar ubicación de Local Centro' })

  it('opening it takes the focus to its first control, «Elegir en el mapa»; «Cancelar» gives it back to «Cambiar ubicación»', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    render(<SitesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })

    await vi.waitFor(() => expect(within(form).getByRole('button', { name: 'Elegir en el mapa' })).toHaveFocus())
    fireEvent.click(within(form).getByRole('button', { name: 'Cancelar' }))
    await vi.waitFor(() => expect(opener()).toHaveFocus())
  })

  it('a saved location gives the focus back to «Cambiar ubicación», next to its result', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    vi.spyOn(api, 'put').mockResolvedValue({ ...existing, geofenceRadiusMeters: 150 } as never)
    render(<SitesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' }), { target: { value: '150' } })
    fireEvent.submit(form)

    expect(await within(screen.getByRole('listitem', { name: 'Local Centro' })).findByText('Ubicación del local actualizada.')).toBeInTheDocument()
    await vi.waitFor(() => expect(opener()).toHaveFocus())
  })
})

// Slice F2b (design system 4.3 and 4.7; finding F-09): the forms of «Locales» are checked on submit, each error under its field.
describe('SitesView: one validation style', () => {
  const createButton = () => screen.getByRole('button', { name: 'Crear local' })

  it('an add form without a name or with a wrong radius explains each field, sums it up and focuses the name', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    const post = vi.spyOn(api, 'post')
    render(<SitesView />)
    const name = await screen.findByRole('textbox', { name: 'Nombre del local' })
    const form = createButton().closest('form')!
    expect(form).toHaveAttribute('novalidate')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' }), { target: { value: '20' } })
    fireEvent.submit(form)

    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Ej. Local Centro Escribí el nombre del local.')
    expect(screen.getByRole('spinbutton', { name: 'Distancia permitida para marcar (metros)' })).toHaveAccessibleDescription(expect.stringContaining('La distancia permitida para marcar debe ser un número entero entre 50 y 500 metros.'))
    expect(within(form).getByRole('alert')).toHaveTextContent('Revisá lo que está marcado debajo de cada campo.')
    await vi.waitFor(() => expect(name).toHaveFocus())
    expect(post).not.toHaveBeenCalled()
  })

  it('a wrong point is the error of the location group, with the focus on the coordinate to fix', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    render(<SitesView />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nombre del local' }), { target: { value: 'Local Centro' } })
    // The coordinates are typed in their fold, open as the person opened it.
    screen.getByText('Escribir las coordenadas a mano').closest('details')!.open = true
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '91' } })
    fireEvent.submit(createButton().closest('form')!)

    const group = screen.getByRole('group', { name: '¿Dónde queda el local?' })
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveClass('field-invalid')
    expect(group).toHaveAccessibleDescription(/Ingresá latitud y longitud juntas, o dejá ambas vacías para crear el local sin centro\.$/)
    await vi.waitFor(() => expect(screen.getByRole('spinbutton', { name: 'Latitud' })).toHaveFocus())
  })

  it('an unconfirmed point of a location change is the error of the group, with the focus on the confirmation', async () => {
    const existing: Site = { id: 'site-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6, longitude: -58.38, geofenceRadiusMeters: 100 }
    vi.spyOn(api, 'get').mockResolvedValue([existing] as never)
    const put = vi.spyOn(api, 'put')
    render(<SitesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar ubicación de Local Centro' }))
    const form = screen.getByRole('form', { name: 'Cambiar ubicación de Local Centro' })
    expect(form).toHaveAttribute('novalidate')
    fireEvent.change(within(form).getByRole('spinbutton', { name: 'Latitud' }), { target: { value: '-34.61' } })
    fireEvent.submit(form)

    expect(within(form).getByRole('group', { name: '¿Dónde queda el local?' })).toHaveAccessibleDescription(/Confirmá que el nuevo punto corresponde a este local antes de guardarlo\.$/)
    await vi.waitFor(() => expect(within(form).getByRole('checkbox', { name: 'Confirmo que este punto corresponde al local.' })).toHaveFocus())
    expect(put).not.toHaveBeenCalled()
  })

  it('an empty address search is the error of the search field, with the focus on it', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([] as never)
    render(<SitesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Elegir en el mapa' }))
    await screen.findByTestId('site-map')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    const query = screen.getByRole('textbox', { name: 'Buscá la dirección del local' })
    expect(query).toHaveAttribute('aria-invalid', 'true')
    expect(query).toHaveAccessibleDescription('Calle y número Escribí la dirección del local para buscarla.')
    await vi.waitFor(() => expect(query).toHaveFocus())
    fireEvent.change(query, { target: { value: 'Corrientes 1234' } })
    expect(query).not.toHaveAttribute('aria-invalid')
  })

  it('«Confirmar ubicación» waits for a point and says so', () => {
    const siteMap: SiteMapState = {
      target: { kind: 'create' }, view: { latitude: -34.6, longitude: -58.38, zoom: 12 }, point: null,
      query: '', searchStatus: 'idle', searchMessage: '', results: []
    }
    renderSitesView(null, false, vi.fn(), { siteMap })

    const confirm = screen.getByRole('button', { name: 'Confirmar ubicación' })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAccessibleDescription('Tocá en el mapa la puerta del local.')
  })
})
