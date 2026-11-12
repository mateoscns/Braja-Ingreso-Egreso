import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeesView } from './AdminViews'
import { deviceDate } from '../../shared/dateRange'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))
vi.mock('../../shared/api/client', () => ({ api: apiMocks, queryString: () => '' }))

const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires' }
const lucia = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const manana = { id: 't-1', siteId: 's-1', name: 'Mañana', active: true, breakfastLimitMinutes: 15, lunchLimitMinutes: 60, blocks: [{ startDayOffset: 0, start: '09:00', end: '17:00', endDayOffset: 0 }] }

const scrollIntoView = vi.fn()
let narrow = false

beforeEach(() => {
  vi.clearAllMocks()
  narrow = false
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({ matches: !narrow && query === '(min-width: 768px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/employees') return Promise.resolve([lucia])
    if (path === '/templates') return Promise.resolve([manana])
    if (path === '/employees/e-1/template-assignments') return Promise.resolve([])
    throw new Error(`GET inesperado: ${path}`)
  })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'matchMedia')
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('Empleados: easier for a shop owner', () => {
  // 2026-11-10, end-to-end check (#110): with a single site the box came unticked and "Crear empleado" stayed blocked.
  it('ticks the only site by default, also for the next employee', async () => {
    apiMocks.post.mockImplementation((_path: string, body: Record<string, unknown>) => Promise.resolve({ id: 'e-9', displayName: body.displayName, dni: body.dni, siteIds: body.siteIds, toleranceMinutes: 5, active: true, mustChangePassword: true }))
    render(<EmployeesView />)
    const box = await screen.findByRole('checkbox', { name: 'Local Centro' })
    await waitFor(() => expect(box).toBeChecked())
    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generar contraseña' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/employees', expect.objectContaining({ siteIds: ['s-1'] })))
    expect(await screen.findByText('Empleado creado.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Local Centro' })).toBeChecked()
  })

  it('generates a temporary password and shows it once after creating the employee', async () => {
    const storageWrites = vi.spyOn(Storage.prototype, 'setItem')
    apiMocks.post.mockImplementation((_path: string, body: Record<string, unknown>) => Promise.resolve({ id: 'e-9', displayName: body.displayName, dni: body.dni, siteIds: body.siteIds, toleranceMinutes: 5, active: true, mustChangePassword: true }))
    render(<EmployeesView />)
    fireEvent.change(await screen.findByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    await waitFor(async () => expect(await screen.findByRole('checkbox', { name: 'Local Centro' })).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: 'Generar contraseña' }))
    const field = screen.getByLabelText(/Contraseña provisoria/) as HTMLInputElement
    expect(field.value).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/)
    expect(field).toHaveAccessibleDescription(/Te la mostramos al crear el empleado/)
    const generated = field.value
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/employees', expect.objectContaining({ temporaryPassword: generated })))
    const region = await screen.findByRole('region', { name: 'Contraseña provisoria de Ana Gómez' })
    const panel = within(region)
    // Large, spaced code, and the keyboard lands on it (2026-11-09: it was small and focus stayed on the form below).
    expect(panel.getByText(generated)).toHaveClass('issued-password-code')
    await waitFor(() => expect(document.activeElement).toContainElement(region))
    expect(panel.getByText('Entregásela en persona; se pide cambiarla al ingresar.')).toBeInTheDocument()
    expect(storageWrites).not.toHaveBeenCalled()
    fireEvent.click(panel.getByRole('button', { name: 'Listo, ya la entregué' }))
    expect(screen.queryByText(generated)).not.toBeInTheDocument()
    storageWrites.mockRestore()
  })

  it('does not show a password the server did not use for an account that already existed', async () => {
    apiMocks.post.mockResolvedValueOnce({ id: 'e-9', displayName: 'Ana Gómez', dni: '30111222', siteIds: ['s-1'], toleranceMinutes: 5, active: true, mustChangePassword: false })
    render(<EmployeesView />)
    fireEvent.change(await screen.findByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    await waitFor(async () => expect(await screen.findByRole('checkbox', { name: 'Local Centro' })).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: 'Generar contraseña' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))
    expect(await screen.findByText('Empleado creado. Ese DNI ya tenía cuenta: sigue entrando con su contraseña de siempre.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Contraseña provisoria de/ })).not.toBeInTheDocument()
  })

  it('explains the tolerance minutes', async () => {
    render(<EmployeesView />)
    expect(await screen.findByLabelText('Minutos de tolerancia')).toHaveAccessibleDescription('Son los minutos que puede llegar tarde o salir antes o después sin que te avisemos.')
  })

  it('opens the horarios of an employee next to it, scrolled into view, from today by default', async () => {
    apiMocks.post.mockResolvedValueOnce({ id: 'a-1', employeeId: 'e-1', siteId: 's-1', templateId: 't-1', templateName: 'Mañana', validFrom: deviceDate(), createdAt: '2026-11-09T12:00:00Z' })
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' }))
    const panel = await screen.findByRole('region', { name: 'Horarios de Lucía Pérez' })
    const rows = screen.getAllByRole('row')
    const employeeRow = rows.findIndex((row) => row.textContent?.includes('30123456'))
    expect(rows[employeeRow + 1]).toContainElement(panel)
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    const inside = within(panel)
    expect(await inside.findByLabelText('Desde el día')).toHaveValue(deviceDate())
    fireEvent.change(inside.getByLabelText('Horario'), { target: { value: 't-1' } })
    fireEvent.click(inside.getByRole('button', { name: 'Asignar horario' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/employees/e-1/template-assignments', { templateId: 't-1', validFrom: deviceDate() }))
    expect(await screen.findByText('Horario asignado.')).toBeInTheDocument()
  })

  // Slice E6: under 768 px the people are records of a list (they were cards, `article`, until then).
  describe('on a phone (under 768 px)', () => {
    beforeEach(() => { narrow = true })

    it('lists the employees as records instead of the table', async () => {
      render(<EmployeesView />)
      const card = within(await screen.findByRole('listitem', { name: 'Lucía Pérez' }))
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(card.getByText('DNI 30123456')).toBeInTheDocument()
      expect(card.getByText('Locales: Local Centro')).toBeInTheDocument()
      expect(card.getByText('Minutos de tolerancia: 5')).toBeInTheDocument()
      expect(card.getByText('Activo')).toBeInTheDocument()
    })

    it('edits inside the record, outside any table, and saves with PATCH', async () => {
      apiMocks.patch.mockResolvedValueOnce({ ...lucia, toleranceMinutes: 10 })
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
      const card = within(screen.getByRole('listitem', { name: 'Lucía Pérez' }))
      const tolerance = card.getByRole('spinbutton', { name: 'Minutos de tolerancia del empleado con DNI 30123456' })
      expect(tolerance.closest('table')).toBeNull()
      fireEvent.change(tolerance, { target: { value: '10' } })
      fireEvent.click(card.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith('/employees/e-1', { displayName: 'Lucía Pérez', siteIds: ['s-1'], toleranceMinutes: 10, active: true }))
      expect(await screen.findByText('Minutos de tolerancia: 10')).toBeInTheDocument()
    })

    it('opens the horarios inside the record', async () => {
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' }))
      const card = within(screen.getByRole('listitem', { name: 'Lucía Pérez' }))
      expect(await card.findByRole('region', { name: 'Horarios de Lucía Pérez' })).toBeInTheDocument()
    })
  })
})

// Slice E6 (design system 4.7, 4.10, 4.12): «Equipo» with the pieces of the system. A form opens under the record it changes and
// says how it went inside itself, above its buttons; the state of a person is a tag; the password shown once is a result too.
describe('«Equipo» with the pieces of the system', () => {
  // clearAllMocks keeps the answers queued with mock…Once: one a test did not use must not reach the next one.
  beforeEach(() => { apiMocks.post.mockReset(); apiMocks.patch.mockReset() })
  const mario = { id: 'e-2', displayName: 'Mario Gómez', dni: '30999888', siteIds: ['s-1'], toleranceMinutes: 10, active: false }
  /** The row of the table that is the record of a person: the one with the DNI in its cells. */
  const recordRow = (dni: string) => screen.getAllByRole('row').find((row) => row.textContent?.includes(dni))!
  /** The full-width row under a record, where its forms, results and horarios open. */
  const underRow = (dni: string) => recordRow(dni).nextElementSibling as HTMLElement
  const follows = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
  const fillNewEmployee = async () => {
    fireEvent.change(await screen.findByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    await waitFor(async () => expect(await screen.findByRole('checkbox', { name: 'Local Centro' })).toBeChecked())
  }

  it('editing opens an inline form in a full-width row under the record of the table', async () => {
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
    const form = screen.getByRole('form', { name: 'Editar empleado Lucía Pérez' })

    // The record keeps showing what is saved; the draft lives in the form under it.
    expect(recordRow('30123456')).toHaveTextContent('Lucía Pérez')
    expect(underRow('30123456')).toContainElement(form)
    expect(form.closest('td')).toHaveAttribute('colspan', '6')
    expect(form).toHaveClass('inline-form')
    expect(within(form).getByRole('textbox', { name: 'Nombre del empleado con DNI 30123456' })).toHaveValue('Lucía Pérez')
  })

  // Slice G1 (WCAG 2.1.1): a table wider than its room scrolls inside its box, which the keyboard reaches by its name.
  it('a table wider than its room is a region named by its section that takes the focus', async () => {
    const scrollWidth = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(900)
    const clientWidth = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(600)
    try {
      render(<EmployeesView />)
      const table = await screen.findByRole('table', { name: 'Empleados (1)' })
      const box = table.parentElement!

      expect(box).toHaveClass('table-scroll')
      // The box is measured right after the table is drawn.
      await waitFor(() => expect(screen.getAllByRole('region', { name: 'Empleados (1)' })).toContain(box))
      expect(box).toHaveAttribute('tabindex', '0')
    } finally { scrollWidth.mockRestore(); clientWidth.mockRestore() }
  })

  it('editing opens an inline form under the record of the list on a phone', async () => {
    narrow = true
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
    const record = screen.getByRole('listitem', { name: 'Lucía Pérez' })
    const form = within(record).getByRole('form', { name: 'Editar empleado Lucía Pérez' })

    expect(form).toHaveClass('inline-form')
    expect(follows(record.querySelector('.record-title')!, form)).toBe(true)
    expect(form.closest('table')).toBeNull()
  })

  it('a failed save says so inside its form, above its buttons, and a saved one under the record', async () => {
    apiMocks.patch.mockRejectedValueOnce(new Error('No se pudo guardar.')).mockResolvedValueOnce({ ...lucia, toleranceMinutes: 10 })
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
    const form = screen.getByRole('form', { name: 'Editar empleado Lucía Pérez' })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))

    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo guardar.')
    expect(follows(alert, within(form).getByRole('button', { name: 'Guardar' }))).toBe(true)
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    const saved = await screen.findByText('Cambios del empleado guardados.')
    expect(screen.queryByRole('form', { name: 'Editar empleado Lucía Pérez' })).not.toBeInTheDocument()
    expect(underRow('30123456')).toContainElement(saved)
  })

  it('the add form\'s result is inside it, above its button', async () => {
    apiMocks.post.mockRejectedValueOnce(new Error('Esa persona ya tiene un rol en esta empresa.'))
    render(<EmployeesView />)
    await fillNewEmployee()
    const create = screen.getByRole('button', { name: 'Crear empleado' })
    fireEvent.click(create)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Esa persona ya tiene un rol en esta empresa.')
    expect(create.closest('form')).toContainElement(alert)
    expect(follows(alert, create)).toBe(true)
  })

  it('a created employee and the password to hand over show inside the add form', async () => {
    apiMocks.post.mockImplementation((_path: string, body: Record<string, unknown>) => Promise.resolve({ id: 'e-9', displayName: body.displayName, dni: body.dni, siteIds: body.siteIds, toleranceMinutes: 5, active: true, mustChangePassword: true }))
    render(<EmployeesView />)
    await fillNewEmployee()
    fireEvent.click(screen.getByRole('button', { name: 'Generar contraseña' }))
    const create = screen.getByRole('button', { name: 'Crear empleado' })
    fireEvent.click(create)

    const region = await screen.findByRole('region', { name: 'Contraseña provisoria de Ana Gómez' })
    const form = create.closest('form')!
    // A success message writes its text right after it mounts (PageMessage), so it is awaited.
    expect(await within(form).findByText('Empleado creado.')).toBeInTheDocument()
    expect(form).toContainElement(region)
    expect(follows(region, create)).toBe(true)
  })

  it('a person\'s state is a StatusTag, in the table and in the list', async () => {
    apiMocks.get.mockImplementation((path: string) => path === '/employees' ? Promise.resolve([lucia, mario]) : path === '/sites' ? Promise.resolve([site]) : Promise.resolve([]))
    const expectTag = (scope: HTMLElement, tone: string, word: string) => {
      const tag = scope.querySelector('.status-chip')
      expect(tag).toHaveClass(`status-${tone}`)
      expect(tag).toHaveTextContent(word)
      expect(tag?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    render(<EmployeesView />)
    await screen.findByText('Mario Gómez')
    expectTag(recordRow('30123456'), 'neutral', 'Activo')
    expectTag(recordRow('30999888'), 'wait', 'Inactivo')
    cleanup()

    narrow = true
    render(<EmployeesView />)
    expectTag(await screen.findByRole('listitem', { name: 'Lucía Pérez' }), 'neutral', 'Activo')
    expectTag(screen.getByRole('listitem', { name: 'Mario Gómez' }), 'wait', 'Inactivo')
  })

  it('the confirmation and the result of a reset open under the record of the person', async () => {
    apiMocks.post.mockResolvedValueOnce({ temporaryPassword: 'Abcd-Efgh-Jkmn-Pqrs' })
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' }))
    const confirm = screen.getByRole('button', { name: 'Confirmar restablecimiento' })
    expect(underRow('30123456')).toContainElement(confirm)
    fireEvent.click(confirm)

    const region = await screen.findByRole('region', { name: 'Contraseña provisoria de Lucía Pérez' })
    expect(underRow('30123456')).toContainElement(region)
    expect(within(region).getByText('Abcd-Efgh-Jkmn-Pqrs')).toHaveClass('issued-password-code')
  })

  it('the result of a reset opens inside the record of the person on a phone', async () => {
    narrow = true
    apiMocks.post.mockResolvedValueOnce({ temporaryPassword: 'Abcd-Efgh-Jkmn-Pqrs' })
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))

    const region = await screen.findByRole('region', { name: 'Contraseña provisoria de Lucía Pérez' })
    expect(screen.getByRole('listitem', { name: 'Lucía Pérez' })).toContainElement(region)
  })

  it('a refused reset says so under the record of the person', async () => {
    apiMocks.post.mockRejectedValueOnce(new Error('Esta persona también tiene acceso en otra empresa o como ADMIN; su contraseña la restablece el operador.'))
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))

    expect(underRow('30123456')).toContainElement(await screen.findByRole('alert'))
  })

  it('a schedule assigned says so inside the form of the horarios, above its button', async () => {
    apiMocks.post.mockResolvedValueOnce({ id: 'a-1', employeeId: 'e-1', siteId: 's-1', templateId: 't-1', templateName: 'Mañana', validFrom: deviceDate(), createdAt: '2026-11-09T12:00:00Z' })
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' }))
    const panel = within(await screen.findByRole('region', { name: 'Horarios de Lucía Pérez' }))
    fireEvent.change(await panel.findByLabelText('Horario'), { target: { value: 't-1' } })
    const assign = panel.getByRole('button', { name: 'Asignar horario' })
    fireEvent.click(assign)

    const notice = await panel.findByText('Horario asignado.')
    expect(assign.closest('form')).toContainElement(notice)
    expect(follows(notice, assign)).toBe(true)
  })
})

