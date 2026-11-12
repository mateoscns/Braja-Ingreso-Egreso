import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchedulesView } from './SchedulesView'
import { deviceDate } from '../../shared/dateRange'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))
vi.mock('../../shared/api/client', () => ({ api: apiMocks, queryString: () => '' }))

const centro = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires' }
const norte = { id: 's-2', name: 'Local Norte', timeZone: 'America/Argentina/Buenos_Aires' }
const manana = {
  id: 't-1', siteId: 's-1', name: 'Mañana', active: true, breakfastLimitMinutes: 15, lunchLimitMinutes: 60,
  blocks: [{ startDayOffset: 0 as const, start: '09:00:00', end: '17:00:00', endDayOffset: 0 as const }]
}
const ana = { id: 'e-1', displayName: 'Ana', dni: '30111111', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const juan = { id: 'e-2', displayName: 'Juan', dni: '30222222', siteIds: ['s-1', 's-2'], toleranceMinutes: 5, active: true }
const pedro = { id: 'e-3', displayName: 'Pedro', dni: '30333333', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const baja = { id: 'e-4', displayName: 'Dado de baja', dni: '30444444', siteIds: ['s-1'], toleranceMinutes: 5, active: false }
const otroLocal = { id: 'e-5', displayName: 'Solo Norte', dni: '30555555', siteIds: ['s-2'], toleranceMinutes: 5, active: true }

function serve({ sites = [centro], templates = [manana] as unknown[] } = {}) {
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve(sites)
    if (path === '/templates') return Promise.resolve(templates)
    if (path === '/employees') return Promise.resolve([ana, juan, pedro, baja, otroLocal])
    throw new Error(`GET inesperado: ${path}`)
  })
}

const savedFrom = (payload: Record<string, unknown>, id = 't-9') => ({ id, active: true, ...payload })

beforeEach(() => {
  vi.clearAllMocks()
  serve()
  apiMocks.post.mockImplementation((path: string, body: Record<string, unknown>) => Promise.resolve(path === '/templates' ? savedFrom(body) : { id: 'a-1', ...body }))
  apiMocks.patch.mockImplementation((path: string, body: Record<string, unknown>) => Promise.resolve(savedFrom(body, path.split('/').pop())))
})
afterEach(() => cleanup())

const form = () => within(screen.getByRole('region', { name: 'Crear un horario' }))

