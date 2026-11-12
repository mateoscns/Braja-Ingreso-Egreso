import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadFailure, StatusTag } from '../../app/ui'
import { AdminApp } from './AdminApp'
import { CoverageNoticeRender, FirstStepsRender } from './FirstSteps'
import type { SetupStep } from './setupStatus'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))
vi.mock('../../app/session', () => ({
  useSession: () => ({
    signOut: vi.fn(), activateCompany: vi.fn(),
    session: { dni: '30123456', activeCompanyId: 'c-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }] }
  })
}))
// The avisos of this device are the hook's business (device/push); AdminApp mounts it on every screen since slice N4.
vi.mock('../../device/push/useAdminPush', () => ({
  useAdminPush: () => ({
    availability: 'unsupported', enabled: false, busy: false, configLoading: false, configReady: false, configError: '', error: '', message: '',
    activate: () => Promise.resolve(), deactivate: () => Promise.resolve(), retryConfig: () => undefined
  })
}))
vi.mock('../../device/pwa/InstallControl', () => ({ InstallControl: () => null }))
// The real LoadFailure and StatusTag, watched: a failed load must go through the first (slice F3), the state of a step through
// the second (slice E7).
vi.mock('../../app/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof import('../../app/ui')>()
  return { ...ui, LoadFailure: vi.fn(ui.LoadFailure), StatusTag: vi.fn(ui.StatusTag) }
})
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

// Changed in slice N4: the four destinations and, under «Configuración», its parts, as links (their icons have no text).
const menu = () => within(screen.getByRole('navigation', { name: 'Navegación principal' })).getAllByRole('link').map((link) => link.textContent)
const menuLink = (name: string) => within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('link', { name })