// Slice F1 (WCAG 2.4.3; finding F-27, gap left by E6): a form of a record takes the focus when it opens, and gives it back to
// the button that opened it when it closes. That button is hidden while its form is open, so the focus waits for it to return.
describe('«Equipo»: where the focus goes when a form of a person opens and closes', () => {
  beforeEach(() => { apiMocks.post.mockReset(); apiMocks.patch.mockReset() })
  const editButton = () => screen.getByRole('button', { name: 'Editar empleado Lucía Pérez' })
  const resetButton = () => screen.getByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' })

  it('«Editar» takes the focus to the name; «Cancelar» gives it back to «Editar»', async () => {
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
    const form = screen.getByRole('form', { name: 'Editar empleado Lucía Pérez' })

    await waitFor(() => expect(within(form).getByRole('textbox', { name: 'Nombre del empleado con DNI 30123456' })).toHaveFocus())
    fireEvent.click(within(form).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(editButton()).toHaveFocus())
  })

  it('a saved edit gives the focus back to «Editar»; a failed one keeps the form open', async () => {
    apiMocks.patch.mockRejectedValueOnce(new Error('No se pudo guardar.')).mockResolvedValueOnce({ ...lucia, toleranceMinutes: 10 })
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
    const form = screen.getByRole('form', { name: 'Editar empleado Lucía Pérez' })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('No se pudo guardar.')
    expect(screen.queryByRole('button', { name: 'Editar empleado Lucía Pérez' })).not.toBeInTheDocument()

    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(editButton()).toHaveFocus())
  })

  it('«Restablecer contraseña» takes the focus to what the reset does, never to the button that confirms it; «Cancelar» gives it back', async () => {
    narrow = true
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' }))

    const explanation = screen.getByText('Se cierran todas sus sesiones y se genera una contraseña provisoria.')
    await waitFor(() => expect(explanation).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Confirmar restablecimiento' })).not.toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar restablecimiento' }))
    await waitFor(() => expect(resetButton()).toHaveFocus())
  })

  it('a refused reset gives the focus back to «Restablecer contraseña», next to its message', async () => {
    apiMocks.post.mockRejectedValueOnce(new Error('Esta persona también tiene acceso en otra empresa o como ADMIN; su contraseña la restablece el operador.'))
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() => expect(resetButton()).toHaveFocus())
  })

  it('once the password of a reset is handed over, the focus goes back to «Restablecer contraseña»', async () => {
    apiMocks.post.mockResolvedValueOnce({ temporaryPassword: 'Abcd-Efgh-Jkmn-Pqrs' })
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restablecer contraseña de Lucía Pérez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar restablecimiento' }))
    const region = await screen.findByRole('region', { name: 'Contraseña provisoria de Lucía Pérez' })
    await waitFor(() => expect(region).toHaveFocus())

    fireEvent.click(within(region).getByRole('button', { name: 'Listo, ya la entregué' }))
    await waitFor(() => expect(resetButton()).toHaveFocus())
  })

  it('once the password of a new employee is handed over, the focus goes back to the first field of the add form', async () => {
    apiMocks.post.mockImplementation((_path: string, body: Record<string, unknown>) => Promise.resolve({ id: 'e-9', displayName: body.displayName, dni: body.dni, siteIds: body.siteIds, toleranceMinutes: 5, active: true, mustChangePassword: true }))
    render(<EmployeesView />)
    fireEvent.change(await screen.findByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    await waitFor(async () => expect(await screen.findByRole('checkbox', { name: 'Local Centro' })).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: 'Generar contraseña' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))
    const region = await screen.findByRole('region', { name: 'Contraseña provisoria de Ana Gómez' })

    fireEvent.click(within(region).getByRole('button', { name: 'Listo, ya la entregué' }))
    await waitFor(() => expect(screen.getByLabelText('Nombre y apellido')).toHaveFocus())
  })

  it('«Cerrar» of the horarios gives the focus back to «Horarios», which opened them', async () => {
    render(<EmployeesView />)
    const opener = await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' })
    opener.focus()
    fireEvent.click(opener)
    const panel = await screen.findByRole('region', { name: 'Horarios de Lucía Pérez' })
    // A disclosure: the focus stays on its button while the horarios come into view.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(opener).toHaveFocus()

    // A click focuses the button it presses; fireEvent does not, so the test does it.
    const close = within(panel).getByRole('button', { name: 'Cerrar' })
    close.focus()
    fireEvent.click(close)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Horarios de Lucía Pérez' })).toHaveFocus())
  })
})

