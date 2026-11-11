import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'
import { AdminInbox, EmployeesView, JourneysView, SitesView, TemplatesView } from './AdminViews'
import { formatDateTime, formatLocalDate, jornadaStateLabel as formatJornadaState } from '../../shared/format'

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
const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6037, longitude: -58.3816, geofenceRadiusMeters: 100 }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const jornada = {
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EN_CURSO' as const,
  scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks: [{ startDayOffset: 0 as const, start: '09:00', end: '17:00', endDayOffset: 0 as const }], breakfastLimitMinutes: 15, lunchLimitMinutes: 60 },
  toleranceMinutes: 5, sequence: 1,
  marks: [{ id: 'm-1', jornadaId: 'j-1', action: 'INGRESO' as const, sequence: 1, acceptedAt: '2026-10-16T12:00:00Z', locationStatus: 'SIN_UBICACION' as const }]
}
const assignment = { id: 'a-1', employeeId: 'e-1', siteId: 's-1', templateId: 't-1', templateName: 'Mañana', validFrom: '2026-11-01', createdAt: '2026-10-27T12:00:00Z' }

// A wide screen unless a test says otherwise: records are tables from 768 px (app/useBreakpoint.ts). The shared stub of
// src/test/setup.ts answers no query, which is now a phone.
const wideScreen = (query: string) => ({ matches: query === '(min-width: 768px)', media: query, addEventListener: () => undefined, removeEventListener: () => undefined })
let sharedMatchMedia: PropertyDescriptor | undefined

beforeEach(() => {
  vi.clearAllMocks()
  sharedMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: wideScreen })
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
    if (path === '/employees/e-1/template-assignments') return Promise.resolve([assignment])
    throw new Error(`GET inesperado: ${path}`)
  })
  apiMocks.post.mockResolvedValue({ ...jornada.marks[0], id: 'm-2', action: 'SALIDA_ALMUERZO', occurredAt: '2026-10-16T15:30:00Z' })
  apiMocks.put.mockResolvedValue({ ...deviation, status: 'NO_JUSTIFICADO' })
})

afterEach(() => {
  cleanup()
  if (sharedMatchMedia) Object.defineProperty(window, 'matchMedia', sharedMatchMedia)
})

