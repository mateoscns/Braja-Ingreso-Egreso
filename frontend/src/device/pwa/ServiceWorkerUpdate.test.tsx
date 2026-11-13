import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceWorkerUpdate, type RegisterServiceWorker } from './ServiceWorkerUpdate'

afterEach(cleanup)

describe('ServiceWorkerUpdate', () => {
  it('registra el service worker una sola vez y no muestra aviso sin versión nueva', () => {
    const register = vi.fn<RegisterServiceWorker>(() => vi.fn(() => Promise.resolve()))
    const view = render(<ServiceWorkerUpdate register={register} />)
    view.rerender(<ServiceWorkerUpdate register={register} />)

    expect(register).toHaveBeenCalledOnce()
    expect(register.mock.calls[0][0]).toMatchObject({ immediate: true })
    expect(screen.queryByText('Hay una versión nueva')).not.toBeInTheDocument()
  })

  it('avisa de la versión nueva y la activa al tocar Actualizar', async () => {
    const updateSW = vi.fn(() => Promise.resolve())
    const register = vi.fn<RegisterServiceWorker>(() => updateSW)
    render(<ServiceWorkerUpdate register={register} />)

    act(() => { register.mock.calls[0][0].onNeedRefresh?.() })
    expect(screen.getByRole('status')).toHaveTextContent('Hay una versión nueva')
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    expect(updateSW).toHaveBeenCalledWith(true)
  })

  // A status is announced reliably only when its text appears in a region that already exists (the pattern of PageMessage).
  it('la región del aviso ya está en la página, vacía, antes de que llegue una versión nueva, para que se anuncie', () => {
    const register = vi.fn<RegisterServiceWorker>(() => vi.fn(() => Promise.resolve()))
    render(<ServiceWorkerUpdate register={register} />)
    const region = screen.getByRole('status')

    expect(region).toBeEmptyDOMElement()
    act(() => { register.mock.calls[0][0].onNeedRefresh?.() })
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toHaveTextContent('Hay una versión nueva')
  })

  // 2026-11-13 audit: an installed app resumed from the background never navigates, so it never looked for a new version.
  it('busca una versión nueva cada hora y cada vez que la app vuelve a la pantalla', () => {
    vi.useFakeTimers()
    try {
      const register = vi.fn<RegisterServiceWorker>(() => vi.fn(() => Promise.resolve()))
      const view = render(<ServiceWorkerUpdate register={register} />)
      const update = vi.fn(() => Promise.resolve())
      act(() => { register.mock.calls[0][0].onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration) })
      expect(update).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(60 * 60 * 1000) })
      expect(update).toHaveBeenCalledTimes(1)

      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(update).toHaveBeenCalledTimes(2)

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(update).toHaveBeenCalledTimes(2)

      view.unmount()
      act(() => { vi.advanceTimersByTime(60 * 60 * 1000) })
      expect(update).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers(); Reflect.deleteProperty(document, 'visibilityState') }
  })

  it('una búsqueda de versión que falla sin conexión no rompe nada', () => {
    vi.useFakeTimers()
    try {
      const register = vi.fn<RegisterServiceWorker>(() => vi.fn(() => Promise.resolve()))
      render(<ServiceWorkerUpdate register={register} />)
      const update = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
      act(() => { register.mock.calls[0][0].onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration) })
      expect(() => act(() => { vi.advanceTimersByTime(60 * 60 * 1000) })).not.toThrow()
      expect(update).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
