import type { SiteCoordinates } from './api/types'

/**
 * The mean Earth radius of the server's geofence (GeofencePolicy.MEAN_EARTH_RADIUS_METERS): the screen measures a mark with the
 * same sphere the server judged it with, so the distance it shows and the verdict the server stored cannot disagree.
 */
const MEAN_EARTH_RADIUS_METERS = 6_371_008.8

const radians = (degrees: number) => degrees * Math.PI / 180

/** Haversine great-circle distance in meters, the formula of GeofencePolicy.distanceMeters. */
export function distanceMeters(a: SiteCoordinates, b: SiteCoordinates): number {
  const latA = radians(a.latitude)
  const latB = radians(b.latitude)
  const sinLatitude = Math.sin((latB - latA) / 2)
  const sinLongitude = Math.sin(radians(b.longitude - a.longitude) / 2)
  const haversine = sinLatitude * sinLatitude + Math.cos(latA) * Math.cos(latB) * sinLongitude * sinLongitude
  return 2 * MEAN_EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

/** A length in whole meters, rounded half up: what the screen says, «aproximadamente», when the value had decimals. */
export function wholeMeters(meters: number): number {
  return Math.round(meters)
}