describe('administración de desvíos y marcas', () => {
  it('anuncia la sección seleccionada y no muestra un indicador de bandeja permanente', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    // Days loaded from tomorrow on: every setup step is done, so the app starts on Bandeja.
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/jornadas?') && path.includes('siteId=')
      ? Promise.resolve([{ id: 'j-9', employeeId: 'e-1', siteId: 's-1', localDate: new URLSearchParams(path.split('?')[1]).get('from'), state: 'NO_INGRESO' }])
      : previousGet(path))
    const { container } = render(<AdminApp />)
    const inbox = screen.getByRole('button', { name: 'Para revisar' })
    await waitFor(() => expect(inbox).toHaveAttribute('aria-current', 'page'))
    expect(container.querySelector('.nav-dot')).not.toBeInTheDocument()

    const employees = screen.getByRole('button', { name: 'Equipo' })
    fireEvent.click(employees)
    expect(employees).toHaveAttribute('aria-current', 'page')
    expect(inbox).not.toHaveAttribute('aria-current')
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
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
    expect(screen.queryByText('No hay casos para mostrar.')).not.toBeInTheDocument()
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
    expect(screen.queryByText('No hay casos para mostrar.')).not.toBeInTheDocument()
  })

  it('distingue un fallo de carga de la lista vacía de sedes y permite reintentar', async () => {
    apiMocks.get.mockImplementationOnce(() => Promise.reject(new Error('Falló la carga de sedes.')))
    render(<SitesView />)

    expect(await screen.findByText('Falló la carga de sedes.')).toBeInTheDocument()
    expect(screen.queryByText('Todavía no hay locales.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Local Centro')).toBeInTheDocument()
  })

  it('muestra el estado vacío de sedes solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.resolve([]) : previousGet(path))
    render(<SitesView />)
    expect(await screen.findByText('Todavía no hay locales.')).toBeInTheDocument()
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

  it('distingue un fallo de carga de la lista vacía de horarios y permite reintentar', async () => {
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
    expect(screen.queryByText('Este local todavía no tiene horarios. Creá el primero.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('list', { name: 'Horario Mañana' })).toHaveTextContent('09:00–17:00')
  })

  it('muestra el estado vacío de horarios solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/templates' ? Promise.resolve([]) : previousGet(path))
    render(<TemplatesView />)
    expect(await screen.findByText('Este local todavía no tiene horarios. Creá el primero.')).toBeInTheDocument()
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
    expect(screen.queryByText('No hay días cargados para esta fecha.')).not.toBeInTheDocument()
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
    const retry = await screen.findByRole('button', { name: 'Reintentar datos del día' })
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
    expect(await screen.findByText('No hay días cargados para esta fecha.')).toBeInTheDocument()
  })

  it('asocia la etiqueta Empleado con el selector de la jornada', async () => {
    render(<JourneysView />)
    expect(await screen.findByLabelText('Empleado')).toHaveRole('combobox')
  })

  it('mantiene el título de Jornadas cuando se borra la fecha', async () => {
    render(<JourneysView />)
    expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })

    expect(screen.getAllByRole('heading', { name: 'Días de trabajo' })).toHaveLength(2)
  })

  it('muestra el estado vacío de la bandeja solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox')
      ? Promise.resolve({ items: [], nextCursor: null })
      : previousGet(path))
    render(<AdminInbox />)
    expect(await screen.findByText('No hay casos para mostrar.')).toBeInTheDocument()
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
    expect(await screen.findByText('No marcó la salida')).toBeInTheDocument()
  })

  it('identifica la marca que originó un FUERA_DE_SEDE en la bandeja', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox')
      ? Promise.resolve({ items: [{ ...deviation, type: 'FUERA_DE_SEDE' as const, sourceMarkId: 'm-2', sourceMarkAction: 'SALIDA_ALMUERZO' as const, sourceMarkSequence: 2, pushEligible: false }], nextCursor: null })
      : previous(path))
    render(<AdminInbox />)
    expect(await screen.findByText('Fuera del local')).toBeInTheDocument()
    expect(screen.getByText('Marca: Salida a almorzar')).toBeInTheDocument()
    expect(screen.queryByText(/secuencia/)).not.toBeInTheDocument()
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

    expect(await screen.findByText('Actualizando días…')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Lucía Pérez/ })).not.toBeInTheDocument()
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/jornadas?from=2026-10-17&to=2026-10-17'))

    await act(async () => { resolveJourneys([]) })
    expect(await screen.findByText('No hay días cargados para esta fecha.')).toBeInTheDocument()
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

  it('no muestra los días de cada tramo: se calculan solos (issue #103)', async () => {
    render(<TemplatesView />)
    expect(await screen.findByLabelText('Entra a las')).toBeInTheDocument()
    expect(screen.queryByLabelText(/el día$/)).not.toBeInTheDocument()
  })

  it('registra una marca olvidada y permite corregir una marca con motivo de auditoría', async () => {
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')

    fireEvent.change(screen.getByLabelText('¿Qué marca faltó?'), { target: { value: 'SALIDA_ALMUERZO' } })
    fireEvent.change(screen.getByLabelText('Hora (Local Centro)'), { target: { value: '2026-10-16T12:30' } })
    fireEvent.change(screen.getByLabelText('¿Por qué la agregás?'), { target: { value: 'La persona olvidó registrar la salida.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar marca' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/jornadas/j-1/forgotten-marks', {
      action: 'SALIDA_ALMUERZO', occurredAt: '2026-10-16T15:30:00.000Z', auditReason: 'La persona olvidó registrar la salida.'
    }))

    const markRow = await screen.findByRole('row', { name: /Entrada/ })
    fireEvent.click(within(markRow).getByRole('button', { name: /^Corregir marca/ }))
    fireEvent.change(screen.getByLabelText('Motivo de corrección de marca'), { target: { value: 'Se verificó la hora con la persona.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección de marca' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/marks/m-1/correction', expect.objectContaining({
      correctedAction: 'INGRESO', correctedOccurredAt: '2026-10-16T12:00:00.000Z', auditReason: 'Se verificó la hora con la persona.'
    })))
  })

  describe('marcas que no encajan con la jornada en los formularios de ADMIN', () => {
    const staleEmployeeText = /El estado del día de trabajo cambió y esa marca ya no corresponde/
    const adminText = 'La hora o la acción no encajan con las demás marcas del día. Revisá el orden.'
    const rejection = (code: string) => Object.assign(new Error('El estado del día de trabajo cambió y esa marca ya no corresponde. Revisá el estado actualizado.'), { status: 409, code })

    it.each(['INVALID_MARK_ORDER', 'INVALID_MARK_HISTORY', 'INVALID_MARK_TRANSITION'])('una marca olvidada rechazada con %s explica el orden al ADMIN', async (code) => {
      apiMocks.post.mockRejectedValueOnce(rejection(code))
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
      fireEvent.change(screen.getByLabelText('Hora (Local Centro)'), { target: { value: '2026-10-16T08:30' } })
      fireEvent.change(screen.getByLabelText('¿Por qué la agregás?'), { target: { value: 'Olvidó marcar.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar marca' }))

      expect(await screen.findByText(adminText)).toBeInTheDocument()
      expect(screen.queryByText(staleEmployeeText)).not.toBeInTheDocument()
    })

    it.each(['INVALID_MARK_ORDER', 'INVALID_MARK_HISTORY', 'INVALID_MARK_TRANSITION'])('una corrección rechazada con %s explica el orden al ADMIN', async (code) => {
      apiMocks.post.mockRejectedValueOnce(rejection(code))
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Entrada/ })
      fireEvent.click(within(markRow).getByRole('button', { name: /^Corregir marca/ }))
      fireEvent.change(screen.getByLabelText('Motivo de corrección de marca'), { target: { value: 'Se verificó la hora.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección de marca' }))

      expect(await screen.findByText(adminText)).toBeInTheDocument()
      expect(screen.queryByText(staleEmployeeText)).not.toBeInTheDocument()
    })

    it('otros rechazos de esos formularios conservan el mensaje del servidor', async () => {
      apiMocks.post.mockRejectedValueOnce(Object.assign(new Error('Esa marca ya fue anulada y no se puede modificar.'), { status: 409, code: 'MARK_VOIDED' }))
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Entrada/ })
      fireEvent.click(within(markRow).getByRole('button', { name: /^Corregir marca/ }))
      fireEvent.change(screen.getByLabelText('Motivo de corrección de marca'), { target: { value: 'Se verificó la hora.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección de marca' }))

      expect(await screen.findByText('Esa marca ya fue anulada y no se puede modificar.')).toBeInTheDocument()
    })
  })

  it.each(['2026-03-08T02:30', '2026-11-01T01:30'])('rechaza una hora inexistente o ambigua en la zona de sede: %s', async (localTime) => {
    const originalGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.resolve([{ ...site, timeZone: 'America/New_York' }]) : originalGet(path))
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
    fireEvent.change(screen.getByLabelText('¿Qué marca faltó?'), { target: { value: 'SALIDA_ALMUERZO' } })
    fireEvent.change(screen.getByLabelText('Hora (Local Centro)'), { target: { value: localTime } })
    fireEvent.change(screen.getByLabelText('¿Por qué la agregás?'), { target: { value: 'Marca olvidada.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar marca' }))
    expect(await screen.findByText(/Esa hora no existe en la zona horaria del local/)).toBeInTheDocument()
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

  it('los campos de hora del detalle no piden segundos', async () => {
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
    expect(screen.getByRole('heading', { name: 'Agregar una marca que faltó' })).toBeInTheDocument()
    expect(screen.getByLabelText('Hora (Local Centro)')).not.toHaveAttribute('step')
    fireEvent.click(screen.getByRole('button', { name: /^Corregir marca Entrada/ }))
    const corrected = screen.getByLabelText('Hora corregida (Local Centro)')
    expect(corrected).not.toHaveAttribute('step')
    expect(corrected).toHaveValue('2026-10-16T09:00')
  })

  it('en un teléfono muestra las marcas como tarjetas y el formulario dentro de la marca que cambia', async () => {
    const previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({ matches: query.startsWith('(max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
    try {
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const marks = await screen.findByRole('list', { name: 'Marcas del día' })
      expect(screen.queryByRole('columnheader', { name: 'Ubicación' })).not.toBeInTheDocument()
      const [card] = within(marks).getAllByRole('listitem')
      expect(card).toHaveTextContent('Entrada')
      expect(card).toHaveTextContent('Sin ubicación')
      fireEvent.click(within(card).getByRole('button', { name: /^Anular marca Entrada/ }))
      const form = screen.getByRole('form', { name: /^Anular la marca Entrada/ })
      // D-20261111-02: the form opens inside the mark it changes (until N2 it opened under the whole list).
      expect(card).toContainElement(form)
      expect(within(form).getByLabelText('Motivo de anulación')).toBeRequired()
    } finally {
      if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia)
      else Reflect.deleteProperty(window, 'matchMedia')
    }
  })

  // 2026-11-09 (integrated check of PR #107): at 360 px the day list was a table to swipe sideways for "Ver marcas", and the
  // five inbox filters pushed the first case down to about 1040 px.
  describe('en un teléfono', () => {
    let previousMatchMedia: PropertyDescriptor | undefined
    beforeEach(() => {
      previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({ matches: query.startsWith('(max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
    })
    afterEach(() => {
      if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia)
      else Reflect.deleteProperty(window, 'matchMedia')
    })

    it('muestra los días cargados como tarjetas, con "Ver marcas" a la vista', async () => {
      render(<JourneysView />)
      const card = await screen.findByRole('article', { name: 'Lucía Pérez' })
      expect(screen.queryByRole('columnheader', { name: 'Empleado' })).not.toBeInTheDocument()
      expect(card).toHaveTextContent('Local Centro')
      expect(card).toHaveTextContent(formatJornadaState('EN_CURSO'))
      fireEvent.click(within(card).getByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
      expect(await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')).toBeInTheDocument()
    })

    it('pliega los filtros de la bandeja y resume en una línea los que están aplicados', async () => {
      render(<AdminInbox />)
      await screen.findByText(/Lucía Pérez ·/)
      const fold = screen.getByText('Filtros: todos').closest('details')!
      expect(fold).not.toHaveAttribute('open')
      const form = screen.getByRole('form', { name: 'Filtros de los casos', hidden: true })
      expect(fold).toContainElement(form)

      await waitFor(() => expect(within(form).getAllByRole('option', { name: 'Lucía Pérez', hidden: true })).toHaveLength(1))
      fireEvent.change(within(form).getByLabelText('Empleado'), { target: { value: 'e-1' } })
      fireEvent.change(within(form).getByLabelText('Local'), { target: { value: 's-1' } })
      fireEvent.click(within(form).getByRole('button', { name: 'Aplicar', hidden: true }))
      expect(await screen.findByText('Filtros: Lucía Pérez · Local Centro')).toBeInTheDocument()
    })

    it('en la pantalla ancha los filtros siguen abiertos, sin pliegue', async () => {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({ matches: query === '(min-width: 768px)', addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
      render(<AdminInbox />)
      await screen.findByText(/Lucía Pérez ·/)
      expect(screen.getByRole('form', { name: 'Filtros de los casos' }).closest('details')).toBeNull()
      expect(screen.queryByText(/^Filtros:/)).not.toBeInTheDocument()
    })
  })

  it('da contexto accesible al botón Corregir de cada marca', async () => {
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    expect(await screen.findByRole('button', { name: /^Corregir marca Entrada de/ })).toBeInTheDocument()
  })

  it('muestra los tramos del horario como HH:MM y el cruce de medianoche en palabras', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/templates' ? Promise.resolve([{
      id: 't-2', siteId: 's-1', name: 'Noche', active: true, breakfastLimitMinutes: 15, lunchLimitMinutes: 60,
      blocks: [{ startDayOffset: 0, start: '22:00:00', end: '06:00:00', endDayOffset: 1 }]
    }]) : previousGet(path))
    render(<TemplatesView />)
    expect(await screen.findByText('22:00–06:00 (sale al día siguiente)')).toBeInTheDocument()
    expect(screen.queryByText(/D\+1/)).not.toBeInTheDocument()
  })

  it('no consulta la API con la fecha vacía y pide elegir una fecha', async () => {
    render(<JourneysView />)
    await screen.findByRole('row', { name: /Lucía Pérez/ })
    const callsBefore = apiMocks.get.mock.calls.length
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })
    expect((await screen.findAllByText('Elegí una fecha para ver los días cargados.')).length).toBeGreaterThan(0)
    expect(apiMocks.get.mock.calls.length).toBe(callsBefore)
    expect(screen.queryByText(/conexión/i)).not.toBeInTheDocument()
  })

  it('etiqueta con el empleado los controles de edición en línea y el estado Activo', async () => {
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Editar/ }))
    expect(screen.getByRole('textbox', { name: 'Nombre del empleado con DNI 30123456' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Minutos de tolerancia del empleado con DNI 30123456' })).toBeInTheDocument()
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

  describe('temporary password of a new employee (12 characters to 72 UTF-8 bytes)', () => {
    async function fillNewEmployee(password: string) {
      render(<EmployeesView />)
      fireEvent.change(await screen.findByLabelText('Nombre y apellido'), { target: { value: 'Ana Ñandú' } })
      fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
      await waitFor(async () => expect(await screen.findByRole('checkbox', { name: 'Local Centro' })).toBeChecked())
      fireEvent.change(screen.getByLabelText(/Contraseña provisoria/), { target: { value: password } })
      fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))
    }

    it('does not call the API with a 73-byte password that fits in 72 characters and explains the limit', async () => {
      await fillNewEmployee(`ñ${'a'.repeat(71)}`)
      expect(await screen.findByText('La contraseña es demasiado larga: puede tener hasta 72 caracteres, y las letras con tilde y la ñ cuentan como 2.')).toBeInTheDocument()
      expect(apiMocks.post).not.toHaveBeenCalled()
    })

    it('sends a 72-byte password', async () => {
      apiMocks.post.mockResolvedValueOnce({ id: 'e-9', displayName: 'Ana Ñandú', dni: '30111222', siteIds: ['s-1'], toleranceMinutes: 5, active: true })
      await fillNewEmployee('ñ'.repeat(36))
      expect(await screen.findByText('Empleado creado.')).toBeInTheDocument()
      expect(apiMocks.post).toHaveBeenCalledWith('/employees', expect.objectContaining({ temporaryPassword: 'ñ'.repeat(36) }))
    })

    it('limits the field to 72 characters and states the limit in its hint', async () => {
      render(<EmployeesView />)
      const field = await screen.findByLabelText(/Contraseña provisoria/)
      expect(field).toHaveAttribute('maxlength', '72')
      expect(field).toHaveAccessibleDescription(/De 12 a 72 caracteres/)
    })
  })

  describe('restablecer la contraseña de un empleado', () => {
    const TEMPORARY = 'Abcd-Efgh-Jkmn-Pqrs'
    const resetButton = () => screen.findByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' })

    it('pide confirmación, muestra la provisoria una sola vez y la borra al cerrar el aviso', async () => {
      const storageWrites = vi.spyOn(Storage.prototype, 'setItem')
      apiMocks.post.mockResolvedValueOnce({ temporaryPassword: TEMPORARY })
      render(<EmployeesView />)
      fireEvent.click(await resetButton())
      expect(apiMocks.post).not.toHaveBeenCalled()
      expect(screen.getByText(/Se cierran todas sus sesiones/)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))
      expect(await screen.findByText(TEMPORARY)).toBeInTheDocument()
      expect(apiMocks.post).toHaveBeenCalledWith('/employees/e-1/password-reset')
      expect(screen.getByText('Entregásela en persona; se pide cambiarla al ingresar.')).toBeInTheDocument()
      expect(storageWrites).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Listo, ya la entregué' }))
      expect(screen.queryByText(TEMPORARY)).not.toBeInTheDocument()
      storageWrites.mockRestore()
    })

    it('cancelar la confirmación no llama a la API', async () => {
      render(<EmployeesView />)
      fireEvent.click(await resetButton())
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar restablecimiento' }))
      expect(screen.queryByRole('button', { name: 'Confirmar restablecimiento' })).not.toBeInTheDocument()
      expect(apiMocks.post).not.toHaveBeenCalled()
    })

    it('un rechazo muestra el mensaje del servidor y ninguna contraseña', async () => {
      apiMocks.post.mockRejectedValueOnce(new Error('Esta persona también tiene acceso en otra empresa o como ADMIN; su contraseña la restablece el operador.'))
      render(<EmployeesView />)
      fireEvent.click(await resetButton())
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('su contraseña la restablece el operador')
      expect(screen.queryByText('Listo, ya la entregué')).not.toBeInTheDocument()
    })

    it('la provisoria no sobrevive a salir de la vista', async () => {
      apiMocks.post.mockResolvedValueOnce({ temporaryPassword: TEMPORARY })
      const { unmount } = render(<EmployeesView />)
      fireEvent.click(await resetButton())
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))
      await screen.findByText(TEMPORARY)
      unmount()
      render(<EmployeesView />)
      await resetButton()
      expect(screen.queryByText(TEMPORARY)).not.toBeInTheDocument()
    })

    it('un empleado inactivo no ofrece restablecer', async () => {
      const previous = apiMocks.get.getMockImplementation()!
      apiMocks.get.mockImplementation((path: string) => path === '/employees' ? Promise.resolve([{ ...employee, active: false }]) : previous(path))
      render(<EmployeesView />)
      expect(await resetButton()).toBeDisabled()
    })
  })

  it('sin la zona horaria de la sede deshabilita las marcas olvidadas y las correcciones', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.reject(new Error('Servidor no disponible.')) : previous(path))
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')

    expect(screen.getByText('No se pudo cargar la zona horaria del local. Reintentá los datos del día antes de incorporar o corregir marcas.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar marca' })).toBeDisabled()
    expect(screen.getByLabelText(/^Hora \(/)).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Corregir marca/ })).toBeDisabled()
  })

  it('un error de red en la vista de administración no usa el texto de marca del empleado', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/employees' ? Promise.reject(new Error('No se pudo conectar. Revisá tu conexión a internet y reintentá.')) : previousGet(path))
    render(<EmployeesView />)
    expect(await screen.findByText(/No se pudo conectar. Revisá tu conexión/)).toBeInTheDocument()
    expect(screen.queryByText(/marca no fue confirmada/)).not.toBeInTheDocument()
  })

  describe('filtros de la bandeja', () => {
    const inboxCalls = () => apiMocks.get.mock.calls.map(([path]) => path as string).filter((path) => path.startsWith('/inbox'))
    const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

    it('envía empleado, sede y fechas al aplicar y vuelve a la consulta sin filtros al limpiar', async () => {
      render(<AdminInbox />)
      await screen.findByText(/Lucía Pérez ·/)
      expect(inboxCalls()).toEqual(['/inbox?limit=50'])

      pick('Empleado', 'e-1'); pick('Local', 's-1'); pick('Desde', '2026-10-01'); pick('Hasta', '2026-10-10')
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
      pick('Local', 's-1')
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      expect(await screen.findByText('Ningún caso coincide con los filtros aplicados.')).toBeInTheDocument()
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
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar el día' }))

      const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' })
      expect(confirm).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '  Feriado nacional ' } })
      fireEvent.click(confirm)

      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/jornadas/j-1/cancellation', { reason: 'Feriado nacional' }))
      expect(await screen.findByText('Día cancelado.')).toBeInTheDocument()
    })

    it('los motivos de cancelación y de anulación piden no escribir datos de salud (L30)', async () => {
      const healthHint = 'No escribas datos de salud; alcanza con «Licencia».'
      withDetail({ state: 'NO_INGRESO', marks: [] })
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar el día' }))
      expect(screen.getByRole('textbox', { name: 'Motivo de cancelación' })).toHaveAccessibleDescription(expect.stringContaining(healthHint))
      cleanup()

      withDetail({})
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Entrada/ })
      fireEvent.click(within(markRow).getByRole('button', { name: /^Anular marca Entrada de/ }))
      expect(screen.getByRole('textbox', { name: 'Motivo de anulación' })).toHaveAccessibleDescription(expect.stringContaining(healthHint))
    })

    it('no ofrece cancelar una jornada que ya tiene marcas', async () => {
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
      expect(screen.queryByRole('button', { name: 'Cancelar el día' })).not.toBeInTheDocument()
    })

    it('muestra la jornada cancelada con su motivo y sin incorporar marcas', async () => {
      withDetail({ state: 'CANCELADA', marks: [], cancelledAt: '2026-10-16T13:00:00Z', cancelReason: 'Feriado nacional' }, 'CANCELADA')
      render(<JourneysView />)
      expect(await screen.findByText('Cancelada')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /^Ver marcas/ }))
      expect(await screen.findByText(/Día cancelado el .* Motivo: Feriado nacional/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Agregar marca' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancelar el día' })).not.toBeInTheDocument()
    })

    it('anula una marca solo con motivo y confirmación', async () => {
      apiMocks.post.mockResolvedValue({ ...jornada.marks[0], voided: true, voidReason: 'Tocó por error.' })
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Entrada/ })
      fireEvent.click(within(markRow).getByRole('button', { name: /^Anular marca Entrada de/ }))

      const confirm = screen.getByRole('button', { name: 'Confirmar anulación' })
      expect(confirm).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Tocó por error.' } })
      fireEvent.click(confirm)

      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/admin/marks/m-1/void', { reason: 'Tocó por error.' }))
      expect(await screen.findByText('Marca anulada.')).toBeInTheDocument()
    })

    it('un reintento de anulación ya aplicada se muestra como hecho y recarga el detalle', async () => {
      apiMocks.post.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409, code: 'MARK_VOIDED' }))
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Entrada/ })
      fireEvent.click(within(markRow).getByRole('button', { name: /^Anular marca Entrada de/ }))
      fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Tocó por error.' } })
      const detailCalls = apiMocks.get.mock.calls.filter(([path]) => path === '/jornadas/j-1').length
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

      expect(await screen.findByText('La marca ya estaba anulada.')).toBeInTheDocument()
      await waitFor(() => expect(apiMocks.get.mock.calls.filter(([path]) => path === '/jornadas/j-1').length).toBeGreaterThan(detailCalls))
    })

    it('un reintento de cancelación ya aplicada se muestra como hecho', async () => {
      withDetail({ state: 'NO_INGRESO', marks: [] })
      apiMocks.post.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409, code: 'JORNADA_CANCELLED' }))
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar el día' }))
      fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: 'Feriado' } })
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))

      expect(await screen.findByText('El día ya estaba cancelado.')).toBeInTheDocument()
    })

    it('muestra una marca anulada como Anulada, con su motivo y sin acciones', async () => {
      withDetail({ marks: [{ ...jornada.marks[0], voided: true, voidedAt: '2026-10-16T13:00:00Z', voidReason: 'Tocó por error.' }] })
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      const markRow = await screen.findByRole('row', { name: /Entrada/ })
      expect(markRow).toHaveTextContent('Anulada')
      expect(markRow).toHaveTextContent('Tocó por error.')
      expect(within(markRow).queryByRole('button')).not.toBeInTheDocument()
    })
  })

  // D-20261111-02, step 1 (findings P-01, F-03): the list of the date came under two load forms, «Ver marcas» opened the day
  // under the whole list without scrolling to it, and «Corregir» and «Anular» opened their forms under the whole list of marks.
  describe('el día se abre en su fila y cada formulario debajo de lo que cambia (D-20261111-02)', () => {
    const openDay = async () => {
      const button = await screen.findByRole('button', { name: 'Ver marcas de Lucía Pérez' })
      fireEvent.click(button)
      await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
      // The day is open once focus reached its heading, as a person sees it. Clicking on before that let the pending focus
      // of the day land after the next form's (2026-11-11: failed now and then under the load of the whole suite).
      await waitFor(() => expect(screen.getByRole('heading', { name: /^Marcas de / })).toHaveFocus())
      return button
    }
    // The row of the mark itself: a form opened under it starts with its own name, not with the name of the mark.
    const markRow = () => screen.getByRole('row', { name: /^Entrada/ })
    const correctButton = () => within(markRow()).getByRole('button', { name: /^Corregir marca Entrada/ })
    const voidButton = () => within(markRow()).getByRole('button', { name: /^Anular marca Entrada/ })
    function withDayDetail(detail: object) {
      const previousGet = apiMocks.get.getMockImplementation()!
      apiMocks.get.mockImplementation((path: string) => path === '/jornadas/j-1' ? Promise.resolve({ ...jornada, ...detail }) : previousGet(path))
    }

    it('la lista del día va antes que la carga de días', async () => {
      render(<JourneysView />)
      const list = await screen.findByRole('region', { name: /^Días de trabajo del/ })
      expect(list.compareDocumentPosition(screen.getByRole('region', { name: 'Cargar días de trabajo' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(list.compareDocumentPosition(screen.getByRole('region', { name: 'Cargar o cambiar un solo día' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('«Ver marcas» abre el día en la fila de abajo de la suya y lleva el foco a su título', async () => {
      render(<JourneysView />)
      const button = await openDay()
      const detailRow = button.closest('tr')!.nextElementSibling
      expect(detailRow).not.toBeNull()
      expect(detailRow).toContainElement(screen.getByRole('region', { name: 'Marcas de Lucía Pérez' }))
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Marcas de Lucía Pérez' })).toHaveFocus())
    })

    it('«Corregir» abre el formulario debajo de su marca con el foco en el primer campo, y «Cancelar» devuelve el foco al botón', async () => {
      render(<JourneysView />)
      await openDay()
      fireEvent.click(correctButton())
      const form = screen.getByRole('form', { name: /^Corregir la marca Entrada/ })
      expect(markRow().nextElementSibling).toContainElement(form)
      await waitFor(() => expect(within(form).getByLabelText('Tipo de marca corregida')).toHaveFocus())

      fireEvent.click(within(form).getByRole('button', { name: 'Cancelar' }))
      expect(form).not.toBeInTheDocument()
      await waitFor(() => expect(correctButton()).toHaveFocus())
    })

    it('«Anular» abre el formulario debajo de su marca con el foco en el motivo, y «Volver» devuelve el foco al botón', async () => {
      render(<JourneysView />)
      await openDay()
      fireEvent.click(voidButton())
      const form = screen.getByRole('form', { name: /^Anular la marca Entrada/ })
      expect(markRow().nextElementSibling).toContainElement(form)
      await waitFor(() => expect(within(form).getByLabelText('Motivo de anulación')).toHaveFocus())

      fireEvent.click(within(form).getByRole('button', { name: 'Volver' }))
      expect(form).not.toBeInTheDocument()
      await waitFor(() => expect(voidButton()).toHaveFocus())
    })

    it('una corrección guardada cierra el formulario, avisa al lado de la marca y devuelve el foco a «Corregir»', async () => {
      render(<JourneysView />)
      await openDay()
      fireEvent.click(correctButton())
      const form = screen.getByRole('form', { name: /^Corregir la marca Entrada/ })
      fireEvent.change(within(form).getByLabelText('Motivo de corrección de marca'), { target: { value: 'Se verificó la hora.' } })
      fireEvent.click(within(form).getByRole('button', { name: 'Guardar corrección de marca' }))

      const notice = await screen.findByText('Marca corregida.')
      expect(markRow().nextElementSibling).toContainElement(notice)
      await waitFor(() => expect(correctButton()).toHaveFocus())
    })

    // Each rejection is queued right before its submit, so a failing step never leaves it to another test.
    it('una corrección rechazada muestra su error dentro del formulario', async () => {
      render(<JourneysView />)
      await openDay()
      fireEvent.click(correctButton())
      const form = screen.getByRole('form', { name: /^Corregir la marca Entrada/ })
      fireEvent.change(within(form).getByLabelText('Motivo de corrección de marca'), { target: { value: 'Se verificó la hora.' } })
      apiMocks.post.mockRejectedValueOnce(Object.assign(new Error('Esa marca ya fue anulada y no se puede modificar.'), { status: 409, code: 'MARK_VOIDED' }))
      fireEvent.click(within(form).getByRole('button', { name: 'Guardar corrección de marca' }))

      expect(await within(form).findByRole('alert')).toHaveTextContent('Esa marca ya fue anulada y no se puede modificar.')
    })

    it('una anulación guardada avisa al lado de la marca anulada y lleva el foco al título del día', async () => {
      withDayDetail({})
      render(<JourneysView />)
      await openDay()
      // From now on the day comes back with the mark voided, as the server answers after the void.
      withDayDetail({ marks: [{ ...jornada.marks[0], voided: true, voidedAt: '2026-10-16T13:00:00Z', voidReason: 'Tocó por error.' }] })
      fireEvent.click(voidButton())
      const form = screen.getByRole('form', { name: /^Anular la marca Entrada/ })
      fireEvent.change(within(form).getByLabelText('Motivo de anulación'), { target: { value: 'Tocó por error.' } })
      fireEvent.click(within(form).getByRole('button', { name: 'Confirmar anulación' }))

      const notice = await screen.findByText('Marca anulada.')
      expect(markRow().nextElementSibling).toContainElement(notice)
      // The button that opened the form left with the mark: the title of the day takes the focus.
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Marcas de Lucía Pérez' })).toHaveFocus())
    })

    it('agregar una marca que faltó muestra su error y su resultado dentro de su formulario', async () => {
      render(<JourneysView />)
      await openDay()
      // Found by its heading: the button reads «Guardando…» while the request runs.
      const form = () => screen.getByRole('heading', { name: 'Agregar una marca que faltó' }).closest('form')!
      fireEvent.change(within(form()).getByLabelText('Hora (Local Centro)'), { target: { value: '2026-10-16T08:30' } })
      fireEvent.change(within(form()).getByLabelText('¿Por qué la agregás?'), { target: { value: 'Olvidó marcar.' } })
      apiMocks.post.mockRejectedValueOnce(Object.assign(new Error('rechazada'), { status: 409, code: 'INVALID_MARK_ORDER' }))
      fireEvent.click(within(form()).getByRole('button', { name: 'Agregar marca' }))
      expect(await within(form()).findByRole('alert')).toHaveTextContent('La hora o la acción no encajan con las demás marcas del día. Revisá el orden.')

      fireEvent.click(within(form()).getByRole('button', { name: 'Agregar marca' }))
      expect(await screen.findByText('Marca agregada.')).toBeInTheDocument()
      expect(form()).toContainElement(screen.getByText('Marca agregada.'))
    })

    it('«Cancelar jornada» abre su formulario dentro del día con el foco en el motivo; su error queda en el formulario y «Volver» devuelve el foco', async () => {
      withDayDetail({ state: 'NO_INGRESO', marks: [] })
      render(<JourneysView />)
      await openDay()
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar el día' }))
      const reason = screen.getByLabelText('Motivo de cancelación')
      expect(screen.getByRole('region', { name: 'Marcas de Lucía Pérez' })).toContainElement(reason)
      await waitFor(() => expect(reason).toHaveFocus())

      fireEvent.change(reason, { target: { value: 'Feriado' } })
      apiMocks.post.mockRejectedValueOnce(new Error('No se pudo conectar con el servidor.'))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
      expect(await within(reason.closest('form')!).findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')

      fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar el día' })).toHaveFocus())
    })

    describe('en un teléfono', () => {
      let previousMatchMedia: PropertyDescriptor | undefined
      beforeEach(() => {
        previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
        Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({ matches: query.startsWith('(max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
      })
      afterEach(() => {
        if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia)
        else Reflect.deleteProperty(window, 'matchMedia')
      })

      it('el día se abre dentro de su tarjeta, el formulario dentro de su marca con el foco en el motivo, y «Volver» devuelve el foco', async () => {
        render(<JourneysView />)
        const card = await screen.findByRole('article', { name: 'Lucía Pérez' })
        fireEvent.click(within(card).getByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
        const marks = await within(card).findByRole('list', { name: 'Marcas del día' })
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Marcas de Lucía Pérez' })).toHaveFocus())

        const [item] = within(marks).getAllByRole('listitem')
        fireEvent.click(within(item).getByRole('button', { name: /^Anular marca Entrada/ }))
        const form = within(item).getByRole('form', { name: /^Anular la marca Entrada/ })
        await waitFor(() => expect(within(form).getByLabelText('Motivo de anulación')).toHaveFocus())
        fireEvent.click(within(form).getByRole('button', { name: 'Volver' }))
        await waitFor(() => expect(within(item).getByRole('button', { name: /^Anular marca Entrada/ })).toHaveFocus())
      })

      it('cada marca dice cuándo se registró, como la tabla de la pantalla ancha', async () => {
        // A mark the ADMIN loaded: its time and the time it was recorded differ.
        withDayDetail({ marks: [{ ...jornada.marks[0], occurredAt: '2026-10-16T12:00:00Z', recordedAt: '2026-10-16T14:30:00Z' }] })
        render(<JourneysView />)
        await openDay()
        const [item] = within(screen.getByRole('list', { name: 'Marcas del día' })).getAllByRole('listitem')
        expect(item).toHaveTextContent(`Registrada: ${formatDateTime('2026-10-16T14:30:00Z', site.timeZone)}`)
      })
    })
  })

  describe('horario asignado por empleado (D-20261015-02)', () => {
    it('muestra el historial de horarios de un empleado y asigna uno nuevo desde un día', async () => {
      apiMocks.post.mockResolvedValueOnce({ ...assignment, id: 'a-2', validFrom: '2026-11-10', createdAt: '2026-10-27T13:00:00Z' })
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' }))

      const history = await screen.findByRole('list', { name: 'Historial de horarios de Lucía Pérez' })
      expect(history).toHaveTextContent(`Mañana · Local Centro · desde ${formatLocalDate('2026-11-01')}`)
      const assign = screen.getByRole('button', { name: 'Asignar horario' })
      expect(assign).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Horario'), { target: { value: 't-1' } })
      fireEvent.change(screen.getByLabelText('Desde el día'), { target: { value: '2026-11-10' } })
      fireEvent.click(assign)

      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/employees/e-1/template-assignments', { templateId: 't-1', validFrom: '2026-11-10' }))
      expect(await screen.findByText('Horario asignado.')).toBeInTheDocument()
      const items = within(screen.getByRole('list', { name: 'Historial de horarios de Lucía Pérez' })).getAllByRole('listitem')
      expect(items.map((item) => item.textContent)).toEqual([
        `Mañana · Local Centro · desde ${formatLocalDate('2026-11-10')}`, `Mañana · Local Centro · desde ${formatLocalDate('2026-11-01')}`
      ])
    })

    it('un fallo al asignar deja el historial como estaba y muestra el error', async () => {
      apiMocks.post.mockRejectedValueOnce(new Error('Esa persona ya tiene un horario en ese local desde ese día. Elegí otro día.'))
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' }))
      await screen.findByRole('list', { name: 'Historial de horarios de Lucía Pérez' })
      fireEvent.change(screen.getByLabelText('Horario'), { target: { value: 't-1' } })
      fireEvent.change(screen.getByLabelText('Desde el día'), { target: { value: '2026-11-01' } })
      fireEvent.click(screen.getByRole('button', { name: 'Asignar horario' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Esa persona ya tiene un horario en ese local desde ese día')
      expect(within(screen.getByRole('list', { name: 'Historial de horarios de Lucía Pérez' })).getAllByRole('listitem')).toHaveLength(1)
    })
  })

  describe('declaration rejected for an employee outside the site or an inactive template (D-20261102-06, D-20261102-07)', () => {
    // The client is mocked here: the rejection carries the code the real ApiClient exposes.
    const rejection = (status: number, code: string) => Object.assign(new Error('mensaje genérico del cliente'), { name: 'ApiError', status, code })
    const workDays = async () => within(await screen.findByRole('region', { name: 'Cargar días de trabajo' }))

    it.each([
      [409, 'EMPLOYEE_NOT_IN_SITE', 'Esa persona no trabaja en este local. Agregale el local desde Equipo y volvé a cargar el día.'],
      [422, 'TEMPLATE_INVALID', 'El horario elegido, o el que la persona tiene asignado, está desactivado. Elegí otro horario.']
    ])('a single day answered %i %s shows its specific message next to its form', async (status, code, message) => {
      apiMocks.post.mockRejectedValueOnce(rejection(status, code))
      render(<JourneysView />)
      await screen.findByRole('row', { name: /Lucía Pérez/ })
      const single = within(screen.getByRole('region', { name: 'Cargar o cambiar un solo día' }))
      fireEvent.click(single.getByRole('button', { name: 'Cargar este día' }))
      expect(await single.findByText(message)).toBeInTheDocument()
    })

    it.each([
      [409, 'EMPLOYEE_NOT_IN_SITE', 'No se cargó ningún día: al menos una de las personas elegidas no trabaja en este local. Revisá sus locales en Equipo y volvé a intentar.'],
      [422, 'TEMPLATE_INVALID', 'No se cargó ningún día: el horario elegido está desactivado. Elegí otro o usá el que tiene asignado cada persona.']
    ])('loading days answered %i %s says no day was loaded', async (status, code, message) => {
      apiMocks.post.mockRejectedValueOnce(rejection(status, code))
      render(<JourneysView />)
      const panel = await workDays()
      await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      expect(await panel.findByText(message)).toBeInTheDocument()
    })

    it('loading days failing with another error keeps the client message', async () => {
      apiMocks.post.mockRejectedValueOnce(rejection(409, 'RETRYABLE_TRANSACTION_CONFLICT'))
      render(<JourneysView />)
      const panel = await workDays()
      await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      expect(await panel.findByText('mensaje genérico del cliente')).toBeInTheDocument()
    })
  })

  describe('cargar días de trabajo (D-20261027-11, issue #104)', () => {
    const workDays = async () => within(await screen.findByRole('region', { name: 'Cargar días de trabajo' }))
    const fixedNow = new Date('2026-11-09T15:00:00Z')
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: fixedNow }) })
    afterEach(() => { vi.useRealTimers() })

    it('un solo día usa por defecto el horario asignado y envía otro solo si se elige', async () => {
      apiMocks.post.mockResolvedValue(jornada)
      render(<JourneysView />)
      await screen.findByRole('row', { name: /Lucía Pérez/ })
      const single = within(screen.getByRole('region', { name: 'Cargar o cambiar un solo día' }))
      const fields = single.getAllByRole('combobox').map((field) => field.getAttribute('id'))
      expect(fields.indexOf(single.getByLabelText('Local').id)).toBeLessThan(fields.indexOf(single.getByLabelText('Empleado').id))
      const schedule = single.getByLabelText('Horario')
      await waitFor(() => expect(single.getByRole('option', { name: 'Mañana' })).toBeInTheDocument())
      expect(schedule).toHaveValue('')
      expect(screen.queryByText(/calendario local de este dispositivo/)).not.toBeInTheDocument()
      const localDate = (single.getByLabelText('Día') as HTMLInputElement).value
      fireEvent.click(single.getByRole('button', { name: 'Cargar este día' }))
      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/jornadas', { employeeId: 'e-1', siteId: 's-1', localDate }))
      expect(await single.findByText('Día cargado.')).toBeInTheDocument()

      fireEvent.change(schedule, { target: { value: 't-1' } })
      fireEvent.click(single.getByRole('button', { name: 'Cargar este día' }))
      await waitFor(() => expect(apiMocks.post).toHaveBeenLastCalledWith('/jornadas', { employeeId: 'e-1', siteId: 's-1', localDate, templateId: 't-1' }))
    })

    it('por defecto carga de lunes a sábado lo que queda del mes para todas las personas, con vista previa', async () => {
      apiMocks.post.mockResolvedValueOnce({ created: [], skipped: [] })
      render(<JourneysView />)
      const panel = await workDays()
      expect(await panel.findByRole('checkbox', { name: 'Lucía Pérez' })).toBeChecked()
      expect(panel.getByRole('button', { name: 'Lunes a sábado' })).toHaveAttribute('aria-pressed', 'true')
      expect(panel.getByRole('button', { name: 'Lo que queda del mes' })).toHaveAttribute('aria-pressed', 'true')
      expect(panel.getByRole('checkbox', { name: 'Domingo' })).not.toBeChecked()
      expect(panel.getByText('Vas a cargar 19 días (lunes a sábado, del 9 al 30 de noviembre) para 1 persona.')).toBeInTheDocument()
      expect(panel.getByText('Se cargan una sola vez. Para el mes siguiente, volvé a esta pantalla.')).toBeInTheDocument()
      expect(panel.queryByLabelText('Primer día')).not.toBeInTheDocument()
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/jornadas/bulk', { employeeIds: ['e-1'], siteId: 's-1', from: '2026-11-09', to: '2026-11-30', weekdays: [1, 2, 3, 4, 5, 6] }))
    })

    it('los botones rápidos cambian los días y el período, y "Elegir fechas" muestra el primer y el último día', async () => {
      apiMocks.post.mockResolvedValueOnce({ created: [], skipped: [] })
      render(<JourneysView />)
      const panel = await workDays()
      await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
      fireEvent.click(panel.getByRole('button', { name: 'Lunes a viernes' }))
      fireEvent.click(panel.getByRole('button', { name: 'Mes que viene' }))
      expect(panel.getByText('Vas a cargar 23 días (lunes a viernes, del 1 al 31 de diciembre) para 1 persona.')).toBeInTheDocument()
      fireEvent.click(panel.getByRole('button', { name: 'Todos' }))
      fireEvent.click(panel.getByRole('button', { name: 'Esta semana' }))
      expect(panel.getByText('Vas a cargar 7 días (todos los días, del 9 al 15 de noviembre) para 1 persona.')).toBeInTheDocument()
      fireEvent.click(panel.getByRole('button', { name: 'Próximas 2 semanas' }))
      expect(panel.getByText(/Vas a cargar 14 días .*del 9 al 22 de noviembre/)).toBeInTheDocument()
      fireEvent.click(panel.getByRole('button', { name: 'Elegir fechas' }))
      expect(panel.getByLabelText('Primer día')).toHaveValue('2026-11-09')
      expect(panel.getByLabelText('Último día')).toHaveValue('2026-11-22')
      fireEvent.change(panel.getByLabelText('Último día'), { target: { value: '2026-11-10' } })
      fireEvent.click(panel.getByRole('checkbox', { name: 'Sábado' }))
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/jornadas/bulk', { employeeIds: ['e-1'], siteId: 's-1', from: '2026-11-09', to: '2026-11-10', weekdays: [1, 2, 3, 4, 5, 7] }))
    })

    it('valida antes de enviar, con mensajes simples', async () => {
      render(<JourneysView />)
      const panel = await workDays()
      fireEvent.click(await panel.findByRole('checkbox', { name: 'Seleccionar todos' }))
      expect(panel.getByRole('checkbox', { name: 'Lucía Pérez' })).not.toBeChecked()
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      expect(await panel.findByText('Elegí al menos una persona.')).toBeInTheDocument()

      fireEvent.click(panel.getByRole('checkbox', { name: 'Seleccionar todos' }))
      fireEvent.click(panel.getByRole('button', { name: 'Elegir fechas' }))
      fireEvent.change(panel.getByLabelText('Último día'), { target: { value: '2026-12-15' } })
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      expect(await panel.findByText('Elegí como máximo 31 días. Para más, cargá un mes y después el siguiente.')).toBeInTheDocument()
      expect(panel.getByLabelText('Último día')).toHaveAttribute('aria-invalid', 'true')

      fireEvent.change(panel.getByLabelText('Último día'), { target: { value: '2026-11-13' } })
      fireEvent.click(panel.getByRole('button', { name: 'Lunes a viernes' }))
      for (const day of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']) fireEvent.click(panel.getByRole('checkbox', { name: day }))
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      expect(await panel.findByText('Elegí al menos un día de la semana.')).toBeInTheDocument()
      expect(apiMocks.post).not.toHaveBeenCalled()
    })

    it('muestra el resultado agrupado por motivo y lleva a asignar horario', async () => {
      const onNavigate = vi.fn()
      apiMocks.post.mockResolvedValueOnce({
        created: [{ id: 'j-2', employeeId: 'e-1', siteId: 's-1', localDate: '2026-11-10', state: 'NO_INGRESO' }],
        skipped: [
          { employeeId: 'e-1', localDate: '2026-11-11', reason: 'JORNADA_EXISTS' }, { employeeId: 'e-1', localDate: '2026-11-12', reason: 'JORNADA_EXISTS' },
          { employeeId: 'e-1', localDate: '2026-11-13', reason: 'TEMPLATE_REQUIRED' }
        ]
      })
      render(<JourneysView onNavigate={onNavigate} />)
      const panel = await workDays()
      await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))

      const outcome = await panel.findByText('Se cargó 1 día. No se cargaron 3:', { exact: false })
      const skipped = panel.getByRole('list', { name: 'Días que no se cargaron' })
      // The reasons sit inside the result box, and each group names its people.
      expect(outcome).toContainElement(skipped)
      expect(skipped).toHaveTextContent('Ya tenían día cargado: Lucía Pérez (2)')
      expect(skipped).toHaveTextContent('Sin horario asignado: Lucía Pérez (1)')
      expect(within(skipped).getAllByRole('listitem')).toHaveLength(2)
      fireEvent.click(panel.getByRole('button', { name: 'Asignar horario' }))
      expect(onNavigate).toHaveBeenCalledWith('empleados')
    })

    it('envía otro horario para todos solo cuando se elige', async () => {
      apiMocks.post.mockResolvedValueOnce({ created: [], skipped: [] })
      render(<JourneysView />)
      const panel = await workDays()
      await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
      fireEvent.change(panel.getByLabelText('Horario para todos'), { target: { value: 't-1' } })
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/jornadas/bulk', expect.objectContaining({ templateId: 't-1' })))
      expect(await panel.findByText('No se cargó ningún día.')).toBeInTheDocument()
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

describe('dirección de cada sección del ADMIN', () => {
  const openAt = (hash: string) => window.history.replaceState(null, '', `/admin${hash}`)
  const menuButton = (name: string) => within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('button', { name })
  // Back and Forward fire hashchange as a task, after the history step.
  const hashSettles = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  // A history step is waited for by its own hashchange: one tick is not enough under the load of the whole suite.
  const back = () => act(() => new Promise<void>((resolve) => {
    window.addEventListener('hashchange', () => setTimeout(resolve, 0), { once: true })
    window.history.back()
  }))
  // The default world misses step 5 (no days loaded from tomorrow on), so the start section is «Primeros pasos».
  const startsOnFirstSteps = async () => {
    expect(await screen.findByRole('heading', { name: 'Primeros pasos', level: 1 })).toBeInTheDocument()
    expect(menuButton('Primeros pasos')).toHaveAttribute('aria-current', 'page')
  }

  beforeEach(() => openAt(''))
  afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

  it.each([
    ['#/para-revisar', 'Para revisar', 'Para revisar'],
    ['#/hoy', 'Días de trabajo', 'Días de trabajo'],
    ['#/historial', 'Historial', 'Historial'],
    ['#/configuracion/locales', 'Locales', 'Locales'],
    ['#/configuracion/horarios', 'Horarios', 'Horarios'],
    ['#/configuracion/equipo', 'Equipo', 'Equipo'],
    ['#/configuracion/primeros-pasos', 'Primeros pasos', 'Primeros pasos']
  ])('la dirección %s abre %s', async (hash, link, title) => {
    openAt(hash)
    render(<AdminApp />)
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(menuButton(link)).toHaveAttribute('aria-current', 'page')
    // A late setup status, which here says a step is missing, never moves the owner to «Primeros pasos».
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/employees/e-1/template-assignments'))
    await hashSettles()
    expect(menuButton(link)).toHaveAttribute('aria-current', 'page')
    expect(window.location.hash).toBe(hash)
  })

  // The start section writes its address in an effect after it renders, so the address is waited for (2026-11-11: read at once, it failed now and then under the load of the whole suite).
  it.each(['#/no-existe', '#/HOY', '#inicio'])('una dirección desconocida (%s) abre la sección de inicio', async (hash) => {
    openAt(hash)
    render(<AdminApp />)
    await startsOnFirstSteps()
    await waitFor(() => expect(window.location.hash).toBe('#/configuracion/primeros-pasos'))
  })

  it('sin dirección y con un paso pendiente sigue abriendo en «Primeros pasos», y la escribe', async () => {
    render(<AdminApp />)
    expect(screen.getByText('Preparando tu panel…')).toBeInTheDocument()
    await startsOnFirstSteps()
    await waitFor(() => expect(window.location.hash).toBe('#/configuracion/primeros-pasos'))
  })

  it('elegir una sección del menú escribe su dirección', async () => {
    render(<AdminApp />)
    await startsOnFirstSteps()
    fireEvent.click(menuButton('Equipo'))
    expect(window.location.hash).toBe('#/configuracion/equipo')
    fireEvent.click(menuButton('Historial'))
    expect(window.location.hash).toBe('#/historial')
  })


  it('volver atrás muestra la sección anterior', async () => {
    render(<AdminApp />)
    await startsOnFirstSteps()
    fireEvent.click(menuButton('Locales'))
    expect(await screen.findByRole('heading', { name: 'Locales', level: 1 })).toBeInTheDocument()
    await hashSettles()
    const sitesReads = () => apiMocks.get.mock.calls.filter(([path]) => path === '/sites').length
    await waitFor(() => expect(sitesReads()).toBe(2))

    await back()
    await startsOnFirstSteps()
    expect(menuButton('Locales')).not.toHaveAttribute('aria-current')
    await waitFor(() => expect(window.location.hash).toBe('#/configuracion/primeros-pasos'))
    // The guide is read again, as when it is chosen from the menu.
    await waitFor(() => expect(sitesReads()).toBe(3))
  })

  it('un cambio de dirección muestra su sección', async () => {
    render(<AdminApp />)
    await startsOnFirstSteps()
    window.location.hash = '#/configuracion/horarios'
    await hashSettles()
    expect(await screen.findByRole('heading', { name: 'Horarios', level: 1 })).toBeInTheDocument()
    expect(menuButton('Horarios')).toHaveAttribute('aria-current', 'page')
  })

  it('ver una jornada desde la bandeja deja la dirección de Jornadas', async () => {
    openAt('#/para-revisar')
    render(<AdminApp />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver el día de Lucía Pérez' }))
    expect(await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')).toBeInTheDocument()
    expect(window.location.hash).toBe('#/hoy')
  })

  it('ver una jornada desde la bandeja abre ese día dentro de su fila, lo trae a la vista y lleva el foco a su título', async () => {
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    try {
      openAt('#/para-revisar')
      render(<AdminApp />)
      fireEvent.click(await screen.findByRole('button', { name: 'Ver el día de Lucía Pérez' }))
      const heading = await screen.findByRole('heading', { name: 'Marcas de Lucía Pérez' })
      const detail = screen.getByRole('region', { name: 'Marcas de Lucía Pérez' })
      expect(screen.getByRole('button', { name: 'Ver marcas de Lucía Pérez' }).closest('tr')!.nextElementSibling).toContainElement(detail)
      await waitFor(() => expect(heading).toHaveFocus())
      expect(scrollIntoView.mock.contexts).toContain(detail)
    } finally {
      if (previousScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScrollIntoView)
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  it('al cambiar de empresa la nueva empieza por su inicio y no por la sección que tenía la anterior', async () => {
    const view = render(<AdminApp key="c-1" />)
    await startsOnFirstSteps()
    fireEvent.click(menuButton('Equipo'))
    expect(window.location.hash).toBe('#/configuracion/equipo')

    // App.tsx keys AdminApp by company, so a switch mounts a new one.
    view.rerender(<AdminApp key="c-2" />)
    await startsOnFirstSteps()
    await waitFor(() => expect(window.location.hash).toBe('#/configuracion/primeros-pasos'))
  })

  it('al cerrar sesión o pasar a la vista de empleado no queda la dirección para la próxima persona', async () => {
    openAt('#/configuracion/equipo')
    const view = render(<AdminApp />)
    expect(await screen.findByRole('heading', { name: 'Equipo', level: 1 })).toBeInTheDocument()
    view.unmount()
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/admin')
  })
})
