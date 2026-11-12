import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../shared/api/client'
import { SessionProvider, useSession } from './session'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const problem = (status: number, code: string) => new Response(JSON.stringify({ status, code }), { status, headers: { 'Content-Type': 'application/problem+json' } })
const csrf = () => json({ token: 'csrf-token-long-enough' })
const session = (mustChangePassword = false) => ({
  accountId: 'account-1', dni: '30123456', mustChangePassword, activeCompanyId: 'c-1',
  memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'EMPLOYEE' }, { companyId: 'c-2', companyName: 'Otra', role: 'EMPLOYEE' }]
})

function Probe() {
  const { session: current, loading, error, unreachable, activateCompany, changePassword, signOut } = useSession()
  const [failure, setFailure] = useState('')
  if (loading) return <p>cargando</p>
  return <div>
    <p data-testid="state">{current ? `con sesión, cambio pendiente: ${current.mustChangePassword}` : 'sin sesión'}</p>
    <p data-testid="error">{error}</p>
    <p data-testid="unreachable">{unreachable ? 'sin conexión' : 'conectado'}</p>
    <p data-testid="failure">{failure}</p>
    <button onClick={() => { activateCompany('c-2').catch((reason: Error) => setFailure(reason.message)) }}>cambiar empresa</button>
    <button onClick={() => { changePassword('incorrecta', 'nueva-contraseña-larga').catch((reason: Error) => setFailure(reason.message)) }}>cambiar contraseña</button>
    <button onClick={() => void signOut()}>salir</button>
  </div>
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); api.clearCsrf() })

describe('SessionProvider', () => {
  // Issue #169 (2026-11-12): the installed app opened without internet showed the sign-in, as if the 30-day session were gone.
  it('si al abrir la app no hay conexión, no da la sesión por cerrada y vuelve a probar sola cuando vuelve internet', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json(session()))
    vi.stubGlobal('fetch', fetchMock)
    render(<SessionProvider><Probe /></SessionProvider>)

    expect(await screen.findByText('sin conexión')).toBeInTheDocument()
    expect(screen.getByTestId('state')).toHaveTextContent('sin sesión')

    window.dispatchEvent(new Event('online'))
    expect(await screen.findByText('con sesión, cambio pendiente: false')).toBeInTheDocument()
    expect(screen.getByTestId('unreachable')).toHaveTextContent('conectado')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('un servidor que no responde (503 del proxy mientras reinicia) tampoco da la sesión por cerrada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(problem(503, 'SERVICE_UNAVAILABLE')))
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(await screen.findByText('sin conexión')).toBeInTheDocument()
  })

  // Review advisory R3-001: a 500 is an error of the application, not a missing answer; it keeps the sign-in with its message.
  it('un 500 al abrir la app no es falta de conexión: muestra el ingreso con el error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(problem(500, 'INTERNAL_ERROR')))
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByTestId('unreachable')).toHaveTextContent('conectado')
    expect(screen.getByTestId('error')).not.toHaveTextContent(/^$/)
  })

  it('un 401 al abrir la app sigue siendo el ingreso, no la falta de conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(problem(401, 'UNAUTHORIZED')))
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByTestId('unreachable')).toHaveTextContent('conectado')
  })

  it('sin sesión al abrir la app muestra el ingreso sin hablar de sesión vencida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(problem(401, 'UNAUTHORIZED')))
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByTestId('error')).toHaveTextContent('')
  })

  it('un 401 en una mutación vuelve al ingreso con el aviso de sesión vencida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(session())).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(problem(401, 'UNAUTHORIZED')))
    render(<SessionProvider><Probe /></SessionProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'cambiar empresa' }))

    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    // #71 (2026-10-30, main CI red): the notice can render in a later commit than the session reset, so wait for it.
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Tu sesión venció. Iniciá sesión nuevamente.'))
  })

  it('una contraseña actual incorrecta no cierra la sesión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(session(true))).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(problem(401, 'CURRENT_PASSWORD_INVALID')))
    render(<SessionProvider><Probe /></SessionProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'cambiar contraseña' }))

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument()
    expect(screen.getByTestId('state')).toHaveTextContent('con sesión, cambio pendiente: true')
    expect(screen.getByTestId('error')).toHaveTextContent('')
  })

  it('si el servidor exige cambiar la contraseña, lleva a la pantalla de cambio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(session())).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(problem(403, 'PASSWORD_CHANGE_REQUIRED')))
    render(<SessionProvider><Probe /></SessionProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'cambiar empresa' }))

    expect(await screen.findByText('con sesión, cambio pendiente: true')).toBeInTheDocument()
  })

  it('salir con la sesión ya vencida vuelve al ingreso sin informar un fallo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(session())).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(problem(401, 'UNAUTHORIZED')))
    render(<SessionProvider><Probe /></SessionProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'salir' }))

    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    expect(screen.getByTestId('error')).toHaveTextContent('')
  })

  it('si no se puede confirmar la salida, lo dice sin hablar de servidores', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(session())).mockResolvedValueOnce(csrf()).mockRejectedValueOnce(new TypeError('Failed to fetch')))
    render(<SessionProvider><Probe /></SessionProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'salir' }))

    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('No pudimos confirmar que la sesión se cerró. Si terminaste, cerrá también esta pestaña.'))
  })
})
