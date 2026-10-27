import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../../shared/api/client'

describe('errores al guardar un motivo', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('explica que un motivo ya revisado no se puede cambiar (409 MOTIVE_LOCKED)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'csrf-token-long-enough' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: 'about:blank', title: 'Conflict', status: 409, code: 'MOTIVE_LOCKED', detail: 'internal detail'
      }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new ApiClient().put('/deviations/d-1/motive', { category: 'OTRA', text: 'Texto' }))
      .rejects.toMatchObject({ code: 'MOTIVE_LOCKED', message: 'El administrador ya revisó este desvío; el motivo ya no se puede cambiar.' })
  })
})
