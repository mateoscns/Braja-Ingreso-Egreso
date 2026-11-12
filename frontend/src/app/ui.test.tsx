import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Icon, type IconName } from './icons'
import { AppHeader, Brand, CompanySwitcher, Fieldset, FieldsSummary, FormField, LoadFailure, Loading, PageHeading, PageMessage, Panel, Status, StatusTag } from './ui'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

/** The markup of one icon of the set, to tell which drawing a component put in. */
const iconMarkup = (name: IconName) => renderToStaticMarkup(<Icon name={name} />)

const memberships = [
  { companyId: 'company-1', companyName: 'Braja', role: 'ADMIN' as const },
  { companyId: 'company-2', companyName: 'Otra empresa', role: 'EMPLOYEE' as const }
]

describe('componentes compartidos de interfaz', () => {
  it('el encabezado cierra la sesión con un botón que lo dice', () => {
    const onSignOut = vi.fn()
    render(<AppHeader companyName="Braja" name="Lucía" onSignOut={onSignOut} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(onSignOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument()
  })

  // Finding F-28: the brand was a link to '#inicio', which led nowhere, and «FichajeBraja» was read as one word.
  it('la marca dice "Fichaje Braja" con un espacio y es un enlace solo donde lleva a algún lado (el ADMIN)', () => {
    const { rerender } = render(<AppHeader companyName="Braja" name="Lucía" onSignOut={vi.fn()} />)
    const banner = screen.getByRole('banner')

    expect(banner.querySelector('.brand')?.textContent).toBe('Fichaje Braja')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    rerender(<AppHeader companyName="Braja" name="Lucía" home="#/para-revisar" onSignOut={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'Fichaje Braja, inicio' })
    expect(link).toHaveAttribute('href', '#/para-revisar')
    expect(link.textContent).toBe('Fichaje Braja')
  })

  it('la marca sola, como en las pantallas de ingreso, es texto con el mismo espacio entre las palabras', () => {
    const { container } = render(<Brand />)

    expect(container.textContent).toBe('Fichaje Braja')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('el encabezado muestra la empresa y la persona, y los avisos de sus controles van debajo de la barra, no adentro', async () => {
    const request = deferred<void>()
    const { rerender } = render(<AppHeader companyName="Panadería Los Hermanos" name="Lucía Pérez" onSignOut={vi.fn()} />)
    const banner = screen.getByRole('banner')

    expect(banner).toHaveTextContent('Panadería Los Hermanos · Lucía Pérez')
    rerender(<AppHeader companyName="Braja" name="Lucía Pérez" onSignOut={vi.fn()}>
      <CompanySwitcher memberships={memberships} activeCompanyId="company-1" onSelect={() => request.promise} />
    </AppHeader>)
    // The select keeps its name and now shows it as a visible label.
    expect(screen.getByText('Empresa activa').tagName).toBe('LABEL')
    fireEvent.change(screen.getByRole('combobox', { name: 'Empresa activa' }), { target: { value: 'company-2' } })

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Esperando la activación de Otra empresa')
    expect(banner).not.toContainElement(status)
    expect(banner.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    request.resolve()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Empresa activa' })).toBeEnabled())
  })

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
    expect(error).toHaveClass('field-error')
    // An error is not a hint in red: it has its own class and its own place.
    expect(error).not.toHaveClass('field-hint')
    expect(control.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ordena el campo como etiqueta, ayuda, control y error: la ayuda se lee antes de escribir', () => {
    const { container } = render(<FormField label="DNI" hint="Usá solo números." error="El DNI tiene que tener de 7 a 12 números."><input /></FormField>)

    const field = container.firstElementChild!
    expect([...field.children]).toEqual([
      screen.getByText('DNI'),
      screen.getByText('Usá solo números.'),
      screen.getByLabelText('DNI'),
      screen.getByText('El DNI tiene que tener de 7 a 12 números.')
    ])
  })

  it('marca el campo entero como inválido solo cuando tiene un error', () => {
    const { container, rerender } = render(<FormField label="DNI" error="El DNI tiene que tener de 7 a 12 números."><input /></FormField>)

    expect(container.firstElementChild).toHaveClass('field', 'field-invalid')
    rerender(<FormField label="DNI" hint="Usá solo números."><input /></FormField>)
    expect(container.firstElementChild).toHaveClass('field')
    expect(container.firstElementChild).not.toHaveClass('field-invalid')
  })

  it('sin error no marca el campo como inválido y conserva su descripción propia', () => {
    render(<FormField label="Fecha"><input aria-describedby="ayuda-externa" aria-invalid="false" /></FormField>)

    const control = screen.getByLabelText('Fecha')
    expect(control).toHaveAttribute('aria-describedby', 'ayuda-externa')
    expect(control).toHaveAttribute('aria-invalid', 'false')
  })

  // Slice F2b: a group of checks or choices is one field too, with its hint first and its error last, both read with the group.
  it('un grupo de controles es un campo: leyenda, ayuda, controles y error, que lo marca inválido', () => {
    const { rerender } = render(<Fieldset legend="Locales donde trabaja" hint="Marcá uno o más." error="Marcá al menos un local."><label><input type="checkbox" />Local Centro</label></Fieldset>)

    const group = screen.getByRole('group', { name: 'Locales donde trabaja' })
    expect(group).toHaveClass('field', 'field-invalid')
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('Marcá uno o más. Marcá al menos un local.')
    expect([...group.children].map((child) => child.className || child.tagName)).toEqual(['field-label', 'field-hint', 'LABEL', 'field-error'])
    expect(screen.getByText('Marcá al menos un local.').querySelector('svg')?.outerHTML).toBe(iconMarkup('alert'))

    rerender(<Fieldset legend="Locales donde trabaja" hint="Marcá uno o más." className="field-wide"><label><input type="checkbox" />Local Centro</label></Fieldset>)
    expect(group).toHaveClass('field', 'field-wide')
    expect(group).not.toHaveClass('field-invalid')
    expect(group).not.toHaveAttribute('aria-invalid')
    expect(group).toHaveAccessibleDescription('Marcá uno o más.')
  })

  it('el error de un grupo puede llevar el id que le dan, para un control de adentro que también lo nombra', () => {
    render(<Fieldset legend="¿Para qué período?" error="Elegí el primer y el último día." errorId="period-error"><input aria-label="Primer día" aria-describedby="period-error" /></Fieldset>)

    expect(screen.getByLabelText('Primer día')).toHaveAccessibleDescription('Elegí el primer y el último día.')
  })

  it('el resumen de un formulario largo aparece solo con dos o más campos mal, como alerta', () => {
    const { rerender } = render(<FieldsSummary count={1} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<FieldsSummary count={2} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá lo que está marcado debajo de cada campo.')
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
    expect(renderToStaticMarkup(<PageMessage kind="warning">Tu marca quedó sin ubicación.</PageMessage>))
      .toBe('<div class="message message-warning" role="status" aria-atomic="true"></div>')
    // An alert is announced when it appears, so its text is there from the start. Changed in slice B4: its icon comes first.
    expect(renderToStaticMarkup(<PageMessage kind="error">No se pudo guardar.</PageMessage>))
      .toBe(`<div class="message message-error" role="alert" aria-atomic="true">${iconMarkup('error')}<div class="message-body">No se pudo guardar.</div></div>`)

    const { rerender } = render(<PageMessage kind="success">Guardado.</PageMessage>)
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Guardado.')
    rerender(<PageMessage kind="success">Se guardó otra vez.</PageMessage>)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Se guardó otra vez.')
  })

  // Slice F3 (WCAG 4.1.3): a line that comes and goes («Entrando…», «Enviando tu marca…») is announced only if its region is
  // already in the document when its text arrives.
  it('una línea de espera monta su región vacía y recién después escribe el texto, para que se anuncie', () => {
    expect(renderToStaticMarkup(<Status>Entrando, esperá un momento…</Status>))
      .toBe('<p role="status" aria-atomic="true"></p>')
    expect(renderToStaticMarkup(<Status as="div" className="message message-info"><span className="spinner" aria-hidden="true" /><div className="message-body">Enviando tu marca… esperá un momento.</div></Status>))
      .toBe('<div class="message message-info" role="status" aria-atomic="true"></div>')
    expect(renderToStaticMarkup(<Status as="span" className="site-location-message">Buscando la ubicación…</Status>))
      .toBe('<span class="site-location-message" role="status" aria-atomic="true"></span>')

    const { rerender } = render(<Status className="muted small-copy">Enviando lo que escribiste…</Status>)
    const region = screen.getByRole('status')
    expect(region.tagName).toBe('P')
    expect(region).toHaveClass('muted', 'small-copy')
    expect(region).toHaveTextContent('Enviando lo que escribiste…')
    rerender(<Status className="muted small-copy">Enviando otra vez…</Status>)
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Enviando otra vez…')
  })

  it('la carga también monta su región vacía y recién después escribe el texto', () => {
    expect(renderToStaticMarkup(<Loading label="Cargando tu día…" />))
      .toBe('<div class="loading" role="status" aria-atomic="true"></div>')

    const { container } = render(<Loading label="Cargando tu día…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tu día…')
    expect(container.querySelector('.loading > .spinner')).toHaveAttribute('aria-hidden', 'true')
  })

  it('cada tipo de mensaje tiene su rol y su ícono, oculto para los lectores: el tipo lo dicen las palabras y la barra', () => {
    const kinds = [['info', 'info', 'status'], ['success', 'check', 'status'], ['warning', 'alert', 'status'], ['error', 'error', 'alert']] as const

    for (const [kind, icon, role] of kinds) {
      render(<PageMessage kind={kind}>Texto del aviso.</PageMessage>)
      const region = screen.getByRole(role)
      const drawing = region.querySelector('svg')

      expect(region, kind).toHaveClass('message', `message-${kind}`)
      expect(drawing, kind).toHaveAttribute('aria-hidden', 'true')
      expect(drawing?.outerHTML, kind).toBe(iconMarkup(icon))
      // The icon adds no words: what is read is the text alone.
      expect(region.textContent, kind).toBe('Texto del aviso.')
      cleanup()
    }
  })

  it('una etiqueta de estado dice el estado con un ícono y una palabra, y no es un botón', () => {
    render(<StatusTag tone="todo" icon="eye">A revisar</StatusTag>)

    const tag = screen.getByText('A revisar')
    expect(tag.tagName).toBe('SPAN')
    expect(tag).toHaveClass('status-chip', 'status-todo')
    expect(tag.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(tag.querySelector('svg')?.outerHTML).toBe(iconMarkup('eye'))
    expect(tag.textContent).toBe('A revisar')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('las cinco tonalidades de una etiqueta son clases, no valores de la API', () => {
    for (const tone of ['neutral', 'wait', 'todo', 'ok', 'bad'] as const) {
      const { container } = render(<StatusTag tone={tone} icon="check">Palabra</StatusTag>)
      expect(container.firstElementChild, tone).toHaveClass('status-chip', `status-${tone}`)
      cleanup()
    }
  })

  it('un error de campo lleva el triángulo, oculto para los lectores, y se sigue leyendo solo el texto', () => {
    render(<FormField label="DNI" error="El DNI tiene que tener de 7 a 12 números."><input /></FormField>)

    const error = screen.getByText('El DNI tiene que tener de 7 a 12 números.')
    expect(error.querySelector('svg')?.outerHTML).toBe(iconMarkup('alert'))
    expect(screen.getByLabelText('DNI')).toHaveAccessibleDescription('El DNI tiene que tener de 7 a 12 números.')
  })

  it('una carga fallida es un error con un botón para reintentar', () => {
    const onRetry = vi.fn()
    render(<LoadFailure message="No se pudieron cargar los empleados." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los empleados.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('una carga fallida conserva el texto de su botón y lo desactiva mientras se vuelve a pedir', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<LoadFailure message="No se pudieron cargar los datos del día." retryLabel="Reintentar datos del día" onRetry={onRetry} />)

    const retry = screen.getByRole('button', { name: 'Reintentar datos del día' })
    expect(retry).toBeEnabled()
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<LoadFailure message="No se pudieron cargar los datos del día." retryLabel="Reintentar datos del día" disabled onRetry={onRetry} />)
    expect(screen.getByRole('button', { name: 'Reintentar datos del día' })).toBeDisabled()
  })

  it('el encabezado de página tiene el título como h1 y su bajada, sin línea de arriba, y una acción opcional', () => {
    const { container, rerender } = render(<PageHeading title="Empleados" subtitle="Cada persona entra con su DNI." />)

    expect(screen.getByRole('heading', { level: 1, name: 'Empleados' })).toBeInTheDocument()
    // The owner removed the eyebrows (2026-11-11): the title is the first line.
    expect(container.querySelector('.eyebrow')).toBeNull()
    expect(screen.getByText('Cada persona entra con su DNI.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<PageHeading title="Empleados" subtitle="Cada persona entra con su DNI." action={<button type="button">Actualizar</button>} />)
    expect(screen.getByRole('button', { name: 'Actualizar' }).closest('.page-title-row')).not.toBeNull()
  })

  // Slice F1 (WCAG 2.4.3): after a change of section the title takes the focus, so it is read first; it is not a stop of Tab.
  it('el título de la página puede recibir el foco desde el código, pero Tab no se detiene en él', () => {
    render(<PageHeading title="Empleados" subtitle="Cada persona entra con su DNI." />)
    const title = screen.getByRole('heading', { level: 1, name: 'Empleados' })

    expect(title).toHaveAttribute('tabindex', '-1')
    title.focus()
    expect(title).toHaveFocus()
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
