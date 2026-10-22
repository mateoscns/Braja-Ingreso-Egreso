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

  it('explica cuándo se habilita una marca rechazada por ser demasiado temprana', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'about:blank', title: 'Conflict', status: 409, code: 'MARK_TOO_EARLY', detail: 'internal detail'
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()

    await expect(client.get('/jornadas')).rejects.toMatchObject({
      message: 'Todavía no es horario para registrar esta marca. El ingreso se habilita 30 minutos antes; las demás marcas, desde el inicio de la jornada.'
    })
  })
})

describe('ApiClient: mensajes de error', () => {
  afterEach(() => vi.unstubAllGlobals())
  const csrf = () => new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const problem = (status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify({ status }), { status, headers: { 'Content-Type': 'application/problem+json', ...headers } })

  it('un 401 al iniciar sesión dice que el DNI o la contraseña son incorrectos, sin decir cuál', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(problem(401)))
    const failure = await new ApiClient().post('/session', { dni: '1', password: 'x' }).catch((reason: Error) => reason)
    expect((failure as Error).message).toBe('El DNI o la contraseña son incorrectos.')
  })

  it('un 401 en una petición ya autenticada sigue diciendo que la sesión venció', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(problem(401)))
    await expect(new ApiClient().get('/jornadas')).rejects.toMatchObject({ message: 'Tu sesión venció. Iniciá sesión nuevamente.' })
  })

  it('un 429 informa la espera según Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(problem(429, { 'Retry-After': '900' })))
    const failure = await new ApiClient().post('/session', {}).catch((reason: Error) => reason)
    expect((failure as Error).message).toContain('15 minutos')
  })

  it('un 429 sin Retry-After habla de unos minutos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(problem(429)))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ message: expect.stringContaining('unos minutos') })
  })

  it('un fallo de red no habla de marcas y se identifica como NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const failure = await new ApiClient().get('/employees').catch((reason: Error) => reason)
    expect((failure as Error).name).toBe('NetworkError')
    expect((failure as Error).message).not.toMatch(/marca/i)
  })
})
