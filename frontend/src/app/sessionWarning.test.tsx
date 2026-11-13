import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, NetworkError } from '../shared/api/client'
import type { Session } from '../shared/api/types'
import { SessionProvider, useSession } from './session'
import { IDLE_CLOSE_MS, IDLE_WARNING_MS, SessionWarning, warnsBeforeIdleClose } from './sessionWarning'

// T12 (#114, 2026-11-12): the ADMIN's 30 minute session closed without warning (WCAG 2.2.1, finding F-04). Mateo answered
// "Sí, aviso a los 28 min (Recomendado)" (D-20261112-02).

const WARNING = 'Tu sesión se va a cerrar por inactividad en 2 minutos.'
const CLOSED = 'Tu sesión se cerró por inactividad. Volvé a ingresar.'

/** A client whose answers are told to the observers, as ApiClient.onResponse does. */
function fakeClient(get: () => Promise<unknown> = async () => ({})) {
  const listeners = new Set<() => void>()
  const answer = () => listeners.forEach((listener) => listener())
  const client = {
    get: vi.fn(async () => { const result = await get(); answer(); return result }),
    onResponse: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  }
  return { client: client as unknown as Parameters<typeof SessionWarning>[0]['client'], get: client.get, answer: () => act(answer) }
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const warningButton = () => screen.queryByRole('button', { name: 'Seguir conectado' })
const signInButton = () => screen.queryByRole('button', { name: 'Ingresar' })

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); api.clearCsrf() })

