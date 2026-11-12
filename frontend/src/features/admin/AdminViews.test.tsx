import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'
import { AdminInbox } from './AdminInbox'
import { EmployeesView } from './EmployeesView'
import { JourneysView } from './JourneysView'
import { SchedulesView } from './SchedulesView'
import { SitesView } from './SitesView'
import { WorkDaysView } from './WorkDaysView'
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
// The avisos of this device are the hook's business (device/push); AdminApp mounts it on every screen since slice N4.
vi.mock('../../device/push/useAdminPush', () => ({
  useAdminPush: () => ({
    availability: 'unsupported', enabled: false, busy: false, configLoading: false, configReady: false, configError: '', error: '', message: '',
    activate: () => Promise.resolve(), deactivate: () => Promise.resolve(), retryConfig: () => undefined
  })
}))
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
    // Changed in slice N4: the menu items are links to their address.
    const inbox = screen.getByRole('link', { name: 'Para revisar' })
    await waitFor(() => expect(inbox).toHaveAttribute('aria-current', 'page'))
    expect(container.querySelector('.nav-dot')).not.toBeInTheDocument()

    const employees = screen.getByRole('link', { name: 'Equipo' })
    fireEvent.click(employees)
    expect(employees).toHaveAttribute('aria-current', 'page')
    expect(inbox).not.toHaveAttribute('aria-current')
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
  })

  // Changed in slice E1 (here and in the inbox tests below that wait for a case): the person is the first line of the case and
  // names its row; it is no longer joined to the time with «·».
  it('muestra el nombre entregado por el servidor en la bandeja', async () => {
    render(<AdminInbox />)
    expect(await screen.findByRole('listitem', { name: 'Lucía Pérez' })).toBeInTheDocument()
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
    expect(await screen.findByRole('listitem', { name: 'Lucía Pérez' })).toBeInTheDocument()
  })

  it('mantiene la bandeja si falla la carga de zonas horarias y explica el huso usado', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites'
      ? Promise.reject(new Error('Falló la consulta de sedes.'))
      : previousGet(path))
    render(<AdminInbox />)

    expect(await screen.findByText(/Falló la consulta de sedes\./)).toBeInTheDocument()
    expect(screen.getByText(/Las horas se muestran en la zona horaria de este dispositivo\./)).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Lucía Pérez' })).toBeInTheDocument()
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
    render(<SchedulesView />)

    expect(await screen.findByText('Falló la carga de plantillas.')).toBeInTheDocument()
    expect(screen.queryByText('Este local todavía no tiene horarios. Creá el primero.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('list', { name: 'Horario Mañana' })).toHaveTextContent('09:00–17:00')
  })

  it('muestra el estado vacío de horarios solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/templates' ? Promise.resolve([]) : previousGet(path))
    render(<SchedulesView />)
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

  it('reintenta empleados, sedes y jornadas después de un fallo inicial', async () => {
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
    for (const path of ['/employees', '/sites']) {
      expect(apiMocks.get.mock.calls.filter(([requestedPath]) => requestedPath === path)).toHaveLength(2)
    }
    expect(apiMocks.get.mock.calls.filter(([path]) => String(path).startsWith('/jornadas?'))).toHaveLength(2)
  })

  it('la carga de días reintenta empleados, sedes y plantillas después de un fallo inicial', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    let failFirstEmployeeRequest = true
    apiMocks.get.mockImplementation((path: string) => {
      if (path === '/employees' && failFirstEmployeeRequest) {
        failFirstEmployeeRequest = false
        return Promise.reject(new Error('Falló la carga inicial de empleados.'))
      }
      return previousGet(path)
    })
    render(<WorkDaysView />)

    expect(await screen.findByText('Falló la carga inicial de empleados.')).toBeInTheDocument()
    const retry = await screen.findByRole('button', { name: 'Reintentar datos del día' })
    await waitFor(() => expect(retry).toBeEnabled())
    fireEvent.click(retry)

    expect(await screen.findByRole('checkbox', { name: 'Lucía Pérez' })).toBeInTheDocument()
    expect(screen.queryByText('Falló la carga inicial de empleados.')).not.toBeInTheDocument()
    for (const path of ['/employees', '/sites', '/templates']) {
      expect(apiMocks.get.mock.calls.filter(([requestedPath]) => requestedPath === path)).toHaveLength(2)
    }
    expect(apiMocks.get.mock.calls.filter(([path]) => String(path).startsWith('/jornadas'))).toHaveLength(0)
  })

  it('muestra el estado vacío de jornadas solo cuando la consulta termina correctamente sin filas', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/jornadas?') ? Promise.resolve([]) : previousGet(path))
    render(<JourneysView />)
    expect(await screen.findByText('No hay días cargados para esta fecha.')).toBeInTheDocument()
  })

  it('asocia la etiqueta Empleado con el selector de la jornada', async () => {
    render(<WorkDaysView />)
    expect(await screen.findByLabelText('Empleado')).toHaveRole('combobox')
  })

  it('mantiene el título de Jornadas cuando se borra la fecha', async () => {
    render(<JourneysView />)
    expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '' } })

    expect(screen.getByRole('heading', { name: 'Hoy', level: 1 })).toBeInTheDocument()
    // Plain «Días»: «Días de trabajo» names another section since D-20261111-02, step 2.
    expect(screen.getByRole('heading', { name: 'Días', level: 2 })).toBeInTheDocument()
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
    // Changed in T12 (UX Medio 1): the result is said in the row of the case, not at the top of the section.
    expect(await within(screen.getByRole('listitem', { name: 'Lucía Pérez' })).findByText('Guardado: No justificado.')).toBeInTheDocument()
  })

  // T12 (UX Medio 1, F-02 residual): «Clasificación guardada.» showed at the top of the section, far from a case lower down.
  it('una decisión guardada se dice en la fila de su caso y el foco va a «Corregir a …»', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    const waiting = { ...deviation, status: 'PENDIENTE_REVISION' as const, category: 'TRANSPORTE' as const }
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox') ? Promise.resolve({ items: [waiting], nextCursor: null }) : previous(path))
    apiMocks.put.mockResolvedValue({ ...waiting, status: 'JUSTIFICADO' })
    render(<AdminInbox />)
    const row = within(await screen.findByRole('listitem', { name: 'Lucía Pérez' }))
    fireEvent.click(row.getByRole('button', { name: 'Justificado' }))

    expect(await row.findByText('Guardado: Justificado.')).toBeInTheDocument()
    await waitFor(() => expect(row.getByRole('button', { name: 'Corregir a no justificado' })).toHaveFocus())
    expect(screen.queryByText('Clasificación guardada.')).not.toBeInTheDocument()
  })

  // T12 (UX A-5): «Para revisar» showed the cases without saying how many wait for the ADMIN and how many for the employee.
  describe('la cuenta de los casos', () => {
    const cases = [
      { ...deviation, id: 'd-1', status: 'MOTIVO_PENDIENTE' as const },
      { ...deviation, id: 'd-2', status: 'MOTIVO_PENDIENTE' as const },
      { ...deviation, id: 'd-3', status: 'PENDIENTE_REVISION' as const, category: 'SALUD' as const },
      { ...deviation, id: 'd-4', status: 'JUSTIFICADO' as const }
    ]
    const serveInbox = (items: typeof cases, nextCursor: string | null) => {
      const previous = apiMocks.get.getMockImplementation()!
      apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox') ? Promise.resolve({ items, nextCursor }) : previous(path))
    }

    it('dice cuántos casos esperan una decisión y cuántos una explicación', async () => {
      serveInbox(cases, null)
      render(<AdminInbox />)
      const panel = within(await screen.findByRole('region', { name: 'Casos recientes' }))
      expect(await panel.findByText('1 para decidir · 2 esperan explicación')).toBeInTheDocument()
    })

    it('con más casos para cargar no dice un total: cuenta los de esta lista', async () => {
      serveInbox(cases.slice(1), 'next-page')
      render(<AdminInbox />)
      const panel = within(await screen.findByRole('region', { name: 'Casos recientes' }))
      expect(await panel.findByText('En esta lista: 1 para decidir · 1 espera explicación')).toBeInTheDocument()
    })
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
    render(<SchedulesView />)
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

  // Changed in slice N4: the foot left the menu for the «Configuración» page, so the test opens that page.
  it('muestra "Conexión protegida" solo en un contexto seguro', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    const openConfiguration = () => window.history.replaceState(null, '', '/admin#/configuracion')
    try {
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
      openConfiguration()
      const insecure = render(<AdminApp />)
      expect(await screen.findByRole('heading', { name: 'Configuración', level: 1 })).toBeInTheDocument()
      expect(screen.queryByText('Conexión protegida')).not.toBeInTheDocument()
      insecure.unmount()
      Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
      openConfiguration()
      render(<AdminApp />)
      expect(await screen.findByText('Conexión protegida')).toBeInTheDocument()
    } finally {
      cleanup()
      window.history.replaceState(null, '', '/')
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
      // Slice E2: a row of a list (design system 4.12), no longer an article.
      const card = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      expect(screen.queryByRole('columnheader', { name: 'Empleado' })).not.toBeInTheDocument()
      expect(card).toHaveTextContent('Local Centro')
      expect(card).toHaveTextContent(formatJornadaState('EN_CURSO'))
      fireEvent.click(within(card).getByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
      expect(await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')).toBeInTheDocument()
    })

    it('pliega los filtros de la bandeja y resume en una línea los que están aplicados', async () => {
      render(<AdminInbox />)
      await screen.findByRole('listitem', { name: 'Lucía Pérez' })
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
      await screen.findByRole('listitem', { name: 'Lucía Pérez' })
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
    render(<SchedulesView />)
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
      apiMocks.post.mockRejectedValueOnce(new Error('Esta persona también tiene acceso en otra empresa o como ADMIN, así que su contraseña no se puede restablecer desde acá. Pedí ayuda al soporte de Fichaje Braja.'))
      render(<EmployeesView />)
      fireEvent.click(await resetButton())
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('su contraseña no se puede restablecer desde acá')
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
      await screen.findByRole('listitem', { name: 'Lucía Pérez' })
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
      await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      Object.entries(values).forEach(([label, value]) => pick(label, value))
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
      // Changed in slice F2b: the problem is the error of the date to change («Hasta» in these three), not an alert of the bar.
      await waitFor(() => expect(screen.getByLabelText('Hasta')).toHaveAccessibleDescription(message))
      expect(inboxCalls()).toEqual(['/inbox?limit=50'])
    })

    it('muestra un estado vacío claro cuando los filtros no encuentran nada', async () => {
      render(<AdminInbox />)
      await screen.findByRole('listitem', { name: 'Lucía Pérez' })
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
      await screen.findByRole('listitem', { name: 'Lucía Pérez' })
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
    const card = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
    expect(card).toHaveTextContent(/0?8:15/)
    expect(card).not.toHaveTextContent(/0?9:00/)
  })

  // Slice E1 (design system 4.2 and 4.11): each case is a row of a list that reads the person first (the owner, 2026-11-11:
  // "Persona primero"), then the case with its tag, when and the motive, then the decision.
  describe('«Para revisar» con las piezas del sistema: la persona primero y el par de decisiones', () => {
    const toReview = { ...deviation, status: 'PENDIENTE_REVISION' as const, category: 'TRANSPORTE' as const, motiveText: 'Hubo paro de colectivos.' }
    function withCases(items: object[]) {
      const previousGet = apiMocks.get.getMockImplementation()!
      apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox') ? Promise.resolve({ items, nextCursor: null }) : previousGet(path))
    }

    // The owner, 2026-11-11: "Sacarlas todas (Recomendado)": no line in capitals above the titles.
    it('el título «Para revisar» no lleva la línea en mayúsculas arriba', async () => {
      const { container } = render(<AdminInbox />)
      const title = await screen.findByRole('heading', { level: 1, name: 'Para revisar' })

      expect(title.previousElementSibling).toBeNull()
      expect(container.querySelector('.eyebrow')).toBeNull()
      expect(screen.queryByText('CENTRO DE CONTROL')).not.toBeInTheDocument()
    })

    it('cada caso se lee empezando por la persona, después el caso con su etiqueta, cuándo y el motivo', async () => {
      withCases([toReview])
      render(<AdminInbox />)
      const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      const person = within(row).getByText('Lucía Pérez')
      const caseName = within(row).getByText('Llegada tarde')
      const motive = within(row).getByText(/Hubo paro de colectivos\./)

      expect(row.textContent?.startsWith('Lucía Pérez')).toBe(true)
      expect(person.compareDocumentPosition(caseName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(caseName.compareDocumentPosition(motive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      // The state is a tag with its icon hidden from screen readers, never a symbol of its own.
      const tag = within(row).getByText('A revisar')
      expect(tag).toHaveClass('status-chip', 'status-todo')
      expect(tag.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    })

    it('el par «Justificado» / «No justificado» es un grupo con nombre y ningún botón de la fila es el principal', async () => {
      withCases([toReview])
      render(<AdminInbox />)
      const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      const pair = within(row).getByRole('group', { name: 'Decidir el caso de Lucía Pérez' })

      expect(within(pair).getAllByRole('button').map((button) => button.textContent)).toEqual(['Justificado', 'No justificado'])
      expect(row.querySelector('.button-primary')).toBeNull()
    })

    it('una decisión que falla muestra su mensaje dentro de su fila', async () => {
      withCases([toReview])
      apiMocks.put.mockRejectedValueOnce(new Error('No se pudo guardar la clasificación.'))
      render(<AdminInbox />)
      const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      fireEvent.click(within(row).getByRole('button', { name: 'Justificado' }))

      expect(await within(row).findByRole('alert')).toHaveTextContent('No se pudo guardar la clasificación.')
      expect(screen.getAllByRole('alert')).toHaveLength(1)
    })

    it('corregir una clasificación abre su formulario dentro de la fila del caso', async () => {
      render(<AdminInbox />)
      const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      fireEvent.click(within(row).getByRole('button', { name: 'Corregir a no justificado' }))

      expect(within(row).getByLabelText('Motivo de corrección')).toBeRequired()
      // The way out of the form is a link button; the next action of the open form is the only filled one.
      expect(within(row).getByRole('button', { name: 'Cancelar' })).toHaveClass('button-link')
      expect([...row.querySelectorAll('.button-primary')].map((button) => button.textContent)).toEqual(['Guardar corrección'])
    })

    // Slice F1 (WCAG 2.4.3; finding F-27): an inline form takes the focus when it opens and gives it back when it closes.
    it('«Corregir a …» lleva el foco al motivo y «Cancelar» lo devuelve al botón', async () => {
      render(<AdminInbox />)
      const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      fireEvent.click(within(row).getByRole('button', { name: 'Corregir a no justificado' }))

      await waitFor(() => expect(within(row).getByLabelText('Motivo de corrección')).toHaveFocus())
      fireEvent.click(within(row).getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(within(row).getByRole('button', { name: 'Corregir a no justificado' })).toHaveFocus())
    })

    it('al guardar la corrección el foco vuelve al botón de la fila, que ahora ofrece la decisión contraria', async () => {
      render(<AdminInbox />)
      const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      fireEvent.click(within(row).getByRole('button', { name: 'Corregir a no justificado' }))
      fireEvent.change(within(row).getByLabelText('Motivo de corrección'), { target: { value: 'Se equivocó de día.' } })
      fireEvent.click(within(row).getByRole('button', { name: 'Guardar corrección' }))

      await waitFor(() => expect(within(row).getByRole('button', { name: 'Corregir a justificado' })).toHaveFocus())
      expect(within(row).queryByLabelText('Motivo de corrección')).not.toBeInTheDocument()
    })

    it('decidir un caso deja el foco en el botón que queda en su fila, no en la página', async () => {
      withCases([toReview])
      render(<AdminInbox />)
      const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
      fireEvent.click(within(row).getByRole('button', { name: 'No justificado' }))

      await waitFor(() => expect(within(row).getByRole('button', { name: 'Corregir a justificado' })).toHaveFocus())
    })

    it('un caso abierto desde un aviso recibe el foco una sola vez: después lo maneja la persona', async () => {
      const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.history.replaceState({}, '', `${window.location.pathname}?deviation=d-1`)
      try {
        render(<AdminInbox />)
        const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
        await waitFor(() => expect(row).toHaveFocus())
        expect(row).toHaveAttribute('tabindex', '-1')

        fireEvent.click(within(row).getByRole('button', { name: 'Corregir a no justificado' }))
        fireEvent.change(within(row).getByLabelText('Motivo de corrección'), { target: { value: 'Se equivocó de día.' } })
        fireEvent.click(within(row).getByRole('button', { name: 'Guardar corrección' }))
        await waitFor(() => expect(within(row).getByRole('button', { name: 'Corregir a justificado' })).toHaveFocus())
      } finally { window.history.replaceState({}, '', previousUrl) }
    })
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
      // Changed in slice F2b (finding F-09): the button is not disabled any more; without a reason it sends nothing.
      fireEvent.click(confirm)
      expect(apiMocks.post).not.toHaveBeenCalled()
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
      // Changed in slice F2b (finding F-09): the button is not disabled any more; without a reason it sends nothing.
      fireEvent.click(confirm)
      expect(apiMocks.post).not.toHaveBeenCalled()
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

    // T12 (UX A-2): only the detail was read again after a change, so the tag of the day in the list kept the old state.
    it('después de agregar, corregir o anular una marca, la fila del día muestra el estado que se leyó de nuevo', async () => {
      const previousGet = apiMocks.get.getMockImplementation()!
      let state = 'EN_CURSO'
      apiMocks.get.mockImplementation((path: string) => path === '/jornadas/j-1' ? Promise.resolve({ ...jornada, state }) : previousGet(path))
      render(<JourneysView />)
      const dayRow = () => screen.getByRole('row', { name: /^Lucía Pérez/ })
      fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
      await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
      expect(within(dayRow()).getByText(formatJornadaState('EN_CURSO'))).toBeInTheDocument()

      state = 'EGRESADA'
      fireEvent.change(screen.getByLabelText('Hora (Local Centro)'), { target: { value: '2026-10-16T17:00' } })
      fireEvent.change(screen.getByLabelText('¿Por qué la agregás?'), { target: { value: 'Olvidó marcar la salida.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar marca' }))
      expect(await within(dayRow()).findByText(formatJornadaState('EGRESADA'))).toBeInTheDocument()

      state = 'PAUSA_ABIERTA'
      await waitFor(() => expect(within(screen.getByRole('row', { name: /^Entrada/ })).getByRole('button', { name: /^Corregir marca/ })).toBeEnabled())
      fireEvent.click(within(screen.getByRole('row', { name: /^Entrada/ })).getByRole('button', { name: /^Corregir marca/ }))
      fireEvent.change(screen.getByLabelText('Motivo de corrección de marca'), { target: { value: 'Se verificó la hora.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección de marca' }))
      expect(await within(dayRow()).findByText(formatJornadaState('PAUSA_ABIERTA'))).toBeInTheDocument()

      state = 'NO_INGRESO'
      await waitFor(() => expect(within(screen.getByRole('row', { name: /^Entrada/ })).getByRole('button', { name: /^Anular marca/ })).toBeEnabled())
      fireEvent.click(within(screen.getByRole('row', { name: /^Entrada/ })).getByRole('button', { name: /^Anular marca/ }))
      fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Tocó por error.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
      expect(await within(dayRow()).findByText(formatJornadaState('NO_INGRESO'))).toBeInTheDocument()
    })

    // T12 (QA M1): the notice of a day and the place it shows were kept when another day opened, so «Día cancelado.» showed in
    // the detail of a day nobody cancelled.
    it('el aviso del día cancelado no aparece en el detalle de otro día que se abre después', async () => {
      const previousGet = apiMocks.get.getMockImplementation()!
      const otherEmployee = { ...employee, id: 'e-2', displayName: 'Nicolás Arce' }
      let cancelled = false
      apiMocks.get.mockImplementation((path: string) => {
        if (path === '/employees') return Promise.resolve([employee, otherEmployee])
        if (path.startsWith('/jornadas?')) return Promise.resolve([
          { id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: cancelled ? 'CANCELADA' : 'NO_INGRESO' },
          { id: 'j-2', employeeId: 'e-2', siteId: 's-1', localDate: '2026-10-16', state: 'EN_CURSO' }
        ])
        if (path === '/jornadas/j-1') return Promise.resolve({ ...jornada, marks: [], ...(cancelled ? { state: 'CANCELADA', cancelledAt: '2026-10-16T13:00:00Z', cancelReason: 'Feriado' } : { state: 'NO_INGRESO' }) })
        if (path === '/jornadas/j-2') return Promise.resolve({ ...jornada, id: 'j-2', employeeId: 'e-2' })
        return previousGet(path)
      })
      apiMocks.post.mockImplementation(() => { cancelled = true; return Promise.resolve({ jornadaId: 'j-1', state: 'CANCELADA' }) })
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar el día' }))
      fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: 'Feriado' } })
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
      expect(await screen.findByText('Día cancelado.')).toBeInTheDocument()
      await screen.findByText(/Día cancelado el .* Motivo: Feriado/)

      const openOther = screen.getByRole('button', { name: 'Ver marcas de Nicolás Arce' })
      await waitFor(() => expect(openOther).toBeEnabled())
      fireEvent.click(openOther)
      expect(await screen.findByRole('region', { name: 'Marcas de Nicolás Arce' })).toBeInTheDocument()
      await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')
      expect(screen.queryByText('Día cancelado.')).not.toBeInTheDocument()
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

    // N3a: the load left this screen for «Días de trabajo», so the list of the day is all there is.
    it('la lista del día está en «Hoy» y la carga de días no', async () => {
      render(<JourneysView />)
      expect(await screen.findByRole('region', { name: /^Días de trabajo del/ })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Cargar días de trabajo' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Cargar o cambiar un solo día' })).not.toBeInTheDocument()
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
        const card = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
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

  // Slice E2 (design system 4.10 and 4.12): the voided mark had a bare chip in the table and only a struck line on a phone, and
  // neither table had a name.
  describe('«Hoy» con las piezas del sistema: etiquetas, listas y tablas con nombre', () => {
    const voidedDay = { marks: [{ ...jornada.marks[0], voided: true, voidedAt: '2026-10-16T13:00:00Z', voidReason: 'Tocó por error.' }] }
    const phone = () => Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn((query: string) => ({ matches: query.startsWith('(max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
    function withDayDetail(detail: object) {
      const previousGet = apiMocks.get.getMockImplementation()!
      apiMocks.get.mockImplementation((path: string) => path === '/jornadas/j-1' ? Promise.resolve({ ...jornada, ...detail }) : previousGet(path))
    }
    /** The tag of a state: a word after an icon hidden from screen readers, in the neutral tone of a day's state. */
    function expectNeutralTag(container: HTMLElement, word: string) {
      const tag = within(container).getAllByText(word).find((element) => element.classList.contains('status-chip'))
      expect(tag, word).toBeDefined()
      expect(tag).toHaveClass('status-neutral')
      expect(tag!.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    }

    it('una marca anulada lleva la etiqueta «Anulada» en la tabla y en la lista del teléfono', async () => {
      withDayDetail(voidedDay)
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
      expectNeutralTag(await screen.findByRole('row', { name: /^Entrada/ }), 'Anulada')
      cleanup()

      phone()
      render(<JourneysView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
      const [item] = within(await screen.findByRole('list', { name: 'Marcas del día' })).getAllByRole('listitem')
      expectNeutralTag(item, 'Anulada')
      expect(item).toHaveTextContent('Tocó por error.')
      expect(within(item).queryByRole('button')).not.toBeInTheDocument()
    })

    it('la tabla de los días y la de las marcas se nombran por el título de su sección', async () => {
      render(<JourneysView />)
      const days = await screen.findByRole('table', { name: /^Días de trabajo del/ })
      expect(within(days).getByRole('columnheader', { name: 'Empleado' })).toHaveAttribute('scope', 'col')
      fireEvent.click(within(days).getByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
      const marks = await screen.findByRole('table', { name: 'Marcas de Lucía Pérez' })
      expect(within(marks).getByRole('columnheader', { name: 'Ubicación' })).toHaveAttribute('scope', 'col')
    })

    // Slice G1 (WCAG 2.1.1): a table wider than its room scrolls inside its box, which the keyboard reaches by its name.
    it('una tabla más ancha que su lugar es una región con el nombre de su sección que toma el foco, la de los días y la de las marcas', async () => {
      const scrollWidth = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(900)
      const clientWidth = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(600)
      try {
        const { container } = render(<JourneysView />)
        const days = await screen.findByRole('table', { name: /^Días de trabajo del/ })
        fireEvent.click(within(days).getByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
        const marks = await screen.findByRole('table', { name: 'Marcas de Lucía Pérez' })
        const boxes = [...container.querySelectorAll<HTMLElement>('.table-scroll')]

        expect(boxes).toEqual([days.parentElement, marks.parentElement])
        // Each box is measured right after its table is drawn.
        await waitFor(() => { for (const box of boxes) expect(box).toHaveAttribute('role', 'region') })
        for (const box of boxes) {
          expect(box).toHaveAttribute('tabindex', '0')
          // Named by the title that names its table.
          expect(box).toHaveAttribute('aria-labelledby', box.querySelector('table')!.getAttribute('aria-labelledby'))
        }
        expect(screen.getAllByRole('region', { name: 'Marcas de Lucía Pérez' })).toContain(marks.parentElement)
      } finally { scrollWidth.mockRestore(); clientWidth.mockRestore() }
    })

    it('el estado de cada día es una etiqueta con su ícono, en la tabla y en la lista del teléfono', async () => {
      render(<JourneysView />)
      expectNeutralTag(await screen.findByRole('row', { name: /^Lucía Pérez/ }), formatJornadaState('EN_CURSO'))
      cleanup()

      phone()
      render(<JourneysView />)
      // A phone shows the days as a list named by its section, one item per person.
      const days = await screen.findByRole('list', { name: /^Días de trabajo del/ })
      const item = within(days).getByRole('listitem', { name: 'Lucía Pérez' })
      expectNeutralTag(item, formatJornadaState('EN_CURSO'))
      expect(item).toHaveTextContent('Local Centro')
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
      // Changed in slice F2b (finding F-09): «Asignar horario» is enabled and a submit without a horario says so under it.
      expect(assign).toBeEnabled()
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
      render(<WorkDaysView />)
      await screen.findByRole('option', { name: 'Lucía Pérez' })
      const single = within(screen.getByRole('region', { name: 'Cargar o cambiar un solo día' }))
      fireEvent.click(single.getByRole('button', { name: 'Cargar este día' }))
      expect(await single.findByText(message)).toBeInTheDocument()
    })

    it.each([
      [409, 'EMPLOYEE_NOT_IN_SITE', 'No se cargó ningún día: al menos una de las personas elegidas no trabaja en este local. Revisá sus locales en Equipo y volvé a intentar.'],
      [422, 'TEMPLATE_INVALID', 'No se cargó ningún día: el horario elegido está desactivado. Elegí otro o usá el que tiene asignado cada persona.']
    ])('loading days answered %i %s says no day was loaded', async (status, code, message) => {
      apiMocks.post.mockRejectedValueOnce(rejection(status, code))
      render(<WorkDaysView />)
      const panel = await workDays()
      await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
      fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
      expect(await panel.findByText(message)).toBeInTheDocument()
    })

    it('loading days failing with another error keeps the client message', async () => {
      apiMocks.post.mockRejectedValueOnce(rejection(409, 'RETRYABLE_TRANSACTION_CONFLICT'))
      render(<WorkDaysView />)
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
      render(<WorkDaysView />)
      await screen.findByRole('option', { name: 'Lucía Pérez' })
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
      render(<WorkDaysView />)
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
      render(<WorkDaysView />)
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
      render(<WorkDaysView />)
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
      render(<WorkDaysView onNavigate={onNavigate} />)
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
      render(<WorkDaysView />)
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
  // Changed in slice N4: the destinations and the parts of «Configuración» are links to their address, no longer buttons.
  const menuLink = (name: string) => within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('link', { name })
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
    expect(menuLink('Primeros pasos')).toHaveAttribute('aria-current', 'page')
  }

  beforeEach(() => openAt(''))
  afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })

  it.each([
    ['#/para-revisar', 'Para revisar', 'Para revisar'],
    ['#/hoy', 'Hoy', 'Hoy'],
    ['#/dias-de-trabajo', 'Días de trabajo', 'Días de trabajo'],
    ['#/configuracion/locales', 'Locales', 'Locales'],
    ['#/configuracion/horarios', 'Horarios', 'Horarios'],
    ['#/configuracion/equipo', 'Equipo', 'Equipo'],
    ['#/configuracion/primeros-pasos', 'Primeros pasos', 'Primeros pasos'],
    ['#/configuracion', 'Configuración', 'Configuración']
  ])('la dirección %s abre %s', async (hash, link, title) => {
    openAt(hash)
    render(<AdminApp />)
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(menuLink(link)).toHaveAttribute('aria-current', 'page')
    // A late setup status, which here says a step is missing, never moves the owner to «Primeros pasos».
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/employees/e-1/template-assignments'))
    await hashSettles()
    expect(menuLink(link)).toHaveAttribute('aria-current', 'page')
    expect(window.location.hash).toBe(hash)
  })

  // The owner removed the small uppercase line above every title (2026-11-11: "Sacarlas todas"). «Para revisar» has its own
  // test in its slice (E1).
  it.each([
    ['#/hoy', 'Hoy'], ['#/dias-de-trabajo', 'Días de trabajo'], ['#/configuracion/locales', 'Locales'], ['#/configuracion/horarios', 'Horarios'],
    ['#/configuracion/equipo', 'Equipo'], ['#/configuracion/primeros-pasos', 'Primeros pasos'], ['#/configuracion', 'Configuración']
  ])('la sección de %s no tiene una línea en mayúsculas arriba del título', async (hash, title) => {
    openAt(hash)
    const { container } = render(<AdminApp />)
    await screen.findByRole('heading', { name: title, level: 1 })
    expect(container.querySelector('.eyebrow')).toBeNull()
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
    fireEvent.click(menuLink('Equipo'))
    expect(window.location.hash).toBe('#/configuracion/equipo')
    fireEvent.click(menuLink('Hoy'))
    expect(window.location.hash).toBe('#/hoy')
  })

  it('la marca de la barra lleva a «Para revisar»', async () => {
    render(<AdminApp />)
    await startsOnFirstSteps()
    expect(screen.getByRole('link', { name: 'Fichaje Braja, inicio' })).toHaveAttribute('href', '#/para-revisar')
  })

  it('volver atrás muestra la sección anterior', async () => {
    render(<AdminApp />)
    await startsOnFirstSteps()
    fireEvent.click(menuLink('Locales'))
    expect(await screen.findByRole('heading', { name: 'Locales', level: 1 })).toBeInTheDocument()
    await hashSettles()
    const sitesReads = () => apiMocks.get.mock.calls.filter(([path]) => path === '/sites').length
    await waitFor(() => expect(sitesReads()).toBe(2))

    await back()
    await startsOnFirstSteps()
    expect(menuLink('Locales')).not.toHaveAttribute('aria-current')
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
    expect(menuLink('Horarios')).toHaveAttribute('aria-current', 'page')
  })

  // Slice F1 (WCAG 2.4.2 and 2.4.3; finding F-19): each section names the browser tab, and after a change of section made by
  // the owner its title takes the focus, so a screen reader reads where he is and Tab goes on from there.
  describe('cada sección nombra la pestaña y, al llegar, su título toma el foco', () => {
    const title = (name: string) => screen.findByRole('heading', { name, level: 1 })

    it.each([
      ['#/para-revisar', 'Para revisar'],
      ['#/hoy', 'Hoy'],
      ['#/dias-de-trabajo', 'Días de trabajo'],
      ['#/configuracion', 'Configuración'],
      ['#/configuracion/locales', 'Locales'],
      ['#/configuracion/horarios', 'Horarios'],
      ['#/configuracion/equipo', 'Equipo'],
      ['#/configuracion/primeros-pasos', 'Primeros pasos']
    ])('la dirección %s se llama «%s · Fichaje Braja» en la pestaña', async (hash, name) => {
      openAt(hash)
      render(<AdminApp />)
      await title(name)

      await waitFor(() => expect(document.title).toBe(`${name} · Fichaje Braja`))
      await hashSettles()
    })

    it('al abrir el panel el foco no se mueve: la primera sección no es un cambio', async () => {
      openAt('#/hoy')
      render(<AdminApp />)
      const heading = await title('Hoy')
      await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/employees/e-1/template-assignments'))
      await hashSettles()

      expect(heading).not.toHaveFocus()
      expect(document.body).toHaveFocus()
    })

    it('elegir una sección del menú le pone su nombre a la pestaña y lleva el foco a su título', async () => {
      render(<AdminApp />)
      await startsOnFirstSteps()
      fireEvent.click(menuLink('Hoy'))

      const heading = await title('Hoy')
      await waitFor(() => expect(heading).toHaveFocus())
      expect(document.title).toBe('Hoy · Fichaje Braja')
      await hashSettles()
    })

    it('volver atrás lleva el foco al título de la sección anterior', async () => {
      render(<AdminApp />)
      await startsOnFirstSteps()
      fireEvent.click(menuLink('Locales'))
      await title('Locales')
      await hashSettles()

      await back()
      const heading = await title('Primeros pasos')
      await waitFor(() => expect(heading).toHaveFocus())
      expect(document.title).toBe('Primeros pasos · Fichaje Braja')
    })

    it('un botón del contenido que lleva a otra sección deja el foco en el título de esa sección, no en la página', async () => {
      openAt('#/para-revisar')
      render(<AdminApp />)
      const notice = await screen.findByText('Mañana nadie tiene día cargado en Local Centro: cargalos para que puedan marcar.')
      const load = within(notice.closest('.message') as HTMLElement).getByRole('button', { name: 'Cargar días' })
      load.focus()
      fireEvent.click(load)

      const heading = await title('Días de trabajo')
      await waitFor(() => expect(heading).toHaveFocus())
      expect(document.title).toBe('Días de trabajo · Fichaje Braja')
      await hashSettles()
    })

    it('«Ir» de un paso de «Primeros pasos» deja el foco en el título de la sección del paso', async () => {
      render(<AdminApp />)
      await startsOnFirstSteps()
      fireEvent.click(screen.getByRole('button', { name: 'Ir a Días de trabajo: Días de trabajo cargados' }))

      const heading = await title('Días de trabajo')
      await waitFor(() => expect(heading).toHaveFocus())
      await hashSettles()
    })
  })

  // D-20261111-02, step 2: the daily work and the monthly load are two places.
  describe('«Hoy» y «Días de trabajo» son dos secciones', () => {
    const dayList = () => screen.queryByRole('region', { name: /^Días de trabajo del/ })
    const monthlyLoad = () => screen.queryByRole('region', { name: 'Cargar días de trabajo' })
    const singleDay = () => screen.queryByRole('region', { name: 'Cargar o cambiar un solo día' })

    it('cada dirección muestra su parte: «Hoy» la lista del día y «Días de trabajo» la carga', async () => {
      openAt('#/hoy')
      render(<AdminApp />)
      expect(await screen.findByRole('row', { name: /Lucía Pérez/ })).toBeInTheDocument()
      expect(dayList()).toBeInTheDocument()
      expect(monthlyLoad()).not.toBeInTheDocument()
      expect(singleDay()).not.toBeInTheDocument()

      fireEvent.click(menuLink('Días de trabajo'))
      expect(window.location.hash).toBe('#/dias-de-trabajo')
      expect(await screen.findByRole('heading', { name: 'Días de trabajo', level: 1 })).toBeInTheDocument()
      expect(menuLink('Días de trabajo')).toHaveAttribute('aria-current', 'page')
      expect(monthlyLoad()).toBeInTheDocument()
      expect(singleDay()).toBeInTheDocument()
      expect(dayList()).not.toBeInTheDocument()
      // The single day no longer has the list on its screen: its hint says where the list is.
      expect(within(singleDay()!).getByText(/abrilo en «Hoy»/)).toBeInTheDocument()
    })

    it('«Cargar días» del aviso lleva a «Días de trabajo», con el aviso arriba de la carga', async () => {
      openAt('#/para-revisar')
      render(<AdminApp />)
      // The default world has nobody loaded tomorrow.
      const notice = await screen.findByText('Mañana nadie tiene día cargado en Local Centro: cargalos para que puedan marcar.')
      fireEvent.click(within(notice.closest('.message') as HTMLElement).getByRole('button', { name: 'Cargar días' }))
      expect(window.location.hash).toBe('#/dias-de-trabajo')
      expect(await screen.findByRole('heading', { name: 'Días de trabajo', level: 1 })).toBeInTheDocument()
      const again = await screen.findByText('Mañana nadie tiene día cargado en Local Centro: cargalos para que puedan marcar.')
      expect(again.compareDocumentPosition(monthlyLoad()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('el paso de los días en «Primeros pasos» lleva a «Días de trabajo»', async () => {
      render(<AdminApp />)
      await startsOnFirstSteps()
      fireEvent.click(screen.getByRole('button', { name: 'Ir a Días de trabajo: Días de trabajo cargados' }))
      expect(window.location.hash).toBe('#/dias-de-trabajo')
      expect(await screen.findByRole('region', { name: 'Cargar días de trabajo' })).toBeInTheDocument()
    })

    it('un resultado de la carga sigue ofreciendo «Asignar horario» y «Revisar horarios», y llevan a su sección', async () => {
      // The default period starts today: a fixed Monday keeps the days of the range known.
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T15:00:00Z') })
      try {
        apiMocks.post.mockResolvedValue({
          created: [],
          skipped: [{ employeeId: 'e-1', localDate: '2026-11-10', reason: 'TEMPLATE_REQUIRED' }, { employeeId: 'e-1', localDate: '2026-11-11', reason: 'TEMPLATE_INVALID' }]
        })
        const load = async () => {
          const panel = within((await screen.findByRole('region', { name: 'Cargar días de trabajo' })))
          await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
          fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))
          return within(await panel.findByRole('list', { name: 'Días que no se cargaron' }))
        }
        openAt('#/dias-de-trabajo')
        render(<AdminApp />)
        fireEvent.click((await load()).getByRole('button', { name: 'Asignar horario' }))
        expect(window.location.hash).toBe('#/configuracion/equipo')
        expect(await screen.findByRole('heading', { name: 'Equipo', level: 1 })).toBeInTheDocument()

        fireEvent.click(menuLink('Días de trabajo'))
        fireEvent.click((await load()).getByRole('button', { name: 'Revisar horarios' }))
        expect(window.location.hash).toBe('#/configuracion/horarios')
        expect(await screen.findByRole('heading', { name: 'Horarios', level: 1 })).toBeInTheDocument()
      } finally { vi.useRealTimers() }
    })
  })

  // D-20261111-02, step 2: «Historial» is no longer a section; its search is a fold of «Hoy».
  describe('la búsqueda de días anteriores está dentro de «Hoy»', () => {
    const daySearch = () => screen.getByRole('region', { name: 'Buscar días anteriores' })
    const fold = () => daySearch().querySelector('details')!

    it('el menú ya no tiene «Historial» y «Hoy» tiene la búsqueda, plegada', async () => {
      openAt('#/hoy')
      render(<AdminApp />)
      expect(await screen.findByRole('heading', { name: 'Hoy', level: 1 })).toBeInTheDocument()
      const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
      expect(within(nav).queryByRole('link', { name: /Historial/ })).not.toBeInTheDocument()
      expect(fold()).not.toHaveAttribute('open')
      expect(within(daySearch()).getByRole('button', { name: 'Buscar' })).toBeInTheDocument()
    })

    it('la dirección vieja #/historial abre «Hoy» con la búsqueda abierta y queda #/hoy sin agregar un paso', async () => {
      openAt('#/historial')
      const before = window.history.length
      render(<AdminApp />)
      expect(await screen.findByRole('heading', { name: 'Hoy', level: 1 })).toBeInTheDocument()
      expect(menuLink('Hoy')).toHaveAttribute('aria-current', 'page')
      expect(fold()).toHaveAttribute('open')
      await waitFor(() => expect(window.location.hash).toBe('#/hoy'))
      expect(window.history.length).toBe(before)
    })

    it('llegar a #/historial desde otra sección también abre «Hoy» con la búsqueda abierta', async () => {
      openAt('#/configuracion/equipo')
      render(<AdminApp />)
      expect(await screen.findByRole('heading', { name: 'Equipo', level: 1 })).toBeInTheDocument()
      window.location.hash = '#/historial'
      await hashSettles()
      expect(await screen.findByRole('heading', { name: 'Hoy', level: 1 })).toBeInTheDocument()
      expect(menuLink('Hoy')).toHaveAttribute('aria-current', 'page')
      expect(fold()).toHaveAttribute('open')
      await waitFor(() => expect(window.location.hash).toBe('#/hoy'))
    })

    // T12 (QA B5): the address was the same as last time, so following it again after closing the fold did nothing.
    it('seguir otra vez #/historial después de plegar la búsqueda la vuelve a abrir', async () => {
      openAt('#/historial')
      render(<AdminApp />)
      expect(await screen.findByRole('heading', { name: 'Hoy', level: 1 })).toBeInTheDocument()
      expect(fold()).toHaveAttribute('open')
      await waitFor(() => expect(window.location.hash).toBe('#/hoy'))
      act(() => { fold().open = false; fold().dispatchEvent(new Event('toggle')) })
      expect(fold()).not.toHaveAttribute('open')

      window.location.hash = '#/historial'
      await hashSettles()
      await waitFor(() => expect(fold()).toHaveAttribute('open'))
      await waitFor(() => expect(window.location.hash).toBe('#/hoy'))
    })
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
    fireEvent.click(menuLink('Equipo'))
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

// Slice F2b (design system 4.3 and 4.7; WCAG 3.3.1, 3.3.3, 1.3.1, 4.1.2; finding F-09): every ADMIN form is checked on submit,
// in our words and under the field they are about; no bubble of the browser; a submit button is disabled only while it sends.
describe('un solo estilo de validación en los formularios del ADMIN', () => {
  const pending = { ...deviation, status: 'PENDIENTE_REVISION' as const }
  function withCases(items: object[]) {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path.startsWith('/inbox') ? Promise.resolve({ items, nextCursor: null }) : previousGet(path))
  }
  const openDay = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Ver marcas de Lucía Pérez' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /^Marcas de / })).toHaveFocus())
  }

  it('el motivo de corrección vacío se explica debajo del campo, con el foco ahí, y no se envía', async () => {
    render(<AdminInbox />)
    const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
    fireEvent.click(within(row).getByRole('button', { name: 'Corregir a no justificado' }))
    const save = within(row).getByRole('button', { name: 'Guardar corrección' })
    expect(save).toBeEnabled()
    expect(save.closest('form')).toHaveAttribute('novalidate')
    fireEvent.click(save)

    const reason = within(row).getByLabelText('Motivo de corrección')
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(reason).toHaveAccessibleDescription('Escribí el motivo de corrección.')
    await waitFor(() => expect(reason).toHaveFocus())
    expect(apiMocks.put).not.toHaveBeenCalled()
    fireEvent.change(reason, { target: { value: 'Se equivocó de día.' } })
    expect(reason).not.toHaveAttribute('aria-invalid')
  })

  it('una corrección rechazada deja su mensaje dentro del formulario y le lleva el foco', async () => {
    apiMocks.put.mockReset()
    apiMocks.put.mockRejectedValueOnce(new Error('No se pudo guardar la clasificación.'))
    render(<AdminInbox />)
    const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
    fireEvent.click(within(row).getByRole('button', { name: 'Corregir a no justificado' }))
    fireEvent.change(within(row).getByLabelText('Motivo de corrección'), { target: { value: 'Se equivocó de día.' } })
    const form = within(row).getByLabelText('Motivo de corrección').closest('form')!
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar corrección' }))

    const failure = await within(form).findByRole('alert')
    expect(failure).toHaveTextContent('No se pudo guardar la clasificación.')
    await waitFor(() => expect(failure).toHaveFocus())
  })

  it('una decisión que falla lleva el foco a su mensaje, dentro de la fila', async () => {
    withCases([pending])
    apiMocks.put.mockReset()
    apiMocks.put.mockRejectedValueOnce(new Error('No se pudo guardar la clasificación.'))
    render(<AdminInbox />)
    const row = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
    fireEvent.click(within(row).getByRole('button', { name: 'Justificado' }))

    const failure = await within(row).findByRole('alert')
    await waitFor(() => expect(failure).toHaveFocus())
  })

  it('las fechas de los filtros de «Para revisar» se explican debajo de la fecha que hay que cambiar', async () => {
    render(<AdminInbox />)
    await screen.findByRole('listitem', { name: 'Lucía Pérez' })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    const to = screen.getByLabelText('Hasta')
    await waitFor(() => expect(to).toHaveAccessibleDescription('Completá las dos fechas: desde y hasta.'))
    expect(to).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(to).toHaveFocus())
  })

  it('agregar una marca sin hora ni motivo explica cada campo, con el foco en la hora, y no se envía', async () => {
    render(<JourneysView />)
    await openDay()
    const form = screen.getByRole('heading', { name: 'Agregar una marca que faltó' }).closest('form')!
    const add = within(form).getByRole('button', { name: 'Agregar marca' })
    expect(form).toHaveAttribute('novalidate')
    expect(add).toBeEnabled()
    fireEvent.click(add)

    const time = within(form).getByLabelText('Hora (Local Centro)')
    expect(time).toHaveAccessibleDescription('Elegí la fecha y la hora.')
    expect(within(form).getByLabelText('¿Por qué la agregás?')).toHaveAccessibleDescription('Escribí por qué agregás la marca.')
    expect(within(form).getByLabelText('¿Por qué la agregás?')).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(time).toHaveFocus())
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('una hora que no existe en el local se explica debajo de la hora', async () => {
    const originalGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.resolve([{ ...site, timeZone: 'America/New_York' }]) : originalGet(path))
    render(<JourneysView />)
    await openDay()
    fireEvent.change(screen.getByLabelText('Hora (Local Centro)'), { target: { value: '2026-03-08T02:30' } })
    fireEvent.change(screen.getByLabelText('¿Por qué la agregás?'), { target: { value: 'Marca olvidada.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar marca' }))

    expect(screen.getByLabelText('Hora (Local Centro)')).toHaveAccessibleDescription('Esa hora no existe en la zona horaria del local. Revisá la fecha y la hora.')
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('corregir y anular sin motivo lo explican debajo del motivo, con los botones habilitados', async () => {
    render(<JourneysView />)
    await openDay()
    fireEvent.click(within(screen.getByRole('row', { name: /^Entrada/ })).getByRole('button', { name: /^Corregir marca Entrada/ }))
    const correction = screen.getByRole('form', { name: /^Corregir la marca Entrada/ })
    expect(correction).toHaveAttribute('novalidate')
    fireEvent.click(within(correction).getByRole('button', { name: 'Guardar corrección de marca' }))
    const correctionReason = within(correction).getByLabelText('Motivo de corrección de marca')
    expect(correctionReason).toHaveAccessibleDescription('Escribí el motivo de corrección.')
    await waitFor(() => expect(correctionReason).toHaveFocus())
    fireEvent.click(within(correction).getByRole('button', { name: 'Cancelar' }))

    fireEvent.click(within(screen.getByRole('row', { name: /^Entrada/ })).getByRole('button', { name: /^Anular marca Entrada/ }))
    const voiding = screen.getByRole('form', { name: /^Anular la marca Entrada/ })
    expect(voiding).toHaveAttribute('novalidate')
    const confirmVoid = within(voiding).getByRole('button', { name: 'Confirmar anulación' })
    expect(confirmVoid).toBeEnabled()
    fireEvent.click(confirmVoid)
    expect(within(voiding).getByLabelText('Motivo de anulación')).toHaveAccessibleDescription(expect.stringContaining('Escribí el motivo de anulación.'))
    expect(within(voiding).getByLabelText('Motivo de anulación')).toHaveAttribute('aria-invalid', 'true')
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('cancelar el día sin motivo lo explica debajo del motivo', async () => {
    const previousGet = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/jornadas/j-1' ? Promise.resolve({ ...jornada, state: 'NO_INGRESO', marks: [] }) : previousGet(path))
    render(<JourneysView />)
    await openDay()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar el día' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar cancelación' })
    expect(confirm).toBeEnabled()
    expect(confirm.closest('form')).toHaveAttribute('novalidate')
    fireEvent.click(confirm)

    expect(screen.getByLabelText('Motivo de cancelación')).toHaveAccessibleDescription(expect.stringContaining('Escribí el motivo de cancelación.'))
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('sin la zona horaria del local, «Agregar marca» dice por qué no se puede usar', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.reject(new Error('Servidor no disponible.')) : previous(path))
    render(<JourneysView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
    await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')

    expect(screen.getByRole('button', { name: 'Agregar marca' })).toHaveAccessibleDescription('No se pudo cargar la zona horaria del local. Reintentá los datos del día antes de incorporar o corregir marcas.')
  })

  it('asignar un horario sin elegirlo lo explica debajo del horario, con el botón habilitado', async () => {
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' }))
    await screen.findByRole('list', { name: 'Historial de horarios de Lucía Pérez' })
    const assign = screen.getByRole('button', { name: 'Asignar horario' })
    expect(assign).toBeEnabled()
    expect(assign.closest('form')).toHaveAttribute('novalidate')
    fireEvent.change(screen.getByLabelText('Desde el día'), { target: { value: '' } })
    fireEvent.click(assign)

    const schedule = screen.getByLabelText('Horario')
    expect(schedule).toHaveAccessibleDescription('Elegí un horario.')
    expect(screen.getByLabelText('Desde el día')).toHaveAccessibleDescription('Elegí desde qué día.')
    await waitFor(() => expect(schedule).toHaveFocus())
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('un solo día sin fecha lo explica debajo del día, sin la burbuja del navegador', async () => {
    render(<WorkDaysView />)
    await screen.findByRole('option', { name: 'Lucía Pérez' })
    const single = within(screen.getByRole('region', { name: 'Cargar o cambiar un solo día' }))
    const load = single.getByRole('button', { name: 'Cargar este día' })
    expect(load.closest('form')).toHaveAttribute('novalidate')
    fireEvent.change(single.getByLabelText('Día'), { target: { value: '' } })
    expect(load).toBeEnabled()
    fireEvent.click(load)

    expect(single.getByLabelText('Día')).toHaveAccessibleDescription('Elegí el día.')
    await waitFor(() => expect(single.getByLabelText('Día')).toHaveFocus())
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('la carga de días sin personas lo explica en el grupo «¿Quiénes?», con el foco en su primera casilla', async () => {
    render(<WorkDaysView />)
    const panel = within(await screen.findByRole('region', { name: 'Cargar días de trabajo' }))
    fireEvent.click(await panel.findByRole('checkbox', { name: 'Seleccionar todos' }))
    fireEvent.click(panel.getByRole('button', { name: 'Cargar días' }))

    const people = panel.getByRole('group', { name: /^¿Quiénes\?/ })
    expect(people).toHaveAttribute('aria-invalid', 'true')
    expect(people).toHaveClass('field-invalid')
    expect(people).toHaveAccessibleDescription('Elegí al menos una persona.')
    await waitFor(() => expect(panel.getByRole('checkbox', { name: 'Seleccionar todos' })).toHaveFocus())
    expect(panel.getByRole('group', { name: '¿Qué días trabajan?' })).not.toHaveAttribute('aria-invalid')
  })

  it('el resultado de la carga de días queda dentro del formulario, encima de su botón', async () => {
    apiMocks.post.mockResolvedValueOnce({ created: [], skipped: [] })
    render(<WorkDaysView />)
    const panel = within(await screen.findByRole('region', { name: 'Cargar días de trabajo' }))
    await panel.findByRole('checkbox', { name: 'Lucía Pérez' })
    const button = panel.getByRole('button', { name: 'Cargar días' })
    fireEvent.click(button)

    const outcome = await panel.findByText('No se cargó ningún día.')
    expect(button.closest('form')).toContainElement(outcome)
    expect(outcome.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
