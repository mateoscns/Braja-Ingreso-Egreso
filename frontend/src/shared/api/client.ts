export type ApiProblem = { status?: number; code?: string }

export type ApiErrorContext = { retryAfterSeconds?: number; login?: boolean }

export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, problem?: ApiProblem, context: ApiErrorContext = {}) {
    super(messageForStatus(status, problem?.code, context))
    this.name = 'ApiError'
    this.status = status
    this.code = problem?.code
  }
}

/** Network failure: the request never got a response. Each screen decides how to contextualize it. */
export class NetworkError extends Error {
  constructor() {
    super('No se pudo conectar con el servidor. Revisá tu conexión y reintentá.')
    this.name = 'NetworkError'
  }
}

function waitText(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 'unos minutos'
  if (seconds < 90) return 'un minuto'
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minutos`
}

function messageForStatus(status: number, code?: string, context: ApiErrorContext = {}): string {
  if (status === 401 && context.login) return 'El DNI o la contraseña son incorrectos.'
  if (status === 401) return 'Tu sesión venció. Iniciá sesión nuevamente.'
  if (status === 403) return 'No tenés permiso para realizar esta acción.'
  if (status === 409 && code === 'MARK_TOO_EARLY') return 'Todavía no es horario para registrar esta marca. El ingreso se habilita 30 minutos antes; las demás marcas, desde el inicio de la jornada.'
  if (status === 409 && code === 'MOTIVE_LOCKED') return 'El administrador ya revisó este desvío; el motivo ya no se puede cambiar.'
  if (status === 409) return 'La información cambió o la acción ya fue procesada. Actualizá la vista.'
  if (status === 422) return 'Revisá los datos ingresados.'
  if (status === 429) return `Hubo demasiados intentos. Esperá ${waitText(context.retryAfterSeconds)} y probá otra vez.`
  return 'No se pudo completar la operación. Revisá tu conexión y reintentá.'
}

type RequestOptions = { headers?: Record<string, string>; signal?: AbortSignal }

export class ApiClient {
  private csrfToken?: string
  private csrfPromise?: Promise<string>

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, options)
  }

  async post<T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('POST', path, body, { headers })
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

  private async request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
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
      if (response.status === 401) this.clearCsrf()
      const retryAfter = Number(response.headers.get('Retry-After'))
      throw new ApiError(response.status, problem, {
        retryAfterSeconds: Number.isFinite(retryAfter) && response.headers.get('Retry-After') ? retryAfter : undefined,
        login: init.method === 'POST' && url === '/api/v1/session'
      })
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