describe('el aviso de sesión por vencer', () => {
  it('aparece a los 28 minutos sin pedidos, como un aviso que se anuncia sin tomar el foco', () => {
    const { client } = fakeClient()
    render(<><SessionWarning client={client} /><input aria-label="Lo que escribe" /></>)
    screen.getByLabelText('Lo que escribe').focus()

    advance(IDLE_WARNING_MS - 1)
    expect(warningButton()).not.toBeInTheDocument()
    advance(1)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(WARNING)
    expect(status).toContainElement(warningButton())
    // The class that keeps it on screen while the page is scrolled (styles.css, recheck of T12).
    expect(status).toHaveClass('session-warning')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Lo que escribe')).toHaveFocus()
  })

  it('«Seguir conectado» hace un pedido de la sesión, esconde el aviso y vuelve a contar los 28 minutos', async () => {
    const { client, get } = fakeClient()
    render(<SessionWarning client={client} />)
    advance(IDLE_WARNING_MS)

    await act(async () => { fireEvent.click(warningButton()!) })

    expect(get).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledWith('/session')
    expect(warningButton()).not.toBeInTheDocument()
    advance(IDLE_WARNING_MS - 1)
    expect(warningButton()).not.toBeInTheDocument()
    advance(1)
    expect(warningButton()).toBeInTheDocument()
  })

  it('cualquier pedido respondido esconde el aviso y vuelve a contar desde cero', () => {
    const { client, answer } = fakeClient()
    render(<SessionWarning client={client} />)
    advance(IDLE_WARNING_MS - 60_000)
    answer()
    advance(IDLE_WARNING_MS - 1)
    expect(warningButton()).not.toBeInTheDocument()
    advance(1)
    expect(warningButton()).toBeInTheDocument()

    answer()
    expect(warningButton()).not.toBeInTheDocument()
  })

  it('si no se pudo renovar, lo dice y deja el botón para reintentar', async () => {
    const { client } = fakeClient(() => Promise.reject(new NetworkError()))
    render(<SessionWarning client={client} />)
    advance(IDLE_WARNING_MS)

    await act(async () => { fireEvent.click(warningButton()!) })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo conectar. Revisá tu conexión a internet y reintentá.')
    expect(warningButton()).toBeEnabled()
  })

  it('solo avisa a una cuenta que es ADMIN en alguna empresa: la que es solo empleado tiene 30 días (regla 23)', () => {
    const session = (...roles: ('ADMIN' | 'EMPLOYEE')[]) => ({
      accountId: 'a-1', dni: '30123456', mustChangePassword: false, activeCompanyId: 'c-0',
      memberships: roles.map((role, index) => ({ companyId: `c-${index}`, companyName: `Empresa ${index}`, role }))
    }) as Session
    expect(warnsBeforeIdleClose(null)).toBe(false)
    expect(warnsBeforeIdleClose(session('EMPLOYEE', 'EMPLOYEE'))).toBe(false)
    expect(warnsBeforeIdleClose(session('EMPLOYEE', 'ADMIN'))).toBe(true)
    expect(warnsBeforeIdleClose(session('ADMIN'))).toBe(true)
  })

  it.each([
    ['EMPLOYEE', false],
    ['ADMIN', true]
  ] as const)('la sesión de una cuenta %s muestra el aviso a los 28 minutos: %s', async (role, warns) => {
    const body = { accountId: 'a-1', dni: '30123456', mustChangePassword: false, activeCompanyId: 'c-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    render(<SessionProvider><p>pantalla</p></SessionProvider>)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    advance(IDLE_WARNING_MS)

    expect(Boolean(warningButton())).toBe(warns)
  })

  // Recheck of T12 (issue #177): nobody touched the warning and «en 2 minutos» stayed on screen past minute 30, when the server
  // had already closed the session; a sleeping tab also fired the timer late.
  it('a los 30 minutos sin respuestas dice que la sesión se cerró y ofrece volver a ingresar, en el mismo aviso', () => {
    const { client, answer } = fakeClient()
    render(<SessionWarning client={client} />)
    advance(IDLE_WARNING_MS)
    const status = screen.getByRole('status')

    advance(IDLE_CLOSE_MS - IDLE_WARNING_MS - 1)
    expect(status).toHaveTextContent(WARNING)
    advance(1)

    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent(CLOSED)
    expect(status).not.toHaveTextContent(WARNING)
    expect(warningButton()).not.toBeInTheDocument()
    expect(status).toContainElement(signInButton())
    // An answer after all (the server still had the session) hides it and starts the count again.
    answer()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    advance(IDLE_WARNING_MS)
    expect(warningButton()).toBeInTheDocument()
  })

  it.each([
    [IDLE_WARNING_MS + 60_000, WARNING],
    [IDLE_CLOSE_MS + 5 * 60_000, CLOSED]
  ])('una pestaña dormida que vuelve a mostrarse después de %i ms sin respuestas lee el reloj, no su temporizador', (asleep, text) => {
    const { client } = fakeClient()
    render(<SessionWarning client={client} />)

    // The clock moves while no timer fires, as in a tab the browser put to sleep.
    act(() => { vi.setSystemTime(Date.now() + asleep) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  it('«Ingresar» pide la sesión: el 401 de una sesión cerrada vuelve al ingreso, que lo dice', async () => {
    const body = { accountId: 'a-1', dni: '30123456', mustChangePassword: false, activeCompanyId: 'c-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }] }
    const json = new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const expired = new Response(JSON.stringify({ status: 401, code: 'UNAUTHORIZED' }), { status: 401, headers: { 'Content-Type': 'application/problem+json' } })
    const fetchMock = vi.fn().mockResolvedValueOnce(json).mockResolvedValueOnce(expired)
    vi.stubGlobal('fetch', fetchMock)
    function Screen() { const { session, error } = useSession(); return <p>{session ? 'pantalla' : `ingreso: ${error}`}</p> }
    render(<SessionProvider><Screen /></SessionProvider>)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    advance(IDLE_CLOSE_MS)

    await act(async () => { fireEvent.click(signInButton()!) })
    await act(async () => { await Promise.resolve() })

    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/session$/)
    expect(fetchMock.mock.calls[1][1]?.method ?? 'GET').toBe('GET')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('ingreso: Tu sesión venció. Iniciá sesión nuevamente.')).toBeInTheDocument()
  })

  it('un 401 al renovar deja que la sesión vuelva al ingreso: el aviso se va con ella', async () => {
    const body = { accountId: 'a-1', dni: '30123456', mustChangePassword: false, activeCompanyId: 'c-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }] }
    const json = new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const expired = new Response(JSON.stringify({ status: 401, code: 'UNAUTHORIZED' }), { status: 401, headers: { 'Content-Type': 'application/problem+json' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json).mockResolvedValueOnce(expired))
    render(<SessionProvider><p>pantalla</p></SessionProvider>)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    advance(IDLE_WARNING_MS)

    await act(async () => { fireEvent.click(warningButton()!) })
    await act(async () => { await Promise.resolve() })

    expect(warningButton()).not.toBeInTheDocument()
  })
})
