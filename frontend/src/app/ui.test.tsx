import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Icon, type IconName } from './icons'
import { appSourcePaths, readSource } from './testing/sourceFiles'
import { AppHeader, Brand, CompanySwitcher, CONTENT_ID, Fieldset, FieldsSummary, FormField, LoadFailure, Loading, PageHeading, PageMessage, Panel, SkipLink, Status, StatusTag, TableScroll } from './ui'

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

  // Issue #177, follow-up F of slice G2: under 1024 px the bar is two rows, the brand and «Cerrar sesión» on the dark one and the
  // company, the person and this device's controls under them, but Tab went brand, the controls under it, then «Cerrar sesión».
  // The markup follows the rows of the phone; from 1024 px, one row, the stylesheet keeps the order of what is seen (reading-flow).
  it('en el orden del documento «Cerrar sesión» va después de la marca y antes de la empresa y sus controles, como en el teléfono', () => {
    render(<AppHeader companyName="Braja" name="Lucía" home="#/para-revisar" onSignOut={vi.fn()}><CompanySwitcher memberships={memberships} activeCompanyId="company-1" onSelect={vi.fn()} /></AppHeader>)
    const follows = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    const brand = screen.getByRole('link', { name: 'Fichaje Braja, inicio' })
    const signOut = screen.getByRole('button', { name: 'Cerrar sesión' })

    expect(follows(brand, signOut)).toBe(true)
    expect(follows(signOut, screen.getByText('Lucía'))).toBe(true)
    expect(follows(signOut, screen.getByRole('combobox', { name: 'Empresa activa' }))).toBe(true)
    expect(follows(signOut, screen.getByRole('button', { name: 'Cambiar' }))).toBe(true)
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
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))

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
    const button = screen.getByRole('button', { name: 'Cambiar' })
    fireEvent.change(select, { target: { value: 'company-2' } })
    fireEvent.click(button)

    expect(select).toBeDisabled()
    expect(button).toBeDisabled()
    expect(await screen.findByRole('status')).toHaveTextContent('Esperando la activación de Otra empresa')
    fireEvent.click(button)
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
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo activar la empresa.')
    await waitFor(() => expect(select).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(select).toBeEnabled())
  })
})

