import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'

describe('ApiClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('obtiene CSRF en memoria y usa cookie de sesión en la API con prefijo del contrato', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accountId: 'account-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()

    await client.post('/session', { dni: '12345678', password: 'secret' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/csrf')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/session')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include', cache: 'no-store' })
  })

  it('envía CSRF en toda operación que cambia estado y no persiste el token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()

    await client.put('/companies/active', { companyId: 'company-1' })

    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-CSRF-TOKEN')).toBe('csrf-token-long-enough')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('no expone detalle privado de respuestas Problem en mensajes de error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'about:blank', title: 'Error', status: 422, code: 'VALIDATION', detail: 'motivo de salud privado'
    }), { status: 422, headers: { 'Content-Type': 'application/problem+json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()

    await expect(client.get('/deviations')).rejects.toMatchObject({ message: 'Revisá los datos ingresados.' })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
  })
})
