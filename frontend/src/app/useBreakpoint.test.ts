import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WIDE_TABLE_QUERY, useWideTable } from './useBreakpoint'

type Listener = () => void
let original: PropertyDescriptor | undefined

/** A screen whose width can change while the hook is mounted, as when a tablet turns. */
function screenOf(width: number) {
  const listeners = new Set<Listener>()
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() { return query === '(min-width: 768px)' && width >= 768 },
    addEventListener: vi.fn((_type: string, listener: Listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: Listener) => listeners.delete(listener))
  }))
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia })
  return {
    matchMedia,
    listeners,
    resize(next: number) { width = next; act(() => listeners.forEach((listener) => listener())) }
  }
}

beforeEach(() => { original = Object.getOwnPropertyDescriptor(window, 'matchMedia') })
afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(window, 'matchMedia', original)
  else Reflect.deleteProperty(window, 'matchMedia')
})

describe('el corte entre lista y tabla', () => {
  it('pregunta por 768 px de ancho, el corte del sistema de diseño', () => {
    const screen = screenOf(1366)

    renderHook(() => useWideTable())

    expect(WIDE_TABLE_QUERY).toBe('(min-width: 768px)')
    expect(screen.matchMedia).toHaveBeenCalledWith('(min-width: 768px)')
  })

  it('muestra la tabla desde 768 px y la lista por debajo', () => {
    screenOf(768)
    expect(renderHook(() => useWideTable()).result.current).toBe(true)
    cleanup()

    screenOf(767)
    expect(renderHook(() => useWideTable()).result.current).toBe(false)
  })

  it('sigue los cambios de ancho mientras está montado y deja de escuchar al desmontarse', () => {
    const screen = screenOf(390)
    const { result, unmount } = renderHook(() => useWideTable())
    expect(result.current).toBe(false)

    screen.resize(1024)
    expect(result.current).toBe(true)
    screen.resize(600)
    expect(result.current).toBe(false)

    unmount()
    expect(screen.listeners.size).toBe(0)
  })

  it('sin matchMedia muestra la lista, que se lee en cualquier ancho', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined })

    expect(renderHook(() => useWideTable()).result.current).toBe(false)
  })
})
