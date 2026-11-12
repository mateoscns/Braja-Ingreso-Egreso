import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginScreen, CompanyScreen, PasswordChangeScreen } from './AuthScreens'
import { clearMarkInterrupted, markWasInterrupted, noteMarkInterrupted } from './interruptedMark'

afterEach(() => { cleanup(); clearMarkInterrupted() })

/**
 * Watches the document and tells whether a status region entered it empty and got its text afterwards: screen readers announce
 * a change inside a region they already know, and often say nothing for one that arrives with its text (WCAG 4.1.3, slice F3).
 */
function watchStatusRegions() {
  const records: MutationRecord[] = []
  const observer = new MutationObserver((batch) => { records.push(...batch) })
  observer.observe(document.body, { childList: true, subtree: true })
  return {
    enteredEmpty(region: Element) {
      records.push(...observer.takeRecords())
      observer.disconnect()
      const entered = records.findIndex((record) => [...record.addedNodes].some((node) => node.contains(region)))
      return entered >= 0 && records.slice(entered + 1).some((record) => record.addedNodes.length > 0 && region.contains(record.target))
    }
  }
}

const twoCompanies = { accountId: 'a', memberships: [
  { companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' as const },
  { companyId: 'c-2', companyName: 'Otra empresa', role: 'EMPLOYEE' as const }
], activeCompanyId: null, mustChangePassword: false }

describe('las esperas de las pantallas de acceso se anuncian: su región está antes que su texto', () => {
  it('al ingresar', async () => {
    render(<LoginScreen onSignIn={() => new Promise<void>(() => {})} />)
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30123456' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'temporary-password' } })
    const watch = watchStatusRegions()

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Entrando, esperá un momento…')
    expect(watch.enteredEmpty(status)).toBe(true)
  })

  it('al elegir una empresa', async () => {
    render(<CompanyScreen session={twoCompanies} onSelect={() => new Promise<void>(() => {})} onSignOut={vi.fn()} />)
    const watch = watchStatusRegions()

    fireEvent.click(screen.getByRole('button', { name: /Braja/ }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Esperando la activación de Braja…')
    expect(watch.enteredEmpty(status)).toBe(true)
  })

  it('al guardar la contraseña nueva', async () => {
    render(<PasswordChangeScreen onChange={() => new Promise<void>(() => {})} onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Contraseña que te dieron'), { target: { value: 'temporary-password' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'CorrectHorseBattery9!' } })
    fireEvent.change(screen.getByLabelText('Repetí la nueva contraseña'), { target: { value: 'CorrectHorseBattery9!' } })
    const watch = watchStatusRegions()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Guardando tu contraseña…')
    expect(watch.enteredEmpty(status)).toBe(true)
  })
})

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
    const current = screen.getByLabelText('Contraseña que te dieron')
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
      fireEvent.change(screen.getByLabelText('Contraseña que te dieron'), { target: { value: 'temporary-password' } })
      fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: password } })
      fireEvent.change(screen.getByLabelText('Repetí la nueva contraseña'), { target: { value: password } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    }

    it('does not call the server with a 73-byte password that fits in 72 characters and explains the limit', async () => {
      const onChange = vi.fn().mockResolvedValue(undefined)
      submitNewPassword(onChange, `ñ${'a'.repeat(71)}`)
      expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña es demasiado larga. Usá una más corta: las letras con tilde y la ñ cuentan doble.')
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
      expect(screen.getByText('Elegí una contraseña de al menos 12 letras o números. Puede ser una frase.')).toBeInTheDocument()
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
      fireEvent.change(screen.getByLabelText('Contraseña que te dieron'), { target: { value: 'temporary-password' } })
      fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'corta' } })
      fireEvent.change(screen.getByLabelText('Repetí la nueva contraseña'), { target: { value: 'corta' } })
      fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña nueva tiene que tener al menos 12 letras o números.')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('Mostrar deja ver las claves al cambiarla y las vuelve a ocultar', () => {
      render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
      const toggle = screen.getByRole('button', { name: 'Mostrar contraseñas' })
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      for (const label of ['Contraseña que te dieron', 'Nueva contraseña', 'Repetí la nueva contraseña']) expect(screen.getByLabelText(label)).toHaveAttribute('type', 'text')
      fireEvent.click(toggle)
      expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute('type', 'password')
    })

    it('el ingreso permite ver la clave y dice qué hacer si se la olvidó', () => {
      render(<LoginScreen onSignIn={vi.fn()} />)
      expect(screen.getByText('¿Te olvidaste la contraseña? Pedile al encargado una nueva.')).toBeInTheDocument()
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

// Slice D4: the three screens sit under the top bar of the app, with the brand only, and on the flat page of the design system
// (no card). The owner removed the line in capitals above each title (2026-11-11: "Sacarlas todas").
describe('pantallas de acceso: la barra de la marca y la hoja plana', () => {
  const screens: [string, () => ReturnType<typeof render>][] = [
    ['el ingreso', () => render(<LoginScreen onSignIn={vi.fn()} />)],
    ['el cambio de contraseña', () => render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)],
    ['la elección de empresa', () => render(<CompanyScreen session={twoCompanies} onSelect={vi.fn()} onSignOut={vi.fn()} />)]
  ]

  it.each(screens)('%s: la marca va como texto en la barra de arriba, el título es el único h1 y no hay renglón en mayúsculas', (_, show) => {
    const { container } = show()
    const banner = screen.getByRole('banner')

    expect(banner).toHaveTextContent('Fichaje Braja')
    // There is nowhere to go from here: the brand is text, as on the employee's screen.
    expect(within(banner).queryByRole('link')).toBeNull()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
    expect(container.querySelector('.eyebrow')).toBeNull()
    expect(container.textContent).not.toMatch(/INGRESO AL SISTEMA|CUENTA COMPARTIDA|PRIMER INGRESO/)
  })

  it('los campos conservan su etiqueta y su autocompletado, y la contraseña se puede pegar (3.3.8)', () => {
    render(<LoginScreen onSignIn={vi.fn()} />)
    expect(screen.getByLabelText('DNI')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('DNI')).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password')
    // fireEvent returns false when a handler prevented the default action.
    expect(fireEvent.paste(screen.getByLabelText('Contraseña'))).toBe(true)
    cleanup()

    render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
    expect(screen.getByLabelText('Contraseña que te dieron')).toHaveAttribute('autocomplete', 'current-password')
    for (const label of ['Nueva contraseña', 'Repetí la nueva contraseña']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'new-password')
      expect(fireEvent.paste(screen.getByLabelText(label))).toBe(true)
    }
  })

  it('solo el botón que sigue va relleno; mostrar la contraseña y cerrar sesión son enlaces', () => {
    const filled = (container: HTMLElement) => [...container.querySelectorAll('.button-primary')].map((button) => button.textContent)

    const login = render(<LoginScreen onSignIn={vi.fn()} />)
    expect(filled(login.container)).toEqual(['Ingresar'])
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveClass('button-link')
    cleanup()

    const change = render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
    expect(filled(change.container)).toEqual(['Guardar contraseña'])
    expect(screen.getByRole('button', { name: 'Mostrar contraseñas' })).toHaveClass('button-link')
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toHaveClass('button-link')
    cleanup()

    const companies = render(<CompanyScreen session={twoCompanies} onSelect={vi.fn()} onSignOut={vi.fn()} />)
    expect(filled(companies.container)).toEqual([])
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toHaveClass('button-link')
  })

  it('mostrar la contraseña suma un tilde al botón sin cambiarle el nombre', () => {
    render(<LoginScreen onSignIn={vi.fn()} />)
    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' })
    expect(toggle.querySelector('svg')).toBeNull()

    fireEvent.click(toggle)

    expect(toggle).toHaveAccessibleName('Mostrar contraseña')
    expect(toggle.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('cada empresa es una opción de una lista: su nombre sobre su rol, sin letra en un cuadro ni flecha escrita', () => {
    render(<CompanyScreen session={twoCompanies} onSelect={vi.fn()} onSignOut={vi.fn()} />)

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
    const braja = screen.getByRole('button', { name: /^Braja\s*Administración$/ })
    expect(braja).toHaveClass('choice')
    expect(braja.querySelector('.choice-text > strong')).toHaveTextContent('Braja')
    expect(braja.querySelector('.choice-text > small')).toHaveTextContent('Administración')
    expect(braja.querySelector('.choice-icon')).toBeNull()
    expect(braja).not.toHaveTextContent('→')
  })

  it('mientras se activa una empresa, la elegida muestra la rueda de espera en lugar de su flecha', async () => {
    render(<CompanyScreen session={twoCompanies} onSelect={() => new Promise<void>(() => {})} onSignOut={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Braja/ }))

    await screen.findByRole('status')
    expect(screen.getByRole('button', { name: /Braja/ }).querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: /Otra empresa/ }).querySelector('.spinner')).toBeNull()
  })
})
