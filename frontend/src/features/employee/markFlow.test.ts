import { describe, expect, it, vi } from 'vitest'
import { submitMark } from './markFlow'
import type { ApiClient } from '../../shared/api/client'

describe('submitMark', () => {
  it('no confirma hasta obtener respuesta del servidor y conserva la clave al reintentar', async () => {
    let resolvePost!: (value: { id: string; acceptedAt: string }) => void
    const post = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve }))
      .mockResolvedValueOnce({ id: 'mark-1', acceptedAt: '2026-10-16T12:00:00Z' })
    const api = { post } as unknown as ApiClient
    const attempt = { jornadaId: 'j-1', action: 'INGRESO' as const, idempotencyKey: 'same-key' }
    const gps = vi.fn(() => Promise.resolve(null))
    const first = submitMark(api, attempt, gps)

    expect(post).toHaveBeenCalledWith('/jornadas/j-1/marks', { action: 'INGRESO' }, { 'Idempotency-Key': 'same-key' })
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
})
