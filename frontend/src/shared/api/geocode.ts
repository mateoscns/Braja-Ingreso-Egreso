/**
 * Address search for the site map picker (D-20261109-01) through OpenStreetMap's Nominatim.
 *
 * This is the only `fetch` outside `client.ts` (CLAUDE.md rule 37) because it is not our API: it goes to a third party,
 * without cookies or CSRF token, and Nominatim sees only the ADMIN's IP and the typed address. The usage policy
 * forbids autocomplete, so the UI sends one request per explicit search.
 */
export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
export const GEOCODE_MAX_RESULTS = 5
const MAX_QUERY_LENGTH = 200
const MAX_LABEL_LENGTH = 300

export type GeocodeResult = { label: string; latitude: number; longitude: number }

export class GeocodeError extends Error {
  constructor() {
    super('No se pudo buscar la dirección. Probá de nuevo en unos segundos o mové el mapa y tocá el lugar.')
    this.name = 'GeocodeError'
  }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export function geocodeSearchUrl(query: string): string {
  const url = new URL(NOMINATIM_SEARCH_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', String(GEOCODE_MAX_RESULTS))
  url.searchParams.set('countrycodes', 'ar')
  url.searchParams.set('q', query.trim().slice(0, MAX_QUERY_LENGTH))
  return url.toString()
}

/** One search; an empty query sends nothing. An abort is rethrown as is so the caller can ignore its own cancellation. */
export async function searchAddress(query: string, options: { signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<GeocodeResult[]> {
  if (!query.trim()) return []
  const fetcher: Fetcher = options.fetcher ?? ((url, init) => globalThis.fetch(url, init))
  let response: Response
  try {
    response = await fetcher(geocodeSearchUrl(query), {
      method: 'GET',
      credentials: 'omit',
      // The page sends Referrer-Policy: same-origin, which would strip the referer; Nominatim asks for one.
      referrerPolicy: 'strict-origin-when-cross-origin',
      headers: { Accept: 'application/json' },
      signal: options.signal
    })
  } catch (reason) {
    if (options.signal?.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) throw reason
    throw new GeocodeError()
  }
  if (!response.ok) throw new GeocodeError()
  let body: unknown
  try { body = await response.json() } catch (reason) {
    if (options.signal?.aborted) throw reason
    throw new GeocodeError()
  }
  if (!Array.isArray(body)) throw new GeocodeError()
  return parseGeocodeResults(body)
}

/** Keeps only results with a name and a numeric latitude and longitude in range, rounded to the database precision. */
export function parseGeocodeResults(items: unknown[]): GeocodeResult[] {
  const results: GeocodeResult[] = []
  for (const item of items) {
    if (results.length >= GEOCODE_MAX_RESULTS) break
    if (typeof item !== 'object' || item === null) continue
    const { lat, lon, display_name: displayName } = item as Record<string, unknown>
    const latitude = coordinate(lat, 90)
    const longitude = coordinate(lon, 180)
    const label = typeof displayName === 'string' ? displayName.trim().slice(0, MAX_LABEL_LENGTH) : ''
    if (latitude === null || longitude === null || !label) continue
    results.push({ label, latitude, longitude })
  }
  return results
}

function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < -limit || number > limit) return null
  return Number(number.toFixed(7))
}
