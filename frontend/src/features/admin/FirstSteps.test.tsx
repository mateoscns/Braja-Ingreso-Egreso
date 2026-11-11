import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApp } from './AdminApp'

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

const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6037, longitude: -58.3816, geofenceRadiusMeters: 100 }
const template = { id: 't-1', siteId: 's-1', name: 'Mañana', active: true, blocks: [{ startDayOffset: 0, start: '09:00', end: '17:00', endDayOffset: 0 }], breakfastLimitMinutes: 15, lunchLimitMinutes: 60 }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const assignment = { id: 'a-1', employeeId: 'e-1', siteId: 's-1', templateId: 't-1', templateName: 'Mañana', validFrom: '2026-11-01', createdAt: '2026-11-01T12:00:00Z' }
const jornada = {
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EGRESADA', toleranceMinutes: 5, sequence: 1,
  scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks: template.blocks, breakfastLimitMinutes: 15, lunchLimitMinutes: 60 },
  marks: [{ id: 'm-1', jornadaId: 'j-1', action: 'INGRESO', sequence: 1, acceptedAt: '2026-10-16T12:00:00Z', locationStatus: 'SIN_UBICACION' }]
}
const missingExit = { id: 'd-1', jornadaId: 'j-1', siteId: 's-1', employeeId: 'e-1', employeeDisplayName: 'Lucía Pérez', type: 'MARCA_FALTANTE', status: 'MOTIVO_PENDIENTE', category: null, createdAt: '2026-10-16T22:00:00Z', pushEligible: false }

type World = { sites: unknown[]; templates: unknown[]; employees: unknown[]; assignments: unknown[]; daysFrom: string | null }
let world: World

