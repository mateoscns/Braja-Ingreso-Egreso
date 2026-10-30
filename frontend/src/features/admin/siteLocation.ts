import type { SiteCoordinates } from '../../shared/api/types'

export type SiteLocationErrorKind = 'unsupported' | 'insecure-context' | 'permission-denied' | 'unavailable' | 'timeout' | 'invalid-position' | 'precision-insufficient' | 'request-failed' | 'cancelled'

export class SiteLocationError extends Error {
  constructor(readonly kind: SiteLocationErrorKind, message: string) {
    super(message)
    this.name = 'SiteLocationError'
  }
}

type GeolocationProvider = Pick<Geolocation, 'getCurrentPosition'>

export const SITE_LOCATION_ACCURACY_LIMIT_METERS = 25
export const SITE_LOCATION_CAPTURE_DEADLINE_MS = 30_000
const CAPTURE_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: SITE_LOCATION_CAPTURE_DEADLINE_MS
}

export type CapturedSiteCoordinates = SiteCoordinates & { accuracyMeters: number }

function browserGeolocation(): GeolocationProvider | null {
  try { return typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null }
  catch { return null }
}

export function captureSiteCoordinates(
  geolocation: GeolocationProvider | null = browserGeolocation(),
  signal?: AbortSignal
): Promise<CapturedSiteCoordinates> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new SiteLocationError('cancelled', 'Búsqueda cancelada.')); return }
    const secureContextError = insecureContextError()
    if (secureContextError) { reject(secureContextError); return }
    if (!geolocation) { reject(new SiteLocationError('unsupported', 'Este navegador no ofrece geolocalización. Usá un navegador compatible en un contexto seguro o creá la sede sin centro.')); return }

    let settled = false
    const deadline: { handle?: ReturnType<typeof setTimeout> } = {}
    const cleanup = () => {
      if (deadline.handle !== undefined) clearTimeout(deadline.handle)
      signal?.removeEventListener('abort', abort)
    }
    const failWithError = (error: SiteLocationError) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const abort = () => {
      failWithError(new SiteLocationError('cancelled', 'Búsqueda cancelada.'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    deadline.handle = setTimeout(() => {
      failWithError(new SiteLocationError('timeout', 'La búsqueda superó los 30 segundos, incluida la espera del permiso. Respondé el aviso de permiso si sigue abierto, activá la ubicación del dispositivo y volvé a intentar; también podés crear la sede sin centro.'))
    }, SITE_LOCATION_CAPTURE_DEADLINE_MS)
    const acceptPosition: PositionCallback = ({ coords }) => {
      if (settled) return
      const { latitude, longitude } = coords
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        failWithError(new SiteLocationError('invalid-position', 'El dispositivo devolvió coordenadas inválidas. Revisá que los servicios de ubicación estén activos y volvé a intentar.'))
        return
      }
      const accuracyMeters = coords.accuracy
      if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
        failWithError(new SiteLocationError('invalid-position', 'El dispositivo no informó una precisión válida. Activá los servicios de ubicación y volvé a intentar.'))
        return
      }
      if (accuracyMeters > SITE_LOCATION_ACCURACY_LIMIT_METERS) {
        failWithError(new SiteLocationError('precision-insufficient', `El dispositivo informó una precisión de ${accuracyMeters.toFixed(1)} m; la propuesta local acepta hasta ${SITE_LOCATION_ACCURACY_LIMIT_METERS} m. Activá la ubicación precisa, probá desde un lugar abierto y volvé a intentar. El punto no se guardó; también podés crear la sede sin centro.`))
        return
      }
      if (settled) return
      settled = true
      cleanup()
      resolve({
        latitude: Number(latitude.toFixed(7)),
        longitude: Number(longitude.toFixed(7)),
        accuracyMeters
      })
    }
    const onGeolocationError: PositionErrorCallback = (error) => {
      if (settled) return
      if (error.code === 1) {
        failWithError(new SiteLocationError('permission-denied', 'El navegador o el dispositivo denegó el permiso. Habilitá la ubicación para este sitio en el navegador y en el sistema operativo, y volvé a intentar; también podés crear la sede sin centro.'))
        return
      }
      failWithError(locationFailure(error))
    }

    try { geolocation.getCurrentPosition(acceptPosition, onGeolocationError, CAPTURE_OPTIONS) }
    catch {
      failWithError(new SiteLocationError('request-failed', 'No se pudo iniciar la solicitud de ubicación. Revisá los permisos del sitio y volvé a intentar.'))
    }
  })
}

function insecureContextError(): SiteLocationError | null {
  try {
    if (typeof window === 'undefined' || window.isSecureContext !== false) return null
    const hostname = window.location.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost')) return null
    return new SiteLocationError('insecure-context', 'El navegador bloquea la ubicación en este origen HTTP. Abrí Braja por HTTPS (o localhost durante desarrollo) y volvé a intentar; también podés crear la sede sin centro.')
  } catch { return null }
}

function locationFailure(error: GeolocationPositionError): SiteLocationError {
  if (error.code === 3) {
    return new SiteLocationError('timeout', 'El navegador agotó el tiempo para obtener una posición. Activá la ubicación del dispositivo, respondé cualquier aviso de permiso y volvé a intentar; también podés crear la sede sin centro.')
  }
  return new SiteLocationError('unavailable', 'El dispositivo no pudo determinar una posición. Verificá que la ubicación esté activada y que el navegador tenga permiso; probá al aire libre y volvé a intentar, o creá la sede sin centro.')
}

export function parseGeofenceRadiusMeters(value: string): number {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) throw new Error('El radio debe ser un número entero entre 50 y 500 metros.')
  const radius = Number(normalized)
  if (!Number.isSafeInteger(radius) || radius < 50 || radius > 500) {
    throw new Error('El radio debe ser un número entero entre 50 y 500 metros.')
  }
  return radius
}
