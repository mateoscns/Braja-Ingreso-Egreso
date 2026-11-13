import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmployeeApp } from './EmployeeApp'
import type { Deviation, Jornada, Site } from '../../shared/api/types'
import { ApiError, NetworkError, TimeoutError } from '../../shared/api/client'
import { forgetLocationNotice, rememberLocationNotice } from './locationNotice'
import { clearMarkInterrupted, markWasInterrupted } from '../auth/interruptedMark'
import { LoadFailure } from '../../app/ui'
import { expectSkipLinkToMain } from '../../app/testing/skipLink'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  onSessionExpired: vi.fn(),
  useSession: vi.fn(),
  createMarkAttempt: vi.fn(),
  submitMark: vi.fn()
}))

vi.mock('../../shared/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/api/client')>(),
  api: { get: mocks.apiGet, put: mocks.apiPut, onSessionExpired: mocks.onSessionExpired },
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
// The real LoadFailure, watched: a failed load must go through it (slice F3).
vi.mock('../../app/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof import('../../app/ui')>()
  return { ...ui, LoadFailure: vi.fn(ui.LoadFailure) }
})

const timeZone = 'America/Argentina/Buenos_Aires'
/** 11:00 in Buenos Aires: two hours after the 09:00 entry and six before the 17:00 end of the shift. */
const NOW = new Date('2026-10-20T14:00:00Z')
const today = '2026-10-20'

