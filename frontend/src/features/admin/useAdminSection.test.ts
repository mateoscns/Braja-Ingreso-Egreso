import { act, cleanup, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AdminSection } from './setupStatus'
import { SECTION_ADDRESSES, sectionFromHash, useAdminSection } from './useAdminSection'

const at = (hash: string) => window.history.replaceState(null, '', `/admin${hash}`)
// jsdom fires hashchange as a task, like a browser does after Back or Forward.
const hashSettles = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))
// A history step is waited for by its own hashchange: one tick was not enough under the load of the whole suite
// (2026-11-11, the second Back still showed the previous section).
const traverse = (step: () => void) => act(() => new Promise<void>((resolve) => {
  window.addEventListener('hashchange', () => setTimeout(resolve, 0), { once: true })
  step()
}))
const back = () => traverse(() => window.history.back())
const forward = () => traverse(() => window.history.forward())

beforeEach(() => at(''))
afterEach(() => { cleanup(); at('') })

describe('direcciones de las secciones', () => {
  it('cada sección tiene una dirección propia que empieza con #/ y vuelve a su sección', () => {
    const sections = Object.keys(SECTION_ADDRESSES) as AdminSection[]
    expect(new Set(Object.values(SECTION_ADDRESSES)).size).toBe(sections.length)
    for (const section of sections) {
      expect(SECTION_ADDRESSES[section]).toMatch(/^#\/[a-z/-]+$/)
      expect(sectionFromHash(SECTION_ADDRESSES[section])).toBe(section)
    }
  })

  it('usa los nombres finales del menú de cuatro destinos', () => {
    expect(SECTION_ADDRESSES).toEqual({
      inbox: '#/para-revisar', jornadas: '#/hoy', workdays: '#/dias-de-trabajo',
      sedes: '#/configuracion/locales', plantillas: '#/configuracion/horarios', empleados: '#/configuracion/equipo',
      setup: '#/configuracion/primeros-pasos'
    })
  })

  it.each(['', '#', '#/', '#/no-existe', '#/HOY', '#/hoy/', '#inicio', '#/configuracion'])('%j no nombra ninguna sección', (hash) => {
    expect(sectionFromHash(hash)).toBeNull()
  })

  it('la dirección vieja de «Historial» nombra «Hoy», donde quedó su búsqueda', () => {
    expect(sectionFromHash('#/historial')).toBe('jornadas')
  })
})

describe('useAdminSection', () => {
  it('muestra la sección de la dirección sin esperar la sección de inicio', () => {
    at('#/configuracion/equipo')
    const { result } = renderHook(() => useAdminSection(null))
    expect(result.current.section).toBe('empleados')
  })

  it('sin dirección espera la sección de inicio y la escribe sin agregar un paso al historial', () => {
    const before = window.history.length
    const { result, rerender } = renderHook(({ start }) => useAdminSection(start), { initialProps: { start: null as AdminSection | null } })
    expect(result.current.section).toBeNull()
    expect(window.location.hash).toBe('')

    rerender({ start: 'setup' })
    expect(result.current.section).toBe('setup')
    expect(window.location.hash).toBe('#/configuracion/primeros-pasos')
    expect(window.history.length).toBe(before)
  })

  it('una dirección desconocida muestra la sección de inicio y queda corregida', () => {
    at('#/no-existe')
    const { result } = renderHook(() => useAdminSection('inbox'))
    expect(result.current.section).toBe('inbox')
    expect(window.location.hash).toBe('#/para-revisar')
  })

  it('la sección de inicio ya mostrada no cambia si después cambia el inicio', () => {
    const { result, rerender } = renderHook(({ start }) => useAdminSection(start), { initialProps: { start: 'setup' as AdminSection | null } })
    rerender({ start: 'inbox' })
    expect(result.current.section).toBe('setup')
  })

  it('elegir una sección escribe su dirección como un paso nuevo del historial', () => {
    const { result } = renderHook(() => useAdminSection('inbox'))
    const before = window.history.length
    act(() => result.current.go('empleados'))
    expect(result.current.section).toBe('empleados')
    expect(window.location.hash).toBe('#/configuracion/equipo')
    expect(window.history.length).toBe(before + 1)

    act(() => result.current.go('empleados'))
    expect(window.history.length).toBe(before + 1)
  })

  it('volver atrás muestra la sección anterior y adelante la siguiente', async () => {
    const { result } = renderHook(() => useAdminSection('inbox'))
    act(() => result.current.go('jornadas'))
    await hashSettles()
    act(() => result.current.go('sedes'))
    await hashSettles()

    await back()
    expect(result.current.section).toBe('jornadas')
    await back()
    expect(result.current.section).toBe('inbox')
    await forward()
    expect(result.current.section).toBe('jornadas')
  })

  it('un cambio a una dirección desconocida vuelve a la sección de inicio', async () => {
    at('#/hoy')
    const { result } = renderHook(() => useAdminSection('setup'))
    window.location.hash = '#/no-existe'
    await hashSettles()
    expect(result.current.section).toBe('setup')
    expect(window.location.hash).toBe('#/configuracion/primeros-pasos')
  })

  it('un cambio de dirección que llega antes de que se fije la sección de inicio no se pisa', () => {
    // A layout effect runs after the commit and before the hook's passive effects, like a hashchange landing in between.
    const { result, rerender } = renderHook(({ start }) => {
      const state = useAdminSection(start)
      useLayoutEffect(() => {
        if (start !== 'setup') return
        at('#/configuracion/horarios')
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }, [start])
      return state
    }, { initialProps: { start: null as AdminSection | null } })
    rerender({ start: 'setup' })
    expect(result.current.section).toBe('plantillas')
    expect(window.location.hash).toBe('#/configuracion/horarios')
  })

  it('la dirección vieja #/historial muestra «Hoy», queda #/hoy sin agregar un paso y dice por dónde se llegó', async () => {
    at('#/historial')
    const before = window.history.length
    const { result } = renderHook(() => useAdminSection('inbox'))
    expect(result.current.section).toBe('jornadas')
    expect(window.location.hash).toBe('#/hoy')
    expect(window.history.length).toBe(before)
    expect(result.current.retiredAddress).toBe('#/historial')

    act(() => result.current.go('sedes'))
    expect(result.current.retiredAddress).toBeNull()
    // The hashchange of go() lands here, not in the next test.
    await hashSettles()
    expect(result.current.section).toBe('sedes')
  })

  it('un cambio a #/historial muestra «Hoy» y deja #/hoy', async () => {
    const { result } = renderHook(() => useAdminSection('inbox'))
    expect(result.current.retiredAddress).toBeNull()
    window.location.hash = '#/historial'
    await hashSettles()
    expect(result.current.section).toBe('jornadas')
    expect(window.location.hash).toBe('#/hoy')
    expect(result.current.retiredAddress).toBe('#/historial')

    window.location.hash = '#/configuracion/locales'
    await hashSettles()
    expect(result.current.retiredAddress).toBeNull()
  })

  it('un ancla dentro de la página no cambia la sección', async () => {
    at('#/hoy')
    const { result } = renderHook(() => useAdminSection('inbox'))
    window.location.hash = '#inicio'
    await hashSettles()
    expect(result.current.section).toBe('jornadas')
    expect(window.location.hash).toBe('#inicio')
  })

  it('al desmontarse borra la dirección, para que la próxima persona o empresa empiece por el inicio', () => {
    at('#/configuracion/equipo')
    const before = window.history.length
    const { unmount } = renderHook(() => useAdminSection('inbox'))
    unmount()
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/admin')
    expect(window.history.length).toBe(before)

    const next = renderHook(() => useAdminSection(null))
    expect(next.result.current.section).toBeNull()
  })

  it('en modo estricto conserva la dirección con la que se abrió', () => {
    at('#/configuracion/horarios')
    const { result } = renderHook(() => useAdminSection(null), { reactStrictMode: true })
    expect(result.current.section).toBe('plantillas')
    expect(window.location.hash).toBe('#/configuracion/horarios')
  })

  it('deja de escuchar los cambios de dirección al desmontarse', async () => {
    at('#/hoy')
    const { result, unmount } = renderHook(() => useAdminSection('inbox'))
    unmount()
    window.location.hash = '#/configuracion/equipo'
    await hashSettles()
    expect(result.current.section).toBe('jornadas')
  })
})
