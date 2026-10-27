export type ApiProblem = { status?: number; code?: string }

export type ApiErrorContext = { retryAfterSeconds?: number; login?: boolean; passwordChange?: boolean }

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly retryAfterSeconds?: number

  constructor(status: number, problem?: ApiProblem, context: ApiErrorContext = {}) {
    super(messageForStatus(status, problem?.code, context))
    this.name = 'ApiError'
    this.status = status
    this.code = problem?.code
    this.retryAfterSeconds = context.retryAfterSeconds
  }
}

/** Network failure: the request never got a response. Each screen decides how to contextualize it. */
export class NetworkError extends Error {
  constructor() {
    super('No se pudo conectar con el servidor. Revisá tu conexión y reintentá.')
    this.name = 'NetworkError'
  }
}

/** The caller's deadline expired before a response arrived; the server may or may not have applied the request. */
export class TimeoutError extends Error {
  constructor() {
    super('El servidor tardó demasiado en responder.')
    this.name = 'TimeoutError'
  }
}

function waitText(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 'unos minutos'
  if (seconds < 90) return 'un minuto'
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minutos`
}

const STALE_MARK = 'El estado de la jornada cambió y esa marca ya no corresponde. Revisá el estado actualizado.'
const CONFLICT_MESSAGES: Record<string, string> = {
  MARK_TOO_EARLY: 'Todavía no es horario para registrar esta marca. El ingreso se habilita 30 minutos antes; las demás marcas, desde el inicio de la jornada.',
  RETRYABLE_TRANSACTION_CONFLICT: 'El servidor estaba ocupado y no completó la operación. Reintentá en unos segundos.',
  INVALID_MARK_TRANSITION: STALE_MARK,
  INVALID_MARK_ORDER: STALE_MARK,
  INVALID_MARK_HISTORY: STALE_MARK,
  IDEMPOTENCY_CONFLICT: 'Esta solicitud ya se usó para otra acción. Actualizá la vista y volvé a intentar.',
  MOTIVE_LOCKED: 'El administrador ya revisó este desvío; el motivo ya no se puede cambiar.',
  JORNADA_EXISTS: 'Ya hay una jornada declarada para ese empleado, sede y fecha.',
  MEMBERSHIP_EXISTS: 'Esa persona ya tiene un rol en esta empresa.',
  ACCOUNT_INACTIVE: 'La cuenta de ese DNI no está habilitada y no se puede agregar a la empresa.',
  JORNADA_HAS_MARKS: 'La jornada ya tiene marcas y no se puede cancelar. Corregí o anulá sus marcas.',
  JORNADA_CANCELLED: 'Esta jornada fue cancelada por el administrador y no admite marcas.',
  MARK_VOIDED: 'Esa marca ya fue anulada y no se puede modificar.'
}

function messageForStatus(status: number, code?: string, context: ApiErrorContext = {}): string {
  if (status === 401 && context.login && code !== 'SESSION_EXPIRED') return 'El DNI o la contraseña son incorrectos.'
  if (status === 401 && context.login) return 'No se pudo iniciar sesión. Reintentá.'
  if (status === 401 && context.passwordChange && code === 'CURRENT_PASSWORD_INVALID') return 'La contraseña actual no es correcta.'
  if (status === 401) return 'Tu sesión venció. Iniciá sesión nuevamente.'
  if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') return 'Tenés que cambiar tu contraseña provisoria antes de continuar.'
  if (status === 403) return 'No tenés permiso para realizar esta acción.'
  if (status === 409 && code && Object.hasOwn(CONFLICT_MESSAGES, code)) return CONFLICT_MESSAGES[code]
  if (status === 409) return 'La información cambió o la acción ya fue procesada. Actualizá la vista.'
  if (status === 422) return 'Revisá los datos ingresados.'
  if (status === 429) return `Hubo demasiados intentos. Esperá ${waitText(context.retryAfterSeconds)} y probá otra vez.`
  return 'No se pudo completar la operación. Revisá tu conexión y reintentá.'
}

type RequestOptions = { headers?: Record<string, string>; signal?: AbortSignal }
export type MutationOptions = { signal?: AbortSignal }
/** Called when an authenticated request gets 401: the server no longer has a live session for this browser. */
export type SessionExpiredListener = () => void

const LOGIN_URL = '/api/v1/session'
const PASSWORD_URL = '/api/v1/session/password'

export class ApiClient {
  private csrfToken?: string
  private csrfPromise?: Promise<string>
  private readonly sessionExpiredListeners = new Set<SessionExpiredListener>()
  private readonly passwordChangeListeners = new Set<SessionExpiredListener>()

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, options)
  }

  async post<T>(path: string, body?: unknown, headers: Record<string, string> = {}, options: MutationOptions = {}): Promise<T> {
    return this.request<T>('POST', path, body, { headers, signal: options.signal })
  }

  async put<T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('PUT', path, body, { headers })
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }

  async delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  async attachLocation(markId: string, location: { latitude: number; longitude: number; accuracyMeters: number }): Promise<void> {
    await this.post(`/marks/${encodeURIComponent(markId)}/location`, location)
  }

  async publicConfig<T>(): Promise<T> {
    return this.send<T>('/api/v1/public-config', { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'same-origin' })
  }

  clearCsrf(): void {
    this.csrfToken = undefined
    this.csrfPromise = undefined
  }

  /** Subscribes to session expiry; returns the unsubscribe function. */
  onSessionExpired(listener: SessionExpiredListener): () => void {
    this.sessionExpiredListeners.add(listener)
    return () => { this.sessionExpiredListeners.delete(listener) }
  }

  /** Subscribes to 403 PASSWORD_CHANGE_REQUIRED; returns the unsubscribe function. */
  onPasswordChangeRequired(listener: () => void): () => void {
    this.passwordChangeListeners.add(listener)
    return () => { this.passwordChangeListeners.delete(listener) }
  }

  private async request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    try {
      return await this.requestOnce<T>(method, path, body, options)
    } catch (reason) {
      // An expired anonymous session invalidates the CSRF token; login retries once with a fresh token.
      const login = method === 'POST' && `/api/v1${path.startsWith('/') ? path : `/${path}`}` === LOGIN_URL
      if (login && reason instanceof ApiError && reason.status === 401 && reason.code === 'SESSION_EXPIRED') {
        return this.requestOnce<T>(method, path, body, options)
      }
      throw reason
    }
  }

  private async requestOnce<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const url = `/api/v1${path.startsWith('/') ? path : `/${path}`}`
    const headers = new Headers(options.headers)
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-TOKEN', await this.ensureCsrf())
    return this.send<T>(url, {
      method,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal
    })
  }

  private async ensureCsrf(): Promise<string> {
    if (this.csrfToken) return this.csrfToken
    if (!this.csrfPromise) {
      this.csrfPromise = this.send<{ token: string }>('/api/v1/csrf', {
        method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', referrerPolicy: 'same-origin'
      }).then(({ token }) => {
        if (typeof token !== 'string' || token.length < 16 || token.length > 256) {
          throw new Error('El servidor no entregó un token CSRF válido.')
        }
        this.csrfToken = token
        return token
      }).finally(() => { this.csrfPromise = undefined })
    }
    return this.csrfPromise
  }

  private async send<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await fetch(url, init)
    } catch {
      const reason: unknown = init.signal?.aborted ? init.signal.reason : undefined
      if (reason instanceof DOMException && reason.name === 'TimeoutError') throw new TimeoutError()
      throw new NetworkError()
    }
    if (!response.ok) {
      let problem: ApiProblem | undefined
      try {
        const parsed: unknown = await response.json()
        if (parsed && typeof parsed === 'object') {
          const candidate = parsed as Record<string, unknown>
          problem = { status: response.status, code: typeof candidate.code === 'string' ? candidate.code : undefined }
        }
      } catch { /* La respuesta HTTP conserva el estado aunque no incluya un problema parseable. */ }
      const login = init.method === 'POST' && url === LOGIN_URL
      const passwordChange = init.method === 'PUT' && url === PASSWORD_URL
      const retryAfter = Number(response.headers.get('Retry-After'))
      const error = new ApiError(response.status, problem, {
        retryAfterSeconds: Number.isFinite(retryAfter) && response.headers.get('Retry-After') ? retryAfter : undefined,
        login,
        passwordChange
      })
      const wrongCurrentPassword = passwordChange && error.code === 'CURRENT_PASSWORD_INVALID'
      if (response.status === 401 && !wrongCurrentPassword) {
        this.clearCsrf()
        if (!login) this.sessionExpiredListeners.forEach((listener) => listener())
      }
      if (response.status === 403 && error.code === 'PASSWORD_CHANGE_REQUIRED') this.passwordChangeListeners.forEach((listener) => listener())
      throw error
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) return undefined as T
    return await response.json() as T
  }
}

export const api = new ApiClient()

export function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  const result = params.toString()
  return result ? `?${result}` : ''
}
