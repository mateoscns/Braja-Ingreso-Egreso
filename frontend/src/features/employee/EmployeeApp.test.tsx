import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeApp } from './EmployeeApp'
import type { Deviation, Jornada, Site } from '../../shared/api/types'
import { ApiError, TimeoutError } from '../../shared/api/client'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  useSession: vi.fn(),
  createMarkAttempt: vi.fn(),
  submitMark: vi.fn()
}))

vi.mock('../../shared/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/api/client')>(),
  api: { get: mocks.apiGet, put: mocks.apiPut },
  queryString: (values: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    }
    return `?${params.toString()}`
  }
}))

vi.mock('../../app/session', () => ({ useSession: mocks.useSession }))
vi.mock('../../device/pwa/InstallControl', () => ({ InstallControl: () => null }))
vi.mock('./markFlow', () => ({ createMarkAttempt: mocks.createMarkAttempt, submitMark: mocks.submitMark }))

const timeZone = 'America/Argentina/Buenos_Aires'
const today = (() => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
})()

const sites: Site[] = [
  { id: 'site-center', name: 'Local Centro', timeZone },
  { id: 'site-north', name: 'Local Norte', timeZone }
]

function makeJornada(id: string, siteId: string): Jornada {
  return {
    id,
    employeeId: 'employee-1',
    siteId,
    localDate: today,
    state: 'EN_CURSO',
    scheduleSnapshot: {
      siteId,
      name: 'Mañana',
      blocks: [{ startDayOffset: 0, start: '09:00', end: '17:00', endDayOffset: 0 }],
      breakfastLimitMinutes: 15,
      lunchLimitMinutes: 45
    },
    toleranceMinutes: 5,
    sequence: 1,
    marks: [{
      id: `mark-${id}`,
      jornadaId: id,
      action: 'INGRESO',
      sequence: 1,
      acceptedAt: '2026-10-20T12:00:00Z',
      locationStatus: 'SIN_UBICACION'
    }]
  }
}

const jornadas = [makeJornada('jornada-center', 'site-center'), makeJornada('jornada-north', 'site-north')]
const pendingDeviation: Deviation = {
  id: 'deviation-1',
  jornadaId: 'jornada-center',
  siteId: 'site-center',
  employeeId: 'employee-1',
  type: 'LLEGADA_TARDE',
  status: 'MOTIVO_PENDIENTE',
  category: null,
  createdAt: '2026-10-20T12:00:00Z',
  pushEligible: true
}