describe('Horarios: a schedule a shop owner understands', () => {
  it('names the screen Horarios and lists the horarios of this local without the Activa chip', async () => {
    serve({ templates: [manana, { ...manana, id: 't-2', name: 'Vieja', active: false }] })
    render(<SchedulesView />)
    expect(screen.getByRole('heading', { level: 1, name: 'Horarios' })).toBeInTheDocument()
    const list = within(await screen.findByRole('region', { name: 'Horarios de este local' }))
    expect(await list.findByText('Mañana')).toBeInTheDocument()
    expect(list.getAllByText('09:00–17:00')).toHaveLength(2)
    expect(list.queryByText('Activa')).not.toBeInTheDocument()
    expect(list.getByText('Inactivo')).toBeInTheDocument()
  })

  it('shows the empty state and hides Local when there is only one local', async () => {
    serve({ templates: [] })
    render(<SchedulesView />)
    expect(await screen.findByText('Este local todavía no tiene horarios. Creá el primero.')).toBeInTheDocument()
    expect(form().queryByLabelText('Local')).not.toBeInTheDocument()
  })

  it('creates a cortado schedule from its card with the days computed and a live preview', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    fireEvent.click(form().getByRole('radio', { name: /^Cortado/ }))
    expect(form().getByRole('radio', { name: /^Cortado/ })).toBeChecked()
    expect(form().getByLabelText('Nombre del horario')).toHaveValue('Cortado')
    const tramo2 = within(form().getByRole('group', { name: 'Tramo 2' }))
    expect(tramo2.getByLabelText('Entra a las')).toHaveValue('17:00')
    expect(tramo2.getByLabelText('Sale a las')).toHaveValue('21:00')
    const preview = within(form().getByRole('list', { name: 'Así queda el horario' }))
    expect(preview.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['09:00–13:00', '17:00–21:00', 'desayuno hasta 15 min', 'almuerzo hasta 60 min'])
    expect(form().queryByText(/horas en total/)).not.toBeInTheDocument()

    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/templates', {
      siteId: 's-1', name: 'Cortado', breakfastLimitMinutes: 15, lunchLimitMinutes: 60,
      blocks: [{ startDayOffset: 0, start: '09:00', end: '13:00', endDayOffset: 0 }, { startDayOffset: 0, start: '17:00', end: '21:00', endDayOffset: 0 }]
    }))
    expect(await screen.findByText('Horario «Cortado» creado.')).toBeInTheDocument()
  })

  it('computes the next day for a night schedule and says it next to the field', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    fireEvent.click(form().getByRole('radio', { name: /^De noche/ }))
    const tramo1 = within(form().getByRole('group', { name: 'Tramo 1' }))
    expect(tramo1.getByLabelText('Sale a las')).toHaveAccessibleDescription('Sale al día siguiente (06:00).')
    expect(form().queryByLabelText(/el día$/)).not.toBeInTheDocument()
    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/templates', expect.objectContaining({
      blocks: [{ startDayOffset: 0, start: '22:00', end: '06:00', endDayOffset: 1 }]
    })))
  })

  it('reports each mistake next to its tramo and sends nothing', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    fireEvent.click(form().getByRole('radio', { name: /^Cortado/ }))
    const tramo2 = within(form().getByRole('group', { name: 'Tramo 2' }))
    fireEvent.change(tramo2.getByLabelText('Entra a las'), { target: { value: '12:00' } })
    fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: '' } })
    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))

    expect(tramo2.getByLabelText('Entra a las')).toHaveAttribute('aria-invalid', 'true')
    expect(tramo2.getByLabelText('Entra a las')).toHaveAccessibleDescription('El tramo 2 empieza antes de que termine el 1.')
    // Changed in slice F2b: the error is the field's own, under the control, and the example stays as its hint.
    expect(form().getByLabelText('Nombre del horario')).toHaveAccessibleDescription('Ej.: Mañana, Turno noche Escribí un nombre para el horario.')
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá lo que está marcado debajo de cada campo.')
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('adds up to four tramos and removes one', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    const add = form().getByRole('button', { name: 'Agregar otro tramo' })
    fireEvent.click(add); fireEvent.click(add); fireEvent.click(add)
    expect(form().getAllByRole('group', { name: /^Tramo \d$/ })).toHaveLength(4)
    expect(add).toBeDisabled()
    fireEvent.click(within(form().getByRole('group', { name: 'Tramo 4' })).getByRole('button', { name: 'Quitar este tramo' }))
    expect(form().getAllByRole('group', { name: /^Tramo \d$/ })).toHaveLength(3)
  })

  it('explains the pause minutes, including what 0 means', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    expect(form().getByLabelText('Minutos para desayunar')).toHaveAccessibleDescription('Si la pausa dura más, te avisamos en Para revisar. Con 0, te avisamos de cualquier pausa.')
    expect(form().getByLabelText('Minutos para almorzar')).toHaveAccessibleDescription('Si la pausa dura más, te avisamos en Para revisar. Con 0, te avisamos de cualquier pausa.')
    fireEvent.change(form().getByLabelText('Minutos para desayunar'), { target: { value: '300' } })
    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
    expect(form().getByLabelText('Minutos para desayunar')).toHaveAccessibleDescription('Poné un número de 0 a 240.')
  })

  it('keeps the typed data when the Local changes and lists the horarios of the chosen local', async () => {
    serve({ sites: [centro, norte] })
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    expect(form().getByLabelText('Local')).toHaveValue('s-1')
    fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: 'Tarde' } })
    fireEvent.change(within(form().getByRole('group', { name: 'Tramo 1' })).getByLabelText('Entra a las'), { target: { value: '13:00' } })
    fireEvent.change(form().getByLabelText('Local'), { target: { value: 's-2' } })

    expect(form().getByLabelText('Nombre del horario')).toHaveValue('Tarde')
    expect(within(form().getByRole('group', { name: 'Tramo 1' })).getByLabelText('Entra a las')).toHaveValue('13:00')
    expect(await screen.findByText('Este local todavía no tiene horarios. Creá el primero.')).toBeInTheDocument()
    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/templates', expect.objectContaining({ siteId: 's-2', name: 'Tarde' })))
  })

  it('changes a horario in place inside its card and warns that loaded days keep the old one', async () => {
    render(<SchedulesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar horario Mañana' }))
    const card = within(screen.getByRole('listitem', { name: 'Mañana' }))
    expect(card.getByText('Los días que ya cargaste mantienen el horario anterior.')).toBeInTheDocument()
    expect(card.getByLabelText('Nombre del horario')).toHaveValue('Mañana')
    fireEvent.change(card.getByLabelText('Sale a las'), { target: { value: '18:00' } })
    fireEvent.click(card.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith('/templates/t-1', {
      siteId: 's-1', name: 'Mañana', breakfastLimitMinutes: 15, lunchLimitMinutes: 60,
      blocks: [{ startDayOffset: 0, start: '09:00', end: '18:00', endDayOffset: 0 }]
    }))
    expect(await screen.findByText('Horario «Mañana» actualizado.')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Mañana' })).getByText('09:00–18:00')).toBeInTheDocument()
  })

  it('keeps the hand-typed days of an old horario under Opciones avanzadas', async () => {
    const legacy = { ...manana, id: 't-3', name: 'Partido', blocks: [
      { startDayOffset: 0 as const, start: '09:00:00', end: '13:00:00', endDayOffset: 0 as const },
      { startDayOffset: 1 as const, start: '14:00:00', end: '18:00:00', endDayOffset: 1 as const }
    ] }
    serve({ templates: [legacy] })
    render(<SchedulesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar horario Partido' }))
    const card = within(screen.getByRole('listitem', { name: 'Partido' }))
    expect(card.getByText('Opciones avanzadas')).toBeInTheDocument()
    expect(card.getByLabelText('Tramo 2: entra el día')).toHaveValue('1')
    fireEvent.click(card.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(apiMocks.patch).toHaveBeenCalledWith('/templates/t-3', expect.objectContaining({
      blocks: [{ startDayOffset: 0, start: '09:00', end: '13:00', endDayOffset: 0 }, { startDayOffset: 1, start: '14:00', end: '18:00', endDayOffset: 1 }]
    })))
  })

  it('a horario the computation reproduces shows no day options', async () => {
    render(<SchedulesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar horario Mañana' }))
    expect(within(screen.getByRole('listitem', { name: 'Mañana' })).queryByText('Opciones avanzadas')).not.toBeInTheDocument()
  })

  describe('¿Quién trabaja con este horario? after saving', () => {
    async function createCorrido() {
      render(<SchedulesView />)
      await screen.findByText('Mañana')
      fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: 'Corrido' } })
      fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
      return within(await screen.findByRole('region', { name: '¿Quién trabaja con este horario?' }))
    }

    it('offers the active employees of the local, today by default, and assigns each checked one', async () => {
      apiMocks.post.mockImplementation((path: string, body: Record<string, unknown>) => {
        if (path === '/templates') return Promise.resolve(savedFrom(body))
        if (path === '/employees/e-3/template-assignments') return Promise.reject(Object.assign(new Error('existe'), { status: 409, code: 'ASSIGNMENT_EXISTS' }))
        return Promise.resolve({ id: 'a-1', ...body })
      })
      const step = await createCorrido()
      expect(step.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(['Ana', 'Juan', 'Pedro'])
      expect(step.getByLabelText('Desde el día')).toHaveValue(deviceDate())
      // Changed in slice F2b (finding F-09): «Asignar» is enabled; with nobody checked it says so on the people.
      expect(step.getByRole('button', { name: 'Asignar' })).toBeEnabled()
      fireEvent.click(step.getByRole('checkbox', { name: 'Ana' }))
      fireEvent.click(step.getByRole('checkbox', { name: 'Juan' }))
      fireEvent.click(step.getByRole('checkbox', { name: 'Pedro' }))
      fireEvent.change(step.getByLabelText('Desde el día'), { target: { value: '2026-11-16' } })
      fireEvent.click(step.getByRole('button', { name: 'Asignar' }))

      expect(await step.findByText('Listo: asignado a Ana y Juan.')).toBeInTheDocument()
      expect(step.getByText('Pedro ya tenía un horario desde ese día. Para cambiarlo, elegí otro día.')).toBeInTheDocument()
      for (const id of ['e-1', 'e-2', 'e-3']) expect(apiMocks.post).toHaveBeenCalledWith(`/employees/${id}/template-assignments`, { templateId: 't-9', validFrom: '2026-11-16' })
      expect(apiMocks.post).toHaveBeenCalledTimes(4)
    })

    it('can be skipped and brings the empty form back', async () => {
      const step = await createCorrido()
      fireEvent.click(step.getByRole('button', { name: 'Ahora no' }))
      expect(screen.queryByRole('region', { name: '¿Quién trabaja con este horario?' })).not.toBeInTheDocument()
      expect(form().getByLabelText('Nombre del horario')).toHaveValue('')
      expect(apiMocks.post).toHaveBeenCalledTimes(1)
    })

    it('opens inside the card after changing a horario', async () => {
      render(<SchedulesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Cambiar horario Mañana' }))
      fireEvent.click(within(screen.getByRole('listitem', { name: 'Mañana' })).getByRole('button', { name: 'Guardar cambios' }))
      const card = within(await screen.findByRole('listitem', { name: 'Mañana' }))
      expect(await card.findByRole('region', { name: '¿Quién trabaja con este horario?' })).toBeInTheDocument()
    })

    it('shows the result of assigning inside its form, right above its buttons', async () => {
      const step = await createCorrido()
      fireEvent.click(step.getByRole('checkbox', { name: 'Ana' }))
      fireEvent.click(step.getByRole('button', { name: 'Asignar' }))
      const result = await step.findByText('Listo: asignado a Ana.')
      expect(aboveTheButtons(result)).toContainElement(step.getByRole('button', { name: 'Asignar' }))
    })
  })

  // Slice E5 (design system 4.5, 4.7, 4.12): the pieces of the system on «Horarios».
  describe('built with the pieces of the design system', () => {
    it('names the type of schedule as a group of option tiles, one chosen at a time', async () => {
      render(<SchedulesView />)
      await screen.findByText('Mañana')
      const types = form().getByRole('group', { name: '¿Cómo es este horario?' })
      const radios = within(types).getAllByRole('radio')

      expect(radios.map((radio) => radio.closest('label')?.className)).toEqual(['choice', 'choice', 'choice'])
      expect(within(types).getByRole('radio', { name: /^Corrido/ })).toBeChecked()
      expect(within(types).getByRole('radio', { name: /^De noche/ })).toHaveAccessibleName('De noche: De 22:00 a 06:00 del día siguiente')
      expect(types).toHaveAccessibleDescription('Elegí el que más se parece. Después podés cambiar las horas.')
      fireEvent.click(within(types).getByRole('radio', { name: /^Cortado/ }))
      expect(within(types).getByRole('radio', { name: /^Cortado/ })).toBeChecked()
      expect(within(types).getByRole('radio', { name: /^Corrido/ })).not.toBeChecked()
    })

    it('lists each horario as a record whose action is a link under it', async () => {
      serve({ templates: [manana, { ...manana, id: 't-2', name: 'Vieja', active: false }] })
      render(<SchedulesView />)
      const record = await screen.findByRole('listitem', { name: 'Mañana' })

      expect(record).toHaveClass('record')
      expect(record.parentElement).toHaveClass('record-list')
      const change = within(record).getByRole('button', { name: 'Cambiar horario Mañana' })
      expect(change).toHaveClass('button-link')
      expect(change.parentElement).toHaveClass('record-actions')
      expect(within(screen.getByRole('listitem', { name: 'Vieja' })).getByText('Inactivo')).toHaveClass('status-chip', 'status-wait')
    })

    it('shows the mistakes and the answer of the server inside the form, right above its buttons', async () => {
      apiMocks.post.mockImplementation(() => Promise.reject(new Error('Ya hay un horario con ese nombre.')))
      apiMocks.patch.mockImplementation(() => Promise.reject(new Error('No se pudo guardar el horario.')))
      render(<SchedulesView />)
      await screen.findByText('Mañana')
      fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: '' } })
      // Changed in slice F2b: the summary is for two or more mistakes (design system 4.7), so two fields are left wrong.
      fireEvent.change(form().getByLabelText('Minutos para almorzar'), { target: { value: '' } })
      fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
      expect(aboveTheButtons(form().getByRole('alert'))).toContainElement(form().getByRole('button', { name: 'Crear horario' }))

      fireEvent.change(form().getByLabelText('Minutos para almorzar'), { target: { value: '60' } })
      fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: 'Tarde' } })
      fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
      expect(aboveTheButtons(await form().findByText('Ya hay un horario con ese nombre.'))).toContainElement(form().getByRole('button', { name: 'Crear horario' }))

      fireEvent.click(screen.getByRole('button', { name: 'Cambiar horario Mañana' }))
      const record = within(screen.getByRole('listitem', { name: 'Mañana' }))
      fireEvent.click(record.getByRole('button', { name: 'Guardar cambios' }))
      expect(aboveTheButtons(await record.findByText('No se pudo guardar el horario.'))).toContainElement(record.getByRole('button', { name: 'Guardar cambios' }))
    })

    it('says a horario was saved where it was saved, not at the top of the page', async () => {
      render(<SchedulesView />)
      await screen.findByText('Mañana')
      fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: 'Corrido' } })
      fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
      const step = within(await screen.findByRole('region', { name: '¿Quién trabaja con este horario?' }))
      // A success message writes its text one effect after it mounts (PageMessage): wait for it.
      expect(await step.findByText('Horario «Corrido» creado.')).toBeInTheDocument()

      fireEvent.click(step.getByRole('button', { name: 'Ahora no' }))
      expect(aboveTheButtons(await form().findByText('Horario «Corrido» creado.'))).toContainElement(form().getByRole('button', { name: 'Crear horario' }))

      fireEvent.click(screen.getByRole('button', { name: 'Cambiar horario Mañana' }))
      fireEvent.click(within(screen.getByRole('listitem', { name: 'Mañana' })).getByRole('button', { name: 'Guardar cambios' }))
      const record = within(await screen.findByRole('listitem', { name: 'Mañana' }))
      expect(await record.findByText('Horario «Mañana» actualizado.')).toBeInTheDocument()
      expect(screen.queryByText('Horario «Corrido» creado.')).not.toBeInTheDocument()
    })
  })

  // Slice F1 (WCAG 2.4.3; finding F-27, gap left by E5): a form that opens takes the focus, and the focus comes back to the
  // button that opened it when it closes; a step that replaces a form takes the focus in its place.
  describe('where the focus goes', () => {
    const changeButton = () => screen.getByRole('button', { name: 'Cambiar horario Mañana' })
    const step = () => within(screen.getByRole('region', { name: '¿Quién trabaja con este horario?' }))

    it('«Cambiar horario» takes the focus to the name; «Cancelar» gives it back to «Cambiar horario»', async () => {
      render(<SchedulesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Cambiar horario Mañana' }))
      const card = within(screen.getByRole('listitem', { name: 'Mañana' }))

      await waitFor(() => expect(card.getByLabelText('Nombre del horario')).toHaveFocus())
      fireEvent.click(card.getByRole('button', { name: 'Cancelar' }))
      await waitFor(() => expect(changeButton()).toHaveFocus())
    })

    it('saving a change takes the focus into the step that follows, and closing the step gives it back to «Cambiar horario»', async () => {
      render(<SchedulesView />)
      fireEvent.click(await screen.findByRole('button', { name: 'Cambiar horario Mañana' }))
      fireEvent.click(within(screen.getByRole('listitem', { name: 'Mañana' })).getByRole('button', { name: 'Guardar cambios' }))

      await screen.findByRole('region', { name: '¿Quién trabaja con este horario?' })
      await waitFor(() => expect(step().getByRole('checkbox', { name: 'Ana' })).toHaveFocus())
      fireEvent.click(step().getByRole('button', { name: 'Ahora no' }))
      await waitFor(() => expect(changeButton()).toHaveFocus())
    })

    it('creating a horario takes the focus into the step that replaces the form, and closing it takes it back to the form', async () => {
      render(<SchedulesView />)
      await screen.findByText('Mañana')
      fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: 'Corrido' } })
      fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))

      await screen.findByRole('region', { name: '¿Quién trabaja con este horario?' })
      await waitFor(() => expect(step().getByRole('checkbox', { name: 'Ana' })).toHaveFocus())
      fireEvent.click(step().getByRole('button', { name: 'Ahora no' }))
      // The first control of the form is the chosen type of horario.
      await waitFor(() => expect(form().getByRole('radio', { name: /^Corrido/ })).toHaveFocus())
    })
  })
})

