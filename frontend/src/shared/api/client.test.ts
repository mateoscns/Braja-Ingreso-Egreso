import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient, ApiError, TimeoutError } from './client'

// Issue #177: «Revisá los datos ingresados.» did not say what to do. A 422 without a code of its own has no field to name,
// so it says the system refused a value and asks to check what was entered; a coded 422 keeps its own message.
const VALIDATION_FALLBACK = 'Hay un dato que el sistema no aceptó. Revisá lo que cargaste y volvé a intentar.'

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

    await expect(client.get('/deviations')).rejects.toMatchObject({ message: VALIDATION_FALLBACK })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
  })

  it('explica cuándo se habilita una marca rechazada por ser demasiado temprana', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'about:blank', title: 'Conflict', status: 409, code: 'MARK_TOO_EARLY', detail: 'internal detail'
    }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()

    await expect(client.get('/jornadas')).rejects.toMatchObject({
      message: 'Todavía es temprano para marcar. La entrada se puede marcar desde 30 minutos antes de tu horario; las demás marcas, desde que empieza tu día de trabajo.'
    })
  })

  it('explica que falta un horario al cargar el día sin horario (422 TEMPLATE_REQUIRED)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 422, code: 'TEMPLATE_REQUIRED', detail: 'internal' }),
      { status: 422, headers: { 'Content-Type': 'application/problem+json' } })))

    await expect(new ApiClient().get('/jornadas')).rejects.toMatchObject({
      status: 422, code: 'TEMPLATE_REQUIRED',
      message: 'Esa persona no tiene un horario en ese local para ese día. Elegí un horario o asignale uno desde Equipo.'
    })
  })

  it('explica que ya hay un horario asignado en ese local desde ese día (409 ASSIGNMENT_EXISTS)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 409, code: 'ASSIGNMENT_EXISTS' }),
      { status: 409, headers: { 'Content-Type': 'application/problem+json' } })))

    await expect(new ApiClient().get('/employees')).rejects.toMatchObject({
      message: 'Esa persona ya tiene un horario en ese local desde ese día. Elegí otro día.'
    })
  })

  // 2026-11-13 audit: Object.hasOwn needs Safari 15.4; on an older iPhone every 409 showed «Object.hasOwn is not a function».
  it('explica un conflicto conocido también en un navegador sin Object.hasOwn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 409, code: 'ASSIGNMENT_EXISTS' }),
      { status: 409, headers: { 'Content-Type': 'application/problem+json' } })))
    const hasOwn = Object.hasOwn
    Reflect.deleteProperty(Object, 'hasOwn')
    // The matchers use Object.hasOwn themselves: the failure is caught first and checked once it is back.
    let failure: unknown
    try { await new ApiClient().get('/employees') } catch (reason) { failure = reason }
    finally { Object.defineProperty(Object, 'hasOwn', { value: hasOwn, configurable: true, writable: true }) }
    expect(failure).toMatchObject({ message: 'Esa persona ya tiene un horario en ese local desde ese día. Elegí otro día.' })
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
    expect((failure as Error).message).toBe('No se pudo conectar. Revisá tu conexión a internet y reintentá.')
  })

  it('un token de seguridad inválido se explica sin palabras técnicas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: 'short' }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const failure = await new ApiClient().put('/companies/active', { companyId: 'company-1' }).catch((reason: Error) => reason)
    expect((failure as Error).message).toBe('No se pudo preparar la operación. Reintentá en unos segundos.')
    expect((failure as Error).message).not.toMatch(/servidor|token|CSRF/)
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
    expect((failure as ApiError).message).toBe('El sistema estaba ocupado y no completó la operación. Reintentá en unos segundos.')
    expect((failure as ApiError).code).toBe('RETRYABLE_TRANSACTION_CONFLICT')
    expect((failure as ApiError).retryAfterSeconds).toBe(1)
  })

  it.each([
    [409, 'INVALID_MARK_TRANSITION', 'El estado del día de trabajo cambió y esa marca ya no corresponde. Revisá el estado actualizado.'],
    [409, 'INVALID_MARK_ORDER', 'El estado del día de trabajo cambió y esa marca ya no corresponde. Revisá el estado actualizado.'],
    [409, 'IDEMPOTENCY_CONFLICT', 'No se pudo registrar tu marca. Tocá Actualizar y volvé a marcar.'],
    [409, 'MOTIVE_LOCKED', 'Tu encargado ya lo revisó: ya no se puede cambiar.'],
    [409, 'JORNADA_EXISTS', 'Esa persona ya tiene ese día cargado en ese local.'],
    [409, 'MEMBERSHIP_EXISTS', 'Esa persona ya tiene un rol en esta empresa.'],
    [409, 'ACCOUNT_INACTIVE', 'La cuenta de ese DNI no está habilitada y no se puede agregar a la empresa.'],
    [409, 'ACCOUNT_SHARED', 'Esta persona también tiene acceso en otra empresa o como ADMIN, así que su contraseña no se puede restablecer desde acá. Pedí ayuda al soporte de Fichaje Braja.'],
    [409, 'EMPLOYEE_INACTIVE', 'El empleado está dado de baja; reactivalo antes de restablecer la contraseña.'],
    [409, 'JORNADA_HAS_MARKS', 'El día de trabajo ya tiene marcas y no se puede cancelar. Corregí o anulá sus marcas.'],
    [409, 'JORNADA_CANCELLED', 'Este día de trabajo fue cancelado y no admite marcas.'],
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
    expect((failure as Error).message).toBe('El sistema tardó demasiado en responder.')
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

  it('a 503 SERVICE_UNAVAILABLE from the proxy during a deploy does not blame the connection and uses Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: 503, code: 'SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '30' } })))
    const failure = await new ApiClient().get('/x').catch((reason: unknown) => reason)
    expect(failure).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE', retryAfterSeconds: 30,
      message: 'El sistema se está actualizando o no está disponible por un momento. Probá de nuevo en un minuto.' })
    expect((failure as Error).message).not.toMatch(/conexión/)
  })

  it('a 503 without a parseable body still says the system is unavailable, not the connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('Service Unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({
      status: 503, message: 'El sistema se está actualizando o no está disponible por un momento. Probá de nuevo en unos minutos.'
    })
  })

  // Issue #177: the generic message blamed the connection («Revisá tu conexión») for a failure of the system.
  it('a 500 says the system failed, not the connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: 500 }), { status: 500, headers: { 'Content-Type': 'application/problem+json' } })))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ message: 'Algo falló en el sistema. Probá de nuevo en un rato. Si sigue pasando, pedí ayuda.' })
  })
})

