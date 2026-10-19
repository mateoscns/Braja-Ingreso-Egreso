import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginScreen, CompanyScreen } from './AuthScreens'

describe('pantallas de acceso', () => {
  it('envía DNI y contraseña al servidor sin guardarlos en el navegador', async () => {
    const onSignIn = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onSignIn={onSignIn} />)
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30123456' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'temporary-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    await waitFor(() => expect(onSignIn).toHaveBeenCalledWith('30123456', 'temporary-password'))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('ofrece solo memberships entregadas por el servidor para elegir empresa', () => {
    const session = { accountId: 'a', memberships: [
      { companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' as const },
      { companyId: 'c-2', companyName: 'Otra empresa', role: 'EMPLOYEE' as const }
    ], activeCompanyId: null, mustChangePassword: false }
    render(<CompanyScreen session={session} onSelect={vi.fn()} onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Braja/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Otra empresa/ })).toBeInTheDocument()
    expect(screen.queryByText('Elegí una empresa externa')).not.toBeInTheDocument()
  })
})