// Slice F2b (design system 4.3 and 4.7; finding F-09): the errors of a horario are the errors of their fields, under the control.
describe('Horarios: one validation style', () => {
  it('a failed save focuses the first field to fix, and each error is the error of its field', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: '' } })
    fireEvent.change(form().getByLabelText('Minutos para almorzar'), { target: { value: '999' } })
    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))

    const name = form().getByLabelText('Nombre del horario')
    await waitFor(() => expect(name).toHaveFocus())
    const nameField = name.closest('.field')!
    expect(nameField).toHaveClass('field-invalid')
    expect(nameField.querySelector('.field-error')).toHaveTextContent('Escribí un nombre para el horario.')
    expect(nameField.querySelector('.field-hint-error')).toBeNull()
    expect(form().getByLabelText('Minutos para almorzar').closest('.field')).toHaveClass('field-invalid')
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá lo que está marcado debajo de cada campo.')
  })

  it('one wrong field needs no summary: its own error says it', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: 'Corrido' } })
    fireEvent.change(form().getByLabelText('Minutos para desayunar'), { target: { value: '300' } })
    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))

    await waitFor(() => expect(form().getByLabelText('Minutos para desayunar')).toHaveFocus())
    expect(screen.queryByText('Revisá lo que está marcado debajo de cada campo.')).not.toBeInTheDocument()
  })

  it('without a local, «Crear horario» says why it cannot be used, next to it', async () => {
    serve({ sites: [], templates: [] })
    render(<SchedulesView />)
    const create = await form().findByRole('button', { name: 'Crear horario' })
    await waitFor(() => expect(create).toHaveAccessibleDescription('Primero creá un local en Locales.'))
    expect(create).toBeDisabled()
  })

  it('assigning nobody explains it on the people and keeps «Asignar» enabled', async () => {
    render(<SchedulesView />)
    await screen.findByText('Mañana')
    fireEvent.change(form().getByLabelText('Nombre del horario'), { target: { value: 'Corrido' } })
    fireEvent.click(form().getByRole('button', { name: 'Crear horario' }))
    const step = within(await screen.findByRole('region', { name: '¿Quién trabaja con este horario?' }))
    await waitFor(() => expect(step.getByRole('checkbox', { name: 'Ana' })).toHaveFocus())
    const assign = step.getByRole('button', { name: 'Asignar' })
    expect(assign).toBeEnabled()
    expect(assign.closest('form')).toHaveAttribute('novalidate')
    fireEvent.change(step.getByLabelText('Desde el día'), { target: { value: '' } })
    // A click focuses the button it presses; fireEvent does not, so the test does it.
    assign.focus()
    fireEvent.click(assign)

    const people = step.getByRole('group', { name: 'Empleados de este local' })
    expect(people).toHaveAttribute('aria-invalid', 'true')
    expect(people).toHaveAccessibleDescription('Elegí al menos una persona.')
    expect(step.getByLabelText('Desde el día')).toHaveAccessibleDescription('Elegí desde qué día.')
    await waitFor(() => expect(step.getByRole('checkbox', { name: 'Ana' })).toHaveFocus())
    // Only the horario was sent: the assignment never left.
    expect(apiMocks.post).toHaveBeenCalledTimes(1)
  })
})

/** The row of buttons right after the block that holds `element`, inside the same form; null when something else comes next. */
function aboveTheButtons(element: HTMLElement) {
  const result = element.closest('.form-result')
  const next = result?.nextElementSibling
  return next?.classList.contains('button-row') && next.closest('form') === result?.closest('form') ? next as HTMLElement : null
}
