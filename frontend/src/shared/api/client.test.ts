import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiError, TimeoutError } from './client'

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

describe('ApiClient: códigos de error conocidos', () => {
  afterEach(() => vi.unstubAllGlobals())
  const coded = (status: number, code: string, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ status, code }), { status, headers: { 'Content-Type': 'application/problem+json', ...headers } })

  it('un conflicto transaccional reintentable no dice que la acción ya fue procesada y expone Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(coded(409, 'RETRYABLE_TRANSACTION_CONFLICT', { 'Retry-After': '1' })))
    const failure = await new ApiClient().get('/jornadas').catch((reason: unknown) => reason)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).message).not.toMatch(/ya fue procesada/)
    expect((failure as ApiError).message).toBe('El servidor estaba ocupado y no completó la operación. Reintentá en unos segundos.')
    expect((failure as ApiError).code).toBe('RETRYABLE_TRANSACTION_CONFLICT')
    expect((failure as ApiError).retryAfterSeconds).toBe(1)
  })

  it.each([
    [409, 'INVALID_MARK_TRANSITION', 'El estado de la jornada cambió y esa marca ya no corresponde. Revisá el estado actualizado.'],
    [409, 'INVALID_MARK_ORDER', 'El estado de la jornada cambió y esa marca ya no corresponde. Revisá el estado actualizado.'],
    [409, 'IDEMPOTENCY_CONFLICT', 'Esta solicitud ya se usó para otra acción. Actualizá la vista y volvé a intentar.'],
    [409, 'MOTIVE_LOCKED', 'El administrador ya revisó este desvío; el motivo ya no se puede cambiar.'],
    [409, 'JORNADA_EXISTS', 'Ya hay una jornada declarada para ese empleado, sede y fecha.'],
    [409, 'MEMBERSHIP_EXISTS', 'Esa persona ya tiene un rol en esta empresa.'],
    [409, 'ACCOUNT_INACTIVE', 'La cuenta de ese DNI no está habilitada y no se puede agregar a la empresa.'],
    [409, 'ACCOUNT_SHARED', 'Esta persona también tiene acceso en otra empresa o como ADMIN; su contraseña la restablece el operador.'],
    [409, 'EMPLOYEE_INACTIVE', 'El empleado está dado de baja; reactivalo antes de restablecer la contraseña.'],
    [409, 'JORNADA_HAS_MARKS', 'La jornada ya tiene marcas y no se puede cancelar. Corregí o anulá sus marcas.'],
    [409, 'JORNADA_CANCELLED', 'Esta jornada fue cancelada por el administrador y no admite marcas.'],
    [409, 'MARK_VOIDED', 'Esa marca ya fue anulada y no se puede modificar.'],
    [403, 'PASSWORD_CHANGE_REQUIRED', 'Tenés que cambiar tu contraseña provisoria antes de continuar.']
  ])('un %i %s tiene un mensaje específico', async (status, code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(coded(status, code)))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ message, code, status })
  })

  it('un 409 con un código desconocido conserva el mensaje genérico', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(coded(409, 'CONFLICT')))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ message: 'La información cambió o la acción ya fue procesada. Actualizá la vista.' })
  })
})

