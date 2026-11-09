import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompanySwitcher, FormField, Loading, PageMessage, Panel } from './ui'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

const memberships = [
  { companyId: 'company-1', companyName: 'Braja', role: 'ADMIN' as const },
  { companyId: 'company-2', companyName: 'Otra empresa', role: 'EMPLOYEE' as const }
]

describe('componentes compartidos de interfaz', () => {
  it('asocia la ayuda de un campo con su control', () => {
    render(<FormField label="DNI" hint="Usá solo números."><input /></FormField>)

    const hint = screen.getByText('Usá solo números.')
    expect(screen.getByLabelText('DNI')).toHaveAttribute('aria-describedby', hint.id)
  })

  it('muestra el error debajo del campo y lo asocia al control', () => {
    render(<FormField label="DNI" hint="Usá solo números." error="El DNI tiene que tener de 7 a 12 números."><input /></FormField>)

    const control = screen.getByLabelText('DNI')
    const hint = screen.getByText('Usá solo números.')
    const error = screen.getByText('El DNI tiene que tener de 7 a 12 números.')
    expect(control).toHaveAttribute('aria-invalid', 'true')
    expect(control).toHaveAttribute('aria-describedby', `${hint.id} ${error.id}`)
    expect(control).toHaveAccessibleDescription('Usá solo números. El DNI tiene que tener de 7 a 12 números.')
    expect(error).toHaveClass('field-hint', 'field-hint-error')
  })

  it('sin error no marca el campo como inválido y conserva su descripción propia', () => {
    render(<FormField label="Fecha"><input aria-describedby="ayuda-externa" aria-invalid="false" /></FormField>)

    const control = screen.getByLabelText('Fecha')
    expect(control).toHaveAttribute('aria-describedby', 'ayuda-externa')
    expect(control).toHaveAttribute('aria-invalid', 'false')
  })

  it('nombra las regiones de paneles con su título', () => {
    render(<Panel title="Jornada de hoy">Contenido</Panel>)

    expect(screen.getByRole('region', { name: 'Jornada de hoy' })).toBeInTheDocument()
  })

  it('expone mensajes y carga como feedback accesible', () => {
    const { container } = render(<><PageMessage kind="error">No se pudo guardar.</PageMessage><Loading /></>)

    expect(screen.getByRole('alert')).toHaveAttribute('aria-atomic', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    expect(container.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true')
  })

  it('monta la región de un aviso vacía y recién después escribe el texto, para que se anuncie', () => {
    expect(renderToStaticMarkup(<PageMessage kind="success">Guardado.</PageMessage>))
      .toBe('<div class="message message-success" role="status" aria-atomic="true"></div>')
    expect(renderToStaticMarkup(<PageMessage>Cargando la configuración.</PageMessage>))
      .toBe('<div class="message message-info" role="status" aria-atomic="true"></div>')
    // An alert is announced when it appears, so its text is there from the start.
    expect(renderToStaticMarkup(<PageMessage kind="error">No se pudo guardar.</PageMessage>))
      .toBe('<div class="message message-error" role="alert" aria-atomic="true">No se pudo guardar.</div>')

    const { rerender } = render(<PageMessage kind="success">Guardado.</PageMessage>)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Guardado.')
    rerender(<PageMessage kind="success">Se guardó otra vez.</PageMessage>)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Se guardó otra vez.')
  })

  it('bloquea cambios simultáneos y anuncia la activación pendiente', async () => {
    const request = deferred<void>()
    const onSelect = vi.fn(() => request.promise)
    render(<CompanySwitcher memberships={memberships} activeCompanyId="company-1" onSelect={onSelect} />)

    const select = screen.getByRole('combobox', { name: 'Empresa activa' })
    fireEvent.change(select, { target: { value: 'company-2' } })

    expect(select).toBeDisabled()
    expect(await screen.findByRole('status')).toHaveTextContent('Esperando la activación de Otra empresa')
    fireEvent.change(select, { target: { value: 'company-1' } })
    expect(onSelect).toHaveBeenCalledTimes(1)

    request.resolve()
    await waitFor(() => expect(select).toBeEnabled())
  })

  it('libera el selector después de un error y permite volver a intentar', async () => {
    const onSelect = vi.fn()
      .mockRejectedValueOnce(new Error('No se pudo activar la empresa.'))
      .mockResolvedValueOnce(undefined)
    render(<CompanySwitcher memberships={memberships} activeCompanyId="company-1" onSelect={onSelect} />)

    const select = screen.getByRole('combobox', { name: 'Empresa activa' })
    fireEvent.change(select, { target: { value: 'company-2' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo activar la empresa.')
    await waitFor(() => expect(select).toBeEnabled())
    fireEvent.change(select, { target: { value: 'company-2' } })

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(select).toBeEnabled())
  })
})
