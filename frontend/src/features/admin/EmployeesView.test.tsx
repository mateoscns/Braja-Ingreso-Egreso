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
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({ matches: narrow && query === '(max-width: 520px)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
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
  it('generates a temporary password and shows it once after creating the employee', async () => {
    const storageWrites = vi.spyOn(Storage.prototype, 'setItem')
    apiMocks.post.mockImplementation((_path: string, body: Record<string, unknown>) => Promise.resolve({ id: 'e-9', displayName: body.displayName, dni: body.dni, siteIds: body.siteIds, toleranceMinutes: 5, active: true, mustChangePassword: true }))
    render(<EmployeesView />)
    fireEvent.change(await screen.findByLabelText('Nombre y apellido'), { target: { value: 'Ana Gómez' } })
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30111222' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Local Centro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generar contraseña' }))
    const field = screen.getByLabelText(/Contraseña provisoria/) as HTMLInputElement
    expect(field.value).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/)
    expect(field).toHaveAccessibleDescription(/Te la mostramos al crear el empleado/)
    const generated = field.value
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/employees', expect.objectContaining({ temporaryPassword: generated })))
    const panel = within(await screen.findByRole('region', { name: 'Contraseña provisoria de Ana Gómez' }))
    expect(panel.getByText(generated)).toBeInTheDocument()
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
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Local Centro' }))
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

  describe('on a phone (520 px or less)', () => {
    beforeEach(() => { narrow = true })

    it('lists the employees as cards instead of the table', async () => {
      render(<EmployeesView />)
      const card = within(await screen.findByRole('article', { name: 'Lucía Pérez' }))
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(card.getByText('DNI 30123456')).toBeInTheDocument()
      expect(card.getByText('Locales: Local Centro')).toBeInTheDocument()
      expect(card.getByText('Minutos de tolerancia: 5')).toBeInTheDocument()
      expect(card.getByText('Activo')).toBeInTheDocument()
    })

    it('edits inside the card, outside any table, and saves with PATCH', async () => {
      apiMocks.patch.mockResolvedValueOnce({ ...lucia, toleranceMinutes: 10 })
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Editar empleado Lucía Pérez' }))
      const card = within(screen.getByRole('article', { name: 'Lucía Pérez' }))
      const tolerance = card.getByRole('spinbutton', { name: 'Minutos de tolerancia del empleado con DNI 30123456' })
      expect(tolerance.closest('table')).toBeNull()
      fireEvent.change(tolerance, { target: { value: '10' } })
      fireEvent.click(card.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith('/employees/e-1', { displayName: 'Lucía Pérez', siteIds: ['s-1'], toleranceMinutes: 10, active: true }))
      expect(await screen.findByText('Minutos de tolerancia: 10')).toBeInTheDocument()
    })

    it('opens the horarios inside the card', async () => {
      render(<EmployeesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Horarios de Lucía Pérez' }))
      const card = within(screen.getByRole('article', { name: 'Lucía Pérez' }))
      expect(await card.findByRole('region', { name: 'Horarios de Lucía Pérez' })).toBeInTheDocument()
    })
  })
})