describe('ApiClient: sesión vencida y contraseña actual', () => {
  afterEach(() => vi.unstubAllGlobals())
  const csrf = () => new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const unauthorized = (code = 'UNAUTHORIZED') => new Response(JSON.stringify({ status: 401, code }), { status: 401, headers: { 'Content-Type': 'application/problem+json' } })

  it('un 401 en una mutación fuera del login avisa la sesión vencida y descarta el token CSRF', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(csrf()).mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    const listener = vi.fn()
    client.onSessionExpired(listener)

    await expect(client.put('/companies/active', { companyId: 'c-1' })).rejects.toMatchObject({ status: 401, message: 'Tu sesión venció. Iniciá sesión nuevamente.' })
    expect(listener).toHaveBeenCalledOnce()
    await client.put('/companies/active', { companyId: 'c-1' })
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/csrf')
  })

  it('un 401 al iniciar sesión no se trata como sesión vencida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unauthorized()))
    const client = new ApiClient()
    const listener = vi.fn()
    client.onSessionExpired(listener)
    await expect(client.post('/session', { dni: '1', password: 'x' })).rejects.toMatchObject({ message: 'El DNI o la contraseña son incorrectos.' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('un 401 CURRENT_PASSWORD_INVALID al cambiar la contraseña dice que la actual es incorrecta y conserva la sesión', async () => {
    const code = 'CURRENT_PASSWORD_INVALID'
    const fetchMock = vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unauthorized(code)).mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    const listener = vi.fn()
    client.onSessionExpired(listener)

    await expect(client.put('/session/password', { currentPassword: 'x', newPassword: 'y'.repeat(12) })).rejects.toMatchObject({ status: 401, message: 'La contraseña actual no es correcta.' })
    expect(listener).not.toHaveBeenCalled()
    await client.put('/session/password', { currentPassword: 'z', newPassword: 'y'.repeat(12) })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get('X-CSRF-TOKEN')).toBe('csrf-token-long-enough')
  })

  it('un 401 UNAUTHORIZED al cambiar la contraseña es una sesión vencida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unauthorized('UNAUTHORIZED')))
    const client = new ApiClient()
    const listener = vi.fn()
    client.onSessionExpired(listener)
    await expect(client.put('/session/password', { currentPassword: 'x', newPassword: 'y'.repeat(12) })).rejects.toMatchObject({ status: 401, message: 'Tu sesión venció. Iniciá sesión nuevamente.' })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('el ingreso reintenta una vez con un token nuevo si la sesión anónima venció', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(unauthorized('SESSION_EXPIRED'))
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    const listener = vi.fn()
    client.onSessionExpired(listener)
    await expect(client.post('/session', { dni: '1', password: 'x' })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/csrf')
    expect(listener).not.toHaveBeenCalled()
  })

  it('el ingreso no reintenta más de una vez', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unauthorized('SESSION_EXPIRED')).mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unauthorized('SESSION_EXPIRED'))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    await expect(client.post('/session', { dni: '1', password: 'x' })).rejects.toMatchObject({ status: 401, message: 'No se pudo iniciar sesión. Reintentá.' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('deja de avisar a un oyente dado de baja', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorized()))
    const client = new ApiClient()
    const listener = vi.fn()
    const unsubscribe = client.onSessionExpired(listener)
    unsubscribe()
    await expect(client.get('/jornadas')).rejects.toMatchObject({ status: 401 })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('ApiClient: tiempo de espera', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('pasa la señal a fetch y distingue la espera agotada de un fallo de red', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const pending = new ApiClient().post('/jornadas/j-1/marks', { action: 'INGRESO' }, { 'Idempotency-Key': 'k' }, { signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1][1].signal).toBe(controller.signal)
    controller.abort(new DOMException('timeout', 'TimeoutError'))

    const failure = await pending.catch((reason: unknown) => reason)
    expect(failure).toBeInstanceOf(TimeoutError)
    expect((failure as Error).message).toBe('El servidor tardó demasiado en responder.')
  })

  it('la espera agotada también corta un pedido de token CSRF que no responde y no envía la mutación', async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => { /* GET /csrf never answers */ }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const pending = new ApiClient().post('/jornadas/j-1/marks', { action: 'INGRESO' }, { 'Idempotency-Key': 'k' }, { signal: controller.signal })
      .catch((reason: unknown) => reason)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort(new DOMException('timeout', 'TimeoutError'))

    expect(await pending).toBeInstanceOf(TimeoutError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]).toEqual(['/api/v1/csrf', expect.objectContaining({ method: 'GET' })])
  })

  it('una señal ya cortada no pide el token CSRF', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort(new DOMException('timeout', 'TimeoutError'))

    await expect(new ApiClient().post('/x', {}, {}, { signal: controller.signal })).rejects.toBeInstanceOf(TimeoutError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cortar una operación no cancela el token CSRF que otra operación sigue esperando', async () => {
    let answerCsrf!: (response: Response) => void
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { answerCsrf = resolve }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    const controller = new AbortController()
    const aborted = client.post('/a', {}, {}, { signal: controller.signal }).catch((reason: unknown) => reason)
    const other = client.put('/b', {})
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    controller.abort(new DOMException('timeout', 'TimeoutError'))
    expect(await aborted).toBeInstanceOf(TimeoutError)
    answerCsrf(new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(other).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/b')
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-CSRF-TOKEN')).toBe('csrf-token-long-enough')
  })
})

describe('ApiClient: autenticación no disponible', () => {
  afterEach(() => vi.unstubAllGlobals())
  const csrf = () => new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const unavailable = () => new Response(JSON.stringify({ status: 503, code: 'AUTHENTICATION_UNAVAILABLE' }), { status: 503, headers: { 'Content-Type': 'application/problem+json' } })
  const message = 'El sistema no está disponible en este momento. Probá de nuevo en unos minutos.'

  it('un 503 AUTHENTICATION_UNAVAILABLE al iniciar sesión dice que el sistema no está disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unavailable()))
    await expect(new ApiClient().post('/session', { dni: '1', password: 'x' })).rejects.toMatchObject({ status: 503, code: 'AUTHENTICATION_UNAVAILABLE', message })
  })

  it('un 503 AUTHENTICATION_UNAVAILABLE al cambiar la contraseña dice que el sistema no está disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(unavailable()))
    await expect(new ApiClient().put('/session/password', { currentPassword: 'a', newPassword: 'b' })).rejects.toMatchObject({ status: 503, message })
  })

  it('un 503 sin ese código conserva el mensaje genérico de conexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: 503 }), { status: 503, headers: { 'Content-Type': 'application/problem+json' } })))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ message: 'No se pudo completar la operación. Revisá tu conexión y reintentá.' })
  })
})
