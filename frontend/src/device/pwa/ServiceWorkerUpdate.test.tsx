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
})