// T12 (#114, 2026-11-12; WCAG 3.2.2): the switch changed the company on the change of the list, so going through it with the
// keyboard reloaded the screen. Mateo answered "Lista + botón «Cambiar» (Recomendado)" (D-20261112-03).
describe('el cambio de empresa con un botón', () => {
  /** The app as App.tsx draws it: one screen per company, mounted again when the company changes. */
  function Screens({ titleLater = false }: { titleLater?: boolean }) {
    const [active, setActive] = useState('company-1')
    const [drawn, setDrawn] = useState(!titleLater)
    async function select(companyId: string) {
      setActive(companyId)
      if (titleLater) { setDrawn(false); setTimeout(() => setDrawn(true), 20) }
    }
    return <div key={active}>
      <CompanySwitcher memberships={memberships} activeCompanyId={active} onSelect={select} />
      <main id={CONTENT_ID} tabIndex={-1}>{drawn ? <h1>{`Pantalla de ${active}`}</h1> : <p>Cargando…</p>}</main>
    </div>
  }

  it('elegir en la lista no cambia nada; el cambio pasa al tocar «Cambiar»', async () => {
    const onSelect = vi.fn(() => Promise.resolve())
    render(<CompanySwitcher memberships={memberships} activeCompanyId="company-1" onSelect={onSelect} />)
    const select = screen.getByRole('combobox', { name: 'Empresa activa' })

    fireEvent.change(select, { target: { value: 'company-2' } })
    fireEvent.keyDown(select, { key: 'ArrowDown' })

    expect(onSelect).not.toHaveBeenCalled()
    expect(select).toHaveValue('company-2')
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('company-2')
    await waitFor(() => expect(select).toBeEnabled())
  })

  it('«Cambiar» con la empresa que ya está activa no pide nada', () => {
    const onSelect = vi.fn(() => Promise.resolve())
    render(<CompanySwitcher memberships={memberships} activeCompanyId="company-1" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('después del cambio el foco va al título de la pantalla nueva', async () => {
    render(<Screens />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Empresa activa' }), { target: { value: 'company-2' } })
    screen.getByRole('button', { name: 'Cambiar' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pantalla de company-2' })).toHaveFocus())
  })

  it('si la pantalla nueva dibuja su título después de cargar, el foco lo espera', async () => {
    render(<Screens titleLater />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Empresa activa' }), { target: { value: 'company-2' } })
    screen.getByRole('button', { name: 'Cambiar' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))

    const title = await screen.findByRole('heading', { level: 1, name: 'Pantalla de company-2' })
    await waitFor(() => expect(title).toHaveFocus())
    expect(title).toHaveAttribute('tabindex', '-1')
  })

  it('el selector y su botón van juntos en la barra de arriba', () => {
    render(<AppHeader companyName="Braja" name="Lucía" onSignOut={vi.fn()}><CompanySwitcher memberships={memberships} activeCompanyId="company-1" onSelect={vi.fn()} /></AppHeader>)
    const wrap = screen.getByRole('combobox', { name: 'Empresa activa' }).parentElement!
    expect(wrap).toHaveClass('company-switch-wrap')
    expect(wrap).toContainElement(screen.getByRole('button', { name: 'Cambiar' }))
    expect(screen.getByRole('banner')).toContainElement(wrap)
  })
})

// Slice G1 (WCAG 2.4.1): every screen starts with «Ir al contenido» (the owner, 2026-11-12: "«Ir al contenido» (Recomendado)"),
// which takes the focus to the screen's one main.
describe('el salto al contenido', () => {
  it('lleva el foco al main de la pantalla sin cambiar la dirección, que en el ADMIN es la sección', () => {
    window.history.replaceState(null, '', '/admin#/hoy')
    render(<><SkipLink /><header><button type="button">Cerrar sesión</button></header><main id={CONTENT_ID} tabIndex={-1}><h1>Hoy</h1></main></>)
    const link = screen.getByRole('link', { name: 'Ir al contenido' })

    expect(link).toHaveAttribute('href', '#contenido')
    expect(fireEvent.click(link)).toBe(false)
    expect(screen.getByRole('main')).toHaveFocus()
    expect(window.location.hash).toBe('#/hoy')
    window.history.replaceState(null, '', '/')
  })
})

// Slice G1 (WCAG 2.1.1): a table wider than its room scrolls inside its box; the keyboard reaches that box only while it scrolls.
describe('una tabla que se desplaza', () => {
  /** jsdom lays nothing out: the box reports the widths given (the content's, then its own). */
  function widths(scroll: () => number, client: number) {
    const scrollWidth = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(scroll)
    const clientWidth = vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(client)
    return () => { scrollWidth.mockRestore(); clientWidth.mockRestore() }
  }
  const table = <><h2 id="employees-title">Empleados (2)</h2><TableScroll labelledBy="employees-title"><table aria-labelledby="employees-title"><tbody><tr><td>Lucía</td></tr></tbody></table></TableScroll></>

  it('mientras la tabla no entra, su caja es una región con el nombre del título que toma el foco', () => {
    const restore = widths(() => 900, 600)
    try {
      const { container } = render(table)
      const box = container.querySelector('.table-scroll')

      expect(screen.getByRole('region', { name: 'Empleados (2)' })).toBe(box)
      expect(box).toHaveAttribute('tabindex', '0')
    } finally { restore() }
  })

  it('si la tabla entra, la caja no es una región ni una parada de Tab', () => {
    const restore = widths(() => 600, 600)
    try {
      const { container } = render(table)
      const box = container.querySelector('.table-scroll')

      expect(screen.queryByRole('region')).not.toBeInTheDocument()
      expect(box).not.toHaveAttribute('tabindex')
      expect(box).not.toHaveAttribute('aria-labelledby')
    } finally { restore() }
  })

  it('al cambiar el ancho de la ventana la caja vuelve a medirse', () => {
    let content = 600
    const restore = widths(() => content, 600)
    try {
      render(table)
      expect(screen.queryByRole('region')).not.toBeInTheDocument()

      content = 900
      fireEvent(window, new Event('resize'))
      expect(screen.getByRole('region', { name: 'Empleados (2)' })).toHaveAttribute('tabindex', '0')
    } finally { restore() }
  })

  // Slice H1: the box observes the element inside it, and React may replace that element (a list that becomes a table, a table
  // with another key) without a change of the box: it was observed once, on the first render.
  it('si cambia la tabla de adentro, la caja mide la nueva y deja de mirar la anterior', async () => {
    const observed = new Set<Element>()
    let notify = () => {}
    class FakeResizeObserver {
      constructor(callback: () => void) { notify = callback }
      observe(target: Element) { observed.add(target) }
      unobserve(target: Element) { observed.delete(target) }
      disconnect() { observed.clear() }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    let content = 600
    const restore = widths(() => content, 600)
    const rows = (key: string) => <><h2 id="employees-title">Empleados (2)</h2><TableScroll labelledBy="employees-title"><table key={key} aria-labelledby="employees-title"><tbody><tr><td>Lucía</td></tr></tbody></table></TableScroll></>
    try {
      const { container, rerender } = render(rows('first'))
      const box = container.querySelector('.table-scroll')!
      const first = box.firstElementChild!
      expect(observed.has(box) && observed.has(first)).toBe(true)

      rerender(rows('second'))
      const second = box.firstElementChild!
      expect(second).not.toBe(first)
      await waitFor(() => expect(observed.has(second)).toBe(true))
      expect(observed.has(first)).toBe(false)
      expect(observed.has(box)).toBe(true)

      content = 900
      act(() => notify())
      expect(screen.getByRole('region', { name: 'Empleados (2)' })).toBe(box)
    } finally { restore(); vi.unstubAllGlobals() }
  })

  // Slice H1: the files are read from this test's own address (app/testing/sourceFiles), not from the folder the run starts in.
  it('ninguna pantalla escribe la caja a mano: toda tabla que se desplaza pasa por TableScroll', () => {
    const screens = appSourcePaths()
      .filter((path) => path.endsWith('.tsx') && path !== 'app/ui.tsx')
      .filter((path) => readSource(path).includes('table-scroll'))

    expect(appSourcePaths()).toContain('app/ui.tsx')
    expect(screens).toEqual([])
  })
})
