import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JourneysView } from './AdminViews'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))

vi.mock('../../app/session', () => ({
  useSession: () => ({
    signOut: vi.fn(), activateCompany: vi.fn(),
    session: { dni: '30123456', activeCompanyId: 'c-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }] }
  })
}))
vi.mock('../../device/push/AdminPushControl', () => ({ AdminPushControl: () => null }))
vi.mock('../../device/pwa/InstallControl', () => ({ InstallControl: () => null }))
vi.mock('../../shared/api/client', () => ({
  api: apiMocks,
  queryString: (values: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    return `?${params.toString()}`
  }
}))

const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires' }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const marks = [
  { id: 'm-1', jornadaId: 'j-1', action: 'INGRESO', sequence: 1, acceptedAt: '2026-10-16T12:20:45Z', locationStatus: 'RECIBIDA' },
  { id: 'm-2', jornadaId: 'j-1', action: 'SALIDA_ALMUERZO', sequence: 2, acceptedAt: '2026-10-16T16:00:10Z', locationStatus: 'SIN_UBICACION' }
]
const detailed = [{
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EGRESADA', employeeDisplayName: 'Lucía Pérez',
  marks,
  deviations: [{
    id: 'd-1', jornadaId: 'j-1', siteId: 's-1', employeeId: 'e-1', type: 'LLEGADA_TARDE', status: 'JUSTIFICADO', category: 'TRANSPORTE',
    occurredAt: '2026-10-16T12:20:45Z', createdAt: '2026-10-16T12:25:00Z', pushEligible: true
  }]
}]
// The day as «Hoy» reads it to open its detail.
const jornada = {
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EGRESADA', toleranceMinutes: 5, sequence: 1,
  scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks: [{ startDayOffset: 0, start: '09:00', end: '17:00', endDayOffset: 0 }], breakfastLimitMinutes: 15, lunchLimitMinutes: 60 },
  marks
}

