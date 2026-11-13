import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSource } from '../../app/testing/sourceFiles'
import { JourneysView } from './JourneysView'
import MarkMapCanvas from './MarkMapCanvas'
import { MAP_MARK_COLOR, MARK_POINT_STYLE } from './markMap'
import { MAP_HALO_COLOR } from './siteMap'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))
vi.mock('../../shared/api/client', () => ({
  api: apiMocks,
  queryString: (values: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    return `?${params.toString()}`
  }
}))

const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6037, longitude: -58.3816, geofenceRadiusMeters: 100 }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
// The entrada was made 400 m north of the local with ±23.46 m; the breakfast mark sent no location.
const located = { id: 'm-1', jornadaId: 'j-1', action: 'INGRESO' as const, sequence: 1, acceptedAt: '2026-10-16T12:00:00Z', locationStatus: 'RECIBIDA' as const, latitude: -34.6001, longitude: -58.3816, accuracyMeters: 23.46 }
const withoutLocation = { id: 'm-2', jornadaId: 'j-1', action: 'SALIDA_DESAYUNO' as const, sequence: 2, acceptedAt: '2026-10-16T14:00:00Z', locationStatus: 'SIN_UBICACION' as const }
const jornada = {
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'PAUSA_ABIERTA' as const,
  scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks: [{ startDayOffset: 0 as const, start: '09:00', end: '17:00', endDayOffset: 0 as const }], breakfastLimitMinutes: 15, lunchLimitMinutes: 60 },
  toleranceMinutes: 5, sequence: 2, marks: [located, withoutLocation],
  geofenceLatitude: -34.6037, geofenceLongitude: -58.3816, geofenceRadiusMeters: 100
}

let detail: object = jornada
const wideScreen = (query: string) => ({ matches: query === '(min-width: 768px)', media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
let sharedMatchMedia: PropertyDescriptor | undefined

beforeEach(() => {
  vi.clearAllMocks()
  detail = jornada
  sharedMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: wideScreen })
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/employees') return Promise.resolve([employee])
    if (path.startsWith('/jornadas?')) return Promise.resolve([{ id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'PAUSA_ABIERTA' }])
    if (path === '/jornadas/j-1') return Promise.resolve(detail)
    throw new Error(`GET inesperado: ${path}`)
  })
})

afterEach(() => {
  cleanup()
  if (sharedMatchMedia) Object.defineProperty(window, 'matchMedia', sharedMatchMedia)
})

async function openDay() {
  fireEvent.click(await screen.findByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: /^Marcas de / })).toHaveFocus())
}
/** «Ver en el mapa» of the entrada; open, it reads «Ocultar mapa» and its name says so (WCAG 2.5.3). */
const mapButton = () => screen.getByRole('button', { name: /^(Ver en el mapa|Ocultar mapa de) la marca Entrada/ })

