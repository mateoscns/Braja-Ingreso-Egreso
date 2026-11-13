import type { Jornada, SiteCoordinates } from '../../shared/api/types'
import { distanceMeters, wholeMeters } from '../../shared/geo'
import { MAP_HALO_COLOR } from './siteMap'

/**
 * Pure helpers of the map of a mark in the ADMIN's day detail (2026-11-13). Leaflet itself is only imported by MarkMapCanvas.tsx,
 * which is lazy-loaded, so nothing here pulls the map library into the main bundle.
 */

/** The local's point and radius the day was judged with: the jornada's snapshot (D-20261030-02). */
export type MarkGeofence = SiteCoordinates & { radiusMeters: number }

export type MarkMapCanvasProps = {
  /** Where the phone said the mark was made. */
  mark: SiteCoordinates
  /** Null when the local had no point that day: the map then shows the mark alone. */
  geofence: MarkGeofence | null
  /** The accessible name of the map. */
  label: string
}

/**
 * The red of a mark, the value of --bad in styles.css, written as an SVG attribute that cannot read a CSS variable
 * (MarkMap.test.tsx checks it still matches). A red dot ringed in white, as the local's point is a brand dot ringed in white.
 */
export const MAP_MARK_COLOR = '#a0261b' // --bad
export const MARK_POINT_STYLE = { radius: 9, color: MAP_HALO_COLOR, weight: 3, fillColor: MAP_MARK_COLOR, fillOpacity: 1, interactive: false } as const
/** How close the map comes when it shows the mark alone, and how close it may come when it shows the mark and the local. */
export const MARK_ALONE_ZOOM = 17
export const MARK_MAP_MAX_ZOOM = 18

export function markGeofence(jornada: Pick<Jornada, 'geofenceLatitude' | 'geofenceLongitude' | 'geofenceRadiusMeters'>): MarkGeofence | null {
  const { geofenceLatitude: latitude, geofenceLongitude: longitude, geofenceRadiusMeters: radiusMeters } = jornada
  return typeof latitude === 'number' && typeof longitude === 'number' && typeof radiusMeters === 'number' ? { latitude, longitude, radiusMeters } : null
}

/** The sentences next to the map; each is left out when it does not apply. `inside` is null when it cannot be told. */
export type MarkPlaceFacts = {
  inside: boolean | null
  verdict?: string; distance?: string; accuracy?: string; rule?: string; noCenter?: string
}

const meters = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
/** «aproximadamente 324 m» when the value was rounded, «20 m» when it was whole; under one meter, «menos de 1 m». */
function length(value: number, approximately: string): string {
  const whole = wholeMeters(value)
  if (whole === 0) return 'menos de 1 m'
  return `${whole === value ? '' : `${approximately} `}${meters.format(whole)} m`
}

/**
 * Where a mark was made, in words: the server's rule (GeofencePolicy.isOutside) says it is inside only when the distance plus
 * the accuracy the phone reported fits in the radius, so the screen says the same with the same values.
 */
export function markPlaceFacts(mark: SiteCoordinates, accuracyMeters: number | null | undefined, geofence: MarkGeofence | null): MarkPlaceFacts {
  const accuracy = typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) ? accuracyMeters : null
  const accuracyText = accuracy === null ? undefined
    : `Precisión informada por el celular: ${wholeMeters(accuracy) === accuracy ? '' : 'aproximadamente '}±${meters.format(wholeMeters(accuracy))} m.`
  if (!geofence) return { inside: null, accuracy: accuracyText, noCenter: 'Ese día el local no tenía ubicación cargada.' }
  const distance = distanceMeters(geofence, mark)
  const wholeDistance = wholeMeters(distance)
  const distanceText = wholeDistance === 0 ? 'Esta marca se hizo a menos de 1 m del local.'
    : `Esta marca se hizo ${wholeDistance === distance ? 'a' : 'aproximadamente a'} ${meters.format(wholeDistance)} m del local.`
  const rule = `Cuenta como dentro del local cuando la distancia más la precisión no pasa de los ${meters.format(geofence.radiusMeters)} m permitidos.`
  if (accuracy === null) {
    return { inside: null, verdict: 'Sin la precisión del celular no se puede saber si estaba dentro del local.', distance: distanceText, rule }
  }
  const inside = !(distance + accuracy > geofence.radiusMeters)
  const verdict = inside ? 'Dentro del local.'
    : `Fuera del local: ${length(distance + accuracy - geofence.radiusMeters, 'aproximadamente')} más allá de la distancia permitida.`
  return { inside, verdict, distance: distanceText, accuracy: accuracyText, rule }
}
