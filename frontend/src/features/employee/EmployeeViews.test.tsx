import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoadFailure } from '../../app/ui'
import type { Deviation, Jornada, Site } from '../../shared/api/types'
import { DayMarksPanel, MarkFeedback, MotivePanel, OtherDayPanel } from './EmployeeViews'

// The real LoadFailure, watched: a failed load must go through it (slice F3).
vi.mock('../../app/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof import('../../app/ui')>()
  return { ...ui, LoadFailure: vi.fn(ui.LoadFailure) }
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

const site: Site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }

describe('DayMarksPanel', () => {
  // 2026-11-10 (#115): a day whose marks the ADMIN loaded for 08:00 and 16:02 showed both at 21:15, the time they
  // were stored, while the ADMIN's own screens showed the right times.
  it('lists each mark at the time it happened, also when the ADMIN loaded it later', () => {
    const stored = '2026-11-10T00:15:00Z'
    const jornada: Jornada = {
      id: 'j-1', employeeId: 'e-1', siteId: site.id, localDate: '2026-11-09', state: 'EGRESADA', toleranceMinutes: 5, sequence: 1,
      scheduleSnapshot: { siteId: site.id, name: 'Mañana', blocks: [{ startDayOffset: 0, start: '08:00', end: '16:00', endDayOffset: 0 }], breakfastLimitMinutes: 15, lunchLimitMinutes: 45 },
      marks: [
        { id: 'm-1', jornadaId: 'j-1', action: 'INGRESO', sequence: 1, acceptedAt: stored, occurredAt: '2026-11-09T11:00:00Z', locationStatus: 'NO_APLICA' },
        { id: 'm-2', jornadaId: 'j-1', action: 'EGRESO', sequence: 2, acceptedAt: stored, occurredAt: '2026-11-09T19:02:00Z', locationStatus: 'NO_APLICA' }
      ]
    }
    render(<DayMarksPanel title="Tus marcas" jornada={jornada} site={site} />)

    expect(screen.getByText('08:00')).toBeInTheDocument()
    expect(screen.getByText('16:02')).toBeInTheDocument()
    expect(screen.queryByText('21:15')).not.toBeInTheDocument()
  })

  it('keeps the server time for a mark the employee made', () => {
    const jornada: Jornada = {
      id: 'j-1', employeeId: 'e-1', siteId: site.id, localDate: '2026-11-09', state: 'EN_CURSO', toleranceMinutes: 5, sequence: 1,
      scheduleSnapshot: { siteId: site.id, name: 'Mañana', blocks: [{ startDayOffset: 0, start: '08:00', end: '16:00', endDayOffset: 0 }], breakfastLimitMinutes: 15, lunchLimitMinutes: 45 },
      marks: [{ id: 'm-1', jornadaId: 'j-1', action: 'INGRESO', sequence: 1, acceptedAt: '2026-11-09T11:02:00Z', locationStatus: 'RECIBIDA' }]
    }
    render(<DayMarksPanel title="Tus marcas" jornada={jornada} site={site} />)

    expect(screen.getByText('08:02')).toBeInTheDocument()
  })

  // Slice D2 (design system 4.14): the marks are a sheet of four fixed rows, read row by row by a screen reader too.
  describe('planilla del día', () => {
    const day = (state: Jornada['state'], marks: Jornada['marks']): Jornada => ({
      id: 'j-1', employeeId: 'e-1', siteId: site.id, localDate: '2026-11-09', state, toleranceMinutes: 5, sequence: 1, marks,
      scheduleSnapshot: { siteId: site.id, name: 'Mañana', blocks: [{ startDayOffset: 0, start: '08:00', end: '16:00', endDayOffset: 0 }], breakfastLimitMinutes: 15, lunchLimitMinutes: 45 }
    })
    const entry = { id: 'm-1', jornadaId: 'j-1', action: 'INGRESO' as const, sequence: 1, acceptedAt: '2026-11-09T11:02:00Z', locationStatus: 'RECIBIDA' as const }

    it('es una tabla con título y una fila con encabezado por cada momento del día', () => {
      render(<DayMarksPanel title="Tus marcas de hoy" jornada={day('EN_CURSO', [entry])} site={site} />)

      const sheet = screen.getByRole('table', { name: 'Marcas del día' })
      expect(within(sheet).getAllByRole('rowheader').map((header) => header.textContent)).toEqual(['Entrada', 'Desayuno', 'Almuerzo', 'Salida'])
      const entryRow = within(sheet).getByRole('row', { name: /Entrada/ })
      expect(entryRow).toHaveTextContent('08:02')
      expect(entryRow).toHaveTextContent('Ubicación enviada')
    })

    it('una fila sin marca muestra una raya y le dice al lector de pantalla que está sin marcar', () => {
      render(<DayMarksPanel title="Tus marcas de hoy" jornada={day('EN_CURSO', [entry])} site={site} />)

      const breakfast = screen.getByRole('row', { name: /Desayuno/ })
      expect(within(breakfast).getByText('—')).toHaveAttribute('aria-hidden', 'true')
      expect(within(breakfast).getByText('sin marcar')).toHaveClass('visually-hidden')
      expect(within(screen.getByRole('row', { name: /Entrada/ })).queryByText('sin marcar')).not.toBeInTheDocument()
    })

    it('una marca anulada no llena su fila: va tachada debajo, con la etiqueta Anulada', () => {
      render(<DayMarksPanel title="Tus marcas de hoy" jornada={day('NO_INGRESO', [{ ...entry, voided: true }])} site={site} />)

      const rows = within(screen.getByRole('table', { name: 'Marcas del día' })).getAllByRole('row')
      expect(rows).toHaveLength(5)
      expect(within(rows[0]).getByText('sin marcar')).toBeInTheDocument()
      // The extra row repeats the name of its row as hidden text, so it is not read without context.
      expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('Entrada')
      expect(within(rows[1]).getByRole('rowheader').firstElementChild).toHaveClass('visually-hidden')
      expect(within(rows[1]).getByText('08:02').closest('s')).not.toBeNull()
      expect(within(rows[1]).getByText('Anulada')).toBeInTheDocument()
      expect(within(rows[2]).getByRole('rowheader')).toHaveTextContent('Desayuno')
    })

    it('un día sin marcas dice que todavía no marcaste nada, salvo que tu encargado lo haya cancelado', () => {
      const { unmount } = render(<DayMarksPanel title="Tus marcas de hoy" jornada={day('NO_INGRESO', [])} site={site} />)
      expect(screen.getByText('Todavía no marcaste nada.')).toBeInTheDocument()
      unmount()

      render(<DayMarksPanel title="Tus marcas de hoy" jornada={day('CANCELADA', [])} site={site} />)
      expect(screen.getAllByRole('rowheader')).toHaveLength(4)
      expect(screen.queryByText('Todavía no marcaste nada.')).not.toBeInTheDocument()
    })

    it('una marca que cargó tu encargado dice quién la cargó en lugar de la ubicación', () => {
      const loaded = { ...entry, acceptedAt: '2026-11-10T00:15:00Z', occurredAt: '2026-11-09T11:00:00Z', locationStatus: 'NO_APLICA' as const }
      render(<DayMarksPanel title="Tus marcas de hoy" jornada={day('EN_CURSO', [loaded])} site={site} />)

      const entryRow = screen.getByRole('row', { name: /Entrada/ })
      expect(entryRow).toHaveTextContent('08:00')
      expect(entryRow).toHaveTextContent('Cargada por tu encargado')
      expect(entryRow).not.toHaveTextContent('Ubicación')
    })
  })
})

