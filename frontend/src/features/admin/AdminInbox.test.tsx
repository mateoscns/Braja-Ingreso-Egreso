// «Para revisar» (issue #177): what the ADMIN reads to decide a case, the warning on a case still waiting for its explanation,
// the button that reads «Guardando…», and the subtitle of the page.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminInbox } from './AdminInbox'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))

vi.mock('../../shared/api/client', () => ({
  api: apiMocks,
  queryString: (values: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    return `?${params.toString()}`
  }
}))

const site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: -34.6037, longitude: -58.3816, geofenceRadiusMeters: 100 }
const employee = { id: 'e-1', displayName: 'Lucía Pérez', dni: '30123456', siteIds: ['s-1'], toleranceMinutes: 5, active: true }
const toReview = {
  id: 'd-1', jornadaId: 'j-1', siteId: 's-1', employeeId: 'e-1', employeeDisplayName: 'Lucía Pérez', type: 'LLEGADA_TARDE' as const,
  status: 'PENDIENTE_REVISION' as const, category: 'TRANSPORTE' as const, motiveText: 'Hubo paro de colectivos.',
  occurredAt: '2026-10-16T11:15:00Z', createdAt: '2026-10-16T11:20:00Z', pushEligible: true
}
const waiting = { ...toReview, id: 'd-2', jornadaId: 'j-2', employeeId: 'e-2', employeeDisplayName: 'Martín Gómez', type: 'SIN_INGRESO' as const, status: 'MOTIVO_PENDIENTE' as const, category: null, motiveText: null }

function withCases(items: object[]) {
  apiMocks.get.mockImplementation((path: string) => {
    if (path.startsWith('/inbox')) return Promise.resolve({ items, nextCursor: null })
    if (path === '/sites') return Promise.resolve([site])
    if (path === '/employees') return Promise.resolve([employee])
    throw new Error(`GET inesperado: ${path}`)
  })
}

beforeEach(() => { vi.clearAllMocks(); withCases([toReview, waiting]) })
afterEach(() => cleanup())

describe('«Para revisar»', () => {
  // The ADMIN saw only the name of the case and a time, while the employee read what happened (describeDeviation).
  it('cada caso dice qué pasó, en tercera persona', async () => {
    render(<AdminInbox />)
    const late = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
    const absent = screen.getByRole('listitem', { name: 'Martín Gómez' })

    expect(within(late).getByText('Llegó tarde: marcó la entrada a las 08:15.')).toBeInTheDocument()
    expect(within(absent).getByText('No marcó su entrada.')).toBeInTheDocument()
    expect(late).not.toHaveTextContent(/marcaste|Llegaste/)
  })

  // D-20261027-02: a case decided without its explanation goes back to review when the explanation arrives.
  it('un caso que todavía espera la explicación avisa que puede volver a revisión', async () => {
    render(<AdminInbox />)
    const absent = await screen.findByRole('listitem', { name: 'Martín Gómez' })
    const late = screen.getByRole('listitem', { name: 'Lucía Pérez' })
    const hint = 'Todavía puede explicarlo; si lo hace, vuelve a revisión.'

    expect(within(absent).getByText(hint)).toBeInTheDocument()
    expect(within(late).queryByText(hint)).not.toBeInTheDocument()
  })

  it('mientras se guarda una decisión, solo el botón tocado dice «Guardando…» y los dos esperan', async () => {
    apiMocks.put.mockReturnValue(new Promise(() => undefined))
    render(<AdminInbox />)
    const late = await screen.findByRole('listitem', { name: 'Lucía Pérez' })
    fireEvent.click(within(late).getByRole('button', { name: 'Justificado' }))

    const pair = within(late).getByRole('group', { name: 'Decidir el caso de Lucía Pérez' })
    const buttons = within(pair).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Guardando…', 'No justificado'])
    for (const button of buttons) expect(button).toBeDisabled()
  })

  // The line about the avisos belongs to «Configuración», where they are turned on.
  it('el subtítulo habla de los casos y no de los avisos', async () => {
    render(<AdminInbox />)
    const title = await screen.findByRole('heading', { level: 1, name: 'Para revisar' })
    const subtitle = title.nextElementSibling

    expect(subtitle).toHaveTextContent('Llegadas tarde, salidas antes, pausas largas y marcas fuera del local. Leé qué pasó y decidí si está justificado.')
    expect(screen.queryByText(/Los avisos no incluyen datos privados/)).not.toBeInTheDocument()
  })
})