/** The value of a token of styles.css, as written there. */
const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`).exec(readSource('styles.css'))?.[1]?.toLowerCase()

// 2026-11-13, the owner: «que se vea dónde estuvo parado, con una indicación en rojo». The ADMIN opens, under a mark, the map
// of where the phone said it was, with the local's area of that day and the verdict of the server's rule in words.
describe('the map of a mark in the day detail', () => {
  it('«Ver en el mapa» opens under its mark, takes the focus, says where it was made, and «Cerrar» gives the focus back', async () => {
    render(<JourneysView />)
    await openDay()
    const row = screen.getByRole('row', { name: /^Entrada/ })
    expect(within(row).getByText('Ubicación recibida')).toBeInTheDocument()
    expect(mapButton()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(mapButton())
    const panel = screen.getByRole('region', { name: 'Dónde se hizo esta marca' })
    expect(row.nextElementSibling).toContainElement(panel)
    await waitFor(() => expect(panel).toHaveFocus())
    expect(mapButton()).toHaveAttribute('aria-expanded', 'true')
    expect(mapButton()).toHaveAttribute('aria-controls', panel.id)

    expect(within(panel).getByText('Fuera del local: aproximadamente 324 m más allá de la distancia permitida.')).toBeInTheDocument()
    expect(within(panel).getByText('Esta marca se hizo aproximadamente a 400 m del local.')).toBeInTheDocument()
    expect(within(panel).getByText('Precisión informada por el celular: aproximadamente ±23 m.')).toBeInTheDocument()
    expect(within(panel).getByText('Cuenta como dentro del local cuando la distancia más la precisión no pasa de los 100 m permitidos.')).toBeInTheDocument()
    // The legend names both points with words, not only with the red and the ink.
    const legend = within(panel).getByRole('list', { name: 'Qué muestra el mapa' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Marca: dónde estaba el celular (punto rojo)', 'Local: su punto y el círculo de los 100 m permitidos'
    ])
    const link = within(panel).getByRole('link', { name: 'Abrir en OpenStreetMap (en otra pestaña)' })
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=-34.6001&mlon=-58.3816#map=17/-34.6001/-58.3816')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer noopener')
    expect(await within(panel).findByRole('group', { name: /^Mapa de la marca Entrada de / })).toHaveClass('site-map-canvas', 'mark-map-canvas')

    fireEvent.click(within(panel).getByRole('button', { name: 'Cerrar' }))
    expect(panel).not.toBeInTheDocument()
    await waitFor(() => expect(mapButton()).toHaveFocus())
    expect(mapButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('the button toggles: pressed again it closes the map and keeps the focus', async () => {
    render(<JourneysView />)
    await openDay()
    fireEvent.click(mapButton())
    await waitFor(() => expect(screen.getByRole('region', { name: 'Dónde se hizo esta marca' })).toHaveFocus())
    expect(mapButton()).toHaveTextContent('Ocultar mapa')

    fireEvent.click(mapButton())
    expect(screen.queryByRole('region', { name: 'Dónde se hizo esta marca' })).not.toBeInTheDocument()
    expect(mapButton()).toHaveTextContent('Ver en el mapa')
  })

  it('a mark without coordinates has no map: its location says why', async () => {
    render(<JourneysView />)
    await openDay()
    const row = screen.getByRole('row', { name: /^Salida a desayunar/ })
    expect(within(row).getByText('Sin ubicación')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /mapa/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Ver en el mapa/ })).toHaveLength(1)
  })

  it('a day whose local had no point shows the mark alone and says so, with no verdict', async () => {
    detail = { ...jornada, geofenceLatitude: undefined, geofenceLongitude: undefined, geofenceRadiusMeters: undefined }
    render(<JourneysView />)
    await openDay()
    fireEvent.click(mapButton())
    const panel = screen.getByRole('region', { name: 'Dónde se hizo esta marca' })

    expect(within(panel).getByText('Ese día el local no tenía ubicación cargada.')).toBeInTheDocument()
    expect(within(panel).getByText('Precisión informada por el celular: aproximadamente ±23 m.')).toBeInTheDocument()
    expect(within(panel).queryByText(/Dentro del local|Fuera del local/)).not.toBeInTheDocument()
    const legend = within(panel).getByRole('list', { name: 'Qué muestra el mapa' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Marca: dónde estaba el celular (punto rojo)'])
  })

  it('a mark inside the area says so', async () => {
    detail = { ...jornada, marks: [{ ...located, latitude: -34.6033, accuracyMeters: 20 }, withoutLocation] }
    render(<JourneysView />)
    await openDay()
    fireEvent.click(mapButton())

    expect(within(screen.getByRole('region', { name: 'Dónde se hizo esta marca' })).getByText('Dentro del local.')).toBeInTheDocument()
  })

  it('a voided mark keeps its point listed but opens no map: it no longer counts for the day', async () => {
    detail = { ...jornada, marks: [{ ...located, voided: true, voidedAt: '2026-10-16T13:00:00Z', voidReason: 'Error' }, withoutLocation] }
    render(<JourneysView />)
    await openDay()

    expect(screen.queryByRole('button', { name: /^Ver en el mapa/ })).not.toBeInTheDocument()
  })

  describe('on a phone', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) })
    })

    it('opens inside the record of its mark, under its buttons, and gives the focus back on «Cerrar»', async () => {
      render(<JourneysView />)
      const card = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      fireEvent.click(within(card).getByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
      const marks = await within(card).findByRole('list', { name: 'Marcas del día' })
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Marcas de Lucía Pérez' })).toHaveFocus())
      const [item] = within(marks).getAllByRole('listitem')

      fireEvent.click(within(item).getByRole('button', { name: /^Ver en el mapa la marca Entrada/ }))
      const panel = within(item).getByRole('region', { name: 'Dónde se hizo esta marca' })
      await waitFor(() => expect(panel).toHaveFocus())
      // Under the buttons of its mark, like a form of the mark.
      expect(within(item).getByRole('button', { name: /^Anular marca Entrada/ }).compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      fireEvent.click(within(panel).getByRole('button', { name: 'Cerrar' }))
      await waitFor(() => expect(within(item).getByRole('button', { name: /^Ver en el mapa la marca Entrada/ })).toHaveFocus())
    })
  })
})

describe('the map of a mark, as Leaflet draws it', () => {
  it('names itself, its zoom buttons in Spanish, and credits OpenStreetMap', () => {
    const { container } = render(<MarkMapCanvas mark={{ latitude: -34.6001, longitude: -58.3816 }} geofence={{ latitude: -34.6037, longitude: -58.3816, radiusMeters: 100 }} label="Mapa de la marca Entrada" />)

    const map = container.querySelector('.mark-map-canvas')!
    expect(map).toHaveAttribute('role', 'group')
    expect(map).toHaveAttribute('aria-label', 'Mapa de la marca Entrada')
    expect(container.querySelector('.leaflet-control-zoom-in')).toHaveAttribute('aria-label', 'Acercar')
    expect(container.querySelector('.leaflet-control-attribution')).toHaveTextContent('© OpenStreetMap')
    // The two points carry their words on the map too.
    expect(container).toHaveTextContent('Marca')
    expect(container).toHaveTextContent('Local')
  })

  it('draws the mark in the red of the tokens, ringed in white', () => {
    expect(MAP_MARK_COLOR).toBe(token('--bad'))
    expect(MARK_POINT_STYLE).toMatchObject({ color: MAP_HALO_COLOR, fillColor: MAP_MARK_COLOR, fillOpacity: 1 })
  })
})