describe('ApiClient: codes of the production backend and proxy', () => {
  afterEach(() => vi.unstubAllGlobals())
  const coded = (status: number, code: string) =>
    new Response(JSON.stringify({ status, code, detail: 'internal detail' }), { status, headers: { 'Content-Type': 'application/problem+json' } })

  it.each([
    [409, 'EMPLOYEE_NOT_IN_SITE', 'Esa persona no trabaja en ese local. Agregale el local desde Equipo y volvé a intentar.'],
    [422, 'TEMPLATE_INVALID', 'Ese horario está desactivado y no se puede usar. Elegí otro o revisalo en Horarios.'],
    [409, 'TEMPLATE_IN_USE', 'Ese horario ya se usa, así que no puede pasar a otro local. Creá un horario nuevo para ese local.'],
    [422, 'PASSWORD_TOO_LONG', 'La contraseña es demasiado larga: puede tener hasta 72 caracteres, y las letras con tilde y la ñ cuentan como 2.'],
    [413, 'PAYLOAD_TOO_LARGE', 'Los datos enviados son demasiado grandes. Acortá los textos y volvé a intentar.']
  ])('a %i %s has a specific message', async (status, code, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(coded(status, code)))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ message, code, status })
  })

  it('a 413 answered by the proxy without a body keeps the size message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 413 })))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ status: 413, message: 'Los datos enviados son demasiado grandes. Acortá los textos y volvé a intentar.' })
  })

  it('a 422 with an unknown code keeps the generic validation message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(coded(422, 'VALIDATION_ERROR')))
    await expect(new ApiClient().get('/x')).rejects.toMatchObject({ message: VALIDATION_FALLBACK })
  })
})