const sites: Site[] = [
  { id: 'site-center', name: 'Local Centro', timeZone, latitude: null, longitude: null, geofenceRadiusMeters: null },
  { id: 'site-north', name: 'Local Norte', timeZone, latitude: null, longitude: null, geofenceRadiusMeters: null }
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

/** Only one jornada in the day: the screen shows no picker. */
function configureSingle(jornada: Jornada, deviations: Deviation[] = []) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === '/sites') return Promise.resolve(sites)
    if (path.startsWith('/jornadas/mine?')) return Promise.resolve([jornada])
    if (path.startsWith('/deviations?status=')) return Promise.resolve(deviations.filter((item) => item.status === 'MOTIVO_PENDIENTE'))
    if (path.startsWith('/deviations?')) return Promise.resolve(deviations)
    if (path === `/jornadas/${jornada.id}`) return Promise.resolve(jornada)
    throw new Error(`GET inesperado: ${path}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  rememberLocationNotice()
  clearMarkInterrupted()
  mocks.onSessionExpired.mockReturnValue(() => undefined)
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

afterEach(() => { cleanup(); vi.useRealTimers() })

const breakfastButton = () => screen.findByRole('button', { name: 'Me voy a desayunar' })

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

  // Slice G1 (WCAG 2.4.1): the top bar comes before the day on every visit; «Ir al contenido» skips it.
  it('lo primero que alcanza Tab es «Ir al contenido», que lleva al único main de la pantalla', async () => {
    render(<EmployeeApp />)
    await breakfastButton()

    expectSkipLinkToMain()
  })

  describe('pantalla principal', () => {
    it('ordena el estado del día, el panel de marcar, las marcas de hoy y al final Ver otros días', async () => {
      configureSingle(jornadas[0], [pendingDeviation])
      const { container } = render(<EmployeeApp />)

      expect(await screen.findByText('Estás trabajando desde las 09:00.')).toBeInTheDocument()
      const headings = [...container.querySelectorAll('h1, h2')].map((heading) => heading.textContent)
      // Slice D3: with something to explain, «Para explicar» comes before the marks, and the day has no section of its own.
      expect(headings).toEqual(['Hola, DNI 30123456', 'Marcar', 'Para explicar', 'Tus marcas de hoy', 'Ver otros días'])
      const sentence = screen.getByText('Estás trabajando desde las 09:00.')
      expect(sentence.compareDocumentPosition(screen.getByRole('button', { name: 'Me voy a desayunar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('muestra la próxima marca como un botón grande, desayuno antes que almuerzo y la salida última y aparte', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)

      const primary = await breakfastButton()
      expect(primary).toHaveClass('button-primary', 'button-clock')
      const panel = screen.getByRole('region', { name: 'Marcar' })
      const buttons = within(panel).getAllByRole('button')
      expect(buttons).toHaveLength(3)
      expect(buttons[0]).toHaveAccessibleName('Me voy a desayunar')
      expect(buttons[1]).toHaveAccessibleName('Me voy a almorzar')
      expect(buttons[2]).toHaveAccessibleName('Marcar salida')
      expect(buttons[2].closest('.now-apart')).not.toBeNull()
      expect(panel).not.toHaveTextContent(/Enviar marca|servidor|secuencia|comprobante|día local/)
    })

    // Slice D1: the state of the day, the next mark and the schedule are one block, so the person reads how the day is and
    // what to do next without looking for the schedule further down.
    it('junta en el bloque Marcar el estado del día, la próxima marca y el horario', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)

      const block = (await breakfastButton()).closest('.now')!
      expect(block).toBe(screen.getByRole('region', { name: 'Marcar' }))
      expect(block).toContainElement(screen.getByText('Estás trabajando desde las 09:00.'))
      expect(block).toContainElement(screen.getByText('09:00 a 17:00'))
      expect(block).toHaveTextContent('Local Centro · Tenés 5 minutos de tolerancia para entrar.')
      expect(screen.getByRole('region', { name: 'Tus marcas de hoy' })).not.toHaveTextContent('Tu horario')
    })

    it('no deja texto técnico en la pantalla', async () => {
      configureSingle(jornadas[0])
      const { container } = render(<EmployeeApp />)
      await breakfastButton()
      expect(container.textContent).not.toMatch(/servidor|secuencia|comprobante|día local|Registrar|Enviar marca/)
    })

    it('dice que hoy no hay un día de trabajo cargado y a quién avisar', async () => {
      mocks.apiGet.mockImplementation((path: string) => {
        if (path === '/sites') return Promise.resolve(sites)
        if (path.startsWith('/jornadas/mine?')) return Promise.resolve([])
        if (path.startsWith('/deviations?')) return Promise.resolve([])
        throw new Error(`GET inesperado: ${path}`)
      })
      render(<EmployeeApp />)
      expect(await screen.findByText('Hoy no tenés un día de trabajo cargado. Si tenés que trabajar, avisale a tu encargado.')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Marcar' })).not.toBeInTheDocument()
    })

    it('durante el desayuno dice hasta qué hora y ofrece volver', async () => {
      configureSingle({
        ...jornadas[0], state: 'PAUSA_ABIERTA',
        marks: [...jornadas[0].marks, { id: 'mark-b', jornadaId: 'jornada-center', action: 'SALIDA_DESAYUNO', sequence: 2, acceptedAt: '2026-10-20T13:55:00Z', locationStatus: 'RECIBIDA' }]
      })
      render(<EmployeeApp />)
      expect(await screen.findByText('Estás desayunando: volvé antes de las 11:10.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Volví del desayuno' })).toHaveClass('button-primary')
    })

    it('muestra el estado de la ubicación de cada marca de hoy', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      const marks = await screen.findByRole('region', { name: 'Tus marcas de hoy' })
      expect(marks).toHaveTextContent('Entrada')
      expect(marks).toHaveTextContent('09:00')
      expect(marks).toHaveTextContent('Sin ubicación')
    })
  })

  it('distingue jornadas por sede y expone cuál está seleccionada', async () => {
    render(<EmployeeApp />)

    const options = await screen.findAllByRole('button', { name: /Mañana/ })
    expect(options).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Elegí tu turno' })).getByRole('group', { name: 'Turnos de este día' })).toContainElement(options[0])
    expect(options[0]).toHaveAccessibleName(/Local Centro/)
    expect(options[1]).toHaveAccessibleName(/Local Norte/)
    expect(options[0]).toHaveAttribute('aria-pressed', 'true')
    expect(options[1]).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(options[1])

    expect(options[0]).toHaveAttribute('aria-pressed', 'false')
    expect(options[1]).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText(/Local Norte · Tenés 5 minutos de tolerancia para entrar/)).toBeInTheDocument()
  })

  describe('salida', () => {
    it('antes del fin del horario pregunta si termina el día y recién al confirmar marca', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await screen.findByRole('button', { name: 'Marcar salida' }))

      expect(await screen.findByText('¿Terminás tu día ahora? Tu horario termina a las 17:00.')).toBeInTheDocument()
      expect(mocks.submitMark).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'No, seguir trabajando' }))
      expect(screen.queryByText(/Terminás tu día ahora/)).not.toBeInTheDocument()
      expect(mocks.submitMark).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Marcar salida' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Sí, marcar salida' }))
      await waitFor(() => expect(mocks.submitMark).toHaveBeenCalledTimes(1))
      expect(mocks.submitMark.mock.calls[0][1]).toMatchObject({ action: 'EGRESO' })
      expect(await screen.findByText('Listo: tu salida quedó registrada a las 10:05.')).toBeInTheDocument()
    })

    // Slice F1 (WCAG 2.4.3; finding F-27, gap left by D1): the question replaces the buttons, so closing it would leave the
    // focus on the page; it goes back to the button that asked.
    it('la pregunta toma el foco y «No, seguir trabajando» lo devuelve al botón de la salida', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await screen.findByRole('button', { name: 'Marcar salida' }))

      const question = (await screen.findByText('¿Terminás tu día ahora? Tu horario termina a las 17:00.')).closest('.now-step') as HTMLElement
      await waitFor(() => expect(question).toHaveFocus())
      fireEvent.click(screen.getByRole('button', { name: 'No, seguir trabajando' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar salida' })).toHaveFocus())
    })

    it('«Volver» del aviso de ubicación devuelve el foco al botón de la marca que lo abrió', async () => {
      forgetLocationNotice()
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())

      expect(await screen.findByText('Al marcar, el celular manda tu ubicación una sola vez para saber si estás en el local. Si no llega, la marca igual se registra.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Me voy a desayunar' })).toHaveFocus())
      expect(mocks.submitMark).not.toHaveBeenCalled()
    })

    it('después del fin del horario marca sin preguntar y la sugiere como la próxima', async () => {
      vi.setSystemTime(new Date('2026-10-20T20:10:00Z'))
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      const exit = await screen.findByRole('button', { name: 'Marcar salida' })
      expect(exit).toHaveClass('button-primary')
      fireEvent.click(exit)
      await waitFor(() => expect(mocks.submitMark).toHaveBeenCalledTimes(1))
      expect(screen.queryByText(/Terminás tu día ahora/)).not.toBeInTheDocument()
    })
  })

  describe('aviso de ubicación', () => {
    it('la primera marca de la sesión explica para qué se pide la ubicación y la siguiente ya no', async () => {
      forgetLocationNotice()
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())

      expect(await screen.findByText('Al marcar, el celular manda tu ubicación una sola vez para saber si estás en el local. Si no llega, la marca igual se registra.')).toBeInTheDocument()
      // Rule 2 (T12, finding A-1): the location never blocks a mark, so the notice does not word it as a condition.
      expect(screen.queryByText(/necesitamos|para marcar/i)).not.toBeInTheDocument()
      expect(mocks.submitMark).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
      await waitFor(() => expect(mocks.submitMark).toHaveBeenCalledTimes(1))

      fireEvent.click(await screen.findByRole('button', { name: 'Me voy a almorzar' }))
      await waitFor(() => expect(mocks.submitMark).toHaveBeenCalledTimes(2))
      expect(screen.queryByText(/manda tu ubicación una sola vez/)).not.toBeInTheDocument()
    })
  })

  describe('confirmación de la marca', () => {
    it('dice qué se marcó y a qué hora, con el foco en el aviso', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())

      const confirmation = await screen.findByText('Listo: tu salida a desayunar quedó registrada a las 10:05.')
      await waitFor(() => expect(document.activeElement).toContainElement(confirmation))
      expect(confirmation.closest('[role="status"]')).not.toBeNull()
    })

    it('muestra cómo va la ubicación de esa marca', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())

      expect(await screen.findByText('Enviando ubicación… no cierres la app.')).toBeInTheDocument()
      const onLocation = mocks.submitMark.mock.calls[0][3] as (result: 'SENT' | 'MISSING') => void
      act(() => onLocation('SENT'))
      const box = screen.getByText(/Listo: tu salida a desayunar/).closest('[role="status"]')!
      await waitFor(() => expect(box).toHaveTextContent('Ubicación enviada'))
      expect(box).not.toHaveTextContent('Enviando ubicación')
      // Slice H1 (finding F-22): the pin icon says it; the decorative «✔» after the words went.
      expect(box).not.toHaveTextContent('✔')
    })

    it('avisa cuando la ubicación no llegó', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())
      await screen.findByText(/Listo: tu salida a desayunar/)
      const onLocation = mocks.submitMark.mock.calls[0][3] as (result: 'SENT' | 'MISSING') => void
      act(() => onLocation('MISSING'))
      expect(await screen.findByText('No llegó tu ubicación: puede figurar como fuera del local. Revisá que el celular tenga la ubicación activada.')).toBeInTheDocument()
    })

    // S8: the mark was saved, so the confirmation stays; only the line about the location is a warning, never a success.
    it('la ubicación que no llegó es una advertencia dentro de la confirmación, no una línea de éxito', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())
      const receipt = (await screen.findByText('Listo: tu salida a desayunar quedó registrada a las 10:05.')).closest('[role="status"]')!
      const onLocation = mocks.submitMark.mock.calls[0][3] as (result: 'SENT' | 'MISSING') => void
      act(() => onLocation('MISSING'))

      const line = await screen.findByText('No llegó tu ubicación: puede figurar como fuera del local. Revisá que el celular tenga la ubicación activada.')
      expect(receipt).toContainElement(line)
      expect(line.closest('.message-success')).toBeNull()
      expect(line.closest('.receipt-location')).toHaveClass('receipt-location-missing')
    })

    // S8, verbatim: «nunca indicar que una marca fue registrada si el servidor todavía no confirmó su aceptación».
    it('mientras la marca está en camino nada dice que quedó registrada: el lugar de la confirmación dice que se está enviando', async () => {
      let resolveMark!: (value: { id: string; acceptedAt: string }) => void
      mocks.submitMark.mockReturnValueOnce(new Promise((resolve) => { resolveMark = resolve }))
      configureSingle(jornadas[0])
      const { container } = render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())

      const sending = await screen.findByText('Enviando tu marca… esperá un momento.')
      expect(sending.closest('.mark-feedback')).not.toBeNull()
      expect(sending.closest('.message-info')).not.toBeNull()
      expect(container).not.toHaveTextContent(/registrada/)
      expect(container.querySelector('.receipt, .message-success')).toBeNull()
      within(screen.getByRole('region', { name: 'Marcar' })).getAllByRole('button').forEach((button) => expect(button).toBeDisabled())

      await act(async () => { resolveMark({ id: 'mark-new', acceptedAt: '2026-10-20T13:05:00Z' }) })
      expect(await screen.findByText('Listo: tu salida a desayunar quedó registrada a las 10:05.')).toBeInTheDocument()
      expect(screen.queryByText('Enviando tu marca… esperá un momento.')).not.toBeInTheDocument()
    })
  })

  it('anuncia una marca pendiente, muestra el error y reintenta con la misma clave', async () => {
    let rejectFirstAttempt!: (reason: Error) => void
    const firstAttempt = new Promise<{ id: string; acceptedAt: string }>((_, reject) => { rejectFirstAttempt = reject })
    const receipt = { id: 'mark-new', acceptedAt: '2026-10-20T13:05:00Z' }
    mocks.submitMark.mockReturnValueOnce(firstAttempt).mockResolvedValueOnce(receipt)
    render(<EmployeeApp />)

    const breakfast = await breakfastButton()
    fireEvent.click(breakfast)

    expect(await screen.findByText('Enviando tu marca… esperá un momento.')).toBeInTheDocument()
    expect(breakfast).toBeDisabled()
    rejectFirstAttempt(new NetworkError())

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay internet. Tu marca no se registró.')
    await waitFor(() => expect(breakfast).toBeEnabled())
    fireEvent.click(breakfast)

    expect(await screen.findByText('Listo: tu salida a desayunar quedó registrada a las 10:05.')).toBeInTheDocument()
    expect(mocks.createMarkAttempt).toHaveBeenCalledTimes(1)
    expect(mocks.submitMark).toHaveBeenCalledTimes(2)
    expect(mocks.submitMark.mock.calls[0][1]).toBe(mocks.submitMark.mock.calls[1][1])
  })

  it('no presenta una consulta fallida como un día sin turno y permite reintentar', async () => {
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
    expect(screen.getByRole('heading', { name: 'No pudimos cargar tu día' })).toBeInTheDocument()
    expect(screen.queryByText(/no tenés un día de trabajo cargado/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findAllByRole('button', { name: /Mañana/ })).toHaveLength(2)
    expect(siteRequests).toBe(2)
  })

  it('un día que no se pudo cargar usa la carga fallida compartida, bajo su título, y su Reintentar vuelve a pedir el día', async () => {
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

    const alert = await screen.findByRole('alert')
    expect(vi.mocked(LoadFailure).mock.lastCall?.[0]).toMatchObject({ message: 'Servidor no disponible.' })
    expect(screen.getByRole('region', { name: 'No pudimos cargar tu día' })).toContainElement(alert)
    // It is the only way out of the screen, so it stays the filled main button it was before LoadFailure.
    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveClass('button-primary')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findAllByRole('button', { name: /Mañana/ })).toHaveLength(2)
    expect(siteRequests).toBe(2)
  })

  it('sin internet al cargar lo dice en palabras simples', async () => {
    mocks.apiGet.mockImplementation((path: string) => path === '/sites' ? Promise.reject(new NetworkError()) : Promise.resolve([]))
    render(<EmployeeApp />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay internet. Revisá la conexión y tocá Reintentar.')
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

  // Issue #177: with no name and no DNI the greeting read «Hola, bienvenido», in the masculine.
  it('sin nombre ni DNI saluda con un «Hola» neutro', async () => {
    mocks.useSession.mockReturnValue({
      session: {
        accountId: 'account-1', dni: '', memberships: [{ companyId: 'company-1', companyName: 'Braja', role: 'EMPLOYEE' }],
        activeCompanyId: 'company-1', mustChangePassword: false
      },
      signOut: vi.fn(), activateCompany: vi.fn()
    })
    render(<EmployeeApp />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola' })).toBeInTheDocument()
    expect(screen.queryByText(/bienvenid/)).not.toBeInTheDocument()
  })

  describe('Para explicar', () => {
    it('dice qué pasó contra el horario del día y pregunta qué pasó', async () => {
      configureApi([{ ...pendingDeviation, occurredAt: '2026-10-20T12:18:00Z' }])
      render(<EmployeeApp />)
      const card = (await screen.findByLabelText('Contá qué pasó')).closest('form')!
      expect(card).toHaveTextContent('Llegaste 18 minutos tarde (tu entrada era 09:00). ¿Qué pasó?')
    })

    it('muestra la hora del hecho (occurredAt) y no la de detección', async () => {
      configureApi([{ ...pendingDeviation, jornadaId: 'jornada-old', occurredAt: '2026-10-20T11:15:00Z', createdAt: '2026-10-20T12:00:00Z' }])
      render(<EmployeeApp />)
      const card = (await screen.findByLabelText('Contá qué pasó')).closest('form')!
      expect(card).toHaveTextContent(/0?8:15/)
      expect(card).not.toHaveTextContent(/0?9:00/)
    })

    it('nombra la marca que quedó fuera del local, sin números de secuencia', async () => {
      configureApi([{
        ...pendingDeviation, type: 'FUERA_DE_SEDE', occurredAt: '2026-10-20T15:00:00Z', sourceMarkId: 'mark-outside', sourceMarkAction: 'SALIDA_ALMUERZO', sourceMarkSequence: 2
      }])
      render(<EmployeeApp />)
      const card = (await screen.findByLabelText('Contá qué pasó')).closest('form')!
      expect(card).toHaveTextContent('Fuera del local')
      expect(card).toHaveTextContent('Marcaste la salida a almorzar fuera del local, a las 12:00.')
      expect(card).not.toHaveTextContent(/secuencia/)
    })

    it('no trae una categoría elegida, explica cada una y pide elegir una dentro de la tarjeta', async () => {
      configureApi([pendingDeviation])
      render(<EmployeeApp />)
      const card = (await screen.findByLabelText('Contá qué pasó')).closest('form')!
      const radios = within(card).getAllByRole('radio')
      expect(radios).toHaveLength(4)
      radios.forEach((radio) => expect(radio).not.toBeChecked())
      expect(card).toHaveTextContent('Salud: estuviste enfermo o en el médico')

      fireEvent.change(within(card).getByLabelText('Contá qué pasó'), { target: { value: 'Paro de colectivos.' } })
      fireEvent.click(within(card).getByRole('button', { name: 'Enviar motivo' }))

      expect(await within(card).findByText('Elegí una de las opciones.')).toBeInTheDocument()
      expect(mocks.apiPut).not.toHaveBeenCalled()
    })

    it('anuncia el envío, confirma con Lo enviamos y actualiza el estado', async () => {
      let resolveMotive!: (value: Deviation) => void
      const pendingSave = new Promise<Deviation>((resolve) => { resolveMotive = resolve })
      const updated = { ...pendingDeviation, status: 'PENDIENTE_REVISION' as const, category: 'OTRA' as const, motiveText: 'Demora en el transporte.' }
      configureApi([pendingDeviation])
      mocks.apiPut.mockReturnValueOnce(pendingSave)
      render(<EmployeeApp />)

      const motive = await screen.findByLabelText('Contá qué pasó')
      fireEvent.click(screen.getByRole('radio', { name: /Otra/ }))
      fireEvent.change(motive, { target: { value: ' Demora en el transporte. ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar motivo' }))

      expect(await screen.findByRole('status')).toHaveTextContent('Enviando lo que escribiste…')
      expect(motive.closest('form')).toHaveAttribute('aria-busy', 'true')
      expect(mocks.apiPut).toHaveBeenCalledWith('/deviations/deviation-1/motive', { category: 'OTRA', text: 'Demora en el transporte.' })

      resolveMotive(updated)

      expect(await screen.findByText('A revisar')).toBeInTheDocument()
      // PageMessage writes a success text one render after mounting its live region (2026-11-11, #120: looking for it
      // without waiting failed two runs in three).
      expect(await screen.findByText('Lo enviamos. Tu encargado lo va a revisar.')).toBeInTheDocument()
      expect(screen.queryByLabelText('Contá qué pasó')).not.toBeInTheDocument()
    })

    // Slice G2 (keyboard pass on the built app, 2026-11-12): a case of another day leaves the list once sent, and the focus fell
    // to the page with its form.
    it('si el caso enviado era de otro día y sale de la lista, el foco va al mensaje de que lo enviamos', async () => {
      const otherDay = { ...pendingDeviation, id: 'deviation-9', jornadaId: 'jornada-old' }
      configureApi([], [otherDay])
      mocks.apiPut.mockResolvedValueOnce({ ...otherDay, status: 'PENDIENTE_REVISION', category: 'OTRA', motiveText: 'Demora.' })
      render(<EmployeeApp />)

      fireEvent.click(await screen.findByRole('radio', { name: /Otra/ }))
      fireEvent.change(screen.getByLabelText('Contá qué pasó'), { target: { value: 'Demora.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar motivo' }))

      const sent = await screen.findByText('Lo enviamos. Tu encargado lo va a revisar.')
      await waitFor(() => expect(sent.closest('.message')).toHaveFocus())
    })

    it('si el envío falla, muestra el error en la tarjeta y conserva lo escrito', async () => {
      configureApi([pendingDeviation])
      mocks.apiPut.mockRejectedValueOnce(new Error('Tu encargado ya lo revisó: ya no se puede cambiar.'))
      render(<EmployeeApp />)

      const motive = await screen.findByLabelText('Contá qué pasó')
      fireEvent.click(screen.getByRole('radio', { name: /Transporte/ }))
      fireEvent.change(motive, { target: { value: 'Paro de colectivos.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar motivo' }))

      const card = motive.closest('form')!
      expect(await within(card).findByRole('alert')).toHaveTextContent('Tu encargado ya lo revisó: ya no se puede cambiar.')
      // T12 (#114, 2026-11-12; WCAG 2.4.3): the button was disabled while it sent, so the focus was lost; it goes to the message.
      await waitFor(() => expect(within(card).getByRole('alert')).toHaveFocus())
      expect(motive).toHaveValue('Paro de colectivos.')
      expect(screen.getByRole('radio', { name: /Transporte/ })).toBeChecked()
    })

    it('muestra motivos pendientes de otras fechas, incluida la jornada nocturna de la víspera', async () => {
      const previousNight: Deviation = { ...pendingDeviation, id: 'deviation-night', jornadaId: 'jornada-previous-night', type: 'MARCA_FALTANTE', occurredAt: '2026-10-19T09:10:00Z' }
      configureApi([], [previousNight])
      render(<EmployeeApp />)

      const card = (await screen.findByLabelText('Contá qué pasó')).closest('form')!
      expect(card).toHaveTextContent('No marcaste tu salida.')
      expect(mocks.apiGet).toHaveBeenCalledWith('/deviations?status=MOTIVO_PENDIENTE&limit=100')

      fireEvent.click(screen.getByRole('radio', { name: /Otra/ }))
      fireEvent.change(screen.getByLabelText('Contá qué pasó'), { target: { value: 'Me olvidé de marcar al salir.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar motivo' }))
      await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledWith('/deviations/deviation-night/motive', { category: 'OTRA', text: 'Me olvidé de marcar al salir.' }))
      await waitFor(() => expect(screen.queryByLabelText('Contá qué pasó')).not.toBeInTheDocument())
    })

    it('si fallan los pendientes, la jornada se muestra y el panel ofrece reintentar solo esa lista', async () => {
      const previousNight: Deviation = { ...pendingDeviation, id: 'deviation-night', jornadaId: 'jornada-previous-night', type: 'MARCA_FALTANTE' }
      const previous = mocks.apiGet.getMockImplementation()!
      let pendingRequests = 0
      mocks.apiGet.mockImplementation((path: string) => {
        if (!path.startsWith('/deviations?status=')) return previous(path)
        pendingRequests += 1
        return pendingRequests === 1 ? Promise.reject(new Error('Servidor no disponible.')) : Promise.resolve([previousNight])
      })
      render(<EmployeeApp />)

      expect(await breakfastButton()).toBeEnabled()
      const panel = screen.getByRole('region', { name: 'Para explicar' })
      expect(await within(panel).findByRole('alert')).toHaveTextContent('No pudimos cargar lo que tenés para explicar.')
      expect(panel).not.toHaveTextContent('No tenés nada para explicar.')
      expect(screen.queryByRole('heading', { name: 'No pudimos cargar tu día' })).not.toBeInTheDocument()
      const sitesBefore = mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length

      fireEvent.click(within(panel).getByRole('button', { name: 'Reintentar' }))

      expect((await within(panel).findByLabelText('Contá qué pasó')).closest('form')).toHaveTextContent('No marcaste tu salida')
      expect(within(panel).queryByRole('alert')).not.toBeInTheDocument()
      expect(mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length).toBe(sitesBefore)
    })

    it('avisa cuando muestra solo los 100 pendientes más recientes', async () => {
      const page = Array.from({ length: 100 }, (_, index): Deviation => ({ ...pendingDeviation, id: `deviation-${index}`, jornadaId: `jornada-${index}` }))
      configureApi([], page)
      render(<EmployeeApp />)
      expect(await screen.findByText(/Te mostramos los 100 más recientes/)).toBeInTheDocument()
    })

    it('no muestra el aviso de límite cuando hay menos de 100 pendientes', async () => {
      configureApi([pendingDeviation])
      render(<EmployeeApp />)
      await screen.findByLabelText('Contá qué pasó')
      expect(screen.queryByText(/Te mostramos los 100/)).not.toBeInTheDocument()
    })
  })

  it('permite corregir el motivo mientras el desvío no está clasificado', async () => {
    const underReview: Deviation = { ...pendingDeviation, status: 'PENDIENTE_REVISION', category: 'OTRA', motiveText: 'Texto anterior.' }
    configureApi([underReview], [])
    mocks.apiPut.mockResolvedValueOnce({ ...underReview, category: 'TRANSPORTE', motiveText: 'Paro de colectivos.' })
    render(<EmployeeApp />)

    fireEvent.click(await screen.findByRole('button', { name: 'Corregir motivo' }))
    const text = screen.getByLabelText('Contá qué pasó')
    expect(text).toHaveValue('Texto anterior.')
    expect(screen.getByRole('radio', { name: /Otra/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Transporte/ }))
    fireEvent.change(text, { target: { value: 'Paro de colectivos.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledWith('/deviations/deviation-1/motive', { category: 'TRANSPORTE', text: 'Paro de colectivos.' }))
    expect(await screen.findByText(/Paro de colectivos\./)).toBeInTheDocument()
    expect(screen.queryByLabelText('Contá qué pasó')).not.toBeInTheDocument()
  })

  // Slice D3 (design system 4.5 and 4.7): what is left to explain and what was already sent are one section, «Para explicar»;
  // a correction opens inside its own item, and the kinds of motive are option tiles. The owner, 2026-11-11: "Sí, arriba si hay
  // algo pendiente (Recomendado)".
  describe('Para explicar como una sola tarea', () => {
    const underReview: Deviation = { ...pendingDeviation, status: 'PENDIENTE_REVISION', category: 'OTRA', motiveText: 'Texto anterior.' }
    const isBefore = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

    it('lo pendiente y lo ya enviado del día están en una sola sección, sin otra sección para el día', async () => {
      configureApi([pendingDeviation, { ...underReview, id: 'deviation-2', type: 'EXCESO_DESAYUNO' }])
      const { container } = render(<EmployeeApp />)
      const section = await screen.findByRole('region', { name: 'Para explicar' })

      await within(section).findByLabelText('Contá qué pasó')
      expect(within(section).getAllByRole('listitem')).toHaveLength(2)
      expect(within(section).getByRole('button', { name: 'Corregir motivo' })).toBeInTheDocument()
      expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).not.toContain('Lo que pasó este día')
    })

    it('con algo pendiente va arriba de Tus marcas de hoy, justo después del bloque de marcar', async () => {
      configureSingle(jornadas[0], [pendingDeviation])
      render(<EmployeeApp />)
      const section = await screen.findByRole('region', { name: 'Para explicar' })
      await within(section).findByLabelText('Contá qué pasó')

      expect(isBefore(screen.getByRole('region', { name: 'Marcar' }), section)).toBe(true)
      expect(isBefore(section, screen.getByRole('region', { name: 'Tus marcas de hoy' }))).toBe(true)
    })

    it('sin nada pendiente va debajo de Tus marcas de hoy y es una sola oración', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      await breakfastButton()
      const section = screen.getByRole('region', { name: 'Para explicar' })

      expect(isBefore(screen.getByRole('region', { name: 'Tus marcas de hoy' }), section)).toBe(true)
      expect(section).toHaveTextContent(/^Para explicar\s*No tenés nada para explicar\.$/)
    })

    it('los tipos de motivo son un grupo de opciones con nombre, una opción grande por tipo', async () => {
      configureApi([pendingDeviation])
      render(<EmployeeApp />)
      const card = (await screen.findByLabelText('Contá qué pasó')).closest('form')!

      const group = within(card).getByRole('group', { name: '¿Qué tipo de motivo es?' })
      const radios = within(group).getAllByRole('radio')
      expect(radios).toHaveLength(4)
      radios.forEach((radio) => expect(radio.closest('label')).toHaveClass('choice'))
      expect(within(group).getByRole('radio', { name: 'Salud: estuviste enfermo o en el médico' })).toBeInTheDocument()
    })

    it('el ejemplo es una ayuda unida al cuadro de texto, no un texto de relleno', async () => {
      configureApi([pendingDeviation])
      render(<EmployeeApp />)
      const text = await screen.findByLabelText('Contá qué pasó')

      expect(text).not.toHaveAttribute('placeholder')
      expect(text).toHaveAccessibleDescription('Por ejemplo: hubo paro de colectivos.')
    })

    it('Corregir motivo abre su formulario en el mismo renglón y lleva el foco adentro; Cancelar lo devuelve al botón', async () => {
      configureApi([underReview], [])
      render(<EmployeeApp />)
      const opener = await screen.findByRole('button', { name: 'Corregir motivo' })
      const item = opener.closest('li')!

      fireEvent.click(opener)

      expect(item).toContainElement(screen.getByLabelText('Contá qué pasó'))
      await waitFor(() => expect(within(item).getByRole('radio', { name: /Otra/ })).toHaveFocus())
      fireEvent.click(within(item).getByRole('button', { name: 'Cancelar' }))

      await waitFor(() => expect(within(item).getByRole('button', { name: 'Corregir motivo' })).toHaveFocus())
      expect(screen.queryByLabelText('Contá qué pasó')).not.toBeInTheDocument()
    })

    it('al guardar la corrección el foco vuelve al botón que abrió el formulario', async () => {
      configureApi([underReview], [])
      mocks.apiPut.mockResolvedValueOnce({ ...underReview, category: 'TRANSPORTE', motiveText: 'Paro de colectivos.' })
      render(<EmployeeApp />)
      fireEvent.click(await screen.findByRole('button', { name: 'Corregir motivo' }))
      fireEvent.click(screen.getByRole('radio', { name: /Transporte/ }))
      fireEvent.change(screen.getByLabelText('Contá qué pasó'), { target: { value: 'Paro de colectivos.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

      await waitFor(() => expect(screen.getByRole('button', { name: 'Corregir motivo' })).toHaveFocus())
    })

    it('si falla el envío de una corrección, el formulario sigue abierto en su renglón con lo escrito', async () => {
      configureApi([underReview], [])
      mocks.apiPut.mockRejectedValueOnce(new NetworkError())
      render(<EmployeeApp />)
      const item = (await screen.findByRole('button', { name: 'Corregir motivo' })).closest('li')!
      fireEvent.click(within(item).getByRole('button', { name: 'Corregir motivo' }))
      fireEvent.click(within(item).getByRole('radio', { name: /Emergencia/ }))
      fireEvent.change(within(item).getByLabelText('Contá qué pasó'), { target: { value: 'Se inundó la cocina.' } })
      fireEvent.click(within(item).getByRole('button', { name: 'Guardar corrección' }))

      expect(await within(item).findByRole('alert')).toHaveTextContent('No hay internet. Lo que escribiste sigue acá')
      // T12 (#114, 2026-11-12; WCAG 2.4.3): the button was disabled while it sent, so the focus was lost; it goes to the message.
      await waitFor(() => expect(within(item).getByRole('alert')).toHaveFocus())
      expect(within(item).getByLabelText('Contá qué pasó')).toHaveValue('Se inundó la cocina.')
      expect(within(item).getByRole('radio', { name: /Emergencia/ })).toBeChecked()
    })
  })

  // Slice F2a (design system 4.3 and 4.7; WCAG 3.3.1): the motive is checked when it is sent, every missing field says so at
  // once and the focus goes to the first one; the browser's own bubble never shows.
  describe('una sola forma de validar el motivo', () => {
    it('un envío vacío marca el tipo y el texto a la vez y lleva el foco a la primera opción', async () => {
      configureApi([pendingDeviation])
      render(<EmployeeApp />)
      // Under the load of the full suite the first draw took longer than the default second once (L37).
      const text = await screen.findByLabelText('Contá qué pasó', undefined, { timeout: 5000 })
      const card = text.closest('form')!
      const button = within(card).getByRole('button', { name: 'Enviar motivo' })
      expect(card).toHaveAttribute('novalidate')
      expect(button).toBeEnabled()

      fireEvent.click(button)

      const group = within(card).getByRole('group', { name: '¿Qué tipo de motivo es?' })
      await waitFor(() => expect(group).toHaveAccessibleDescription('Elegí una de las opciones.'))
      expect(group).toHaveAttribute('aria-invalid', 'true')
      expect(text).toHaveAttribute('aria-invalid', 'true')
      expect(text).toHaveAccessibleDescription('Por ejemplo: hubo paro de colectivos. Contá en pocas palabras qué pasó.')
      await waitFor(() => expect(within(card).getByRole('radio', { name: /Salud/ })).toHaveFocus())
      expect(mocks.apiPut).not.toHaveBeenCalled()
    })

    it('elegir un tipo borra solo su mensaje; enviar otra vez sin texto lleva el foco al cuadro de texto', async () => {
      configureApi([pendingDeviation])
      render(<EmployeeApp />)
      const text = await screen.findByLabelText('Contá qué pasó')
      const card = text.closest('form')!
      fireEvent.click(within(card).getByRole('button', { name: 'Enviar motivo' }))
      await waitFor(() => expect(text).toHaveAttribute('aria-invalid', 'true'))

      fireEvent.click(within(card).getByRole('radio', { name: /Otra/ }))

      const group = within(card).getByRole('group', { name: '¿Qué tipo de motivo es?' })
      expect(group).not.toHaveAttribute('aria-invalid')
      expect(group).toHaveAccessibleDescription('')
      expect(text).toHaveAttribute('aria-invalid', 'true')
      expect(text).not.toHaveFocus()

      fireEvent.click(within(card).getByRole('button', { name: 'Enviar motivo' }))

      await waitFor(() => expect(text).toHaveFocus())
      expect(mocks.apiPut).not.toHaveBeenCalled()
    })
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
    expect(screen.getByText('Todavía no marcaste tu entrada.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/America\//)
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(container.textContent).not.toMatch(/:\d{2}:\d{2}/)
  })

  it('llama Finalizada a una jornada egresada y dice que ya terminó el día', async () => {
    configureSingle({ ...jornadas[0], state: 'EGRESADA' })
    render(<EmployeeApp />)
    expect((await screen.findAllByText('Finalizada')).length).toBeGreaterThan(0)
    expect(screen.getByText('Ya terminaste tu día.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Marcar' })).not.toBeInTheDocument()
  })

  it('ignora un segundo disparo de la misma marca mientras el primero está en vuelo', async () => {
    let resolveMark!: (value: { id: string; acceptedAt: string }) => void
    mocks.submitMark.mockReturnValueOnce(new Promise((resolve) => { resolveMark = resolve }))
    render(<EmployeeApp />)
    const breakfast = await breakfastButton()

    act(() => { breakfast.click(); breakfast.click() })
    await act(async () => { resolveMark({ id: 'mark-new', acceptedAt: '2026-10-20T13:05:00Z' }) })

    expect(mocks.submitMark).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Listo: tu salida a desayunar/)).toBeInTheDocument()
  })

  describe('después de una marca fallida', () => {
    it('vuelve a consultar la jornada y muestra la próxima acción que corresponde', async () => {
      const closed: Jornada = { ...jornadas[0], state: 'EGRESADA' }
      const previous = mocks.apiGet.getMockImplementation()!
      mocks.apiGet.mockImplementation((path: string) => path === '/jornadas/jornada-center' ? Promise.resolve(closed) : previous(path))
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'INVALID_MARK_TRANSITION' }))
      render(<EmployeeApp />)

      fireEvent.click(await breakfastButton())

      expect(await screen.findByRole('alert')).toHaveTextContent('Tu día cambió y esa marca ya no corresponde. Te mostramos cómo está ahora.')
      expect(await screen.findByText('Ya terminaste tu día.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Me voy a desayunar' })).not.toBeInTheDocument()
      expect(mocks.apiGet).toHaveBeenCalledWith('/jornadas/jornada-center')
    })

    it('ofrece Actualizar para volver a cargar el estado', async () => {
      mocks.submitMark.mockRejectedValueOnce(new Error('Falló.'))
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())
      await screen.findByRole('alert')
      const sitesBefore = mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length

      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

      await waitFor(() => expect(mocks.apiGet.mock.calls.filter(([path]) => path === '/sites').length).toBe(sitesBefore + 1))
      expect(await breakfastButton()).toBeEnabled()
    })

    it('si al actualizar la marca aparece, cambia el error por la confirmación', async () => {
      configureSingle(jornadas[0])
      mocks.submitMark.mockRejectedValueOnce(new TimeoutError())
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())
      expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si llegó. Tocá el mismo botón otra vez: no se marca dos veces.')

      const arrived: Jornada = {
        ...jornadas[0], state: 'PAUSA_ABIERTA',
        marks: [...jornadas[0].marks, { id: 'mark-arrived', jornadaId: 'jornada-center', action: 'SALIDA_DESAYUNO', sequence: 2, acceptedAt: '2026-10-20T13:59:00Z', locationStatus: 'RECIBIDA' }]
      }
      configureSingle(arrived)
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

      expect(await screen.findByText('Listo: tu salida a desayunar quedó registrada a las 10:59.')).toBeInTheDocument()
      const receipt = screen.getByText(/Listo: tu salida a desayunar/).closest('[role="status"]')
      expect(receipt).toHaveTextContent('Ubicación enviada')
      expect(receipt).not.toHaveTextContent('✔')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('un conflicto que persiste tras el reintento dice que la marca no se registró', async () => {
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'RETRYABLE_TRANSACTION_CONFLICT' }, { retryAfterSeconds: 1 }))
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())
      expect(await screen.findByRole('alert')).toHaveTextContent('Tu marca no se registró. Esperá unos segundos y tocá el mismo botón otra vez.')
    })

    it('conserva el aviso de horario temprano en palabras simples', async () => {
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'MARK_TOO_EARLY' }))
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())
      expect(await screen.findByRole('alert')).toHaveTextContent('Todavía es temprano para marcar.')
    })

    it('un IDEMPOTENCY_CONFLICT descarta el intento guardado y el próximo usa una clave nueva', async () => {
      let created = 0
      mocks.createMarkAttempt.mockImplementation((jornadaId: string, action: string) => ({ jornadaId, action, idempotencyKey: `attempt-${++created}` }))
      mocks.submitMark.mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'IDEMPOTENCY_CONFLICT' }))
      render(<EmployeeApp />)
      const breakfast = await breakfastButton()
      fireEvent.click(breakfast)

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar tu marca. Tocá Actualizar y volvé a marcar.')
      await waitFor(() => expect(breakfast).toBeEnabled())
      fireEvent.click(breakfast)

      expect(await screen.findByText(/Listo: tu salida a desayunar/)).toBeInTheDocument()
      expect(mocks.createMarkAttempt).toHaveBeenCalledTimes(2)
      expect(mocks.submitMark.mock.calls[0][1]).toMatchObject({ idempotencyKey: 'attempt-1' })
      expect(mocks.submitMark.mock.calls[1][1]).toMatchObject({ jornadaId: 'jornada-center', action: 'SALIDA_DESAYUNO', idempotencyKey: 'attempt-2' })
    })

    it('una espera agotada dice que no sabemos si llegó, libera los botones y reintenta con la misma clave', async () => {
      mocks.submitMark.mockRejectedValueOnce(new TimeoutError())
      render(<EmployeeApp />)
      const breakfast = await breakfastButton()
      fireEvent.click(breakfast)

      expect(await screen.findByRole('alert')).toHaveTextContent('No sabemos si llegó. Tocá el mismo botón otra vez: no se marca dos veces.')
      await waitFor(() => expect(breakfast).toBeEnabled())
      fireEvent.click(breakfast)

      expect(await screen.findByText(/Listo: tu salida a desayunar/)).toBeInTheDocument()
      expect(mocks.createMarkAttempt).toHaveBeenCalledTimes(1)
      expect(mocks.submitMark.mock.calls[1][1]).toBe(mocks.submitMark.mock.calls[0][1])
    })

    it('a 503 during a deploy says the system is updating, not the connection, and the retry keeps the Idempotency-Key', async () => {
      mocks.submitMark.mockRejectedValueOnce(new ApiError(503, { status: 503, code: 'SERVICE_UNAVAILABLE' }, { retryAfterSeconds: 30 }))
      render(<EmployeeApp />)
      const breakfast = await breakfastButton()
      fireEvent.click(breakfast)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('El sistema se está actualizando. Esperá un minuto y volvé a marcar.')
      expect(alert).not.toHaveTextContent(/conexión|internet/)
      await waitFor(() => expect(breakfast).toBeEnabled())
      fireEvent.click(breakfast)

      expect(await screen.findByText(/Listo: tu salida a desayunar/)).toBeInTheDocument()
      expect(mocks.createMarkAttempt).toHaveBeenCalledTimes(1)
      expect(mocks.submitMark.mock.calls[1][1]).toMatchObject({ idempotencyKey: 'attempt-1' })
    })

    it('si la sesión vence con una marca en vuelo, deja dicho que la marca no se guardó', async () => {
      let expire!: () => void
      mocks.onSessionExpired.mockImplementation((listener: () => void) => { expire = listener; return () => undefined })
      let rejectMark!: (reason: Error) => void
      mocks.submitMark.mockReturnValueOnce(new Promise((_, reject) => { rejectMark = reject }))
      render(<EmployeeApp />)
      fireEvent.click(await breakfastButton())

      act(() => expire())
      rejectMark(new ApiError(401, { status: 401, code: 'UNAUTHORIZED' }))

      expect(markWasInterrupted()).toBe(true)
      expect(await screen.findByRole('alert')).toHaveTextContent('Pasó mucho tiempo y hay que entrar de nuevo. Tu marca todavía no se guardó.')
    })

    it('si la sesión vence sin una marca en vuelo, no deja ese aviso', async () => {
      let expire!: () => void
      mocks.onSessionExpired.mockImplementation((listener: () => void) => { expire = listener; return () => undefined })
      render(<EmployeeApp />)
      await breakfastButton()
      act(() => expire())
      expect(markWasInterrupted()).toBe(false)
    })
  })

  describe('Ver otros días', () => {
    it('elige otro día al final de la pantalla y vuelve a hoy con un botón', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      await breakfastButton()
      const otherDays = screen.getByRole('region', { name: 'Ver otros días' })
      expect(within(otherDays).queryByRole('button', { name: 'Volver a hoy' })).not.toBeInTheDocument()

      fireEvent.change(within(otherDays).getByLabelText('Día'), { target: { value: '2026-10-15' } })

      expect(await screen.findByText(/Estás viendo el 15 oct 2026/)).toBeInTheDocument()
      await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-15'))
      fireEvent.click(within(otherDays).getByRole('button', { name: 'Volver a hoy' }))

      expect(within(otherDays).getByLabelText('Día')).toHaveValue('')
      expect(await screen.findByText('Estás trabajando desde las 09:00.')).toBeInTheDocument()
    })
    // T12 (#114, 2026-11-12, finding K-1): another day still offered the mark buttons of an open day. Mateo answered "Solo mirar
    // (Recomendado)" (D-20261112-01): another day is only for looking; a forgotten mark is loaded by the ADMIN.
    it('en otro día abierto no hay botones de marcar ni la tolerancia de hoy, y ofrece volver a hoy', async () => {
      const pastOpen = { ...makeJornada('jornada-past', 'site-center'), localDate: '2026-10-15' }
      configureSingle(jornadas[0])
      const today = mocks.apiGet.getMockImplementation()!
      mocks.apiGet.mockImplementation((path: string) => path === '/jornadas/mine?localDate=2026-10-15' ? Promise.resolve([pastOpen]) : today(path))
      render(<EmployeeApp />)
      await breakfastButton()
      expect(screen.getByText(/minutos de tolerancia para entrar/)).toBeInTheDocument()

      fireEvent.change(within(screen.getByRole('region', { name: 'Ver otros días' })).getByLabelText('Día'), { target: { value: '2026-10-15' } })

      expect(await screen.findByText(/Estás viendo el 15 oct 2026/)).toBeInTheDocument()
      expect(await screen.findByRole('region', { name: 'Tus marcas del 15 oct 2026' })).toBeInTheDocument()
      const now = screen.getByText('Para marcar, volvé a hoy.').closest('section')!
      expect(within(now).getAllByRole('button').map((button) => button.textContent)).toEqual(['Volver a hoy'])
      for (const name of ['Me voy a desayunar', 'Me voy a almorzar', 'Marcar salida', 'Marcar entrada']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
      expect(screen.queryByText(/tolerancia/)).not.toBeInTheDocument()
      expect(screen.getByText(/Local Centro/)).toBeInTheDocument()

      fireEvent.click(within(now).getByRole('button', { name: 'Volver a hoy' }))
      expect(screen.getByLabelText('Día')).toHaveValue('')
    })

    // Review advisory of T12 (R3-other-day-truthy-date): choosing today's date in the field left today read-only.
    it('elegir la fecha de hoy en «Ver otros días» deja la pantalla de hoy, con sus botones de marcar', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      await breakfastButton()

      fireEvent.change(screen.getByLabelText('Día'), { target: { value: today } })

      expect(screen.getByLabelText('Día')).toHaveValue('')
      expect(screen.queryByText('Para marcar, volvé a hoy.')).not.toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Me voy a desayunar' })).toBeInTheDocument()
    })

    it('un día sin nada cargado también dice que para marcar hay que volver a hoy', async () => {
      configureSingle(jornadas[0])
      render(<EmployeeApp />)
      await breakfastButton()
      fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2026-10-14' } })

      expect(await screen.findByText(/Ese día no tenés un día de trabajo cargado/)).toBeInTheDocument()
      expect(screen.getByText('Para marcar, volvé a hoy.')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Volver a hoy' })).toHaveLength(2)
    })
  })

  it('bloquea la elección de jornada, el día y la empresa mientras una marca está en vuelo', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Me voy a desayunar' }))

    options.forEach((option) => expect(option).toBeDisabled())
    expect(screen.getByLabelText('Día')).toBeDisabled()
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
    expect(await screen.findByText('Tu encargado canceló este día: no tenés que marcar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar entrada' })).not.toBeInTheDocument()
  })

  it('muestra las marcas anuladas como Anulada y no las cuenta para la próxima acción', async () => {
    const withVoided = {
      ...jornadas[0],
      marks: [...jornadas[0].marks, { id: 'mark-voided', jornadaId: 'jornada-center', action: 'SALIDA_DESAYUNO' as const, sequence: 2, acceptedAt: '2026-10-20T13:00:00Z', locationStatus: 'SIN_UBICACION' as const, voided: true }]
    }
    configureSingle(withVoided)
    render(<EmployeeApp />)

    expect(await screen.findByText('Anulada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me voy a desayunar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar salida' })).toBeInTheDocument()
  })

  it('oculta los símbolos decorativos de los botones de marca', async () => {
    configureSingle(jornadas[0])
    render(<EmployeeApp />)
    const lunch = await screen.findByRole('button', { name: 'Me voy a almorzar' })
    expect(lunch).toHaveAccessibleName('Me voy a almorzar')
    lunch.querySelectorAll('span').forEach((glyph) => expect(glyph).toHaveAttribute('aria-hidden', 'true'))
  })
})
