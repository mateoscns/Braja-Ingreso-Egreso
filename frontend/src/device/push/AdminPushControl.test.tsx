import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicConfig } from '../../shared/api/types'
import { api } from '../../shared/api/client'
import { AdminPushControl } from './AdminPushControl'

vi.mock('../../shared/api/client', () => ({ api: { publicConfig: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

function browserSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/device-1') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn().mockResolvedValue(true)
  }
}

function useBrowserSubscription(subscription: ReturnType<typeof browserSubscription> | null, subscribe = vi.fn()) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription), subscribe } })
    } as unknown as ServiceWorkerContainer
  })
}

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

    render(<AdminPushControl companyName="Braja Centro" />)

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
    render(<AdminPushControl companyName="Braja Centro" />)
    expect(await screen.findByText(/no admite avisos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar avisos' })).not.toBeInTheDocument()
  })

  it('explica que el servidor tiene los avisos deshabilitados', async () => {
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: false, vapidPublicKey: null })
    render(<AdminPushControl companyName="Braja Centro" />)
    expect(await screen.findByText(/no están habilitados en el servidor/)).toBeInTheDocument()
  })

  it('explica cómo habilitar los avisos cuando el permiso está bloqueado', async () => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied', requestPermission: vi.fn() } })
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
    render(<AdminPushControl companyName="Braja Centro" />)
    expect(await screen.findByText(/bloqueaste los avisos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar avisos' })).not.toBeInTheDocument()
  })

  // 2026-10-27 (issue #47, D-20261027-04): opening another company re-sent the browser subscription
  // and an ADMIN of several companies got alerts from a company where they never enabled them.
  it('no suscribe el dispositivo al abrir una empresa donde no se activaron los avisos', async () => {
    useBrowserSubscription(browserSubscription())
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
    vi.mocked(api.post).mockResolvedValue({ subscribed: false })

    render(<AdminPushControl companyName="Braja Norte" />)

    expect(await screen.findByText(/Desactivadas para Braja Norte/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeEnabled()
    expect(api.post).toHaveBeenCalledWith('/push/subscriptions/current', { endpoint: 'https://fcm.googleapis.com/fcm/send/device-1' })
    expect(api.put).not.toHaveBeenCalled()
  })

  it('muestra que el dispositivo está suscripto en la empresa activa y al desactivar no corta las demás', async () => {
    const subscription = browserSubscription()
    useBrowserSubscription(subscription)
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
    vi.mocked(api.post).mockResolvedValue({ subscribed: true, id: 'sub-1' })
    vi.mocked(api.delete).mockResolvedValue(undefined)

    render(<AdminPushControl companyName="Braja Centro" />)

    expect(await screen.findByText(/Activadas para Braja Centro/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))

    expect(await screen.findByText('Avisos desactivados para Braja Centro en este dispositivo.')).toBeInTheDocument()
    expect(api.delete).toHaveBeenCalledWith('/push/subscriptions/sub-1')
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeInTheDocument()
  })

  it('activa los avisos solo para la empresa activa cuando el ADMIN lo pide', async () => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted', requestPermission: vi.fn() } })
    const subscription = browserSubscription()
    const subscribe = vi.fn().mockResolvedValue(subscription)
    useBrowserSubscription(null, subscribe)
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'cHVibGljLXZhcGlkLWtleQ' })
    vi.mocked(api.put).mockResolvedValue({ id: 'sub-2' })

    render(<AdminPushControl companyName="Braja Centro" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeEnabled())
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))

    expect(await screen.findByText('Avisos activados para Braja Centro en este dispositivo.')).toBeInTheDocument()
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.put).toHaveBeenCalledWith('/push/subscriptions', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-1', keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
    })
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument()
  })
})
