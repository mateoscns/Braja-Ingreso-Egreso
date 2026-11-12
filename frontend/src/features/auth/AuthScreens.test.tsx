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

/** An accessible description that holds this text, whatever else (a hint) is read with it. */
function describedWith(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

const twoCompanies = { accountId: 'a', memberships: [
  { companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' as const },
  { companyId: 'c-2', companyName: 'Otra empresa', role: 'EMPLOYEE' as const }
], activeCompanyId: null, mustChangePassword: false }

// Slice G1 (WCAG 2.4.1): the three screens start with «Ir al contenido», as the apps do, and keep one main as its target.
describe('el salto al contenido de las pantallas de acceso', () => {
  it.each([
    ['ingreso', () => <LoginScreen onSignIn={vi.fn()} />],
    ['elegir empresa', () => <CompanyScreen session={twoCompanies} onSelect={vi.fn()} onSignOut={vi.fn()} />],
    ['cambiar la contraseña', () => <PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />]
  ])('en la pantalla de %s lo primero que alcanza Tab es «Ir al contenido», que lleva al único main', (_name, screenOf) => {
    render(screenOf())
    const focusable = document.querySelector<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
    const main = document.querySelector('main')

    expect(focusable).toBe(screen.getByRole('link', { name: 'Ir al contenido' }))
    expect(focusable).toHaveAttribute('href', '#contenido')
    expect(document.querySelectorAll('main')).toHaveLength(1)
    expect(main).toHaveAttribute('id', 'contenido')
    expect(main).toHaveAttribute('tabindex', '-1')
    fireEvent.click(focusable!)
    expect(main).toHaveFocus()
  })
})

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
    expect(confirm).toHaveAccessibleDescription('Las contraseñas nuevas no coinciden.')
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
      expect(screen.getByLabelText('Nueva contraseña')).toHaveAccessibleDescription(describedWith('La contraseña es demasiado larga. Usá una más corta: las letras con tilde y la ñ cuentan doble.'))
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
      expect(screen.getByLabelText('Nueva contraseña')).toHaveAccessibleDescription('Llevás 5 de 12. La contraseña nueva tiene que tener al menos 12 letras o números.')
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

// Slice F2a (design system 4.3 and 4.7; WCAG 3.3.1, 3.3.3): each form checks itself when it is sent, says what is wrong under
// each field and takes the focus to the first one; the browser's own bubble never shows. A field's error is read with its field
// and is not an alert of its own; what the server answers is one message inside the form, above its button.
describe('una sola forma de validar en las pantallas de acceso', () => {
  const isBefore = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('el ingreso vacío marca cada campo con su mensaje, sin la burbuja del navegador, y lleva el foco al DNI', async () => {
    const onSignIn = vi.fn()
    render(<LoginScreen onSignIn={onSignIn} />)
    const button = screen.getByRole('button', { name: 'Ingresar' })
    expect(button.closest('form')).toHaveAttribute('novalidate')
    expect(button).toBeEnabled()

    fireEvent.click(button)

    const dni = screen.getByLabelText('DNI')
    const password = screen.getByLabelText('Contraseña')
    expect(dni).toHaveAttribute('aria-invalid', 'true')
    expect(dni).toHaveAccessibleDescription('Escribí tu DNI.')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAccessibleDescription('Escribí tu contraseña.')
    await waitFor(() => expect(dni).toHaveFocus())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('un DNI corto dice cuántos números lleva; al corregirlo su mensaje se va', async () => {
    const onSignIn = vi.fn()
    render(<LoginScreen onSignIn={onSignIn} />)
    const dni = screen.getByLabelText('DNI')
    fireEvent.change(dni, { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'temporary-password' } })

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(dni).toHaveAccessibleDescription('El DNI tiene que tener de 7 a 12 números.')
    expect(screen.getByLabelText('Contraseña')).not.toHaveAttribute('aria-invalid')
    await waitFor(() => expect(dni).toHaveFocus())
    expect(onSignIn).not.toHaveBeenCalled()

    fireEvent.change(dni, { target: { value: '1234567' } })
    expect(dni).not.toHaveAttribute('aria-invalid')
    expect(dni).toHaveAccessibleDescription('')
  })

  it('con el DNI escrito y la contraseña vacía, el foco va a la contraseña', async () => {
    render(<LoginScreen onSignIn={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30123456' } })

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => expect(screen.getByLabelText('Contraseña')).toHaveFocus())
    expect(screen.getByLabelText('DNI')).not.toHaveAttribute('aria-invalid')
  })

  it('el error del ingreso es uno solo para el formulario, adentro y arriba del botón, sin señalar ningún campo', async () => {
    const onSignIn = vi.fn().mockRejectedValue(new Error('El DNI o la contraseña son incorrectos.'))
    render(<LoginScreen onSignIn={onSignIn} />)
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '30123456' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'temporary-password' } })
    const button = screen.getByRole('button', { name: 'Ingresar' })
    const form = button.closest('form')!

    fireEvent.click(button)

    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent('El DNI o la contraseña son incorrectos.')
    expect(isBefore(alert, screen.getByRole('button', { name: 'Ingresar' }))).toBe(true)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    for (const label of ['DNI', 'Contraseña']) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid')
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription('')
    }
  })

  it('el cambio de contraseña vacío marca la que te dieron y la nueva, y lleva el foco a la primera', async () => {
    const onChange = vi.fn()
    render(<PasswordChangeScreen onChange={onChange} onSignOut={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Guardar contraseña' })
    expect(button.closest('form')).toHaveAttribute('novalidate')
    expect(button).toBeEnabled()

    fireEvent.click(button)

    const current = screen.getByLabelText('Contraseña que te dieron')
    expect(current).toHaveAttribute('aria-invalid', 'true')
    expect(current).toHaveAccessibleDescription('Escribí la contraseña actual, la que te dieron para entrar.')
    const next = screen.getByLabelText('Nueva contraseña')
    expect(next).toHaveAttribute('aria-invalid', 'true')
    // The counter stays the hint, read before the error.
    expect(next).toHaveAccessibleDescription('Llevás 0 de 12. La contraseña nueva tiene que tener al menos 12 letras o números.')
    expect(screen.getByLabelText('Repetí la nueva contraseña')).not.toHaveAttribute('aria-invalid')
    await waitFor(() => expect(current).toHaveFocus())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('si las nuevas no coinciden lo dice debajo de la repetición y lleva el foco ahí', async () => {
    render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Contraseña que te dieron'), { target: { value: 'temporary-password' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'CorrectHorseBattery9!' } })
    fireEvent.change(screen.getByLabelText('Repetí la nueva contraseña'), { target: { value: 'CorrectHorseBattery' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    const confirm = screen.getByLabelText('Repetí la nueva contraseña')
    expect(confirm).toHaveAttribute('aria-invalid', 'true')
    expect(confirm).toHaveAccessibleDescription('Las contraseñas nuevas no coinciden.')
    await waitFor(() => expect(confirm).toHaveFocus())
    expect(screen.getByLabelText('Contraseña que te dieron')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Nueva contraseña')).not.toHaveAttribute('aria-invalid')
  })

  it('lo que responde el servidor al cambiar la contraseña va dentro del formulario, arriba de Guardar contraseña', async () => {
    render(<PasswordChangeScreen onChange={vi.fn().mockRejectedValue(new Error('La contraseña actual no coincide.'))} onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Contraseña que te dieron'), { target: { value: 'temporary-password' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'CorrectHorseBattery9!' } })
    fireEvent.change(screen.getByLabelText('Repetí la nueva contraseña'), { target: { value: 'CorrectHorseBattery9!' } })
    const form = screen.getByRole('button', { name: 'Guardar contraseña' }).closest('form')!

    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent('La contraseña actual no coincide.')
    expect(isBefore(alert, screen.getByRole('button', { name: 'Guardar contraseña' }))).toBe(true)
  })

  it('después de un envío fallido las contraseñas se siguen pudiendo pegar (3.3.8)', () => {
    render(<LoginScreen onSignIn={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(fireEvent.paste(screen.getByLabelText('Contraseña'))).toBe(true)
    cleanup()

    render(<PasswordChangeScreen onChange={vi.fn()} onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    for (const label of ['Contraseña que te dieron', 'Nueva contraseña', 'Repetí la nueva contraseña']) expect(fireEvent.paste(screen.getByLabelText(label))).toBe(true)
  })
})
