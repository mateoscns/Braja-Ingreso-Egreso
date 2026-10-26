import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicConfig } from '../../shared/api/types'
import { api } from '../../shared/api/client'
import { AdminPushControl } from './AdminPushControl'

vi.mock('../../shared/api/client', () => ({ api: { publicConfig: vi.fn() } }))

const originalPushManager = Object.getOwnPropertyDescriptor(window, 'PushManager')
const originalNotification = Object.getOwnPropertyDescriptor(window, 'Notification')
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

function restoreProperty(target: object, name: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, name, descriptor)
  else Reflect.deleteProperty(target, name)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

beforeEach(() => {
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'default', requestPermission: vi.fn() } })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } })
    } as unknown as ServiceWorkerContainer
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  restoreProperty(window, 'PushManager', originalPushManager)
  restoreProperty(window, 'Notification', originalNotification)
  restoreProperty(navigator, 'serviceWorker', originalServiceWorker)
})

describe('AdminPushControl', () => {
  it('muestra la carga y permite reintentar si falla la consulta de configuración', async () => {
    const retry = deferred<PublicConfig>()
    const publicConfig = vi.mocked(api.publicConfig<PublicConfig>)
    publicConfig.mockRejectedValueOnce(new Error('No se pudo consultar la configuración de avisos.'))
    publicConfig.mockReturnValueOnce(retry.promise)

    render(<AdminPushControl />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar la configuración de avisos.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Consultando la configuración de avisos')
    expect(screen.getByRole('button', { name: 'Cargando configuración…' })).toBeDisabled()

    retry.resolve({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeEnabled())
    expect(publicConfig).toHaveBeenCalledTimes(2)
  })

  it('explica que el navegador no admite avisos en lugar de desaparecer', async () => {
    Reflect.deleteProperty(window, 'PushManager')
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
    render(<AdminPushControl />)
    expect(await screen.findByText(/no admite avisos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar avisos' })).not.toBeInTheDocument()
  })

  it('explica que el servidor tiene los avisos deshabilitados', async () => {
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: false, vapidPublicKey: null })
    render(<AdminPushControl />)
    expect(await screen.findByText(/no están habilitados en el servidor/)).toBeInTheDocument()
  })

  it('explica cómo habilitar los avisos cuando el permiso está bloqueado', async () => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied', requestPermission: vi.fn() } })
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
    render(<AdminPushControl />)
    expect(await screen.findByText(/bloqueaste los avisos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar avisos' })).not.toBeInTheDocument()
  })
})
