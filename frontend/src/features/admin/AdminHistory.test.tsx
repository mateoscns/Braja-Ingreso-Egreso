import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'
import { AdminHistory } from './AdminViews'

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
const detailed = [{
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EGRESADA', employeeDisplayName: 'Lucía Pérez',
  marks: [
    { id: 'm-1', jornadaId: 'j-1', action: 'INGRESO', sequence: 1, acceptedAt: '2026-10-16T12:20:45Z', locationStatus: 'RECIBIDA' },
    { id: 'm-2', jornadaId: 'j-1', action: 'SALIDA_ALMUERZO', sequence: 2, acceptedAt: '2026-10-16T16:00:10Z', locationStatus: 'SIN_UBICACION' }
  ],
  deviations: [{
    id: 'd-1', jornadaId: 'j-1', siteId: 's-1', employeeId: 'e-1', type: 'LLEGADA_TARDE', status: 'JUSTIFICADO', category: 'TRANSPORTE',
    occurredAt: '2026-10-16T12:20:45Z', createdAt: '2026-10-16T12:25:00Z', pushEligible: true
  }]
}]

const historyCalls = () => apiMocks.get.mock.calls.map(([path]) => path as string).filter((path) => path.startsWith('/jornadas'))
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 23, 15, 0, 0) })
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/employees') return Promise.resolve([employee])
    if (path.startsWith('/jornadas?')) return Promise.resolve(detailed)
    throw new Error(`GET inesperado: ${path}`)
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Historial del ADMIN', () => {
  it('aparece en la navegación y abre la vista', async () => {
    render(<AdminApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeInTheDocument()
  })

  it('propone los últimos 7 días y consulta con includeDetail para el empleado elegido', async () => {
    render(<AdminHistory />)
    await screen.findByRole('option', { name: 'Lucía Pérez' })
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-17')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-23')
    pick('Empleado', 'e-1')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(historyCalls()).toEqual(['/jornadas?from=2026-10-17&to=2026-10-23&employeeId=e-1&includeDetail=true']))
  })

  it('muestra las marcas y los desvíos de cada jornada con la hora del hecho', async () => {
    render(<AdminHistory />)
    await screen.findByRole('option', { name: 'Lucía Pérez' })
    pick('Empleado', 'e-1'); pick('Sede', 's-1')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    const card = (await screen.findByRole('article', { name: /Lucía Pérez/ }))
    expect(historyCalls()[0]).toBe('/jornadas?from=2026-10-17&to=2026-10-23&employeeId=e-1&siteId=s-1&includeDetail=true')
    expect(card).toHaveTextContent('Local Centro')
    expect(card).toHaveTextContent('Finalizada')
    const marks = within(card).getByRole('list', { name: 'Marcas' })
    expect(marks).toHaveTextContent(/Ingreso.*0?9:20/)
    expect(marks).not.toHaveTextContent('09:20:45')
    expect(marks).toHaveTextContent('Ubicación recibida')
    expect(marks).toHaveTextContent(/Salida almuerzo.*(13:00|1:00)/)
    expect(marks).toHaveTextContent('Sin ubicación')
    const deviations = within(card).getByRole('list', { name: 'Desvíos' })
    expect(deviations).toHaveTextContent('Llegada tarde')
    expect(deviations).toHaveTextContent(/0?9:20/)
    expect(deviations).not.toHaveTextContent(/0?9:25/)
    expect(deviations).toHaveTextContent('Justificado')
  })

  it('pide elegir un empleado o una sede antes de consultar', async () => {
    render(<AdminHistory />)
    await screen.findByRole('option', { name: 'Lucía Pérez' })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí un empleado o una sede.')
    expect(historyCalls()).toEqual([])
  })

  it('valida el rango en el cliente y no llama a la API', async () => {
    render(<AdminHistory />)
    await screen.findByRole('option', { name: 'Lucía Pérez' })
    pick('Empleado', 'e-1'); pick('Desde', '2025-01-01')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El rango no puede superar los 366 días.')
    pick('Desde', '')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Completá las dos fechas: desde y hasta.')
    expect(historyCalls()).toEqual([])
  })

  it('explica en español un 422 del servidor', async () => {
    apiMocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/jornadas?')) return Promise.reject(Object.assign(new Error('Revisá los datos ingresados.'), { status: 422 }))
      return Promise.resolve(path === '/sites' ? [site] : [employee])
    })
    render(<AdminHistory />)
    await screen.findByRole('option', { name: 'Lucía Pérez' })
    pick('Empleado', 'e-1')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor rechazó la consulta: acotá el rango de fechas o elegí un empleado o una sede (máximo 366 días y 500 jornadas).')
  })

  it('muestra un estado vacío y un error de carga con reintento', async () => {
    render(<AdminHistory />)
    await screen.findByRole('option', { name: 'Lucía Pérez' })
    pick('Empleado', 'e-1')
    apiMocks.get.mockImplementation(() => Promise.resolve([]))
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText('No hay jornadas para esos filtros en el rango elegido.')).toBeInTheDocument()

    apiMocks.get.mockImplementation(() => Promise.reject(new Error('Sin conexión.')))
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText('Sin conexión.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
