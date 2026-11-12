import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadFailure } from '../../app/ui'
import { ONCE_NOTE, WorkDaysFormRender, type WorkDaysFormValues } from './WorkDaysForm'
import { WorkDaysPanel } from './WorkDaysPanel'
import { WorkDaysView } from './WorkDaysView'
import { WorkDaysViewRender } from './WorkDaysViewRender'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../shared/api/client', () => ({ api: apiMocks }))
// The real LoadFailure, watched: the view must hand it the label of what it reloads and its loading flag.
vi.mock('../../app/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof import('../../app/ui')>()
  return { ...ui, LoadFailure: vi.fn(ui.LoadFailure) }
})

const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6037, longitude: -58.3816, geofenceRadiusMeters: 100 }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const template = { id: 't-1', siteId: 's-1', name: 'Mañana', active: true, blocks: [{ startDayOffset: 0 as const, start: '09:00', end: '17:00', endDayOffset: 0 as const }], breakfastLimitMinutes: 15, lunchLimitMinutes: 60 }
const noop = () => undefined
const values: WorkDaysFormValues = { siteId: 's-1', weekdays: [1, 2, 3, 4, 5, 6], period: 'rest-of-month', from: '2026-11-09', to: '2026-11-30', selectedIds: ['e-1'], templateId: '' }
const PREVIEW = 'Vas a cargar 19 días (lunes a sábado, del 9 al 30 de noviembre) para 1 persona.'
const formProps = {
  sites: [site], employees: [employee], templates: [template], values, preview: PREVIEW, busy: false, disabled: false, error: '', dateError: false, result: null,
  onSiteChange: noop, onWeekdaysChange: noop, onPeriodChange: noop, onFromChange: noop, onToChange: noop, onToggleEmployee: noop, onToggleAll: noop,
  onTemplateChange: noop, onSubmit: noop, onAssignSchedules: noop, onReviewSchedules: noop
}
const viewProps = {
  sites: [site], eligibleEmployees: [employee], siteTemplates: [template], loading: false, dependencyError: '', busy: false, employeeId: 'e-1', siteId: 's-1',
  templateId: '', singleDate: '2026-11-09', onSingleDateChange: noop, onEmployeeChange: noop, onSiteChange: noop, onTemplateChange: noop, onDeclare: noop, onRetryDependencies: noop
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/employees') return Promise.resolve([employee])
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/templates') return Promise.resolve([template])
    return Promise.reject(new Error(`GET inesperado: ${path}`))
  })
})
afterEach(() => { cleanup() })