// T12 (#114): the warning before the ADMIN session expires restarts its clock on every answer the server gave (rule 23).
describe('ApiClient: observer of answered requests', () => {
  afterEach(() => vi.unstubAllGlobals())
  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const coded = (status: number) => new Response(JSON.stringify({ status, code: 'X' }), { status, headers: { 'Content-Type': 'application/problem+json' } })

  it('tells every answer of a request with the session cookie, an error included, and changes neither the request nor its result', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok()).mockResolvedValueOnce(coded(409))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    const listener = vi.fn()
    const stop = client.onResponse(listener)

    await expect(client.get('/session')).resolves.toEqual({ ok: true })
    expect(listener).toHaveBeenCalledTimes(1)
    await expect(client.get('/x')).rejects.toMatchObject({ status: 409 })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error' })

    stop()
    fetchMock.mockResolvedValueOnce(ok())
    await client.get('/session')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not tell a request that never got an answer nor one sent without the cookie', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    const listener = vi.fn()
    client.onResponse(listener)

    await expect(client.get('/session')).rejects.toMatchObject({ name: 'NetworkError' })
    await client.publicConfig()
    expect(listener).not.toHaveBeenCalled()
  })

  // Verifier of T12: Caddy answers 503 under /api while the backend restarts, without reaching it, so a 5xx is no proof that the
  // server saw the session; counting it hid «Seguir conectado» and the session still closed two minutes later.
  it('does not tell a 5xx answer, which may come from the proxy without touching the session', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(coded(503)).mockResolvedValueOnce(coded(500))
    vi.stubGlobal('fetch', fetchMock)
    const client = new ApiClient()
    const listener = vi.fn()
    client.onResponse(listener)

    await expect(client.get('/session')).rejects.toMatchObject({ status: 503 })
    await expect(client.get('/x')).rejects.toMatchObject({ status: 500 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('a listener that throws does not break the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok()))
    const client = new ApiClient()
    client.onResponse(() => { throw new Error('listener') })
    await expect(client.get('/session')).resolves.toEqual({ ok: true })
  })
})

// 2026-11-13 audit: only the mark had a deadline; a stalled connection left «Preparando…» or «Cargando tu día…» forever.
describe('ApiClient: plazo de las consultas', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  const hanging = () => vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  }))

  it('una consulta sin respuesta se corta a los 30 segundos con TimeoutError', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hanging())
    const pending = new ApiClient().get('/session').catch((reason: unknown) => reason)

    await vi.advanceTimersByTimeAsync(29_999)
    expect(await Promise.race([pending.then(() => 'settled'), Promise.resolve('pending')])).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toBeInstanceOf(TimeoutError)
  })

  it('una consulta con su propia señal usa esa y no el plazo general', async () => {
    vi.useFakeTimers()
    const fetchMock = hanging()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const pending = new ApiClient().get('/session', { signal: controller.signal }).catch((reason: unknown) => reason)

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await Promise.race([pending.then(() => 'settled'), Promise.resolve('pending')])).toBe('pending')
    controller.abort(new DOMException('timeout', 'TimeoutError'))
    expect(await pending).toBeInstanceOf(TimeoutError)
  })

  it('una consulta que responde a tiempo no deja el plazo corriendo', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(new ApiClient().get('/session')).resolves.toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  })
})
