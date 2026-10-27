import { describe, expect, it, vi } from 'vitest'
import { focusOrOpenAdmin, type WindowClientLike } from './notificationClick'

const origin = 'https://fichaje.example'
function windowClient(url: string, navigate?: WindowClientLike['navigate']): WindowClientLike {
  const client: WindowClientLike = { url, focus: vi.fn(() => Promise.resolve(client)), navigate }
  return client
}
function clientsWith(windows: WindowClientLike[]) {
  return { matchAll: vi.fn(() => Promise.resolve(windows)), openWindow: vi.fn(() => Promise.resolve(null)) }
}

describe('focusOrOpenAdmin', () => {
  it('navega una ventana propia controlada a la URL de la notificación y la enfoca', async () => {
    const navigated = windowClient(`${origin}/admin?deviation=1`)
    const existing = windowClient(`${origin}/`, vi.fn(() => Promise.resolve(navigated)))
    const clients = clientsWith([existing])

    await focusOrOpenAdmin(clients, origin, '/admin?deviation=1')

    expect(existing.navigate).toHaveBeenCalledWith('/admin?deviation=1')
    expect(navigated.focus).toHaveBeenCalled()
    expect(clients.openWindow).not.toHaveBeenCalled()
  })

  it('si navigate no existe, enfoca una ventana de /admin abierta', async () => {
    const admin = windowClient(`${origin}/admin`)
    const clients = clientsWith([windowClient(`${origin}/`), admin])

    await focusOrOpenAdmin(clients, origin, '/admin')

    expect(admin.focus).toHaveBeenCalled()
    expect(clients.openWindow).not.toHaveBeenCalled()
  })

  it('si navigate falla en una ventana no controlada y no hay /admin, abre una ventana nueva', async () => {
    const uncontrolled = windowClient(`${origin}/`, vi.fn(() => Promise.reject(new TypeError('not controlled'))))
    const clients = clientsWith([uncontrolled])

    await focusOrOpenAdmin(clients, origin, '/admin')

    expect(clients.openWindow).toHaveBeenCalledWith('/admin')
  })

  it('si navigate no devuelve ventana, cae a abrir /admin', async () => {
    const clients = clientsWith([windowClient(`${origin}/`, vi.fn(() => Promise.resolve(null)))])
    await focusOrOpenAdmin(clients, origin, '/admin')
    expect(clients.openWindow).toHaveBeenCalledWith('/admin')
  })

  it('ignora ventanas de otro origen y abre una nueva', async () => {
    const foreign = windowClient('https://otro.example/admin', vi.fn(() => Promise.resolve(null)))
    const clients = clientsWith([foreign])

    await focusOrOpenAdmin(clients, origin, '/admin')

    expect(foreign.navigate).not.toHaveBeenCalled()
    expect(foreign.focus).not.toHaveBeenCalled()
    expect(clients.openWindow).toHaveBeenCalledWith('/admin')
  })
})
