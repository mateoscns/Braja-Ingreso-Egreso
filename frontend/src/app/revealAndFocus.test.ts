import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firstControl, reveal, revealAndFocus } from './revealAndFocus'

const scrollIntoView = vi.fn()
let reduced = false

beforeEach(() => {
  reduced = false
  scrollIntoView.mockReset()
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({ matches: reduced && query === '(prefers-reduced-motion: reduce)', media: query }) })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
})
afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

function mount(html: string) {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe('revealAndFocus', () => {
  it('desliza la parte hasta la vista y mueve el foco sin un segundo desplazamiento', () => {
    const part = mount('<section><input id="field"></section>')
    const field = part.querySelector('input')!
    const focus = vi.spyOn(field, 'focus')

    revealAndFocus(part, field)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(part)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(field).toHaveFocus()
  })

  it('salta sin deslizar cuando el sistema pide menos movimiento, y respeta dónde ubicar la parte', () => {
    reduced = true
    const heading = mount('<h1 tabindex="-1">Hoy</h1>')

    revealAndFocus(heading, heading, 'start')

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })
    expect(heading).toHaveFocus()
  })

  it('sin un destino aparte, el foco va a la parte misma', () => {
    const button = mount('<button type="button">Editar</button>')

    revealAndFocus(button)

    expect(button).toHaveFocus()
  })

  it('sin scrollIntoView ni matchMedia (un navegador viejo) igual mueve el foco', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    Reflect.deleteProperty(window, 'matchMedia')
    const button = mount('<button type="button">Editar</button>')

    expect(() => revealAndFocus(button)).not.toThrow()
    expect(button).toHaveFocus()
  })

  it('reveal solo trae la parte a la vista: el foco queda donde estaba', () => {
    const part = mount('<div><button type="button">Horarios</button><section>Horarios de Lucía</section></div>')
    const opener = part.querySelector('button')!
    opener.focus()

    reveal(part.querySelector('section')!)

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
    expect(opener).toHaveFocus()
  })
})

describe('firstControl', () => {
  it('es el primer control que se puede usar: salta los deshabilitados, los ocultos y los de un pliegue cerrado', () => {
    const form = mount(`<form>
      <input type="hidden" name="token">
      <button type="button" disabled>Elegir en el mapa</button>
      <details><summary>Escribir las coordenadas a mano</summary><input aria-label="Latitud"></details>
      <input aria-label="Distancia">
    </form>`)

    expect(firstControl(form)).toHaveAccessibleName('Distancia')
  })

  it('dentro de un pliegue abierto el control cuenta', () => {
    const form = mount('<form><details open><summary>Más</summary><select aria-label="Día"></select></details><input aria-label="Nombre"></form>')

    expect(firstControl(form)).toHaveAccessibleName('Día')
  })

  it('en un grupo de opciones es la opción elegida, como lo haría Tab', () => {
    const form = mount(`<form>
      <label><input type="radio" name="tipo" value="a">Corrido</label>
      <label><input type="radio" name="tipo" value="b" checked>Cortado</label>
      <input aria-label="Nombre">
    </form>`)

    expect(firstControl(form)).toHaveAccessibleName('Cortado')
  })

  it('un botón también es un control, y sin ninguno no hay destino', () => {
    expect(firstControl(mount('<form><p>Se cierran todas sus sesiones.</p><button>Confirmar</button></form>'))).toHaveAccessibleName('Confirmar')
    expect(firstControl(mount('<section><p>Nada para hacer.</p></section>'))).toBeNull()
  })
})
