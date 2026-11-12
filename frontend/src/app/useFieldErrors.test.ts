import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DATE_PAIR_MESSAGE } from '../shared/dateRange'
import { dateRangeErrors, firstProblem, useFieldErrors } from './useFieldErrors'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

/** A part of the page written by hand, as a form would render it. */
function part(html: string) {
  const element = document.createElement('form')
  element.id = 'form'
  element.innerHTML = html
  document.body.append(element)
  return element
}

describe('dónde va el foco cuando un formulario falla', () => {
  it('va al primer campo inválido en el orden de la página', () => {
    const form = part('<input id="a"><input id="b" aria-invalid="true"><input id="c" aria-invalid="true">')
    expect(firstProblem(form)?.id).toBe('b')
  })

  it('en un grupo inválido va a su control marcado, o si no a su primer control que se puede usar', () => {
    const marked = part('<fieldset aria-invalid="true"><button id="map" type="button">Mapa</button><input id="check" type="checkbox" aria-invalid="true"></fieldset>')
    expect(firstProblem(marked)?.id).toBe('check')
    marked.remove()

    const plain = part('<fieldset aria-invalid="true"><button id="off" type="button" disabled>Mapa</button><input id="first" type="checkbox"></fieldset>')
    expect(firstProblem(plain)?.id).toBe('first')
    plain.remove()

    // A control marked inside a closed fold cannot take the focus: the group's first control does.
    const folded = part('<fieldset aria-invalid="true"><button id="map" type="button">Mapa</button><details><summary>A mano</summary><input id="latitude" aria-invalid="true"></details></fieldset>')
    expect(firstProblem(folded)?.id).toBe('map')
  })

  it('sin campos inválidos va al mensaje de error del formulario, que puede tomar el foco', () => {
    const form = part('<input><div role="alert">No se pudo guardar.</div>')
    const message = firstProblem(form)
    expect(message).toHaveTextContent('No se pudo guardar.')
    expect(message).toHaveAttribute('tabindex', '-1')
  })

  it('sin nada que corregir no elige nada', () => {
    expect(firstProblem(part('<input>'))).toBeNull()
  })
})

describe('los errores de los campos de un formulario', () => {
  it('check muestra solo los errores con texto, lleva el foco al primero y dice si se puede enviar', async () => {
    // The field as the form draws it with its error; the hook only moves the focus there.
    const form = part('<input id="name" aria-invalid="true">')
    const { result } = renderHook(() => useFieldErrors<'name' | 'dni'>())

    let valid = true
    act(() => { valid = result.current.check('form', { name: 'Escribí el nombre.', dni: '' }) })
    expect(valid).toBe(false)
    expect(result.current.errors).toEqual({ name: 'Escribí el nombre.' })
    expect(result.current.count).toBe(1)
    await waitFor(() => expect(form.querySelector('input')).toHaveFocus())

    act(() => { valid = result.current.check('form', { name: '' }) })
    expect(valid).toBe(true)
    expect(result.current.errors).toEqual({})
  })

  it('clear quita solo los errores de los campos que se editan, y reset todos', () => {
    part('')
    const { result } = renderHook(() => useFieldErrors<'from' | 'to' | 'who'>())
    act(() => { result.current.check('form', { from: 'a', to: 'b', who: 'c' }) })

    act(() => { result.current.clear('from', 'to') })
    expect(result.current.errors).toEqual({ who: 'c' })
    act(() => { result.current.reset() })
    expect(result.current.errors).toEqual({})
  })
})

describe('el problema de un rango de fechas va a la fecha que hay que cambiar', () => {
  it('a la fecha vacía', () => {
    expect(dateRangeErrors('', '2026-10-01', DATE_PAIR_MESSAGE)).toEqual({ from: DATE_PAIR_MESSAGE })
    expect(dateRangeErrors('2026-10-01', '', DATE_PAIR_MESSAGE)).toEqual({ to: DATE_PAIR_MESSAGE })
  })

  it('a la que está fuera de los años, o si no al final del rango', () => {
    expect(dateRangeErrors('1999-12-31', '2026-10-01', 'Las fechas deben estar entre los años 2000 y 2100.')).toEqual({ from: 'Las fechas deben estar entre los años 2000 y 2100.' })
    expect(dateRangeErrors('2026-10-10', '2026-10-01', 'La fecha desde no puede ser posterior a la fecha hasta.')).toEqual({ to: 'La fecha desde no puede ser posterior a la fecha hasta.' })
  })

  it('sin problema no marca ninguna', () => {
    expect(dateRangeErrors('2026-10-01', '2026-10-10', '')).toEqual({})
  })
})
