import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitMark } from './markFlow'
import { ApiError, TimeoutError, type ApiClient } from '../../shared/api/client'

describe('submitMark', () => {
  it('no confirma hasta obtener respuesta del servidor y conserva la clave al reintentar', async () => {
    let resolvePost!: (value: { id: string; acceptedAt: string }) => void
    const post = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve }))
      .mockResolvedValueOnce({ id: 'mark-1', acceptedAt: '2026-10-16T12:00:00Z' })
    const api = { post } as unknown as ApiClient
    const attempt = { jornadaId: 'j-1', action: 'INGRESO' as const, idempotencyKey: 'same-key' }
    const gps = vi.fn(() => Promise.resolve(null))
    const first = submitMark(api, attempt, gps)

    expect(post).toHaveBeenCalledWith('/jornadas/j-1/marks', { action: 'INGRESO' }, { 'Idempotency-Key': 'same-key' }, { signal: expect.any(AbortSignal) })
    expect(await Promise.race([first.then(() => 'resolved'), Promise.resolve('pending')])).toBe('pending')
    resolvePost({ id: 'mark-1', acceptedAt: '2026-10-16T12:00:00Z' })
    await expect(first).resolves.toMatchObject({ id: 'mark-1', acceptedAt: '2026-10-16T12:00:00Z' })

    await submitMark(api, attempt, gps)
    expect(post.mock.calls[1][2]).toEqual({ 'Idempotency-Key': 'same-key' })
  })

  it('inicia GPS sin bloquear la marca y adjunta coordenadas solo al markId devuelto', async () => {
    let resolveGps!: (value: { latitude: number; longitude: number; accuracyMeters: number } | null) => void
    const gps = vi.fn(() => new Promise<{ latitude: number; longitude: number; accuracyMeters: number } | null>((resolve) => { resolveGps = resolve }))
    const post = vi.fn().mockResolvedValue({ id: 'mark-from-server', acceptedAt: '2026-10-16T12:00:00Z' })
    const attachLocation = vi.fn().mockResolvedValue(undefined)
    const api = { post, attachLocation } as unknown as ApiClient

    const response = await submitMark(api, { jornadaId: 'j-1', action: 'INGRESO', idempotencyKey: 'k' }, gps)
    expect(response.id).toBe('mark-from-server')
    expect(gps.mock.invocationCallOrder[0]).toBeLessThan(post.mock.invocationCallOrder[0])
    expect(attachLocation).not.toHaveBeenCalled()
    resolveGps({ latitude: -26, longitude: -65, accuracyMeters: 20 })
    await vi.waitFor(() => expect(attachLocation).toHaveBeenCalledWith('mark-from-server', {
      latitude: -26, longitude: -65, accuracyMeters: 20
    }))
  })

  it('no adjunta ubicación si el servidor no confirmó la marca', async () => {
    let resolveGps!: (value: { latitude: number; longitude: number; accuracyMeters: number } | null) => void
    const gps = () => new Promise<{ latitude: number; longitude: number; accuracyMeters: number } | null>((resolve) => { resolveGps = resolve })
    const post = vi.fn().mockRejectedValue(new Error('sin conexión'))
    const attachLocation = vi.fn()
    const api = { post, attachLocation } as unknown as ApiClient
    const submission = submitMark(api, { jornadaId: 'j-1', action: 'INGRESO', idempotencyKey: 'same-key' }, gps)

    await expect(submission).rejects.toThrow('sin conexión')
    resolveGps({ latitude: -26, longitude: -65, accuracyMeters: 20 })
    await Promise.resolve()
    expect(attachLocation).not.toHaveBeenCalled()
  })

  it('confirma la marca aunque el GPS esté denegado', async () => {
    const post = vi.fn().mockResolvedValue({ id: 'mark-2', acceptedAt: '2026-10-16T12:00:00Z' })
    const attachLocation = vi.fn()
    const api = { post, attachLocation } as unknown as ApiClient

    await expect(submitMark(api, { jornadaId: 'j-1', action: 'INGRESO', idempotencyKey: 'denied' }, () => Promise.resolve(null)))
      .resolves.toEqual({ id: 'mark-2', acceptedAt: '2026-10-16T12:00:00Z' })
    await Promise.resolve()
    expect(post).toHaveBeenCalledOnce()
    expect(attachLocation).not.toHaveBeenCalled()
  })

  it('confirma enseguida y descarta una coordenada que llega después de 30 segundos', async () => {
    let resolveGps!: (value: { latitude: number; longitude: number; accuracyMeters: number } | null) => void
    const gps = () => new Promise<{ latitude: number; longitude: number; accuracyMeters: number } | null>((resolve) => { resolveGps = resolve })
    const post = vi.fn().mockResolvedValue({ id: 'mark-3', acceptedAt: '2026-10-16T12:00:00Z' })
    const attachLocation = vi.fn()
    const api = { post, attachLocation } as unknown as ApiClient
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(30_101)

    try {
      await expect(submitMark(api, { jornadaId: 'j-1', action: 'INGRESO', idempotencyKey: 'late-gps' }, gps))
        .resolves.toMatchObject({ id: 'mark-3' })
      expect(post).toHaveBeenCalledOnce()
      resolveGps({ latitude: -26, longitude: -65, accuracyMeters: 20 })
      await Promise.resolve(); await Promise.resolve()
      expect(attachLocation).not.toHaveBeenCalled()
    } finally { clock.mockRestore() }
  })

  describe('conflicto reintentable y espera agotada', () => {
    afterEach(() => vi.useRealTimers())
    const retryable = () => new ApiError(409, { status: 409, code: 'RETRYABLE_TRANSACTION_CONFLICT' }, { retryAfterSeconds: 1 })

    it('reintenta una sola vez con la misma clave después de Retry-After', async () => {
      vi.useFakeTimers()
      const post = vi.fn().mockRejectedValueOnce(retryable()).mockResolvedValueOnce({ id: 'mark-r', acceptedAt: '2026-10-16T12:00:00Z' })
      const api = { post, attachLocation: vi.fn() } as unknown as ApiClient
      const submission = submitMark(api, { jornadaId: 'j-1', action: 'EGRESO', idempotencyKey: 'retry-key' }, () => Promise.resolve(null))

      await vi.advanceTimersByTimeAsync(999)
      expect(post).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await expect(submission).resolves.toMatchObject({ id: 'mark-r' })
      expect(post).toHaveBeenCalledTimes(2)
      expect(post.mock.calls[1][2]).toEqual({ 'Idempotency-Key': 'retry-key' })
    })

    it('si el reintento vuelve a chocar, informa el conflicto sin un tercer intento', async () => {
      vi.useFakeTimers()
      const post = vi.fn().mockRejectedValueOnce(retryable()).mockRejectedValueOnce(retryable())
      const api = { post, attachLocation: vi.fn() } as unknown as ApiClient
      const submission = submitMark(api, { jornadaId: 'j-1', action: 'EGRESO', idempotencyKey: 'k' }, () => Promise.resolve(null)).catch((reason: unknown) => reason)

      await vi.advanceTimersByTimeAsync(1000)
      const failure = await submission
      expect(failure).toBeInstanceOf(ApiError)
      expect((failure as ApiError).code).toBe('RETRYABLE_TRANSACTION_CONFLICT')
      expect(post).toHaveBeenCalledTimes(2)
    })

    it('no reintenta otros conflictos', async () => {
      const post = vi.fn().mockRejectedValueOnce(new ApiError(409, { status: 409, code: 'MARK_TOO_EARLY' }))
      const api = { post, attachLocation: vi.fn() } as unknown as ApiClient
      await expect(submitMark(api, { jornadaId: 'j-1', action: 'INGRESO', idempotencyKey: 'k' }, () => Promise.resolve(null))).rejects.toMatchObject({ code: 'MARK_TOO_EARLY' })
      expect(post).toHaveBeenCalledTimes(1)
    })

    it('corta la marca a los 15 segundos sin respuesta y lo informa como espera agotada', async () => {
      vi.useFakeTimers()
      const post = vi.fn((_path: string, _body: unknown, _headers: unknown, options: { signal: AbortSignal }) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new TimeoutError()))
      }))
      const api = { post, attachLocation: vi.fn() } as unknown as ApiClient
      const submission = submitMark(api, { jornadaId: 'j-1', action: 'INGRESO', idempotencyKey: 'k' }, () => Promise.resolve(null)).catch((reason: unknown) => reason)

      await vi.advanceTimersByTimeAsync(14_999)
      expect(post.mock.calls[0][3].signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await submission).toBeInstanceOf(TimeoutError)
    })
  })
})
