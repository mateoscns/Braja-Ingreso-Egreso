import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'
import { AdminInbox, EmployeesView, JourneysView, SitesView, TemplatesView } from './AdminViews'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))
const adminSessionMocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  activateCompany: vi.fn(),
  session: {
    dni: '30123456', activeCompanyId: 'c-1',
    memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }]
  }
}))

vi.mock('../../app/session', () => ({
  useSession: () => ({ ...adminSessionMocks, session: adminSessionMocks.session })
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

const deviation = {
  id: 'd-1', jornadaId: 'j-1', siteId: 's-1', employeeId: 'e-1', employeeDisplayName: 'Lucía Pérez',
  type: 'LLEGADA_TARDE' as const, status: 'JUSTIFICADO' as const, category: null, createdAt: '2026-10-16T12:00:00Z', pushEligible: true
}
const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires' }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const jornada = {
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EN_CURSO' as const,
  scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks: [{ startDayOffset: 0 as const, start: '09:00', end: '17:00', endDayOffset: 0 as const }], breakfastLimitMinutes: 15, lunchLimitMinutes: 60 },
  toleranceMinutes: 5, sequence: 1,
  marks: [{ id: 'm-1', jornadaId: 'j-1', action: 'INGRESO' as const, sequence: 1, acceptedAt: '2026-10-16T12:00:00Z', locationStatus: 'SIN_UBICACION' as const }]
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.get.mockImplementation((path: string) => {
    if (path.startsWith('/inbox')) return Promise.resolve({ items: [deviation], nextCursor: null })
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/employees') return Promise.resolve([employee])
    if (path === '/templates') return Promise.resolve([{
      id: 't-1', siteId: 's-1', name: 'Mañana', active: true, blocks: jornada.scheduleSnapshot.blocks,
      breakfastLimitMinutes: 15, lunchLimitMinutes: 60
    }])
    if (path.startsWith('/jornadas?')) return Promise.resolve([{ id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EN_CURSO' }])
    if (path === '/jornadas/j-1') return Promise.resolve(jornada)
    throw new Error(`GET inesperado: ${path}`)
  })
  apiMocks.post.mockResolvedValue({ ...jornada.marks[0], id: 'm-2', action: 'SALIDA_ALMUERZO', occurredAt: '2026-10-16T15:30:00Z' })
  apiMocks.put.mockResolvedValue({ ...deviation, status: 'NO_JUSTIFICADO' })
})

afterEach(() => cleanup())

describe('administración de desvíos y marcas', () => {
  it('anuncia la sección seleccionada y no muestra un indicador de bandeja permanente', async () => {
    const { container } = render(<AdminApp />)
    const inbox = screen.getByRole('button', { name: 'Bandeja' })
    expect(inbox).toHaveAttribute('aria-current', 'page')
    expect(container.querySelector('.nav-dot')).not.toBeInTheDocument()

    const employees = screen.getByRole('button', { name: 'Empleados' })
    fireEvent.click(employees)
    expect(employees).toHaveAttribute('aria-current', 'page')
    expect(inbox).not.toHaveAttribute('aria-current')
    expect(await screen.findByRole('heading', { name: 'Empleados' })).toBeInTheDocument()
  })

  it('muestra el nombre entregado por el servidor en la bandeja', async () => {
    render(<AdminInbox />)
    expect(await screen.findByText(/Lucía Pérez/)).toBeInTheDocument()
  })

  it('distingue un fallo de carga de la bandeja vacía y permite reintentar', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    let failFirstRequest = true
    apiMocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/inbox') && failFirstRequest) {
        failFirstRequest = false
        return Promise.reject(new Error('Falló la carga de la bandeja.'))
      }
      return previousGet(path)
    })
    render(<AdminInbox />)

    expect(await screen.findByText('Falló la carga de la bandeja.')).toBeInTheDocument()
    expect(screen.queryByText('No hay desvíos para mostrar.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/Lucía Pérez/)).toBeInTheDocument()
  })

  it('mantiene la bandeja si falla la carga de zonas horarias y explica el huso usado', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites'
      ? Promise.reject(new Error('Falló la consulta de sedes.'))
      : previousGet(path))
    render(<AdminInbox />)

    expect(await screen.findByText(/Falló la consulta de sedes\./)).toBeInTheDocument()
    expect(screen.getByText(/Las horas se muestran en la zona horaria de este dispositivo\./)).toBeInTheDocument()
    expect(screen.getByText(/Lucía Pérez/)).toBeInTheDocument()
    expect(screen.queryByText('No hay desvíos para mostrar.')).not.toBeInTheDocument()
  })

  it('distingue un fallo de carga de la lista vacía de sedes y permite reintentar', async () => {
    apiMocks.get.mockImplementationOnce(() => Promise.reject(new Error('Falló la carga de sedes.')))
    render(<SitesView />)

    expect(await screen.findByText('Falló la carga de sedes.')).toBeInTheDocument()
    expect(screen.queryByText('Todavía no hay sedes.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Local Centro')).toBeInTheDocument()
  })

  it('muestra el estado vacío de sedes solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.resolve([]) : previousGet(path))
    render(<SitesView />)
    expect(await screen.findByText('Todavía no hay sedes.')).toBeInTheDocument()
  })

  it('distingue un fallo de carga de la lista vacía de empleados y permite reintentar', async () => {
    apiMocks.get.mockImplementationOnce(() => Promise.reject(new Error('Falló la carga de empleados.')))
    render(<EmployeesView />)

    expect(await screen.findByText('Falló la carga de empleados.')).toBeInTheDocument()
    expect(screen.queryByText('No hay empleados cargados.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Lucía Pérez')).toBeInTheDocument()
  })

  it('muestra el estado vacío de empleados solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/employees' ? Promise.resolve([]) : previousGet(path))
    render(<EmployeesView />)
    expect(await screen.findByText('No hay empleados cargados.')).toBeInTheDocument()
  })

  it('distingue un fallo de carga de la lista vacía de plantillas y permite reintentar', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    let failFirstTemplateRequest = true
    apiMocks.get.mockImplementation((path: string) => {
      if (path === '/templates' && failFirstTemplateRequest) {
        failFirstTemplateRequest = false
        return Promise.reject(new Error('Falló la carga de plantillas.'))
      }
      return previousGet(path)
    })
    render(<TemplatesView />)

    expect(await screen.findByText('Falló la carga de plantillas.')).toBeInTheDocument()
    expect(screen.queryByText('No hay plantillas para esta sede.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/09:00–17:00/)).toBeInTheDocument()
  })

  it('muestra el estado vacío de plantillas solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/templates' ? Promise.resolve([]) : previousGet(path))
    render(<TemplatesView />)
    expect(await screen.findByText('No hay plantillas para esta sede.')).toBeInTheDocument()
  })

  it('distingue un fallo de carga de la lista vacía de jornadas y permite reintentar', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    let failFirstRequest = true
    apiMocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/jornadas?') && failFirstRequest) {
        failFirstRequest = false
        return Promise.reject(new Error('Falló la carga de jornadas.'))
      }
      return previousGet(path)
    })
    render(<JourneysView />)

    expect(await screen.findByText('Falló la carga de jornadas.')).toBeInTheDocument()
    expect(screen.queryByText('No hay jornadas declaradas para esta fecha.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()
  })

  it('reintenta empleados, sedes, plantillas y jornadas después de un fallo inicial', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    let failFirstEmployeeRequest = true
    apiMocks.get.mockImplementation((path: string) => {
      if (path === '/employees' && failFirstEmployeeRequest) {
        failFirstEmployeeRequest = false
        return Promise.reject(new Error('Falló la carga inicial de empleados.'))
      }
      return previousGet(path)
    })
    render(<JourneysView />)

    expect(await screen.findByText('Falló la carga inicial de empleados.')).toBeInTheDocument()
    const retry = await screen.findByRole('button', { name: 'Reintentar datos de la jornada' })
    await waitFor(() => expect(retry).toBeEnabled())
    fireEvent.click(retry)

    expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()
    for (const path of ['/employees', '/sites', '/templates']) {
      expect(apiMocks.get.mock.calls.filter(([requestedPath]) => requestedPath === path)).toHaveLength(2)
    }
    expect(apiMocks.get.mock.calls.filter(([path]) => String(path).startsWith('/jornadas?'))).toHaveLength(2)
  })

  it('muestra el estado vacío de jornadas solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/jornadas?') ? Promise.resolve([]) : previousGet(path))
    render(<JourneysView />)
    expect(await screen.findByText('No hay jornadas declaradas para esta fecha.')).toBeInTheDocument()
  })

  it('muestra el estado vacío de la bandeja solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox')
      ? Promise.resolve({ items: [], nextCursor: null })
      : previousGet(path))
    render(<AdminInbox />)
    expect(await screen.findByText('No hay desvíos para mostrar.')).toBeInTheDocument()
  })

  it('evita el desplazamiento suave cuando el sistema reduce el movimiento', async () => {
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    const scrollIntoView = vi.fn()
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn().mockReturnValue({ matches: true }) })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    window.history.replaceState({}, '', `${window.location.pathname}?deviation=d-1`)

    try {
      render(<AdminInbox />)
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' }))
    } finally {
      cleanup()
      window.history.replaceState({}, '', previousUrl)
      if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia)
      else Reflect.deleteProperty(window, 'matchMedia')
      if (previousScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScrollIntoView)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  it('muestra la etiqueta de egreso sin marcar para MARCA_FALTANTE', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox')
      ? Promise.resolve({ items: [{ ...deviation, type: 'MARCA_FALTANTE' as const, status: 'MOTIVO_PENDIENTE' as const, pushEligible: false }], nextCursor: null })
      : previous(path))
    render(<AdminInbox />)
    expect(await screen.findByText('Egreso sin marcar')).toBeInTheDocument()
  })

  it('permite corregir una clasificación existente y exige motivo de auditoría', async () => {
    render(<AdminInbox />)
    const correctButton = await screen.findByRole('button', { name: 'Corregir a no justificado' })
    fireEvent.click(correctButton)
    const reason = screen.getByLabelText('Motivo de corrección')
    expect(reason).toBeRequired()
    fireEvent.change(reason, { target: { value: 'Revisión de la evidencia del día.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))
    await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith('/admin/deviations/d-1/classification', {
      classification: 'NO_JUSTIFICADO', correctionReason: 'Revisión de la evidencia del día.'
    }))
    expect(await screen.findByText('Clasificación guardada.')).toBeInTheDocument()
  })

  it('oculta las jornadas de la fecha anterior mientras se carga la fecha nueva', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    let resolveJourneys!: (rows: unknown) => void
    apiMocks.get.mockImplementation((path: string) => path === '/jornadas?from=2026-10-17&to=2026-10-17'
      ? new Promise((resolve) => { resolveJourneys = resolve })
      : previousGet(path))

    render(<JourneysView />)
    expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-17' } })

    expect(await screen.findByText('Actualizando jornadas…')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Lucía Pérez/ })).not.toBeInTheDocument()
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/jornadas?from=2026-10-17&to=2026-10-17'))

    await act(async () => { resolveJourneys([]) })
    expect(await screen.findByText('No hay jornadas declaradas para esta fecha.')).toBeInTheDocument()
  })

  it('ignora el detalle antiguo si llega después de cambiar de fecha y abrir otra jornada', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    const otherEmployee = { ...employee, id: 'e-2', displayName: 'Nicolás Arce' }
    const otherRow = { id: 'j-2', employeeId: 'e-2', siteId: 's-1', localDate: '2026-10-17', state: 'EN_CURSO' as const }
    const otherDetail = { ...jornada, id: 'j-2', employeeId: 'e-2', localDate: '2026-10-17', scheduleSnapshot: { ...jornada.scheduleSnapshot, name: 'Tarde' }, marks: [] }
    let resolveOldDetail!: (response: typeof jornada) => void
    apiMocks.get.mockImplementation((path: string) => {
      if (path === '/employees') return Promise.resolve([employee, otherEmployee])
      if (path === '/jornadas?from=2026-10-17&to=2026-10-17') return Promise.resolve([otherRow])
      if (path === '/jornadas/j-1') return new Promise<typeof jornada>((resolve) => { resolveOldDetail = resolve })
      if (path === '/jornadas/j-2') return Promise.resolve(otherDetail)
      return previousGet(path)
    })
    render(<JourneysView />)

    expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver marcas' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver marcas' })).toBeDisabled())

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-17' } })
    expect(await screen.findByRole('row', { name: /Nicolás Arce/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver marcas' }))
    expect(await screen.findByText('Horario asignado: Tarde · tolerancia 5 min')).toBeInTheDocument()

    await act(async () => { resolveOldDetail({ ...jornada, scheduleSnapshot: { ...jornada.scheduleSnapshot, name: 'Mañana antigua' } }) })
    expect(screen.getByText('Horario asignado: Tarde · tolerancia 5 min')).toBeInTheDocument()
    expect(screen.queryByText(/Horario asignado: Mañana antigua/)).not.toBeInTheDocument()
  })

  it('distingue los días de inicio y cierre de cada bloque horario', async () => {
    render(<TemplatesView />)
    expect((await screen.findAllByLabelText('Empieza el día'))).toHaveLength(2)
    expect(screen.getAllByLabelText('Termina el día')).toHaveLength(2)
  })

  it('registra una marca olvidada y permite corregir una marca con motivo de auditoría', async () => {
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver marcas' }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')

    fireEvent.change(screen.getByLabelText('Tipo de marca olvidada'), { target: { value: 'SALIDA_ALMUERZO' } })
    fireEvent.change(screen.getByLabelText('Hora del evento (Local Centro)'), { target: { value: '2026-10-16T12:30' } })
    fireEvent.change(screen.getByLabelText('Motivo de incorporación'), { target: { value: 'La persona olvidó registrar la salida.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar marca olvidada' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/jornadas/j-1/forgotten-marks', {
      action: 'SALIDA_ALMUERZO', occurredAt: '2026-10-16T15:30:00.000Z', auditReason: 'La persona olvidó registrar la salida.'
    }))

    const markRow = await screen.findByRole('row', { name: /Ingreso/ })
    fireEvent.click(within(markRow).getByRole('button', { name: 'Corregir' }))
    fireEvent.change(screen.getByLabelText('Motivo de corrección de marca'), { target: { value: 'Se verificó la hora con la persona.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección de marca' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/marks/m-1/correction', expect.objectContaining({
      correctedAction: 'INGRESO', correctedOccurredAt: '2026-10-16T12:00:00.000Z', auditReason: 'Se verificó la hora con la persona.'
    })))
  })

  it.each(['2026-03-08T02:30', '2026-11-01T01:30'])('rechaza una hora inexistente o ambigua en la zona de sede: %s', async (localTime) => {
    const originalGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.resolve([{ ...site, timeZone: 'America/New_York' }]) : originalGet(path))
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver marcas' }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
    fireEvent.change(screen.getByLabelText('Tipo de marca olvidada'), { target: { value: 'SALIDA_ALMUERZO' } })
    fireEvent.change(screen.getByLabelText('Hora del evento (Local Centro)'), { target: { value: localTime } })
    fireEvent.change(screen.getByLabelText('Motivo de incorporación'), { target: { value: 'Marca olvidada.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar marca olvidada' }))
    expect(await screen.findByText(/Esa hora no existe en la zona horaria de la sede/)).toBeInTheDocument()
    expect(apiMocks.post).not.toHaveBeenCalled()
  })
})