// Only the search asks for the detail of each day; the list of the date in «Hoy» does not.
const historyCalls = () => apiMocks.get.mock.calls.map(([path]) => path as string).filter((path) => path.startsWith('/jornadas?') && path.includes('includeDetail=true'))
const search = () => screen.getByRole('region', { name: 'Buscar días anteriores' })
const pick = (label: string, value: string) => fireEvent.change(within(search()).getByLabelText(label), { target: { value } })
const searchButton = () => within(search()).getByRole('button', { name: 'Buscar' })
const searchReady = () => within(search()).findByRole('option', { name: 'Lucía Pérez' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 23, 15, 0, 0) })
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/employees') return Promise.resolve([employee])
    if (path.startsWith('/jornadas?') && path.includes('includeDetail=true')) return Promise.resolve(detailed)
    // Today has no day loaded: a day found by the search is never a row of the list of the date.
    if (path.startsWith('/jornadas?')) return Promise.resolve([])
    if (path === '/jornadas/j-1') return Promise.resolve(jornada)
    throw new Error(`GET inesperado: ${path}`)
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('búsqueda de días anteriores en «Hoy» (antes Historial)', () => {
  it('está en «Hoy», plegada, y usa las personas y los locales que «Hoy» ya leyó', async () => {
    render(<JourneysView />)
    expect(within(search()).getByRole('heading', { name: 'Buscar días anteriores' })).toBeInTheDocument()
    expect(search().querySelector('details')).not.toHaveAttribute('open')
    await searchReady()
    expect(within(search()).getByRole('option', { name: 'Local Centro' })).toBeInTheDocument()
    const reads = (path: string) => apiMocks.get.mock.calls.filter(([called]) => called === path).length
    expect(reads('/employees')).toBe(1)
    expect(reads('/sites')).toBe(1)
    expect(historyCalls()).toEqual([])
  })

  it('propone los últimos 7 días y consulta con includeDetail para el empleado elegido', async () => {
    render(<JourneysView />)
    await searchReady()
    expect(within(search()).getByLabelText('Desde')).toHaveValue('2026-10-17')
    expect(within(search()).getByLabelText('Hasta')).toHaveValue('2026-10-23')
    pick('Empleado', 'e-1')
    fireEvent.click(searchButton())
    await waitFor(() => expect(historyCalls()).toEqual(['/jornadas?from=2026-10-17&to=2026-10-23&employeeId=e-1&includeDetail=true']))
  })

  it('muestra las marcas y los desvíos de cada jornada con la hora del hecho', async () => {
    render(<JourneysView />)
    await searchReady()
    pick('Empleado', 'e-1'); pick('Local', 's-1')
    fireEvent.click(searchButton())
    const card = (await within(search()).findByRole('article', { name: /Lucía Pérez/ }))
    expect(historyCalls()[0]).toBe('/jornadas?from=2026-10-17&to=2026-10-23&employeeId=e-1&siteId=s-1&includeDetail=true')
    expect(card).toHaveTextContent('Local Centro')
    expect(card).toHaveTextContent('Finalizada')
    const marks = within(card).getByRole('list', { name: 'Marcas' })
    expect(marks).toHaveTextContent(/Entrada.*0?9:20/)
    expect(marks).not.toHaveTextContent('09:20:45')
    expect(marks).toHaveTextContent('Ubicación recibida')
    expect(marks).toHaveTextContent(/Salida a almorzar.*(13:00|1:00)/)
    expect(marks).toHaveTextContent('Sin ubicación')
    const deviations = within(card).getByRole('list', { name: 'Casos' })
    expect(deviations).toHaveTextContent('Llegada tarde')
    expect(deviations).toHaveTextContent(/0?9:20/)
    expect(deviations).not.toHaveTextContent(/0?9:25/)
    expect(deviations).toHaveTextContent('Justificado')
  })

  it('pide elegir un empleado o una sede antes de consultar', async () => {
    render(<JourneysView />)
    await searchReady()
    fireEvent.click(searchButton())
    expect(await within(search()).findByRole('alert')).toHaveTextContent('Elegí un empleado o un local.')
    expect(historyCalls()).toEqual([])
  })

  it('valida el rango en el cliente y no llama a la API', async () => {
    render(<JourneysView />)
    await searchReady()
    pick('Empleado', 'e-1'); pick('Desde', '2025-01-01')
    fireEvent.click(searchButton())
    expect(await within(search()).findByRole('alert')).toHaveTextContent('El rango no puede superar los 366 días.')
    pick('Desde', '')
    fireEvent.click(searchButton())
    expect(await within(search()).findByRole('alert')).toHaveTextContent('Completá las dos fechas: desde y hasta.')
    expect(historyCalls()).toEqual([])
  })

  it('explica en español un 422 del servidor', async () => {
    apiMocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/jornadas?') && path.includes('includeDetail=true')) return Promise.reject(Object.assign(new Error('Revisá los datos ingresados.'), { status: 422 }))
      if (path.startsWith('/jornadas?')) return Promise.resolve([])
      return Promise.resolve(path === '/sites' ? [site] : [employee])
    })
    render(<JourneysView />)
    await searchReady()
    pick('Empleado', 'e-1')
    fireEvent.click(searchButton())
    expect(await within(search()).findByRole('alert')).toHaveTextContent('Son demasiados datos para una sola consulta: acotá el rango de fechas o elegí un empleado o un local (hasta 366 días y 500 días de trabajo).')
  })

  it('muestra un estado vacío y un error de carga con reintento', async () => {
    render(<JourneysView />)
    await searchReady()
    pick('Empleado', 'e-1')
    apiMocks.get.mockImplementation(() => Promise.resolve([]))
    fireEvent.click(searchButton())
    expect(await within(search()).findByText('No hay días de trabajo para esos filtros en el rango elegido.')).toBeInTheDocument()

    apiMocks.get.mockImplementation(() => Promise.reject(new Error('Sin conexión.')))
    fireEvent.click(searchButton())
    expect(await within(search()).findByText('Sin conexión.')).toBeInTheDocument()
    expect(within(search()).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('un día encontrado se abre en el detalle de «Hoy», con las mismas acciones', async () => {
    apiMocks.post.mockResolvedValue({ ...marks[0], voided: true })
    render(<JourneysView />)
    await searchReady()
    pick('Empleado', 'e-1')
    fireEvent.click(searchButton())
    const card = await within(search()).findByRole('article', { name: /Lucía Pérez/ })
    fireEvent.click(within(card).getByRole('button', { name: /^Ver marcas de Lucía Pérez del 16/ }))

    const heading = await screen.findByRole('heading', { name: 'Marcas de Lucía Pérez' })
    expect(apiMocks.get).toHaveBeenCalledWith('/jornadas/j-1')
    await waitFor(() => expect(heading).toHaveFocus())
    // The day is not a row of the list of the date, so it opens in its own block, outside the results.
    const detail = screen.getByRole('region', { name: 'Marcas de Lucía Pérez' })
    expect(search()).not.toContainElement(detail)
    expect(detail).toHaveTextContent('Horario asignado: Mañana · tolerancia 5 min')
    expect(within(detail).getByRole('button', { name: /^Corregir marca Entrada/ })).toBeEnabled()
    expect(within(detail).getByRole('button', { name: 'Agregar marca' })).toBeInTheDocument()
    expect(within(detail).getByRole('button', { name: 'Ver historial' })).toBeInTheDocument()

    // And an action works as it does from the list: voiding a mark.
    fireEvent.click(within(detail).getByRole('button', { name: /^Anular marca Entrada/ }))
    fireEvent.change(within(detail).getByLabelText('Motivo de anulación'), { target: { value: 'Marca duplicada' } })
    fireEvent.click(within(detail).getByRole('button', { name: 'Confirmar anulación' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/marks/m-1/void', { reason: 'Marca duplicada' }))
  })
})