const deviation: Deviation = {
  id: 'd-1', jornadaId: 'j-1', siteId: site.id, type: 'LLEGADA_TARDE', status: 'MOTIVO_PENDIENTE', category: null,
  occurredAt: '2026-11-09T11:20:00Z', createdAt: '2026-11-09T11:20:00Z', pushEligible: true
}
const motiveProps = (overrides: Partial<ComponentProps<typeof MotivePanel>> = {}): ComponentProps<typeof MotivePanel> => ({
  loading: false, loadFailed: false, pendingError: '', retrying: false, truncated: false, limit: 100, items: [], notice: '', jornadas: [], sites: [site],
  values: {}, errors: {}, savingId: '', editingIds: [], deviations: [], onChange: vi.fn(), onSubmit: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(), onEdit: vi.fn(), ...overrides
})

// Slice F3 (WCAG 4.1.3): a sending line is announced only if its region is in the document before its text.
describe('líneas de espera y cargas fallidas', () => {
  it('mientras la marca se envía, su región está en el lugar de la confirmación antes que su texto', () => {
    const feedback = <MarkFeedback feedbackRef={createRef()} sending error="" showRefresh={false} onRefresh={vi.fn()} confirmation={null} />

    expect(renderToStaticMarkup(feedback))
      .toBe('<div class="mark-feedback" tabindex="-1"><div class="message message-info" role="status" aria-atomic="true"></div></div>')
    render(feedback)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Enviando tu marca… esperá un momento.')
    expect(status.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true')
  })

  it('mientras se envía un motivo, su región está en el formulario antes que su texto', () => {
    const panel = <MotivePanel {...motiveProps({ items: [deviation], savingId: deviation.id })} />

    const markup = renderToStaticMarkup(panel)
    expect(markup).toContain('<p class="muted small-copy" role="status" aria-atomic="true"></p>')
    expect(markup).not.toContain('Enviando lo que escribiste…')
    render(panel)
    expect(screen.getByRole('status')).toHaveTextContent('Enviando lo que escribiste…')
    expect(screen.getByRole('status').closest('form')).not.toBeNull()
  })

  it('si fallan los pendientes, el panel lo dice con la carga fallida compartida y su Reintentar pide de nuevo', () => {
    const onRetry = vi.fn()
    render(<MotivePanel {...motiveProps({ pendingError: 'Servidor no disponible.', onRetry })} />)

    expect(vi.mocked(LoadFailure)).toHaveBeenCalled()
    expect(vi.mocked(LoadFailure).mock.lastCall?.[0]).toMatchObject({ message: 'No pudimos cargar lo que tenés para explicar. Servidor no disponible.' })
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar lo que tenés para explicar. Servidor no disponible.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

// Slice F2a (design system 4.3 and 4.7): each error of the motive is read with its field and marks it; it is not an alert of
// its own. What the server answers is one message inside the form, above its buttons.
describe('los errores del motivo van con su campo', () => {
  const isBefore = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('el tipo y el texto muestran su mensaje a la vez, cada uno unido a su campo', () => {
    render(<MotivePanel {...motiveProps({ items: [deviation], errors: { [deviation.id]: { category: 'Elegí una de las opciones.', text: 'Contá en pocas palabras qué pasó.' } } })} />)

    const group = screen.getByRole('group', { name: '¿Qué tipo de motivo es?' })
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('Elegí una de las opciones.')
    const text = screen.getByLabelText('Contá qué pasó')
    expect(text).toHaveAttribute('aria-invalid', 'true')
    // The example stays the hint, read before the error.
    expect(text).toHaveAccessibleDescription('Por ejemplo: hubo paro de colectivos. Contá en pocas palabras qué pasó.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lo que responde el servidor va dentro del formulario, arriba del botón, sin marcar ningún campo', () => {
    render(<MotivePanel {...motiveProps({ items: [deviation], errors: { [deviation.id]: { form: 'Tu encargado ya lo revisó: ya no se puede cambiar.' } } })} />)

    const button = screen.getByRole('button', { name: 'Enviar motivo' })
    const alert = within(button.closest('form')!).getByRole('alert')
    expect(alert).toHaveTextContent('Tu encargado ya lo revisó: ya no se puede cambiar.')
    expect(isBefore(alert, button)).toBe(true)
    expect(screen.getByRole('group', { name: '¿Qué tipo de motivo es?' })).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Contá qué pasó')).not.toHaveAttribute('aria-invalid')
  })

  it('el botón de enviar solo se apaga mientras se envía', () => {
    const { unmount } = render(<MotivePanel {...motiveProps({ items: [deviation] })} />)
    expect(screen.getByRole('button', { name: 'Enviar motivo' })).toBeEnabled()
    unmount()

    render(<MotivePanel {...motiveProps({ items: [deviation], savingId: deviation.id })} />)
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
  })
})

// Slice G2 (keyboard pass on the built app, 2026-11-12): while a chosen day loads, the sections above it shrink to one line, the
// page scrolls up, and the field the person was typing the date in ended out of sight.
describe('ver otros días', () => {
  it('cuando termina de cargar el día elegido, el campo de la fecha vuelve a la vista si todavía tiene el foco', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const panel = (loading: boolean) => <OtherDayPanel date="2026-11-11" disabled={false} loading={loading} onDate={() => undefined} onToday={() => undefined} />
    const { rerender } = render(panel(true))
    rerender(panel(false))
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender(panel(true))
    const field = screen.getByLabelText('Día')
    field.focus()
    rerender(panel(false))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(field)
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })
})