/** Dated requests return `deviations`; GET /deviations?status=... returns `pending` (by default the dated MOTIVO_PENDIENTE ones). */
function configureApi(deviations: Deviation[] = [], pending = deviations.filter((item) => item.status === 'MOTIVO_PENDIENTE')) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve(sites)
    if (path.startsWith('/jornadas/mine?')) return Promise.resolve(jornadas)
    if (path.startsWith('/deviations?status=')) return Promise.resolve(pending)
    if (path.startsWith('/deviations?')) return Promise.resolve(deviations)
    if (path === '/jornadas/jornada-center') return Promise.resolve(jornadas[0])
    if (path === '/jornadas/jornada-north') return Promise.resolve(jornadas[1])
    throw new Error(`GET inesperado: ${path}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSession.mockReturnValue({
    session: {
      accountId: 'account-1',
      dni: '30123456',
      memberships: [{ companyId: 'company-1', companyName: 'Braja', role: 'EMPLOYEE' }],
      activeCompanyId: 'company-1',
      mustChangePassword: false
    },
    signOut: vi.fn(),
    activateCompany: vi.fn()
  })
  configureApi()
  mocks.apiPut.mockResolvedValue({ ...pendingDeviation, status: 'PENDIENTE_REVISION', category: 'OTRA', motiveText: 'Demora en el transporte.' })
  mocks.createMarkAttempt.mockImplementation((jornadaId: string, action: string) => ({ jornadaId, action, idempotencyKey: 'attempt-1' }))
  mocks.submitMark.mockResolvedValue({ id: 'mark-new', acceptedAt: '2026-10-20T13:05:00Z' })
})

afterEach(() => cleanup())

describe('EmployeeApp', () => {
  it('conserva el orden de hooks cuando la sesión aparece después del primer render', async () => {
    mocks.useSession.mockReturnValueOnce({ session: null, signOut: vi.fn(), activateCompany: vi.fn() })
    const view = render(<EmployeeApp />)

    mocks.useSession.mockReturnValue({
      session: {
        accountId: 'account-1',
        dni: '30123456',
        memberships: [{ companyId: 'company-1', companyName: 'Braja', role: 'EMPLOYEE' }],
        activeCompanyId: 'company-1',
        mustChangePassword: false
      },
      signOut: vi.fn(),
      activateCompany: vi.fn()
    })
    view.rerender(<EmployeeApp />)

    expect(await screen.findByRole('heading', { name: /Hola, DNI 30123456/ })).toBeInTheDocument()
  })

  it('distingue jornadas por sede y expone cuál está seleccionada', async () => {
    render(<EmployeeApp />)

    const options = await screen.findAllByRole('button', { name: /Mañana/ })
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAccessibleName(/Local Centro/)
    expect(options[1]).toHaveAccessibleName(/Local Norte/)
    expect(options[0]).toHaveAttribute('aria-pressed', 'true')
    expect(options[1]).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(options[1])

    expect(options[0]).toHaveAttribute('aria-pressed', 'false')
    expect(options[1]).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText(/Jornada del .* · Local Norte · Tolerancia/)).toBeInTheDocument()
  })

  it('anuncia una marca pendiente, muestra el error y reintenta con la misma clave', async () => {
    let rejectFirstAttempt!: (reason: Error) => void
    const firstAttempt = new Promise<{ id: string; acceptedAt: string }>((_, reject) => { rejectFirstAttempt = reject })
    const receipt = { id: 'mark-new', acceptedAt: '2026-10-20T13:05:00Z' }
    mocks.submitMark.mockReturnValueOnce(firstAttempt).mockResolvedValueOnce(receipt)
    render(<EmployeeApp />)

    const egreso = await screen.findByRole('button', { name: /Registrar egreso/ })
    fireEvent.click(egreso)

    expect(await screen.findByRole('status')).toHaveTextContent('Enviando Registrar egreso al servidor')
    expect(egreso).toBeDisabled()
    rejectFirstAttempt(new Error('No hay conexión.'))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión.')
    await waitFor(() => expect(egreso).toBeEnabled())
    fireEvent.click(egreso)

    expect(await screen.findByText(/Marca confirmada por el servidor/)).toBeInTheDocument()
    expect(await screen.findByText(/10:05/)).toBeInTheDocument()
    expect(mocks.createMarkAttempt).toHaveBeenCalledTimes(1)
    expect(mocks.submitMark).toHaveBeenCalledTimes(2)
    expect(mocks.submitMark.mock.calls[0][1]).toBe(mocks.submitMark.mock.calls[1][1])
  })

  it('no presenta una consulta fallida como una jornada vacía y permite reintentar', async () => {
    let siteRequests = 0
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/sites') {
        siteRequests += 1
        return siteRequests === 1 ? Promise.reject(new Error('Servidor no disponible.')) : Promise.resolve(sites)
      }
      if (path.startsWith('/jornadas/mine?')) return Promise.resolve(jornadas)
      if (path.startsWith('/deviations?')) return Promise.resolve([])
      throw new Error(`GET inesperado: ${path}`)
    })
    render(<EmployeeApp />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor no disponible.')
    expect(screen.getByRole('heading', { name: 'No se pudo consultar tu jornada' })).toBeInTheDocument()
    expect(screen.queryByText(/El administrador todavía no declaró una jornada/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findAllByRole('button', { name: /Mañana/ })).toHaveLength(2)
    expect(siteRequests).toBe(2)
  })

  it('saluda con el nombre de la sesión cuando existe', async () => {
    mocks.useSession.mockReturnValue({
      session: {
        accountId: 'account-1', dni: '30123456', displayName: 'Lucía Pérez',
        memberships: [{ companyId: 'company-1', companyName: 'Braja', role: 'EMPLOYEE' }], activeCompanyId: 'company-1', mustChangePassword: false
      },
      signOut: vi.fn(), activateCompany: vi.fn()
    })
    render(<EmployeeApp />)
    expect(await screen.findByRole('heading', { name: 'Hola, Lucía Pérez' })).toBeInTheDocument()
    expect(screen.queryByText('DNI 30123456')).not.toBeInTheDocument()
  })

  it('muestra la hora del hecho (occurredAt) del motivo pendiente y no la de detección', async () => {
    configureApi([{ ...pendingDeviation, occurredAt: '2026-10-20T11:15:00Z', createdAt: '2026-10-20T12:00:00Z' }])
    render(<EmployeeApp />)
    const card = (await screen.findByLabelText('Motivo')).closest('form')!
    expect(card).toHaveTextContent(/0?8:15/)
    expect(card).not.toHaveTextContent(/0?9:00/)
  })

  it('anuncia el envío de un motivo y actualiza su estado al recibir respuesta', async () => {
    let resolveMotive!: (value: Deviation) => void
    const pendingSave = new Promise<Deviation>((resolve) => { resolveMotive = resolve })
    const updated = { ...pendingDeviation, status: 'PENDIENTE_REVISION' as const, category: 'OTRA' as const, motiveText: 'Demora en el transporte.' }
    configureApi([pendingDeviation])
    mocks.apiPut.mockReturnValueOnce(pendingSave)
    render(<EmployeeApp />)

    const motive = await screen.findByLabelText('Motivo')
    fireEvent.change(motive, { target: { value: ' Demora en el transporte. ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar motivo' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Enviando el motivo al servidor')
    expect(motive.closest('form')).toHaveAttribute('aria-busy', 'true')
    expect(mocks.apiPut).toHaveBeenCalledWith('/deviations/deviation-1/motive', { category: 'OTRA', text: 'Demora en el transporte.' })

    resolveMotive(updated)

    expect(await screen.findByText('A revisar')).toBeInTheDocument()
    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument()
  })

  it('muestra motivos pendientes de otras fechas, incluida la jornada nocturna de la víspera', async () => {
    const previousNight: Deviation = { ...pendingDeviation, id: 'deviation-night', jornadaId: 'jornada-previous-night', type: 'MARCA_FALTANTE', occurredAt: '2026-10-19T09:10:00Z' }
    configureApi([], [previousNight])
    render(<EmployeeApp />)

    const card = (await screen.findByLabelText('Motivo')).closest('form')!
    expect(card).toHaveTextContent('Egreso sin marcar')
    expect(mocks.apiGet).toHaveBeenCalledWith('/deviations?status=MOTIVO_PENDIENTE&limit=100')
    expect(screen.getByText('No hay desvíos para esta fecha.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Me olvidé de marcar al salir.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar motivo' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledWith('/deviations/deviation-night/motive', { category: 'OTRA', text: 'Me olvidé de marcar al salir.' }))
    await waitFor(() => expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument())
  })

  describe('panel de motivos pendientes', () => {
    it('si fallan los pendientes, la jornada se muestra y el panel ofrece reintentar solo los motivos', async () => {
      const previousNight: Deviation = { ...pendingDeviation, id: 'deviation-night', jornadaId: 'jornada-previous-night', type: 'MARCA_FALTANTE' }
      const previous = mocks.apiGet.getMockImplementation()!
      let pendingRequests = 0
      mocks.apiGet.mockImplementation((path: string) => {
        if (!path.startsWith('/deviations?status=')) return previous(path)
        pendingRequests += 1
        return pendingRequests === 1 ? Promise.reject(new Error('Servidor no disponible.')) : Promise.resolve([previousNight])
      })
      render(<EmployeeApp />)

      expect(await screen.findByRole('button', { name: /Registrar egreso/ })).toBeEnabled()
      const panel = screen.getByRole('heading', { name: 'Motivos pendientes' }).closest('section')!
      expect(await within(panel).findByRole('alert')).toHaveTextContent('No se pudieron consultar tus motivos pendientes.')
      expect(panel).not.toHaveTextContent('No tenés motivos pendientes.')
      expect(screen.queryByRole('heading', { name: 'No se pudo consultar tu jornada' })).not.toBeInTheDocument()
      const sitesBefore = mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length

      fireEvent.click(within(panel).getByRole('button', { name: 'Reintentar motivos' }))

      expect((await within(panel).findByLabelText('Motivo')).closest('form')).toHaveTextContent('Egreso sin marcar')
      expect(within(panel).queryByRole('alert')).not.toBeInTheDocument()
      expect(mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length).toBe(sitesBefore)
    })

    it('avisa cuando muestra solo los 100 pendientes más recientes', async () => {
      const page = Array.from({ length: 100 }, (_, index): Deviation => ({ ...pendingDeviation, id: `deviation-${index}`, jornadaId: `jornada-${index}` }))
      configureApi([], page)
      render(<EmployeeApp />)
      expect(await screen.findByText(/Mostramos los 100 motivos pendientes más recientes/)).toBeInTheDocument()
    })

    it('no muestra el aviso de límite cuando hay menos de 100 pendientes', async () => {
      configureApi([pendingDeviation])
      render(<EmployeeApp />)
      await screen.findByLabelText('Motivo')
      expect(screen.queryByText(/Mostramos los 100/)).not.toBeInTheDocument()
    })
  })

  it('permite corregir el motivo mientras el desvío no está clasificado', async () => {
    const underReview: Deviation = { ...pendingDeviation, status: 'PENDIENTE_REVISION', category: 'OTRA', motiveText: 'Texto anterior.' }
    configureApi([underReview], [])
    mocks.apiPut.mockResolvedValueOnce({ ...underReview, category: 'TRANSPORTE', motiveText: 'Paro de colectivos.' })
    render(<EmployeeApp />)

    fireEvent.click(await screen.findByRole('button', { name: 'Corregir motivo' }))
    const text = screen.getByLabelText('Motivo')
    expect(text).toHaveValue('Texto anterior.')
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'TRANSPORTE' } })
    fireEvent.change(text, { target: { value: 'Paro de colectivos.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledWith('/deviations/deviation-1/motive', { category: 'TRANSPORTE', text: 'Paro de colectivos.' }))
    expect(await screen.findByText(/Paro de colectivos\./)).toBeInTheDocument()
    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument()
  })

  it('no ofrece corregir un motivo ya clasificado, pero sí agregar el primero si se clasificó sin motivo', async () => {
    configureApi([
      { ...pendingDeviation, id: 'classified', status: 'JUSTIFICADO', category: 'OTRA', motiveText: 'Revisado.' },
      { ...pendingDeviation, id: 'classified-empty', status: 'NO_JUSTIFICADO', category: null }
    ], [])
    render(<EmployeeApp />)

    expect(await screen.findByRole('button', { name: 'Agregar motivo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corregir motivo' })).not.toBeInTheDocument()
  })

  it('muestra estados y horarios legibles, sin segundos, zona IANA ni fechas ISO', async () => {
    const overnight: Jornada = { ...jornadas[0], state: 'NO_INGRESO', marks: [], scheduleSnapshot: { ...jornadas[0].scheduleSnapshot, blocks: [{ startDayOffset: 0, start: '22:00:00', end: '06:00:00', endDayOffset: 1 }] } }
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/sites') return Promise.resolve(sites)
      if (path.startsWith('/jornadas/mine?')) return Promise.resolve([overnight])
      if (path.startsWith('/deviations?')) return Promise.resolve([])
      throw new Error(`GET inesperado: ${path}`)
    })
    const { container } = render(<EmployeeApp />)

    expect(await screen.findByText('22:00 a 06:00 (día siguiente)')).toBeInTheDocument()
    expect(screen.getAllByText('Sin ingreso').length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/America\//)
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(container.textContent).not.toMatch(/:\d{2}:\d{2}/)
  })

  it('llama Finalizada a una jornada egresada', async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/sites') return Promise.resolve(sites)
      if (path.startsWith('/jornadas/mine?')) return Promise.resolve([{ ...jornadas[0], state: 'EGRESADA' }])
      if (path.startsWith('/deviations?')) return Promise.resolve([])
      throw new Error(`GET inesperado: ${path}`)
    })
    render(<EmployeeApp />)
    expect((await screen.findAllByText('Finalizada')).length).toBeGreaterThan(0)
  })

  it('ignora un segundo disparo de la misma marca mientras el primero está en vuelo', async () => {
    let resolveMark!: (value: { id: string; acceptedAt: string }) => void
    mocks.submitMark.mockReturnValueOnce(new Promise((resolve) => { resolveMark = resolve }))
    render(<EmployeeApp />)
    const egreso = await screen.findByRole('button', { name: /Registrar egreso/ })

    act(() => { egreso.click(); egreso.click() })
    await act(async () => { resolveMark({ id: 'mark-new', acceptedAt: '2026-10-20T13:05:00Z' }) })

    expect(mocks.submitMark).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/ya fue procesada/)).not.toBeInTheDocument()
    expect(await screen.findByText(/Marca confirmada por el servidor/)).toBeInTheDocument()
  })

  it('no deja un punto doble después de la hora de la marca confirmada', async () => {
    render(<EmployeeApp />)
    fireEvent.click(await screen.findByRole('button', { name: /Registrar egreso/ }))
    const confirmation = await screen.findByText(/Marca confirmada por el servidor/)
    expect(confirmation.textContent).not.toContain('..')
  })

  it('un fallo de red al marcar dice que la marca no fue confirmada', async () => {
    mocks.submitMark.mockRejectedValueOnce(Object.assign(new Error('No se pudo conectar con el servidor. Revisá tu conexión y reintentá.'), { name: 'NetworkError' }))
    render(<EmployeeApp />)
    fireEvent.click(await screen.findByRole('button', { name: /Registrar egreso/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La marca no fue confirmada')
  })

  describe('después de una marca fallida', () => {
    it('vuelve a consultar la jornada al servidor y muestra la próxima acción que corresponde', async () => {
      const closed: Jornada = { ...jornadas[0], state: 'EGRESADA' }
      const previous = mocks.apiGet.getMockImplementation()!
      mocks.apiGet.mockImplementation((path: string) => path === '/jornadas/jornada-center' ? Promise.resolve(closed) : previous(path))
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'INVALID_MARK_TRANSITION' }))
      render(<EmployeeApp />)

      fireEvent.click(await screen.findByRole('button', { name: /Registrar egreso/ }))

      expect(await screen.findByRole('alert')).toHaveTextContent('La jornada cambió y esa marca ya no corresponde. Te mostramos el estado actual del servidor.')
      expect(await screen.findByText('Esta jornada ya fue cerrada.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Registrar egreso/ })).not.toBeInTheDocument()
      expect(mocks.apiGet).toHaveBeenCalledWith('/jornadas/jornada-center')
    })

    it('ofrece Actualizar para volver a cargar el estado desde el servidor', async () => {
      mocks.submitMark.mockRejectedValueOnce(new Error('Falló.'))
      render(<EmployeeApp />)
      fireEvent.click(await screen.findByRole('button', { name: /Registrar egreso/ }))
      await screen.findByRole('alert')
      const sitesBefore = mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length

      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

      await waitFor(() => expect(mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length).toBe(sitesBefore + 1))
      expect(await screen.findByRole('button', { name: /Registrar egreso/ })).toBeEnabled()
    })

    it('un conflicto que persiste tras el reintento dice que la marca no se registró', async () => {
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'RETRYABLE_TRANSACTION_CONFLICT' }, { retryAfterSeconds: 1 }))
      render(<EmployeeApp />)
      fireEvent.click(await screen.findByRole('button', { name: /Registrar egreso/ }))
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('La marca no se registró porque el servidor estaba ocupado. Reintentá la misma acción.')
      expect(alert).not.toHaveTextContent(/ya fue procesada/)
    })

    it('conserva el aviso de horario temprano', async () => {
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'MARK_TOO_EARLY' }))
      render(<EmployeeApp />)
      fireEvent.click(await screen.findByRole('button', { name: /Registrar egreso/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Todavía no es horario para registrar esta marca.')
    })

    it('un IDEMPOTENCY_CONFLICT descarta el intento guardado y el próximo usa una clave nueva', async () => {
      let created = 0
      mocks.createMarkAttempt.mockImplementation((jornadaId: string, action: string) => ({ jornadaId, action, idempotencyKey: `attempt-${++created}` }))
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'IDEMPOTENCY_CONFLICT' }))
      render(<EmployeeApp />)
      const egreso = await screen.findByRole('button', { name: /Registrar egreso/ })
      fireEvent.click(egreso)

      expect(await screen.findByRole('alert')).toHaveTextContent('Esta solicitud ya se usó para otra acción.')
      await waitFor(() => expect(egreso).toBeEnabled())
      fireEvent.click(egreso)

      expect(await screen.findByText(/Marca confirmada por el servidor/)).toBeInTheDocument()
      expect(mocks.createMarkAttempt).toHaveBeenCalledTimes(2)
      expect(mocks.submitMark.mock.calls[0][1]).toMatchObject({ idempotencyKey: 'attempt-1' })
      expect(mocks.submitMark.mock.calls[1][1]).toMatchObject({ jornadaId: 'jornada-center', action: 'EGRESO', idempotencyKey: 'attempt-2' })
    })

    it('una espera agotada avisa que la marca puede no estar registrada, libera los botones y reintenta con la misma clave', async () => {
      mocks.submitMark.mockRejectedValueOnce(new TimeoutError())
      render(<EmployeeApp />)
      const egreso = await screen.findByRole('button', { name: /Registrar egreso/ })
      fireEvent.click(egreso)

      expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no respondió a tiempo. La marca puede no haberse registrado')
      await waitFor(() => expect(egreso).toBeEnabled())
      fireEvent.click(egreso)

      expect(await screen.findByText(/Marca confirmada por el servidor/)).toBeInTheDocument()
      expect(mocks.createMarkAttempt).toHaveBeenCalledTimes(1)
      expect(mocks.submitMark.mock.calls[1][1]).toBe(mocks.submitMark.mock.calls[0][1])
    })
  })

  it('bloquea la elección de jornada, la fecha y la empresa mientras una marca está en vuelo', async () => {
    mocks.useSession.mockReturnValue({
      session: {
        accountId: 'account-1', dni: '30123456', activeCompanyId: 'company-1', mustChangePassword: false,
        memberships: [{ companyId: 'company-1', companyName: 'Braja', role: 'EMPLOYEE' }, { companyId: 'company-2', companyName: 'Otra', role: 'EMPLOYEE' }]
      },
      signOut: vi.fn(), activateCompany: vi.fn()
    })
    let resolveMark!: (value: { id: string; acceptedAt: string }) => void
    mocks.submitMark.mockReturnValueOnce(new Promise((resolve) => { resolveMark = resolve }))
    render(<EmployeeApp />)
    const options = await screen.findAllByRole('button', { name: /Mañana/ })

    fireEvent.click(screen.getByRole('button', { name: /Registrar egreso/ }))

    options.forEach((option) => expect(option).toBeDisabled())
    expect(screen.getByLabelText('Fecha de consulta')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Empresa activa' })).toBeDisabled()
    await act(async () => { resolveMark({ id: 'mark-new', acceptedAt: '2026-10-20T13:05:00Z' }) })
    await waitFor(() => options.forEach((option) => expect(option).toBeEnabled()))
    expect(screen.getByRole('combobox', { name: 'Empresa activa' })).toBeEnabled()
  })

  it('muestra una jornada cancelada sin acciones de marca y elige primero la que sigue vigente', async () => {
    const cancelled = { ...jornadas[0], state: 'CANCELADA' as const, marks: [], cancelledAt: '2026-10-20T11:00:00Z' }
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/sites') return Promise.resolve(sites)
      if (path.startsWith('/jornadas/mine?')) return Promise.resolve([cancelled, jornadas[1]])
      if (path.startsWith('/deviations?')) return Promise.resolve([])
      throw new Error(`GET inesperado: ${path}`)
    })
    render(<EmployeeApp />)

    const options = await screen.findAllByRole('button', { name: /Mañana/ })
    expect(options[0]).toHaveAccessibleName(/Cancelada/)
    expect(options[1]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(options[0])
    expect(await screen.findByText('El administrador canceló esta jornada; no hay marcas para registrar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar ingreso/ })).not.toBeInTheDocument()
  })

  it('muestra las marcas anuladas como Anulada y no las cuenta para la próxima acción', async () => {
    const withVoided = {
      ...jornadas[0],
      marks: [...jornadas[0].marks, { id: 'mark-voided', jornadaId: 'jornada-center', action: 'SALIDA_DESAYUNO' as const, sequence: 2, acceptedAt: '2026-10-20T13:00:00Z', locationStatus: 'SIN_UBICACION' as const, voided: true }]
    }
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/sites') return Promise.resolve(sites)
      if (path.startsWith('/jornadas/mine?')) return Promise.resolve([withVoided])
      if (path.startsWith('/deviations?')) return Promise.resolve([])
      throw new Error(`GET inesperado: ${path}`)
    })
    render(<EmployeeApp />)

    expect(await screen.findByText('Anulada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salir a desayuno/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Registrar egreso/ })).toBeInTheDocument()
  })

  it('oculta los símbolos decorativos de los botones de marca y lleva el foco al resultado', async () => {
    render(<EmployeeApp />)
    const egreso = await screen.findByRole('button', { name: /Registrar egreso/ })
    expect(egreso).toHaveAccessibleName(/^Registrar egreso\s*Enviar marca$/)
    egreso.querySelectorAll('span').forEach((glyph) => expect(glyph).toHaveAttribute('aria-hidden', 'true'))

    fireEvent.click(egreso)

    const confirmation = await screen.findByText(/Marca confirmada por el servidor/)
    await waitFor(() => expect(document.activeElement).toContainElement(confirmation))
  })
})
