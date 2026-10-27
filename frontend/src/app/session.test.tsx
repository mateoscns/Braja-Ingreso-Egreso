import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  const { session: current, loading, error, activateCompany, changePassword, signOut } = useSession()
  const [failure, setFailure] = useState('')
  if (loading) return <p>cargando</p>
  return <div>
    <p data-testid="state">{current ? `con sesión, cambio pendiente: ${current.mustChangePassword}` : 'sin sesión'}</p>
    <p data-testid="error">{error}</p>
    <p data-testid="failure">{failure}</p>
    <button onClick={() => { activateCompany('c-2').catch((reason: Error) => setFailure(reason.message)) }}>cambiar empresa</button>
    <button onClick={() => { changePassword('incorrecta', 'nueva-contraseña-larga').catch((reason: Error) => setFailure(reason.message)) }}>cambiar contraseña</button>
    <button onClick={() => void signOut()}>salir</button>
  </div>
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); api.clearCsrf() })

describe('SessionProvider', () => {
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
    expect(screen.getByTestId('error')).toHaveTextContent('Tu sesión venció. Iniciá sesión nuevamente.')
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
})
