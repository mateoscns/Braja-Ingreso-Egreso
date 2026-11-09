import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginScreen, CompanyScreen, PasswordChangeScreen } from './AuthScreens'
import { clearMarkInterrupted, markWasInterrupted, noteMarkInterrupted } from './interruptedMark'

afterEach(() => { cleanup(); clearMarkInterrupted() })

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
    expect(await screen.findByRole('status')).toHaveTextContent('Entrando, esperá un momento…')
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
    expect(await screen.findByRole('status')).toHaveTextContent('Guardando tu contraseña…')
    expect(onChange).toHaveBeenCalledWith('temporary-password', 'CorrectHorseBattery9!')
    rejectChange(new Error('La contraseña actual no coincide.'))

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no coincide.')
    await waitFor(() => expect(form).toHaveAttribute('aria-busy', 'false'))
  })

  describe('new password limit: 72 UTF-8 bytes (BCrypt)', () => {
    function submitNewPassword(onChange: () => Promise<void>, password: string) {
      render(<PasswordChangeScreen onChange={onChange} onSignOut={vi.fn()} />)
      fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'temporary-password' } })
      fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: password } })
      fireEvent.change(screen.getByLabelText('Repetí la nueva contraseña'), { target: { value: password } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    }

    it('does not call the server with a 73-byte password that fits in 72 characters and explains the limit', async () => {
      const onChange = vi.fn().mockResolvedValue(undefined)
      submitNewPassword(onChange, `ñ${'a'.repeat(71)}`)
      expect(await screen.findByRole('alert')).toHaveTextContent('La clave es demasiado larga. Usá una más corta: las letras con tilde y la ñ cuentan doble.')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('sends a 72-byte password', async () => {
      const onChange = vi.fn().mockResolvedValue(undefined)
      submitNewPassword(onChange, 'ñ'.repeat(36))
      await waitFor(() => expect(onChange).toHaveBeenCalledWith('temporary-password', 'ñ'.repeat(36)))
    })

    it('limits the new password fields to 72 characters and states the limit', () => {
      render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
      expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('maxlength', '72')
      expect(screen.getByLabelText('Repetí la nueva contraseña')).toHaveAttribute('maxlength', '72')
      expect(screen.getByText('Elegí una clave de al menos 12 letras o números. Puede ser una frase.')).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/bytes|UTF-8|caracteres/)
    })
  })

  describe('ayuda para elegir y escribir la clave', () => {
    it('cuenta lo que lleva escrito la clave nueva hasta llegar a 12', () => {
      render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
      const next = screen.getByLabelText('Nueva contraseña')
      expect(next).toHaveAccessibleDescription('Llevás 0 de 12.')
      fireEvent.change(next, { target: { value: 'abcdefgh' } })
      expect(next).toHaveAccessibleDescription('Llevás 8 de 12.')
      fireEvent.change(next, { target: { value: 'mi perro toby' } })
      expect(next).toHaveAccessibleDescription('Llevás 13: alcanza.')
    })

    it('dice en palabras simples que la clave nueva es corta y no la envía', async () => {
      const onChange = vi.fn()
      render(<PasswordChangeScreen onChange={onChange} onSignOut={vi.fn()} />)
      fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'temporary-password' } })
      fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'corta' } })
      fireEvent.change(screen.getByLabelText('Repetí la nueva contraseña'), { target: { value: 'corta' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('La clave nueva tiene que tener al menos 12 letras o números.')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('Mostrar deja ver las claves al cambiarla y las vuelve a ocultar', () => {
      render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
      const toggle = screen.getByRole('button', { name: 'Mostrar contraseñas' })
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      for (const label of ['Contraseña actual', 'Nueva contraseña', 'Repetí la nueva contraseña']) expect(screen.getByLabelText(label)).toHaveAttribute('type', 'text')
      fireEvent.click(toggle)
      expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('type', 'password')
    })

    it('el ingreso permite ver la clave y dice qué hacer si se la olvidó', () => {
      render(<LoginScreen onSignIn={vi.fn()} />)
      expect(screen.getByText('¿Te olvidaste la clave? Pedile al encargado una nueva.')).toBeInTheDocument()
      const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' })
      fireEvent.click(toggle)
      expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text')
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('marca cortada por una sesión vencida', () => {
    it('el ingreso dice que hay que entrar de nuevo y que la marca no se guardó', async () => {
      noteMarkInterrupted()
      const onSignIn = vi.fn().mockResolvedValue(undefined)
      render(<LoginScreen onSignIn={onSignIn} error="Tu sesión venció. Iniciá sesión nuevamente." />)
      expect(screen.getByRole('alert')).toHaveTextContent('Pasó mucho tiempo y hay que entrar de nuevo. Tu marca todavía no se guardó.')
      expect(screen.queryByText(/Tu sesión venció/)).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30123456' } })
      fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'temporary-password' } })
      fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
      await waitFor(() => expect(onSignIn).toHaveBeenCalled())
      expect(markWasInterrupted()).toBe(false)
    })

    it('sin una marca cortada muestra el aviso de sesión de siempre', () => {
      render(<LoginScreen onSignIn={vi.fn()} error="Tu sesión venció. Iniciá sesión nuevamente." />)
      expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión venció. Iniciá sesión nuevamente.')
    })
  })
})
