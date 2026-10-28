import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JourneysView } from './AdminViews'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))

vi.mock('../../shared/api/client', () => ({
  api: apiMocks,
  queryString: (values: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    return `?${params.toString()}`
  }
}))

const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires' }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const blocks = [{ startDayOffset: 0 as const, start: '09:00', end: '17:00', endDayOffset: 0 as const }]
const jornada = {
  id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EN_CURSO' as const,
  scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks, breakfastLimitMinutes: 15, lunchLimitMinutes: 60 },
  toleranceMinutes: 5, sequence: 1,
  marks: [{ id: 'm-1', jornadaId: 'j-1', action: 'INGRESO' as const, sequence: 1, acceptedAt: '2026-10-16T12:00:00Z', locationStatus: 'SIN_UBICACION' as const }]
}
const audit = {
  jornadaId: 'j-1', timeZone: 'America/Argentina/Buenos_Aires', truncated: false,
  entries: [
    { kind: 'DEVIATION', changedAt: '2026-10-16T12:15:00Z', deviationId: 'd-1', deviationType: 'LLEGADA_TARDE', changeType: 'CREATED', afterType: 'SIN_INGRESO' },
    { kind: 'FORGOTTEN_MARK', changedAt: '2026-10-16T12:20:00Z', actorAccountId: 'a-1', actorDisplayName: 'Ana Admin', reason: 'Se olvidó de marcar', markId: 'm-1', markSequence: 1, afterAction: 'INGRESO', afterOccurredAt: '2026-10-16T12:12:00Z' },
    { kind: 'DEVIATION', changedAt: '2026-10-16T12:20:00Z', deviationId: 'd-1', deviationType: 'LLEGADA_TARDE', changeType: 'TYPE_REPLACED', beforeType: 'SIN_INGRESO', afterType: 'LLEGADA_TARDE', reason: 'Corrected event reconciliation' },
    { kind: 'DEVIATION', changedAt: '2026-10-16T12:30:00Z', actorAccountId: 'a-2', actorDisplayName: 'Lucía Pérez', deviationId: 'd-1', deviationType: 'LLEGADA_TARDE', changeType: 'MOTIVE_CORRECTED', beforeMotiveCategory: 'SALUD', afterMotiveCategory: 'TRANSPORTE' },
    { kind: 'DEVIATION', changedAt: '2026-10-16T12:40:00Z', actorAccountId: 'a-1', actorDisplayName: 'Ana Admin', deviationId: 'd-1', deviationType: 'LLEGADA_TARDE', changeType: 'CLASSIFICATION_CHANGED', beforeClassification: 'JUSTIFICADO', afterClassification: 'NO_JUSTIFICADO', reason: 'Revisé la cámara' },
    { kind: 'MARK_CORRECTION', changedAt: '2026-10-16T13:00:00Z', actorAccountId: 'a-3', actorDisplayName: 'DNI 30999888', reason: '<b>Hora real</b>', markId: 'm-1', markSequence: 1, beforeAction: 'INGRESO', afterAction: 'INGRESO', beforeOccurredAt: '2026-10-16T12:12:00Z', afterOccurredAt: '2026-10-16T12:05:00Z' },
    { kind: 'MARK_VOID', changedAt: '2026-10-16T13:10:00Z', actorAccountId: 'a-1', actorDisplayName: 'Ana Admin', reason: 'Tocó por error', markId: 'm-2', markSequence: 2, beforeAction: 'SALIDA_DESAYUNO', afterAction: 'SALIDA_DESAYUNO', beforeOccurredAt: '2026-10-16T13:05:00Z', afterOccurredAt: '2026-10-16T13:05:00Z' },
    { kind: 'JORNADA_CANCELLATION', changedAt: '2026-10-16T13:20:00Z', actorAccountId: 'a-1', actorDisplayName: 'Ana Admin', reason: 'Feriado nacional' }
  ]
}

let auditResult: () => Promise<unknown> = () => Promise.resolve(audit)

