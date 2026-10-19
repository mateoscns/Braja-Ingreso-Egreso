import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminInbox, JourneysView } from './AdminViews'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))

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
  it('muestra el nombre entregado por el servidor en la bandeja', async () => {
    render(<AdminInbox />)
    expect(await screen.findByText(/Lucía Pérez/)).toBeInTheDocument()
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