// Slice F2b (design system 4.3 and 4.7; finding F-09): the forms of «Equipo» are checked on submit, each error under its field.
describe('Empleados: one validation style', () => {
  const norte = { id: 's-2', name: 'Local Norte', timeZone: 'America/Argentina/Buenos_Aires' }
  const createButton = () => screen.getByRole('button', { name: 'Crear empleado' })

  it('an empty add form explains each field, sums it up above the button and focuses the first field', async () => {
    const previous = apiMocks.get.getMockImplementation()!
    apiMocks.get.mockImplementation((path: string) => path === '/sites' ? Promise.resolve([site, norte]) : previous(path))
    render(<EmployeesView />)
    await screen.findByRole('checkbox', { name: 'Local Norte' })
    const form = createButton().closest('form')!
    expect(form).toHaveAttribute('novalidate')
    expect(createButton()).toBeEnabled()
    fireEvent.click(createButton())

    const name = screen.getByLabelText('Nombre y apellido')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription('Escribí el nombre y apellido.')
    expect(screen.getByLabelText('DNI')).toHaveAccessibleDescription('Escribí el DNI.')
    const sites = screen.getByRole('group', { name: 'Locales donde trabaja' })
    expect(sites).toHaveAttribute('aria-invalid', 'true')
    expect(sites).toHaveAccessibleDescription('Marcá al menos un local para crear el empleado.')
    const summary = within(form).getByRole('alert')
    expect(summary).toHaveTextContent('Revisá lo que está marcado debajo de cada campo.')
    expect(summary.compareDocumentPosition(createButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await waitFor(() => expect(name).toHaveFocus())
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('checks the DNI length, the tolerance and a short temporary password before sending', async () => {
    render(<EmployeesView />)
    await waitFor(async () => expect(await screen.findByRole('checkbox', { name: 'Local Centro' })).toBeChecked())
    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '301' } })
    fireEvent.change(screen.getByLabelText('Minutos de tolerancia'), { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText(/Contraseña provisoria/), { target: { value: 'corta' } })
    fireEvent.click(createButton())

    const dni = screen.getByLabelText('DNI')
    expect(dni).toHaveAccessibleDescription('El DNI tiene que tener de 7 a 12 números.')
    expect(screen.getByLabelText('Minutos de tolerancia')).toHaveAccessibleDescription(expect.stringContaining('Poné un número de 0 a 240.'))
    expect(screen.getByLabelText(/Contraseña provisoria/)).toHaveAccessibleDescription(expect.stringContaining('La contraseña provisoria tiene que tener al menos 12 caracteres.'))
    await waitFor(() => expect(dni).toHaveFocus())
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('a refused add shows the server message inside the form, above its button, and takes the focus there', async () => {
    apiMocks.post.mockReset()
    apiMocks.post.mockRejectedValueOnce(new Error('Ese DNI ya está en esta empresa.'))
    render(<EmployeesView />)
    await waitFor(async () => expect(await screen.findByRole('checkbox', { name: 'Local Centro' })).toBeChecked())
    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    // Taken before the click: the button reads «Guardando…» while the request runs.
    const form = createButton().closest('form')!
    fireEvent.click(createButton())

    const failure = await within(form).findByRole('alert')
    expect(failure).toHaveTextContent('Ese DNI ya está en esta empresa.')
    await waitFor(() => expect(failure).toHaveFocus())
  })

  it('an edit without locals explains it on the group and keeps «Guardar» enabled', async () => {
    render(<EmployeesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
    const form = screen.getByRole('form', { name: 'Editar empleado Lucía Pérez' })
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Local Centro (DNI 30123456)' }))
    const save = within(form).getByRole('button', { name: 'Guardar' })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    const sites = within(form).getByRole('group', { name: 'Locales donde trabaja' })
    expect(sites).toHaveAccessibleDescription('Marcá al menos un local.')
    await waitFor(() => expect(within(form).getByRole('checkbox', { name: 'Local Centro (DNI 30123456)' })).toHaveFocus())
    expect(apiMocks.patch).not.toHaveBeenCalled()
  })
})