beforeEach(() => {
  vi.clearAllMocks()
  auditResult = () => Promise.resolve(audit)
  apiMocks.get.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/employees') return Promise.resolve([employee])
    if (path === '/templates') return Promise.resolve([{ id: 't-1', siteId: 's-1', name: 'Mañana', active: true, blocks, breakfastLimitMinutes: 15, lunchLimitMinutes: 60 }])
    if (path.startsWith('/jornadas?')) return Promise.resolve([{ id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-10-16', state: 'EN_CURSO' }])
    if (path === '/jornadas/j-1') return Promise.resolve(jornada)
    if (path === '/admin/jornadas/j-1/audit') return auditResult()
    throw new Error(`GET inesperado: ${path}`)
  })
  apiMocks.post.mockResolvedValue({ ...jornada.marks[0], voided: true, voidReason: 'Tocó por error.' })
})

afterEach(() => cleanup())

const auditCalls = () => apiMocks.get.mock.calls.filter(([path]) => path === '/admin/jornadas/j-1/audit').length

async function openDetail() {
  render(<JourneysView />)
  fireEvent.click(await screen.findByRole('button', { name: /^Ver marcas/ }))
  return screen.findByRole('button', { name: 'Ver historial' })
}

describe('historial de cambios de una jornada (issue #60)', () => {
  it('empieza plegado, no consulta hasta abrirlo y lista cada cambio en español con la hora de la sede', async () => {
    const toggle = await openDetail()
    expect(screen.getByRole('heading', { name: 'Historial de cambios' })).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(auditCalls()).toBe(0)

    fireEvent.click(toggle)

    const list = await screen.findByRole('list', { name: 'Cambios de la jornada' })
    expect(auditCalls()).toBe(1)
    expect(screen.getByRole('button', { name: 'Ocultar historial' })).toHaveAttribute('aria-expanded', 'true')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(8)
    expect(items[0]).toHaveTextContent('Desvío detectado: Sin ingreso')
    expect(items[0]).toHaveTextContent('Automático del sistema')
    expect(items[1]).toHaveTextContent(/Marca olvidada incorporada: Ingreso de .*0?9:12/)
    expect(items[1]).toHaveTextContent('Por Ana Admin')
    expect(items[1]).toHaveTextContent('Motivo: Se olvidó de marcar')
    expect(items[2]).toHaveTextContent('Desvío actualizado: Sin ingreso → Llegada tarde')
    expect(items[2]).not.toHaveTextContent('Corrected event reconciliation')
    expect(items[3]).toHaveTextContent('Llegada tarde: motivo corregido, categoría Salud → Transporte')
    expect(items[3]).toHaveTextContent('Por Lucía Pérez')
    expect(items[4]).toHaveTextContent('Llegada tarde: clasificación corregida de justificado a no justificado')
    expect(items[4]).toHaveTextContent('Motivo: Revisé la cámara')
    // Times are shown in the site's zone (UTC-3): 13:00Z is 10:00 at the site.
    expect(items[5]).toHaveTextContent(/Marca corregida: Ingreso de .*0?9:12.* → Ingreso de .*0?9:05/)
    expect(items[5]).toHaveTextContent(/10:00/)
    expect(items[5]).toHaveTextContent('Por DNI 30999888')
    // Reasons are React text, never markup.
    expect(items[5]).toHaveTextContent('Motivo: <b>Hora real</b>')
    expect(items[5].querySelector('b')).toBeNull()
    expect(items[6]).toHaveTextContent(/Marca anulada: Salida desayuno de/)
    expect(items[7]).toHaveTextContent('Jornada cancelada')
    expect(items[7]).toHaveTextContent('Motivo: Feriado nacional')

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar historial' }))
    expect(screen.queryByRole('list', { name: 'Cambios de la jornada' })).not.toBeInTheDocument()
  })

  it('distingue un fallo de carga del historial vacío y permite reintentar', async () => {
    let fail = true
    auditResult = () => fail ? Promise.reject(new Error('No se pudo conectar con el servidor.')) : Promise.resolve({ ...audit, entries: [] })
    fireEvent.click(await openDetail())

    expect(await screen.findByText('No se pudo conectar con el servidor.')).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Esta jornada no tiene cambios registrados.')).toBeInTheDocument()
    expect(auditCalls()).toBe(2)
  })

  it('avisa cuando el servidor recortó el historial', async () => {
    auditResult = () => Promise.resolve({ ...audit, truncated: true })
    fireEvent.click(await openDetail())

    expect(await screen.findByText('Se muestran los primeros 8 cambios de esta jornada.')).toBeInTheDocument()
  })

  it('recarga el historial abierto después de anular una marca y lo pliega al abrir otra vez la jornada', async () => {
    fireEvent.click(await openDetail())
    await screen.findByRole('list', { name: 'Cambios de la jornada' })
    const markRow = await screen.findByRole('row', { name: /Ingreso/ })
    fireEvent.click(within(markRow).getByRole('button', { name: /^Anular marca Ingreso de/ }))
    fireEvent.change(screen.getByLabelText('Motivo de anulación'), { target: { value: 'Tocó por error.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

    expect(await screen.findByText('Marca anulada.')).toBeInTheDocument()
    await waitFor(() => expect(auditCalls()).toBe(2))
    expect(await screen.findByRole('list', { name: 'Cambios de la jornada' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Ver marcas/ }))
    expect(await screen.findByRole('button', { name: 'Ver historial' })).toHaveAttribute('aria-expanded', 'false')
    expect(auditCalls()).toBe(2)
  })
})
