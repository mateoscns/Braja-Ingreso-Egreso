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
    expect(await screen.findByText(/Lucía Pérez ·/)).toBeInTheDocument()
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
    expect(await screen.findByText(/Lucía Pérez ·/)).toBeInTheDocument()
  })

  it('mantiene la bandeja si falla la carga de zonas horarias y explica el huso usado', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites'
      ? Promise.reject(new Error('Falló la consulta de sedes.'))
      : previousGet(path))
    render(<AdminInbox />)

    expect(await screen.findByText(/Falló la consulta de sedes\./)).toBeInTheDocument()
    expect(screen.getByText(/Las horas se muestran en la zona horaria de este dispositivo\./)).toBeInTheDocument()
    expect(screen.getByText(/Lucía Pérez ·/)).toBeInTheDocument()
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
    expect(await screen.findByText(/09:00 a 17:00/)).toBeInTheDocument()
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

  it('asocia la etiqueta Empleado con el selector de la jornada', async () => {
    render(<JourneysView />)
    expect(await screen.findByLabelText('Empleado')).toHaveRole('combobox')
  })

  it('mantiene el título de Jornadas cuando se borra la fecha', async () => {
    render(<JourneysView />)
    expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })

    expect(screen.getAllByRole('heading', { name: 'Jornadas' })).toHaveLength(2)
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
    fireEvent.click(screen.getByRole('button', { name: /^Ver marcas/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Ver marcas/ })).toBeDisabled())

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-17' } })
    expect(await screen.findByRole('row', { name: /Nicolás Arce/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Ver marcas/ }))
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
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')

    fireEvent.change(screen.getByLabelText('Tipo de marca olvidada'), { target: { value: 'SALIDA_ALMUERZO' } })
    fireEvent.change(screen.getByLabelText('Hora del evento (Local Centro)'), { target: { value: '2026-10-16T12:30' } })
    fireEvent.change(screen.getByLabelText('Motivo de incorporación'), { target: { value: 'La persona olvidó registrar la salida.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar marca olvidada' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/jornadas/j-1/forgotten-marks', {
      action: 'SALIDA_ALMUERZO', occurredAt: '2026-10-16T15:30:00.000Z', auditReason: 'La persona olvidó registrar la salida.'
    }))

    const markRow = await screen.findByRole('row', { name: /Ingreso/ })
    fireEvent.click(within(markRow).getByRole('button', { name: /^Corregir marca/ }))
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
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
    fireEvent.change(screen.getByLabelText('Tipo de marca olvidada'), { target: { value: 'SALIDA_ALMUERZO' } })
    fireEvent.change(screen.getByLabelText('Hora del evento (Local Centro)'), { target: { value: localTime } })
    fireEvent.change(screen.getByLabelText('Motivo de incorporación'), { target: { value: 'Marca olvidada.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar marca olvidada' }))
    expect(await screen.findByText(/Esa hora no existe en la zona horaria de la sede/)).toBeInTheDocument()
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('muestra "Conexión protegida" solo en un contexto seguro', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    try {
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
      const insecure = render(<AdminApp />)
      expect(screen.queryByText('Conexión protegida')).not.toBeInTheDocument()
      insecure.unmount()
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
      render(<AdminApp />)
      expect(screen.getByText('Conexión protegida')).toBeInTheDocument()
    } finally {
      if (original) Object.defineProperty(window, 'isSecureContext', original)
      else Reflect.deleteProperty(window, 'isSecureContext')
    }
  })

  it('muestra los estados de jornada con nombres legibles y botones con contexto', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/jornadas?') ? Promise.resolve([{ id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'NO_INGRESO' }]) : previousGet(path))
    render(<JourneysView />)
    expect(await screen.findByText('Sin ingreso')).toBeInTheDocument()
    expect(screen.queryByText('NO INGRESO')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver marcas de Lucía Pérez' })).toBeInTheDocument()
  })

  it('da contexto accesible al botón Corregir de cada marca', async () => {
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    expect(await screen.findByRole('button', { name: /^Corregir marca Ingreso de/ })).toBeInTheDocument()
  })

  it('muestra los bloques de plantilla como HH:MM y el cruce de medianoche en palabras', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/templates' ? Promise.resolve([{
      id: 't-2', siteId: 's-1', name: 'Noche', active: true, breakfastLimitMinutes: 15, lunchLimitMinutes: 60,
      blocks: [{ startDayOffset: 0, start: '22:00:00', end: '06:00:00', endDayOffset: 1 }]
    }]) : previousGet(path))
    render(<TemplatesView />)
    expect(await screen.findByText('22:00 a 06:00 (día siguiente)')).toBeInTheDocument()
    expect(screen.queryByText(/D\+1/)).not.toBeInTheDocument()
  })

  it('no consulta la API con la fecha vacía y pide elegir una fecha', async () => {
    render(<JourneysView />)
    await screen.findByRole('row', { name: /Lucía Pérez/ })
    const callsBefore = apiMocks.get.mock.calls.length
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })
    expect((await screen.findAllByText('Elegí una fecha para ver o declarar jornadas.')).length).toBeGreaterThan(0)
    expect(apiMocks.get.mock.calls.length).toBe(callsBefore)
    expect(screen.queryByText(/conexión/i)).not.toBeInTheDocument()
  })

  it('etiqueta con el empleado los controles de edición en línea y el estado Activo', async () => {
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Editar/ }))
    expect(screen.getByRole('textbox', { name: 'Nombre del empleado con DNI 30123456' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Tolerancia en minutos del empleado con DNI 30123456' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Activo (DNI 30123456)' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Local Centro (DNI 30123456)' })).toBeInTheDocument()
  })

  describe('edición de empleados sobre un borrador', () => {
    const second = { id: 'e-2', displayName: 'Mario Gómez', dni: '30999888', siteIds: ['s-1'], toleranceMinutes: 10, active: true }
    beforeEach(() => {
      const previous = apiMocks.get.getMockImplementation()!
      apiMocks.get.mockImplementation((path: string) => path === '/employees' ? Promise.resolve([employee, second]) : previous(path))
    })
    const rowOf = (name: string) => screen.getAllByRole('row').find((row) => row.textContent?.includes(name) || within(row).queryByDisplayValue(name))!

    it('guarda los cambios del borrador con PATCH', async () => {
      apiMocks.patch.mockResolvedValueOnce({ ...employee, displayName: 'Lucía P.', active: false })
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del empleado con DNI 30123456' }), { target: { value: 'Lucía P.' } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Activo (DNI 30123456)' }))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByText('Cambios del empleado guardados.')).toBeInTheDocument()
      expect(apiMocks.patch).toHaveBeenCalledWith('/employees/e-1', { displayName: 'Lucía P.', siteIds: ['s-1'], toleranceMinutes: 5, active: false })
      expect(rowOf('Lucía P.')).toHaveTextContent('Inactivo')
    })

    it('Cancelar descarta el borrador y muestra los valores guardados', async () => {
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Activo (DNI 30123456)' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(rowOf('Lucía Pérez')).toHaveTextContent('Activo')
      expect(rowOf('Lucía Pérez')).not.toHaveTextContent('Inactivo')
      expect(apiMocks.patch).not.toHaveBeenCalled()
    })

    it('cambiar de fila no deja valores sin guardar a la vista como si estuvieran guardados', async () => {
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del empleado con DNI 30123456' }), { target: { value: 'Nombre sin guardar' } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Activo (DNI 30123456)' }))
      fireEvent.click(screen.getByRole('button', { name: 'Editar empleado Mario Gómez' }))

      expect(screen.queryByText('Nombre sin guardar')).not.toBeInTheDocument()
      expect(rowOf('Lucía Pérez')).toHaveTextContent('Activo')
      expect(rowOf('Lucía Pérez')).not.toHaveTextContent('Inactivo')
    })

    it('un guardado fallido mantiene la edición abierta y no altera los valores guardados', async () => {
      apiMocks.patch.mockRejectedValueOnce(new Error('No se pudo guardar.'))
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Activo (DNI 30123456)' }))
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar.')
      expect(screen.getByRole('checkbox', { name: 'Activo (DNI 30123456)' })).not.toBeChecked()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(rowOf('Lucía Pérez')).toHaveTextContent('Activo')
      expect(rowOf('Lucía Pérez')).not.toHaveTextContent('Inactivo')
    })
  })

  it('sin la zona horaria de la sede deshabilita las marcas olvidadas y las correcciones', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.reject(new Error('Servidor no disponible.')) : previous(path))
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')

    expect(screen.getByText('No se pudo cargar la zona horaria de la sede. Reintentá los datos de la jornada antes de incorporar o corregir marcas.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar marca olvidada' })).toBeDisabled()
    expect(screen.getByLabelText(/^Hora del evento/)).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Corregir marca/ })).toBeDisabled()
  })

  it('un error de red en la vista de administración no usa el texto de marca del empleado', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/employees' ? Promise.reject(new Error('No se pudo conectar con el servidor. Revisá tu conexión y reintentá.')) : previousGet(path))
    render(<EmployeesView />)
    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument()
    expect(screen.queryByText(/marca no fue confirmada/)).not.toBeInTheDocument()
  })

  describe('filtros de la bandeja', () => {
    const inboxCalls = () => apiMocks.get.mock.calls.map(([path]) => path as string).filter((path) => path.startsWith('/inbox'))
    const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

    it('envía empleado, sede y fechas al aplicar y vuelve a la consulta sin filtros al limpiar', async () => {
      render(<AdminInbox />)
      await screen.findByText(/Lucía Pérez ·/)
      expect(inboxCalls()).toEqual(['/inbox?limit=50'])

      pick('Empleado', 'e-1'); pick('Sede', 's-1'); pick('Desde', '2026-10-01'); pick('Hasta', '2026-10-10')
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      await waitFor(() => expect(inboxCalls()).toContain('/inbox?limit=50&employeeId=e-1&siteId=s-1&from=2026-10-01&to=2026-10-10'))

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
      await waitFor(() => expect(inboxCalls().at(-1)).toBe('/inbox?limit=50'))
      expect(screen.getByLabelText('Empleado')).toHaveValue('')
      expect(screen.getByLabelText('Desde')).toHaveValue('')
    })

    it('al cambiar los filtros descarta el cursor y la paginación sigue con los filtros nuevos', async () => {
      apiMocks.get.mockImplementation((path: string) => {
        if (path === '/inbox?limit=50') return Promise.resolve({ items: [deviation], nextCursor: 'c1' })
        if (path === '/inbox?limit=50&employeeId=e-1') return Promise.resolve({ items: [deviation], nextCursor: 'c2' })
        if (path.startsWith('/inbox')) return Promise.resolve({ items: [], nextCursor: null })
        if (path === '/sites') return Promise.resolve([site])
        if (path === '/employees') return Promise.resolve([employee])
        throw new Error(`GET inesperado: ${path}`)
      })
      render(<AdminInbox />)
      fireEvent.click(await screen.findByRole('button', { name: 'Cargar anteriores' }))
      await waitFor(() => expect(inboxCalls()).toContain('/inbox?limit=50&cursor=c1'))

      pick('Empleado', 'e-1')
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      await waitFor(() => expect(inboxCalls().at(-1)).toBe('/inbox?limit=50&employeeId=e-1'))
      fireEvent.click(await screen.findByRole('button', { name: 'Cargar anteriores' }))
      await waitFor(() => expect(inboxCalls().at(-1)).toBe('/inbox?limit=50&employeeId=e-1&cursor=c2'))
    })

    it.each([
      ['solo una fecha', { Desde: '2026-10-01' }, 'Completá las dos fechas: desde y hasta.'],
      ['rango invertido', { Desde: '2026-10-10', Hasta: '2026-10-01' }, 'La fecha desde no puede ser posterior a la fecha hasta.'],
      ['rango mayor a 366 días', { Desde: '2025-01-01', Hasta: '2026-10-01' }, 'El rango no puede superar los 366 días.']
    ])('no consulta la API con %s y explica el problema', async (_name, values, message) => {
      render(<AdminInbox />)
      await screen.findByText(/Lucía Pérez ·/)
      Object.entries(values).forEach(([label, value]) => pick(label, value))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(inboxCalls()).toEqual(['/inbox?limit=50'])
    })

    it('muestra un estado vacío claro cuando los filtros no encuentran nada', async () => {
      render(<AdminInbox />)
      await screen.findByText(/Lucía Pérez ·/)
      apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox') ? Promise.resolve({ items: [], nextCursor: null }) : Promise.resolve([]))
      pick('Sede', 's-1')
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      expect(await screen.findByText('Ningún desvío coincide con los filtros aplicados.')).toBeInTheDocument()
    })

    it('mantiene las acciones de clasificación sobre los resultados filtrados', async () => {
      apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox')
        ? Promise.resolve({ items: [{ ...deviation, status: 'PENDIENTE_REVISION' }], nextCursor: null })
        : Promise.resolve(path === '/sites' ? [site] : [employee]))
      render(<AdminInbox />)
      await screen.findByText(/Lucía Pérez ·/)
      pick('Empleado', 'e-1')
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Justificado' }))
      await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith('/admin/deviations/d-1/classification', { classification: 'JUSTIFICADO' }))
    })
  })

  it('muestra la hora del hecho (occurredAt) y no la de detección en la bandeja', async () => {
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox')
      ? Promise.resolve({ items: [{ ...deviation, occurredAt: '2026-10-16T11:15:00Z', createdAt: '2026-10-16T12:00:00Z' }], nextCursor: null })
      : Promise.resolve(path === '/sites' ? [site] : [employee]))
    render(<AdminInbox />)
    const card = (await screen.findByText(/Lucía Pérez ·/)).closest('article')!
    expect(card).toHaveTextContent(/0?8:15/)
    expect(card).not.toHaveTextContent(/0?9:00/)
  })

  describe('cancelar jornadas y anular marcas (D-20261027-07, D-20261027-08)', () => {
    function withDetail(detail: object, rowState = 'NO_INGRESO') {
      const previousGet = apiMocks.get.getMockImplementation()!
      apiMocks.get.mockImplementation((path: string) => {
        if (path === '/jornadas/j-1') return Promise.resolve({ ...jornada, ...detail })
        if (path.startsWith('/jornadas?')) return Promise.resolve([{ id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: rowState }])
        return previousGet(path)
      })
    }

    it('cancela una jornada sin marcas solo con motivo y confirmación', async () => {
      withDetail({ state: 'NO_INGRESO', marks: [] })
      apiMocks.post.mockResolvedValue({ jornadaId: 'j-1', state: 'CANCELADA', cancelledAt: '2026-10-16T13:00:00Z', cancelReason: 'Feriado nacional' })
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar jornada' }))

      const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' })
      expect(confirm).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '  Feriado nacional ' } })
      fireEvent.click(confirm)

      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/jornadas/j-1/cancellation', { reason: 'Feriado nacional' }))
      expect(await screen.findByText('Jornada cancelada.')).toBeInTheDocument()
    })

    it('no ofrece cancelar una jornada que ya tiene marcas', async () => {
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
      expect(screen.queryByRole('button', { name: 'Cancelar jornada' })).not.toBeInTheDocument()
    })

    it('muestra la jornada cancelada con su motivo y sin incorporar marcas', async () => {
      withDetail({ state: 'CANCELADA', marks: [], cancelledAt: '2026-10-16T13:00:00Z', cancelReason: 'Feriado nacional' }, 'CANCELADA')
      render(<JourneysView />)
      expect(await screen.findByText('Cancelada')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /^Ver marcas/ }))
      expect(await screen.findByText(/Jornada cancelada el .* Motivo: Feriado nacional/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Registrar marca olvidada' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancelar jornada' })).not.toBeInTheDocument()
    })

    it('anula una marca solo con motivo y confirmación', async () => {
      apiMocks.post.mockResolvedValue({ ...jornada.marks[0], voided: true, voidReason: 'Tocó por error.' })
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Ingreso/ })
      fireEvent.click(within(markRow).getByRole('button', { name: /^Anular marca Ingreso de/ }))

      const confirm = screen.getByRole('button', { name: 'Confirmar anulación' })
      expect(confirm).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Tocó por error.' } })
      fireEvent.click(confirm)

      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/marks/m-1/void', { reason: 'Tocó por error.' }))
      expect(await screen.findByText('Marca anulada.')).toBeInTheDocument()
    })

    it('muestra una marca anulada como Anulada, con su motivo y sin acciones', async () => {
      withDetail({ marks: [{ ...jornada.marks[0], voided: true, voidedAt: '2026-10-16T13:00:00Z', voidReason: 'Tocó por error.' }] })
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Ingreso/ })
      expect(markRow).toHaveTextContent('Anulada')
      expect(markRow).toHaveTextContent('Tocó por error.')
      expect(within(markRow).queryByRole('button')).not.toBeInTheDocument()
    })
  })

  it('saluda con el nombre de la sesión y cae al DNI cuando no hay nombre', () => {
    const original = adminSessionMocks.session
    adminSessionMocks.session = { ...original, displayName: 'Mateo Scienza' } as typeof original
    const view = render(<AdminApp />)
    expect(screen.getByText('Mateo Scienza')).toBeInTheDocument()
    expect(screen.queryByText('DNI 30123456')).not.toBeInTheDocument()
    view.unmount()
    adminSessionMocks.session = original
    render(<AdminApp />)
    expect(screen.getByText('DNI 30123456')).toBeInTheDocument()
  })
})
