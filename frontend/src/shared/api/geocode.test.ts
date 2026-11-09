import { describe, expect, it, vi } from 'vitest'
import { GeocodeError, geocodeSearchUrl, parseGeocodeResults, searchAddress } from './geocode'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('geocodeSearchUrl', () => {
  it('asks Nominatim for at most five Argentine results of the trimmed query in JSON v2', () => {
    const url = new URL(geocodeSearchUrl('  Av. Corrientes 1234, CABA  '))

    expect(url.origin).toBe('https://nominatim.openstreetmap.org')
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('countrycodes')).toBe('ar')
    expect(url.searchParams.get('q')).toBe('Av. Corrientes 1234, CABA')
  })
})

describe('searchAddress', () => {
  it('sends one request without credentials and with an origin-only referrer', async () => {
    const fetcher = vi.fn(async () => jsonResponse([{ lat: '-34.6037220', lon: '-58.3815920', display_name: 'Obelisco, Buenos Aires' }]))

    const results = await searchAddress('Obelisco', { fetcher })

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(geocodeSearchUrl('Obelisco'))
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' })
    expect(results).toEqual([{ label: 'Obelisco, Buenos Aires', latitude: -34.603722, longitude: -58.381592 }])
  })

  it('does not call the service for an empty query', async () => {
    const fetcher = vi.fn()
    await expect(searchAddress('   ', { fetcher })).resolves.toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns an empty list when nothing matches', async () => {
    await expect(searchAddress('zzzz', { fetcher: async () => jsonResponse([]) })).resolves.toEqual([])
  })

  it('turns an HTTP error into a plain message', async () => {
    const failure = searchAddress('Obelisco', { fetcher: async () => jsonResponse({ error: 'busy' }, 429) })
    await expect(failure).rejects.toBeInstanceOf(GeocodeError)
    await expect(failure).rejects.toThrow('No se pudo buscar la dirección.')
  })

  it('turns a network failure or an unreadable body into the same plain message', async () => {
    await expect(searchAddress('Obelisco', { fetcher: async () => { throw new TypeError('Failed to fetch') } })).rejects.toBeInstanceOf(GeocodeError)
    await expect(searchAddress('Obelisco', { fetcher: async () => new Response('<html>', { status: 200 }) })).rejects.toBeInstanceOf(GeocodeError)
    await expect(searchAddress('Obelisco', { fetcher: async () => jsonResponse({ not: 'a list' }) })).rejects.toBeInstanceOf(GeocodeError)
  })

  it('lets an abort through so the caller can ignore a search it cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return jsonResponse([])
    })
    await expect(searchAddress('Obelisco', { fetcher, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('parseGeocodeResults', () => {
  it('drops results without a name or a numeric latitude and longitude in range, and keeps at most five', () => {
    const valid = (index: number) => ({ lat: `-34.${index}`, lon: '-58.4', display_name: `Lugar ${index}` })
    const parsed = parseGeocodeResults([
      { lat: 'abc', lon: '-58.4', display_name: 'Sin latitud' },
      { lat: '-91', lon: '-58.4', display_name: 'Latitud fuera de rango' },
      { lat: '-34.6', lon: '181', display_name: 'Longitud fuera de rango' },
      { lat: '-34.6', lon: '-58.4', display_name: '   ' },
      { lat: '', lon: '', display_name: 'Vacío' },
      null,
      'texto',
      valid(1), valid(2), valid(3), valid(4), valid(5), valid(6)
    ])

    expect(parsed.map((result) => result.label)).toEqual(['Lugar 1', 'Lugar 2', 'Lugar 3', 'Lugar 4', 'Lugar 5'])
    expect(parsed[0]).toEqual({ label: 'Lugar 1', latitude: -34.1, longitude: -58.4 })
  })

  it('rounds coordinates to seven decimals', () => {
    expect(parseGeocodeResults([{ lat: '-34.123456789', lon: '-58.987654321', display_name: 'Esquina' }]))
      .toEqual([{ label: 'Esquina', latitude: -34.1234568, longitude: -58.9876543 }])
  })
})
