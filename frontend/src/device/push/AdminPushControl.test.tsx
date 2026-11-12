import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicConfig } from '../../shared/api/types'
import { api } from '../../shared/api/client'
import { AdminPushControlRender, type AdminPushControlRenderProps } from './AdminPushControl'
import { useAdminPush } from './useAdminPush'

vi.mock('../../shared/api/client', () => ({ api: { publicConfig: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

/** The hook and its render wired as AdminApp wires them (the hook lives in AdminApp, the render on the «Configuración» page). */
function AdminPushControl({ companyName }: { companyName: string }) {
  const { activate, deactivate, retryConfig, ...state } = useAdminPush(companyName)
  return <AdminPushControlRender {...state} companyName={companyName}
    onActivate={() => void activate()} onDeactivate={() => void deactivate()} onRetryConfig={retryConfig} />
}
/** The short status the fixed bar showed on phones; the bar is gone (slice N4) and the row says the whole sentence. */
const SHORT_STATUS = /^Avisos: /

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

  it('explica que los avisos no están habilitados, sin hablar de servidores', async () => {
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: false, vapidPublicKey: null })
    const { container } = render(<AdminPushControl companyName="Braja Centro" />)
    expect(await screen.findByText('Los avisos todavía no están habilitados en Fichaje.')).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/servidor/)
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()
  })

  // Replaced in slice N4. 2026-11-09 (integrated check of PR #107): at 360 px the fixed bar wrapped to four lines and took 127 px
  // of the screen, so phones got a short status. The control is now a row of the «Configuración» page, in the flow, at every width.
  it('en todo ancho muestra su título y la frase completa, sin un estado corto aparte', async () => {
    useBrowserSubscription(browserSubscription())
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
    vi.mocked(api.post).mockResolvedValue({ subscribed: false })
    render(<AdminPushControl companyName="Braja Norte" />)

    const control = screen.getByRole('region', { name: 'Avisos en este dispositivo' })
    await within(control).findByText(/^Desactivados para Braja Norte;/)
    expect(within(control).getByRole('heading', { name: 'Avisos en este dispositivo' })).toBeInTheDocument()
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()

    cleanup()
    vi.mocked(api.post).mockResolvedValue({ subscribed: true, id: 'sub-1' })
    render(<AdminPushControl companyName="Braja Centro" />)
    await screen.findByText(/^Activados para Braja Centro\./)
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()
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

    expect(await screen.findByText(/Desactivados para Braja Norte/)).toBeInTheDocument()
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

    expect(await screen.findByText(/Activados para Braja Centro/)).toBeInTheDocument()
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

describe('AdminPushControl: subscription renewed by the browser (pushsubscriptionchange)', () => {
  const OLD = 'https://fcm.googleapis.com/fcm/send/device-old'
  const RENEWED = 'https://fcm.googleapis.com/fcm/send/device-renewed'

  /** A service worker container that can deliver messages, with a browser subscription the test can swap. */
  function useMessagingServiceWorker(initial: ReturnType<typeof browserSubscription> | null) {
    const getSubscription = vi.fn().mockResolvedValue(initial)
    const container = Object.assign(new EventTarget(), {
      ready: Promise.resolve({ pushManager: { getSubscription, subscribe: vi.fn() } }),
      startMessages: vi.fn()
    })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container as unknown as ServiceWorkerContainer })
    return {
      container,
      renewTo: (endpoint: string) => getSubscription.mockResolvedValue(browserSubscription(endpoint)),
      notify: (oldEndpoint: string | null) => container.dispatchEvent(new MessageEvent('message', { data: { type: 'PUSH_SUBSCRIPTION_CHANGED', oldEndpoint } }))
    }
  }

  beforeEach(() => {
    vi.mocked(api.publicConfig<PublicConfig>).mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
  })

  it('re-registers the renewed subscription when the service worker reports a change of the subscribed endpoint', async () => {
    const worker = useMessagingServiceWorker(browserSubscription(OLD))
    vi.mocked(api.post).mockResolvedValue({ subscribed: true, id: 'sub-1' })
    vi.mocked(api.put).mockResolvedValue({ id: 'sub-9' })
    render(<AdminPushControl companyName="Braja Centro" />)
    expect(await screen.findByText(/Activados para Braja Centro/)).toBeInTheDocument()
    expect(worker.container.startMessages).toHaveBeenCalled()

    worker.renewTo(RENEWED)
    worker.notify(OLD)

    expect(await screen.findByText('El navegador renovó la suscripción; los avisos siguen activos para Braja Centro.')).toBeInTheDocument()
    expect(api.put).toHaveBeenCalledWith('/push/subscriptions', { endpoint: RENEWED, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } })
  })

  it('asks the server about the old endpoint when the panel did not know it and re-registers only if it was subscribed here', async () => {
    const worker = useMessagingServiceWorker(null)
    vi.mocked(api.post).mockResolvedValue({ subscribed: true, id: 'sub-1' })
    vi.mocked(api.put).mockResolvedValue({ id: 'sub-9' })
    render(<AdminPushControl companyName="Braja Centro" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeEnabled())

    worker.renewTo(RENEWED)
    worker.notify(OLD)

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/push/subscriptions', { endpoint: RENEWED, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }))
    expect(api.post).toHaveBeenCalledWith('/push/subscriptions/current', { endpoint: OLD })
  })

  // D-20261027-04: a renewal never subscribes a company where the ADMIN did not enable alerts.
  it('does not register the renewed subscription in a company where the old endpoint was not subscribed', async () => {
    const worker = useMessagingServiceWorker(browserSubscription(OLD))
    vi.mocked(api.post).mockResolvedValue({ subscribed: false })
    render(<AdminPushControl companyName="Braja Norte" />)
    expect(await screen.findByText(/Desactivados para Braja Norte/)).toBeInTheDocument()

    worker.renewTo(RENEWED)
    worker.notify(OLD)

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/push/subscriptions/current', { endpoint: OLD }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.put).not.toHaveBeenCalled()
    expect(screen.getByText(/Desactivados para Braja Norte/)).toBeInTheDocument()
  })

  it('when the app comes back to the foreground, re-registers if the browser endpoint differs from the one the server confirmed', async () => {
    const worker = useMessagingServiceWorker(browserSubscription(OLD))
    vi.mocked(api.post).mockResolvedValue({ subscribed: true, id: 'sub-1' })
    vi.mocked(api.put).mockResolvedValue({ id: 'sub-9' })
    render(<AdminPushControl companyName="Braja Centro" />)
    expect(await screen.findByText(/Activados para Braja Centro/)).toBeInTheDocument()

    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.put).not.toHaveBeenCalled()

    worker.renewTo(RENEWED)
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/push/subscriptions', { endpoint: RENEWED, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }))
  })

  it('ignores unrelated service worker messages', async () => {
    const worker = useMessagingServiceWorker(browserSubscription(OLD))
    vi.mocked(api.post).mockResolvedValue({ subscribed: true, id: 'sub-1' })
    render(<AdminPushControl companyName="Braja Centro" />)
    expect(await screen.findByText(/Activados para Braja Centro/)).toBeInTheDocument()

    worker.renewTo(RENEWED)
    worker.container.dispatchEvent(new MessageEvent('message', { data: { type: 'SKIP_WAITING' } }))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.put).not.toHaveBeenCalled()
  })
})

