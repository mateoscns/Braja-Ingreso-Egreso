import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminPushControlRenderProps } from '../../device/push/AdminPushControl'
import { AdminApp } from './AdminApp'
import { ConfigurationPage } from './ConfigurationPage'

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }))
vi.mock('../../app/session', () => ({
  useSession: () => ({
    signOut: vi.fn(), activateCompany: vi.fn(),
    session: { dni: '30123456', activeCompanyId: 'c-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }] }
  })
}))
// The avisos of this device are the hook's business (device/push); here they are off and available.
vi.mock('../../device/push/useAdminPush', () => ({
  useAdminPush: () => ({
    availability: 'available', enabled: false, busy: false, configLoading: false, configReady: true, configError: '', error: '', message: '',
    activate: () => Promise.resolve(), deactivate: () => Promise.resolve(), retryConfig: () => undefined
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

const PUSH: AdminPushControlRenderProps = {
  companyName: 'Braja Centro', availability: 'available', enabled: false, busy: false, configLoading: false, configReady: true,
  configError: '', error: '', message: '', onActivate: vi.fn(), onDeactivate: vi.fn(), onRetryConfig: vi.fn()
}

function show({ setupMissing = false, secure = true, push = {} }: { setupMissing?: boolean; secure?: boolean; push?: Partial<AdminPushControlRenderProps> } = {}) {
  const onNavigate = vi.fn()
  render(<ConfigurationPage setupMissing={setupMissing} secure={secure} onNavigate={onNavigate} push={{ ...PUSH, ...push }} />)
  return onNavigate
}
const parts = () => within(screen.getByRole('list', { name: 'Partes de la configuración' })).getAllByRole('link')

// D-20261111-02: «Configuración» holds Locales, Horarios, Equipo, Avisos en este dispositivo, and Primeros pasos while a step is missing.
describe('la página «Configuración»', () => {
  it('lleva a cada una de sus partes, con una línea que dice para qué es', () => {
    show()

    expect(screen.getByRole('heading', { name: 'Configuración', level: 1 })).toBeInTheDocument()
    expect(parts().map((part) => part.getAttribute('href'))).toEqual(['#/configuracion/locales', '#/configuracion/horarios', '#/configuracion/equipo'])
    expect(parts().map((part) => part.querySelector('strong')?.textContent)).toEqual(['Locales', 'Horarios', 'Equipo'])
    for (const part of parts()) {
      expect(part.querySelector('small')?.textContent).not.toBe('')
      for (const icon of part.querySelectorAll('svg')) expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('mientras falta un paso, «Primeros pasos» es la primera parte', () => {
    show({ setupMissing: true })

    expect(parts().map((part) => part.querySelector('strong')?.textContent)).toEqual(['Primeros pasos', 'Locales', 'Horarios', 'Equipo'])
    expect(parts()[0]).toHaveAttribute('href', '#/configuracion/primeros-pasos')
  })

  it('elegir una parte avisa a la aplicación', () => {
    const onNavigate = show({ setupMissing: true })

    fireEvent.click(parts()[0])
    fireEvent.click(parts()[3])

    expect(onNavigate.mock.calls).toEqual([['setup'], ['empleados']])
  })

  it('tiene el control de avisos de este dispositivo, después de las partes', () => {
    show()

    const control = screen.getByRole('region', { name: 'Avisos en este dispositivo' })
    expect(within(control).getByText(/^Desactivados para Braja Centro;/)).toBeInTheDocument()
    expect(within(control).getByRole('button', { name: 'Activar avisos' })).toBeEnabled()
    expect(screen.getByRole('list', { name: 'Partes de la configuración' }).compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('muestra los avisos bloqueados en el navegador y el error al activarlos tal como los da el control', () => {
    show({ push: { availability: 'blocked' } })
    expect(screen.getByText('No podemos avisarte porque bloqueaste los avisos en este navegador. Habilitalos desde los permisos del sitio.')).toBeInTheDocument()
    cleanup()

    show({ push: { error: 'No se pudieron activar los avisos.' } })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron activar los avisos.')
  })

  it('dice «Conexión protegida» solo en un contexto seguro', () => {
    show({ secure: false })
    expect(screen.queryByText('Conexión protegida')).not.toBeInTheDocument()
    cleanup()

    show({ secure: true })
    expect(screen.getByText('Conexión protegida')).toBeInTheDocument()
  })
})

describe('«Configuración» dentro de la aplicación', () => {
  const openAt = (hash: string) => window.history.replaceState(null, '', `/admin${hash}`)
  const hashSettles = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

  it('«Conexión protegida» está en la página «Configuración» y en ninguna otra sección', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    apiMocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/inbox')) return Promise.resolve({ items: [], nextCursor: null })
      if (path.startsWith('/jornadas?')) return Promise.resolve([])
      return Promise.resolve([])
    })
    try {
      const sections: [string, string][] = [
        ['#/para-revisar', 'Para revisar'], ['#/hoy', 'Hoy'], ['#/dias-de-trabajo', 'Días de trabajo'], ['#/configuracion/locales', 'Locales'],
        ['#/configuracion/horarios', 'Horarios'], ['#/configuracion/equipo', 'Equipo'], ['#/configuracion/primeros-pasos', 'Primeros pasos']
      ]
      for (const [hash, title] of sections) {
        openAt(hash)
        const view = render(<AdminApp />)
        expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
        expect(screen.queryByText('Conexión protegida'), hash).not.toBeInTheDocument()
        await hashSettles()
        view.unmount()
      }

      openAt('#/configuracion')
      render(<AdminApp />)
      expect(await screen.findByRole('heading', { name: 'Configuración', level: 1 })).toBeInTheDocument()
      expect(screen.getAllByText('Conexión protegida')).toHaveLength(1)
      expect(screen.getByRole('region', { name: 'Avisos en este dispositivo' })).toBeInTheDocument()
      await hashSettles()
    } finally {
      cleanup()
      window.history.replaceState(null, '', '/')
      if (original) Object.defineProperty(window, 'isSecureContext', original)
      else Reflect.deleteProperty(window, 'isSecureContext')
    }
  })
})