describe('«Días de trabajo» con las piezas del sistema', () => {
  // A PageMessage writes its text one render after mounting; the preview is part of the form, so it is there from the first one.
  it('la vista previa es un mensaje de información que ya tiene su texto en el primer dibujo', () => {
    const page = document.createElement('div')
    page.innerHTML = renderToStaticMarkup(<WorkDaysFormRender {...formProps} />)

    const message = [...page.querySelectorAll('.message')].find((element) => element.textContent?.includes(PREVIEW))
    expect(message).toBeDefined()
    expect(message).toHaveClass('message-info')
    expect(message?.querySelector(':scope > svg.icon')).not.toBeNull()
    expect(message).toHaveTextContent(ONCE_NOTE)
    // The sentence that changes with each choice is the live region, and it already holds its words.
    expect(message?.querySelector('[role="status"]')).toHaveTextContent(PREVIEW)
  })

  it('los botones rápidos muestran el elegido con un tilde y su nombre sigue siendo el mismo', () => {
    render(<WorkDaysPanel sites={[site]} employees={[employee]} templates={[template]} disabled={false} onLoaded={noop} onAssignSchedules={noop} onReviewSchedules={noop} />)
    const check = (name: string) => screen.getByRole('button', { name }).querySelector('svg.icon')

    expect(screen.getByRole('button', { name: 'Lunes a sábado' })).toHaveAttribute('aria-pressed', 'true')
    expect(check('Lunes a sábado')).not.toBeNull()
    expect(check('Lunes a sábado')).toHaveAttribute('aria-hidden', 'true')
    expect(check('Lunes a viernes')).toBeNull()
    expect(check('Lo que queda del mes')).not.toBeNull()
    expect(check('Mes que viene')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Lunes a viernes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mes que viene' }))
    expect(check('Lunes a viernes')).not.toBeNull()
    expect(check('Lunes a sábado')).toBeNull()
    expect(check('Mes que viene')).not.toBeNull()
    expect(check('Lo que queda del mes')).toBeNull()
    // Secondary buttons of the system, not the old quiet ones.
    for (const button of screen.getAllByRole('button', { pressed: false })) expect(button).not.toHaveClass('button-quiet')
  })

  // The limit is about the range, not about the last day: read before both dates, and the two boxes stay side by side level.
  it('"Hasta 31 días por vez." describe las dos fechas y va antes de ellas', () => {
    render(<WorkDaysFormRender {...formProps} values={{ ...values, period: 'custom' }} />)
    const first = screen.getByLabelText('Primer día')
    const last = screen.getByLabelText('Último día')
    const hint = screen.getByText('Hasta 31 días por vez.')

    expect(first).toHaveAccessibleDescription('Hasta 31 días por vez.')
    expect(last).toHaveAccessibleDescription('Hasta 31 días por vez.')
    expect(hint.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('el resultado lista lo que no se cargó como filas y lleva a cada sección con un botón de enlace', () => {
    const result = { created: 1, skipped: 3, existing: { count: 2, names: ['Lucía Pérez'] }, noSchedule: { count: 1, names: ['Lucía Pérez'] }, inactiveSchedule: { count: 0, names: [] } }
    render(<WorkDaysFormRender {...formProps} result={result} />)
    const skipped = screen.getByRole('list', { name: 'Días que no se cargaron' })

    expect(skipped).toHaveClass('record-list')
    for (const row of within(skipped).getAllByRole('listitem')) expect(row).toHaveClass('record')
    expect(within(skipped).getByRole('button', { name: 'Asignar horario' })).toHaveClass('button-link')
  })

  // Slice G2 (keyboard pass on the built app, 2026-11-12): «Cargar días» was disabled while it sent, so the focus fell to the
  // page and the result was left for the keyboard to find.
  it('después de cargar, el foco va al resultado de la carga', async () => {
    apiMocks.post.mockResolvedValue({ created: [{ id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-11-30', state: 'NO_INGRESO' }], skipped: [] })
    render(<WorkDaysPanel sites={[site]} employees={[employee]} templates={[template]} disabled={false} onLoaded={noop} onAssignSchedules={noop} onReviewSchedules={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cargar días' }))

    await waitFor(() => expect(screen.getByRole('group', { name: 'Resultado de la carga' })).toHaveFocus())
  })

  // Design system 4.15 (finding F-30): the summary text is the name of the fold; a heading inside a summary breaks it.
  it('el día suelto es un plegable nombrado por su resumen, sin un título adentro', () => {
    render(<WorkDaysViewRender {...viewProps} />)
    const single = screen.getByRole('region', { name: 'Cargar o cambiar un solo día' })
    const summary = single.querySelector('summary') as HTMLElement

    expect(summary).toHaveTextContent('Cargar o cambiar un solo día')
    expect(within(summary).queryByRole('heading')).not.toBeInTheDocument()
  })

  // Review advisory of F3: the dependency error goes through LoadFailure with the label of what it reloads, off while it loads.
  it('si fallan los datos del día, «Reintentar datos del día» está apagado mientras carga y vuelve a pedirlos', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<WorkDaysViewRender {...viewProps} dependencyError="Falló la carga." loading onRetryDependencies={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Falló la carga.')
    expect(screen.getByRole('button', { name: 'Reintentar datos del día' })).toBeDisabled()
    rerender(<WorkDaysViewRender {...viewProps} dependencyError="Falló la carga." loading={false} onRetryDependencies={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar datos del día' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('la vista le pasa a la carga fallida su nombre y su estado de carga, y el reintento vuelve a pedir los datos', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementationOnce(() => Promise.reject(new Error('Falló la carga de empleados.'))).mockImplementation(previous)
    render(<WorkDaysView />)

    const retry = await screen.findByRole('button', { name: 'Reintentar datos del día' })
    await waitFor(() => expect(retry).toBeEnabled())
    expect(vi.mocked(LoadFailure).mock.lastCall?.[0]).toMatchObject({ message: 'Falló la carga de empleados.', retryLabel: 'Reintentar datos del día', disabled: false })
    fireEvent.click(retry)

    expect(await screen.findByRole('checkbox', { name: 'Lucía Pérez' })).toBeInTheDocument()
    expect(apiMocks.get.mock.calls.filter(([path]) => path === '/employees')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Reintentar datos del día' })).not.toBeInTheDocument()
  })
})