describe('Primeros pasos', () => {
  it('con una empresa vacía abre la guía primero, con los cinco pasos pendientes, y cada paso lleva a su sección', async () => {
    world = { sites: [], templates: [], employees: [], assignments: [], daysFrom: null }
    render(<AdminApp />)
    expect(await screen.findByRole('heading', { name: 'Primeros pasos' })).toBeInTheDocument()
    expect(menuLink('Primeros pasos')).toHaveAttribute('aria-current', 'page')
    // D-20261111-02: «Primeros pasos» is a part of «Configuración», listed first while a step is missing.
    expect(menu()).toEqual(['Para revisar', 'Hoy', 'Días de trabajo', 'Configuración', 'Primeros pasos', 'Locales', 'Horarios', 'Equipo'])
    expect(menuLink('Configuración')).toHaveAttribute('aria-current', 'true')
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

  // Changed in slice N4: with every step done the guide leaves the menu (D-20261111-02: «Primeros pasos mientras falte un paso»);
  // its address still opens it.
  it('con todo configurado empieza en «Para revisar», saca la guía del menú y la guía dice cuántos pueden marcar mañana', async () => {
    render(<AdminApp />)
    await waitFor(() => expect(menuLink('Para revisar')).toHaveAttribute('aria-current', 'page'))
    expect(menu()).toEqual(['Para revisar', 'Hoy', 'Días de trabajo', 'Configuración', 'Locales', 'Horarios', 'Equipo'])
    expect(await screen.findByText('Hay días cargados hasta el martes 10 de noviembre.')).toBeInTheDocument()

    window.location.hash = '#/configuracion/primeros-pasos'
    expect(await screen.findByText('Listo: mañana puede marcar 1 persona. Volvé cada mes a cargar los días.')).toBeInTheDocument()
  })

  it('una sección elegida antes de que llegue la revisión no se cambia por la guía', async () => {
    world = { sites: [], templates: [], employees: [], assignments: [], daysFrom: null }
    let release!: (value: unknown) => void
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/templates' ? new Promise((resolve) => { release = resolve }) : previous(path))
    render(<AdminApp />)
    fireEvent.click(menuLink('Equipo'))
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
    await act(async () => { release([]) })
    expect(screen.getByRole('heading', { name: 'Equipo' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Primeros pasos' })).not.toBeInTheDocument()
  })
})

// Slice E7 (design system 4.19): the guide is an ordered list of records of the system. Three steps done, one that could not be
// checked from here and the next one to do, with the texts setupSteps writes.
const STEPS: SetupStep[] = [
  { title: 'Tu local', explanation: 'Cargá el local donde trabaja tu equipo y dónde queda, para saber si marcan desde ahí.', done: true, section: 'sedes', sectionLabel: 'Locales' },
  { title: 'Tus horarios', explanation: 'Armá los horarios de cada local: a qué hora se entra, se sale y cuánto duran las pausas.', done: true, section: 'plantillas', sectionLabel: 'Horarios' },
  { title: 'Tu equipo', explanation: 'Dá de alta a las personas que van a marcar, con su DNI y su local.', done: true, section: 'empleados', sectionLabel: 'Equipo' },
  { title: 'Cada uno con su horario', explanation: 'Elegí qué horario tiene cada persona, desde Equipo.', done: 'unknown', detail: 'Revisá Equipo: son muchas personas para revisarlas desde acá.', section: 'empleados', sectionLabel: 'Equipo' },
  { title: 'Días de trabajo cargados', explanation: 'Cargá los días que trabaja cada persona. Se hace una vez por mes.', done: false, detail: 'Falta en: Local Centro.', section: 'workdays', sectionLabel: 'Días de trabajo' }
]
const showSteps = () => {
  render(<FirstStepsRender steps={STEPS} loading={false} error="" readyCount={0} onGo={vi.fn()} onRetry={vi.fn()} />)
  const list = screen.getByRole('list', { name: 'Pasos para empezar' })
  return { list, steps: within(list).getAllByRole('listitem') }
}

describe('Primeros pasos como registros del sistema', () => {
  it('los pasos son una lista ordenada de registros, cada uno con su número, que no se lee porque el título ya lo dice', () => {
    const { list, steps } = showSteps()

    expect(list.tagName).toBe('OL')
    expect(list).toHaveClass('record-list')
    expect(steps).toHaveLength(5)
    for (const step of steps) {
      expect(step).toHaveClass('record', 'step')
      expect(step.querySelector('.step-number')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(steps.map((step) => step.querySelector('.record-title')?.textContent)).toEqual(['1. Tu local', '2. Tus horarios', '3. Tu equipo', '4. Cada uno con su horario', '5. Días de trabajo cargados'])
    // A done step has the check of the icon set in its box, not a typed glyph.
    expect(steps[0].querySelector('.step-number svg.icon')).not.toBeNull()
    expect(steps[0]).not.toHaveTextContent('✓')
    expect(steps[4].querySelector('.step-number')).toHaveTextContent('5')
  })

  it('solo el próximo paso tiene el botón lleno; un paso listo lleva a su sección con un enlace y los demás con un botón secundario', () => {
    const { list, steps } = showSteps()
    const go = (step: HTMLElement) => within(step).getByRole('button', { name: /^Ir a / })

    expect(list.querySelectorAll('.button-primary')).toHaveLength(1)
    expect(go(steps[4])).toHaveClass('button-primary')
    expect(steps[4]).toHaveClass('step-next')
    expect(steps.filter((step) => step.classList.contains('step-next'))).toHaveLength(1)
    for (const done of steps.slice(0, 3)) expect(go(done)).toHaveClass('button-link')
    expect(go(steps[3])).toHaveClass('button-secondary')
    expect(go(steps[3])).toHaveAccessibleName('Ir a Equipo: Cada uno con su horario')
  })

  it('un paso listo no muestra su explicación; uno que falta o que hay que revisar la muestra con lo que falta', () => {
    const { steps } = showSteps()

    for (const [index, done] of steps.slice(0, 3).entries()) {
      expect(done).toHaveClass('step-done')
      expect(done).not.toHaveTextContent(STEPS[index].explanation)
    }
    expect(steps[3]).toHaveTextContent(STEPS[3].explanation)
    expect(steps[3].querySelector('.step-detail')).toHaveTextContent('Revisá Equipo: son muchas personas para revisarlas desde acá.')
    expect(steps[4]).toHaveTextContent(STEPS[4].explanation)
    expect(steps[4].querySelector('.step-detail')).toHaveTextContent('Falta en: Local Centro.')
  })

  it('el estado de cada paso es una etiqueta del sistema con su ícono: Listo, Revisalo, Falta', () => {
    const { list, steps } = showSteps()

    expect(vi.mocked(StatusTag).mock.calls.map(([props]) => [props.tone, props.icon, props.children])).toEqual([
      ['ok', 'check', 'Listo'], ['ok', 'check', 'Listo'], ['ok', 'check', 'Listo'], ['todo', 'eye', 'Revisalo'], ['todo', 'alert', 'Falta']
    ])
    for (const step of steps) expect(step.querySelector('.status-chip svg')).toHaveAttribute('aria-hidden', 'true')
    // The setup steps no longer borrow the classes of the deviations.
    expect(list.querySelector('.status-justificado, .status-motivo_pendiente')).toBeNull()
  })
})

describe('Primeros pasos sin datos', () => {
  // Slice F3: a failed load goes through the shared LoadFailure, with its own «Reintentar», off while the review runs again.
  it('si no pudo revisar qué falta, lo dice con la carga fallida compartida y su Reintentar vuelve a revisar', () => {
    const onRetry = vi.fn()
    const props = { steps: null, error: 'No pudimos revisar qué falta.', readyCount: 0, onGo: vi.fn(), onRetry }
    const { rerender } = render(<FirstStepsRender {...props} loading={false} />)

    expect(vi.mocked(LoadFailure).mock.lastCall?.[0]).toMatchObject({ message: 'No pudimos revisar qué falta.', disabled: false })
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos revisar qué falta.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<FirstStepsRender {...props} loading />)
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDisabled()
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

  // Slice E3: the notice is a message of the system (its icon, its body) and «Cargar días» leads somewhere, so it is a link
  // button under the words. On arrival it stays a polite status even when it is an error.
  it('el aviso es un mensaje del sistema con su ícono, sigue siendo un estado y «Cargar días» es un enlace debajo del texto', () => {
    const onAction = vi.fn()
    render(<CoverageNoticeRender notice={{ kind: 'error', siteNames: ['Local Centro'], text: 'Mañana nadie tiene día cargado en Local Centro: cargalos para que puedan marcar.' }} actionLabel="Cargar días" onAction={onAction} />)
    const notice = screen.getByRole('status')
    const body = notice.querySelector(':scope > .message-body') as HTMLElement

    expect(notice).toHaveClass('message', 'message-error')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(notice.querySelector(':scope > svg.icon')).not.toBeNull()
    expect(body).toHaveTextContent('Mañana nadie tiene día cargado en Local Centro')
    const action = within(body).getByRole('button', { name: 'Cargar días' })
    expect(action).toHaveClass('button-link')
    fireEvent.click(action)
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('Ver jornada desde un desvío', () => {
  it('abre Jornadas en la fecha de esa jornada, con su detalle y la salida preelegida para una salida sin marcar', async () => {
    render(<AdminApp />)
    const card = (await screen.findByText('No marcó la salida')).closest('li') as HTMLElement
    expect(card).not.toHaveTextContent(/secuencia/)
    fireEvent.click(within(card).getByRole('button', { name: 'Ver el día de Lucía Pérez' }))

    expect(await screen.findByText('Horario asignado: Mañana · tolerancia 5 min')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-16')
    expect(apiMocks.get).toHaveBeenCalledWith('/jornadas?from=2026-10-16&to=2026-10-16')
    expect(screen.getByLabelText('¿Qué marca faltó?')).toHaveValue('EGRESO')
  })
})