// The render half takes everything by props (CLAUDE.md, rule 36), so each state is shown without a browser or a server.
describe('AdminPushControlRender: lo que se lee y el botón que se ofrece en cada estado, con props fijas', () => {
  // Avisos off in a browser that can receive them, with the configuration already loaded.
  const OFF: Omit<AdminPushControlRenderProps, 'onActivate' | 'onDeactivate' | 'onRetryConfig'> = {
    companyName: 'Braja Centro', availability: 'available', enabled: false, busy: false,
    configLoading: false, configReady: true, configError: '', error: '', message: ''
  }

  function show(overrides: Partial<typeof OFF> = {}) {
    const handlers = { onActivate: vi.fn(), onDeactivate: vi.fn(), onRetryConfig: vi.fn() }
    const view = render(<AdminPushControlRender {...OFF} {...overrides} {...handlers} />)
    return { ...view, ...handlers, control: screen.getByRole('region', { name: 'Avisos en este dispositivo' }) }
  }

  it('mientras carga la configuración lo dice y no deja activar todavía', () => {
    const { control } = show({ configLoading: true, configReady: false })

    expect(screen.getByRole('status')).toHaveTextContent('Consultando la configuración de avisos…')
    expect(control).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cargando configuración…' })).toBeDisabled()
  })

  it('si el navegador no admite avisos lo explica y no ofrece ningún botón', () => {
    const { control } = show({ availability: 'unsupported' })

    expect(within(control).getByRole('heading', { name: 'Avisos en este dispositivo' })).toBeInTheDocument()
    expect(within(control).getByText(
      'Este navegador no admite avisos. En iPhone, instalá la app desde Safari (Compartir, Agregar a pantalla de inicio) y abrila desde el ícono.')).toBeInTheDocument()
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('si los avisos no están habilitados en Fichaje lo explica y no ofrece ningún botón', () => {
    const { control } = show({ availability: 'unconfigured' })

    expect(within(control).getByText('Los avisos todavía no están habilitados en Fichaje.')).toBeInTheDocument()
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('si los avisos están bloqueados en el navegador explica cómo habilitarlos y no ofrece ningún botón', () => {
    const { control } = show({ availability: 'blocked' })

    expect(within(control).getByText(
      'No podemos avisarte porque bloqueaste los avisos en este navegador. Habilitalos desde los permisos del sitio.')).toBeInTheDocument()
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  // An unavailable control shows only its explanation: no pending notice and no "busy" mark.
  it('cuando no hay avisos disponibles no muestra mensajes ni se marca como ocupado', () => {
    const { control } = show({ availability: 'blocked', configLoading: true, configError: 'Sin conexión.', error: 'Falló.', message: 'Listo.' })

    expect(control).not.toHaveAttribute('aria-busy')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('con los avisos desactivados nombra la empresa y ofrece «Activar avisos»', () => {
    const { control, onActivate, onDeactivate, onRetryConfig } = show({ companyName: 'Braja Norte' })

    expect(within(control).getByRole('heading', { name: 'Avisos en este dispositivo' })).toBeInTheDocument()
    expect(within(control).getByText(
      'Desactivados para Braja Norte; cada empresa se activa por separado. Solo avisan cuando alguien no marca la entrada o llega tarde.')).toBeInTheDocument()
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()
    expect(control).toHaveAttribute('aria-busy', 'false')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeEnabled()
    // Design system 4.18: «Activar avisos» is a secondary button.
    expect(screen.getByRole('button', { name: 'Activar avisos' })).toHaveClass('button', 'button-secondary')

    fireEvent.click(screen.getByRole('button', { name: 'Activar avisos' }))
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onDeactivate).not.toHaveBeenCalled()
    expect(onRetryConfig).not.toHaveBeenCalled()
  })

  it('con los avisos activados nombra la empresa y ofrece «Desactivar»', () => {
    const { control, onActivate, onDeactivate, onRetryConfig } = show({ enabled: true })

    expect(within(control).getByText(/^Activados para Braja Centro\. Solo avisan cuando alguien no marca la entrada o llega tarde\.$/)).toBeInTheDocument()
    expect(screen.queryByText(SHORT_STATUS)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeEnabled()
    // Design system 4.18: «Desactivar» turns something off without a domain word, so it is a link button.
    expect(screen.getByRole('button', { name: 'Desactivar' })).toHaveClass('button', 'button-link')

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))
    expect(onDeactivate).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
    expect(onRetryConfig).not.toHaveBeenCalled()
  })

  it('mientras activa muestra «Activando…» y no deja repetir el pedido', () => {
    show({ busy: true })

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Activando…' })).toBeDisabled()
  })

  it('mientras desactiva muestra «Actualizando…» y no deja repetir el pedido', () => {
    show({ enabled: true, busy: true })

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled()
  })

  it('si activar o desactivar falla muestra el error y deja volver a intentarlo', () => {
    show({ error: 'No se pudieron activar los avisos.' })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron activar los avisos.')
    expect(screen.getByRole('button', { name: 'Activar avisos' })).toBeEnabled()
    // Its messages are ordinary messages under the row (design system 4.18), no longer floating above a fixed bar.
    expect(screen.getByRole('button', { name: 'Activar avisos' }).compareDocumentPosition(screen.getByRole('alert')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('si no se pudo consultar la configuración muestra el error y ofrece «Reintentar consulta»', () => {
    const { onActivate, onRetryConfig } = show({ configReady: false, configError: 'No se pudo consultar la configuración de avisos.' })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo consultar la configuración de avisos.')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Reintentar consulta' })).toHaveClass('button', 'button-secondary')

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }))
    expect(onRetryConfig).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('después de un cambio muestra la confirmación que recibe', () => {
    show({ enabled: true, message: 'Avisos activados para Braja Centro en este dispositivo.' })

    expect(screen.getByRole('status')).toHaveTextContent('Avisos activados para Braja Centro en este dispositivo.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('no consulta nada por su cuenta: solo muestra lo que recibe', () => {
    show().unmount()
    show({ enabled: true, configLoading: true }).unmount()

    expect(api.publicConfig).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(api.delete).not.toHaveBeenCalled()
  })
})
