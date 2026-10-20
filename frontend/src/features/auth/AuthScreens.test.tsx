import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginScreen, CompanyScreen, PasswordChangeScreen } from './AuthScreens'

afterEach(cleanup)

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

  it('anuncia que el login espera al servidor y presenta el error de forma accesible', async () => {
    let rejectSignIn!: (reason: Error) => void
    const pending = new Promise<void>((_, reject) => { rejectSignIn = reject })
    const onSignIn = vi.fn(() => pending)
    render(<LoginScreen onSignIn={onSignIn} />)
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30123456' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'temporary-password' } })
    const form = screen.getByRole('button', { name: 'Ingresar' }).closest('form')!

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(form).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByRole('status')).toHaveTextContent('Esperando respuesta del servidor para iniciar sesión')
    expect(screen.getByRole('button', { name: 'Ingresando…' })).toBeDisabled()

    rejectSignIn(new Error('Revisá el DNI y la contraseña.'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá el DNI y la contraseña.')
    await waitFor(() => expect(form).toHaveAttribute('aria-busy', 'false'))
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

  it('anuncia la selección de empresa y expone errores del servidor', async () => {
    let rejectSelection!: (reason: Error) => void
    const pending = new Promise<void>((_, reject) => { rejectSelection = reject })
    const session = { accountId: 'a', memberships: [
      { companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' as const },
      { companyId: 'c-2', companyName: 'Otra empresa', role: 'EMPLOYEE' as const }
    ], activeCompanyId: null, mustChangePassword: false }
    render(<CompanyScreen session={session} onSelect={vi.fn(() => pending)} onSignOut={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Braja/ }))

    expect(await screen.findByRole('status')).toHaveTextContent('Esperando la activación de Braja')
    expect(screen.getByRole('button', { name: /Braja/ })).toBeDisabled()
    rejectSelection(new Error('No se pudo activar Braja.'))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo activar Braja.')
    await waitFor(() => expect(screen.getByRole('button', { name: /Braja/ })).toBeEnabled())
  })

  it('valida la confirmación y anuncia el cambio de contraseña pendiente y fallido', async () => {
    let rejectChange!: (reason: Error) => void
    const pending = new Promise<void>((_, reject) => { rejectChange = reject })
    const onChange = vi.fn(() => pending)
    render(<PasswordChangeScreen onChange={onChange} onSignOut={vi.fn()} />)
    const current = screen.getByLabelText('Contraseña actual')
    const next = screen.getByLabelText('Nueva contraseña')
    const confirm = screen.getByLabelText('Repetí la nueva contraseña')

    fireEvent.change(current, { target: { value: 'temporary-password' } })
    fireEvent.change(next, { target: { value: 'CorrectHorseBattery9!' } })
    fireEvent.change(confirm, { target: { value: 'DifferentHorseBattery9!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas nuevas no coinciden.')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(confirm, { target: { value: 'CorrectHorseBattery9!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    const form = screen.getByRole('button', { name: 'Guardando…' }).closest('form')!
    expect(form).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByRole('status')).toHaveTextContent('Esperando confirmación del servidor')
    expect(onChange).toHaveBeenCalledWith('temporary-password', 'CorrectHorseBattery9!')
    rejectChange(new Error('La contraseña actual no coincide.'))

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no coincide.')
    await waitFor(() => expect(form).toHaveAttribute('aria-busy', 'false'))
  })
})