beforeEach(() => {
  vi.clearAllMocks()
  // Monday 9 November 2026, noon in Buenos Aires: tomorrow is the 10th.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T15:00:00Z') })
  world = { sites: [site], templates: [template], employees: [employee], assignments: [assignment], daysFrom: '2026-11-10' }
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve(world.sites)
    if (path === '/templates') return Promise.resolve(world.templates)
    if (path === '/employees') return Promise.resolve(world.employees)
    if (path === '/employees/e-1/template-assignments') return Promise.resolve(world.assignments)
    if (path.startsWith('/inbox')) return Promise.resolve({ items: [missingExit], nextCursor: null })
    if (path.startsWith('/jornadas?') && path.includes('siteId=')) {
      return Promise.resolve(world.daysFrom ? [{ id: 'j-9', employeeId: 'e-1', siteId: 's-1', localDate: world.daysFrom, state: 'NO_INGRESO' }] : [])
    }
    if (path.startsWith('/jornadas?')) return Promise.resolve([{ id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EGRESADA' }])
    if (path === '/jornadas/j-1') return Promise.resolve(jornada)
    return Promise.reject(new Error(`GET inesperado: ${path}`))
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

const menu = () => within(screen.getByRole('navigation', { name: 'Navegación principal' })).getAllByRole('button').map((button) => button.textContent)

describe('Primeros pasos', () => {
  it('con una empresa vacía abre la guía primero, con los cinco pasos pendientes, y cada paso lleva a su sección', async () => {
    world = { sites: [], templates: [], employees: [], assignments: [], daysFrom: null }
    render(<AdminApp />)
    expect(await screen.findByRole('heading', { name: 'Primeros pasos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Primeros pasos/ })).toHaveAttribute('aria-current', 'page')
    expect(menu()).toEqual(['✓Primeros pasos', '◷Para revisar', '▦Hoy', '▥Días de trabajo', '☰Historial', '⌖Locales', '▤Horarios', '♙Equipo'])
    expect(screen.getByText('CONFIGURACIÓN')).toBeInTheDocument()
    const steps = within(screen.getByRole('list', { name: 'Pasos para empezar' })).getAllByRole('listitem')
    expect(steps.map((step) => step.querySelector('strong')?.textContent)).toEqual(['1. Tu local', '2. Tus horarios', '3. Tu equipo', '4. Cada uno con su horario', '5. Días de trabajo cargados'])
    expect(steps.every((step) => step.textContent?.includes('Falta'))).toBe(true)
    expect(screen.getByRole('heading', { name: '0 de 5 pasos listos' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Locales: Tu local' }))
    expect(await screen.findByRole('heading', { name: 'Locales' })).toBeInTheDocument()
  })

  it('marca lo hecho y nombra lo que falta: personas sin horario asignado', async () => {
    world = { ...world, assignments: [], daysFrom: null }
    render(<AdminApp />)
    const steps = within(await screen.findByRole('list', { name: 'Pasos para empezar' })).getAllByRole('listitem')
    expect(steps[0]).toHaveTextContent('Listo')
    expect(steps[3]).toHaveTextContent('Falta para: Lucía Pérez.')
    // The next step to do is the obvious one.
    expect(within(steps[3]).getByRole('button', { name: /^Ir a Equipo/ })).toHaveClass('button-primary')
    expect(within(steps[4]).getByRole('button', { name: /^Ir a Días de trabajo/ })).not.toHaveClass('button-primary')
  })

  it('con todo configurado empieza en Bandeja, deja la guía al final del menú y la guía dice cuántos pueden marcar mañana', async () => {
    render(<AdminApp />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Para revisar/ })).toHaveAttribute('aria-current', 'page'))
    expect(menu()).toEqual(['◷Para revisar', '▦Hoy', '▥Días de trabajo', '☰Historial', '⌖Locales', '▤Horarios', '♙Equipo', '✓Primeros pasos'])
    expect(await screen.findByText('Hay días cargados hasta el martes 10 de noviembre.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Primeros pasos/ }))
    expect(await screen.findByText('Listo: mañana puede marcar 1 persona. Volvé cada mes a cargar los días.')).toBeInTheDocument()
  })

  it('una sección elegida antes de que llegue la revisión no se cambia por la guía', async () => {
    world = { sites: [], templates: [], employees: [], assignments: [], daysFrom: null }
    let release!: (value: unknown) => void
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/templates' ? new Promise((resolve) => { release = resolve }) : previous(path))
    render(<AdminApp />)
    fireEvent.click(screen.getByRole('button', { name: /Equipo/ }))
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
    await act(async () => { release([]) })
    expect(screen.getByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Primeros pasos' })).not.toBeInTheDocument()
  })
})

describe('aviso de días cargados', () => {
  it('en Bandeja avisa cuando mañana nadie tiene día cargado y lleva a Jornadas', async () => {
    world = { ...world, daysFrom: '2026-11-12' }
    render(<AdminApp />)
    // Days on the 12th count for step 5 (tomorrow to 7 days later), so the app starts on Bandeja.
    const notice = await screen.findByText('Mañana nadie tiene día cargado en Local Centro: cargalos para que puedan marcar.')
    expect(notice.closest('.message')).toHaveClass('message-error')
    fireEvent.click(within(notice.closest('.message') as HTMLElement).getByRole('button', { name: 'Cargar días' }))
    expect(await screen.findByRole('heading', { name: 'Días de trabajo' })).toBeInTheDocument()
    expect(await screen.findByText('Mañana nadie tiene día cargado en Local Centro: cargalos para que puedan marcar.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cargar días de trabajo' })).toBeInTheDocument()
  })
})

describe('Ver jornada desde un desvío', () => {
  it('abre Jornadas en la fecha de esa jornada, con su detalle y la salida preelegida para una salida sin marcar', async () => {
    render(<AdminApp />)
    const card = (await screen.findByText('No marcó la salida')).closest('article') as HTMLElement
    expect(card).not.toHaveTextContent(/secuencia/)
    fireEvent.click(within(card).getByRole('button', { name: 'Ver el día de Lucía Pérez' }))

    expect(await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-16')
    expect(apiMocks.get).toHaveBeenCalledWith('/jornadas?from=2026-10-16&to=2026-10-16')
    expect(screen.getByLabelText('¿Qué marca faltó?')).toHaveValue('EGRESO')
  })
})
