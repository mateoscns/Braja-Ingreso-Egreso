import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectSkipLinkToMain } from '../../app/testing/skipLink'
import { AdminApp } from './AdminApp'
import { AdminNav } from './AdminNav'
import type { AdminSection } from './setupStatus'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), publicConfig: vi.fn() }))
vi.mock('../../app/session', () => ({
  useSession: () => ({
    signOut: vi.fn(), activateCompany: vi.fn(),
    session: { dni: '30123456', activeCompanyId: 'c-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }] }
  })
}))
vi.mock('../../device/pwa/InstallControl', () => ({ InstallControl: () => null }))
vi.mock('../../shared/api/client', () => ({
  api: apiMocks,
  queryString: (values: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
    return `?${params.toString()}`
  }
}))

afterEach(cleanup)

const navigation = () => screen.getByRole('navigation', { name: 'Navegación principal' })
/** The four destinations: the links of the top level of the navigation list, in order. */
const destinations = () => [...navigation().querySelectorAll(':scope > ul > li > a')] as HTMLAnchorElement[]
const link = (name: string) => within(navigation()).getByRole('link', { name })

function show(section: AdminSection | null, setupMissing = false) {
  const onNavigate = vi.fn()
  render(<AdminNav section={section} setupMissing={setupMissing} onNavigate={onNavigate} />)
  return onNavigate
}

// D-20261111-02: four destinations by task, the same on a phone (a bar at the bottom) and on a computer (a rail on the left).
describe('navegación del ADMIN: cuatro destinos', () => {
  it('es una sola navegación con nombre, con los cuatro destinos en el orden decidido y como enlaces a su dirección', () => {
    show('inbox')

    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(destinations().map((item) => item.textContent)).toEqual(['Para revisar', 'Hoy', 'Días de trabajo', 'Configuración'])
    expect(destinations().map((item) => item.getAttribute('href'))).toEqual(['#/para-revisar', '#/hoy', '#/dias-de-trabajo', '#/configuracion'])
    // Each one has its icon, hidden from screen readers: the name is the word.
    for (const item of destinations()) expect(item.querySelector('svg.icon')).toHaveAttribute('aria-hidden', 'true')
    expect(within(navigation()).queryAllByRole('button')).toEqual([])
  })

  it('el orden de los cuatro es el mismo con la configuración completa o con un paso pendiente', () => {
    show('inbox', false)
    const complete = destinations().map((item) => item.textContent)
    cleanup()
    show('setup', true)

    expect(destinations().map((item) => item.textContent)).toEqual(complete)
  })

  it.each([
    ['inbox', 'Para revisar'],
    ['jornadas', 'Hoy'],
    ['workdays', 'Días de trabajo'],
    ['config', 'Configuración']
  ] as [AdminSection, string][])('en %s marca «%s» como el lugar actual y ningún otro', (section, name) => {
    show(section)

    expect(link(name)).toHaveAttribute('aria-current', 'page')
    expect(within(navigation()).getAllByRole('link').filter((item) => item.hasAttribute('aria-current'))).toEqual([link(name)])
  })

  it.each([
    ['sedes', 'Locales'],
    ['plantillas', 'Horarios'],
    ['empleados', 'Equipo'],
    ['setup', 'Primeros pasos']
  ] as [AdminSection, string][])('en una parte de «Configuración» (%s) «Configuración» sigue marcada y su parte «%s» es el lugar actual', (section, name) => {
    show(section, true)

    expect(link('Configuración')).toHaveAttribute('aria-current', 'true')
    expect(link(name)).toHaveAttribute('aria-current', 'page')
    expect(within(navigation()).getAllByRole('link').filter((item) => item.hasAttribute('aria-current'))).toEqual([link('Configuración'), link(name)])
  })

  it('antes de saber qué sección mostrar no marca ninguna', () => {
    show(null)

    expect(within(navigation()).getAllByRole('link').filter((item) => item.hasAttribute('aria-current'))).toEqual([])
  })

  // The owner, 2026-11-11: on a computer the rail lists the parts of «Configuración» under it (CSS hides them on a phone).
  it('las partes de «Configuración» van debajo de ella, con «Primeros pasos» primero solo mientras falta un paso', () => {
    show('inbox', true)
    const parts = () => within(link('Configuración').closest('li')!.querySelector('ul')!).getAllByRole('link')

    expect(parts().map((item) => item.textContent)).toEqual(['Primeros pasos', 'Locales', 'Horarios', 'Equipo'])
    expect(parts().map((item) => item.getAttribute('href')))
      .toEqual(['#/configuracion/primeros-pasos', '#/configuracion/locales', '#/configuracion/horarios', '#/configuracion/equipo'])
    cleanup()

    show('inbox', false)
    expect(parts().map((item) => item.textContent)).toEqual(['Locales', 'Horarios', 'Equipo'])
  })

  it('con todo configurado «Primeros pasos» sigue en la lista mientras es el lugar que se muestra', () => {
    show('setup', false)

    expect(link('Primeros pasos')).toHaveAttribute('aria-current', 'page')
  })

  it('elegir un destino o una parte avisa a la aplicación, que muestra la sección', () => {
    const onNavigate = show('inbox')

    fireEvent.click(link('Hoy'))
    fireEvent.click(link('Configuración'))
    fireEvent.click(link('Equipo'))

    expect(onNavigate.mock.calls).toEqual([['jornadas'], ['config'], ['empleados']])
  })

  it('un clic con Ctrl o con la rueda queda en manos del navegador, que abre la dirección en otra pestaña', () => {
    const onNavigate = show('inbox')

    expect(fireEvent.click(link('Hoy'), { ctrlKey: true })).toBe(true)
    expect(fireEvent.click(link('Hoy'), { button: 1 })).toBe(true)
    expect(onNavigate).not.toHaveBeenCalled()
    // A plain click is the app's: the browser does not follow the link by itself.
    expect(fireEvent.click(link('Hoy'))).toBe(false)
  })
})

describe('navegación del ADMIN dentro de la aplicación', () => {
  const openAt = (hash: string) => window.history.replaceState(null, '', `/admin${hash}`)
  const hashSettles = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  const originals = {
    pushManager: Object.getOwnPropertyDescriptor(window, 'PushManager'),
    notification: Object.getOwnPropertyDescriptor(window, 'Notification'),
    serviceWorker: Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
  }
  const restore = (target: object, name: PropertyKey, descriptor?: PropertyDescriptor) => {
    if (descriptor) Object.defineProperty(target, name, descriptor)
    else Reflect.deleteProperty(target, name)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    openAt('')
    apiMocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/inbox')) return Promise.resolve({ items: [], nextCursor: null })
      if (path === '/sites' || path === '/templates' || path === '/employees') return Promise.resolve([])
      if (path.startsWith('/jornadas?')) return Promise.resolve([])
      return Promise.reject(new Error(`GET inesperado: ${path}`))
    })
    apiMocks.publicConfig.mockResolvedValue({ pushEnabled: true, vapidPublicKey: 'public-vapid-key' })
    apiMocks.post.mockResolvedValue({ subscribed: true, id: 'sub-1' })
    // A browser that can receive avisos and is already subscribed.
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} })
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted', requestPermission: vi.fn() } })
    const subscription = { endpoint: 'https://push.example/device-1', toJSON: () => ({ endpoint: 'https://push.example/device-1', keys: { p256dh: 'p', auth: 'a' } }) }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }) } as unknown as ServiceWorkerContainer
    })
  })
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
    restore(window, 'PushManager', originals.pushManager)
    restore(window, 'Notification', originals.notification)
    restore(navigator, 'serviceWorker', originals.serviceWorker)
  })

  it.each([
    ['#/para-revisar', 'Para revisar', 'page'],
    ['#/hoy', 'Hoy', 'page'],
    ['#/dias-de-trabajo', 'Días de trabajo', 'page'],
    ['#/configuracion', 'Configuración', 'page'],
    ['#/configuracion/equipo', 'Configuración', 'true']
  ])('la dirección %s marca «%s» en la navegación', async (hash, name, current) => {
    openAt(hash)
    render(<AdminApp />)

    await waitFor(() => expect(link(name)).toHaveAttribute('aria-current', current))
    await hashSettles()
  })

  // The avisos control left the fixed bar for the «Configuración» page; its hook stays in AdminApp, so a renewed browser
  // subscription is still followed wherever the owner is (D-20261027-04).
  it('el seguimiento de los avisos sigue activo en una sección que no es «Configuración», sin mostrar el control', async () => {
    openAt('#/para-revisar')
    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: 'Para revisar', level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/push/subscriptions/current', { endpoint: 'https://push.example/device-1' }))
    expect(screen.queryByRole('region', { name: 'Avisos en este dispositivo' })).not.toBeInTheDocument()

    // The same hook feeds the control on the page: it is not asked again.
    fireEvent.click(link('Configuración'))
    const control = await screen.findByRole('region', { name: 'Avisos en este dispositivo' })
    expect(within(control).getByText(/^Activados para Braja\./)).toBeInTheDocument()
    expect(apiMocks.publicConfig).toHaveBeenCalledTimes(1)
    await hashSettles()
  })

  // Slice G1 (WCAG 2.4.1): the top bar and the navigation come before the section on every screen; «Ir al contenido» skips them.
  it('lo primero que alcanza Tab es «Ir al contenido», que lleva al único main sin cambiar la sección de la dirección', async () => {
    openAt('#/hoy')
    render(<AdminApp />)
    await waitFor(() => expect(link('Hoy')).toHaveAttribute('aria-current', 'page'))

    expectSkipLinkToMain()
    expect(window.location.hash).toBe('#/hoy')
    await hashSettles()
  })
})
