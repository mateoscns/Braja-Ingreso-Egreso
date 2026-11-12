import type { TileLayerOptions } from 'leaflet'
import type { SiteCoordinates } from '../../shared/api/types'

/**
 * Pure helpers of the site map picker (D-20261109-01). Leaflet itself is only imported by SiteMapPicker.tsx, which is
 * lazy-loaded, so nothing here pulls the map library into the main bundle.
 */
export type SiteMapView = { latitude: number; longitude: number; zoom: number }

export type SiteMapPickerProps = {
  /** A new object re-centers the map; the owner can pan freely in between. */
  view: SiteMapView
  point: SiteCoordinates | null
  radiusMeters: number
  /** Raw tapped coordinates; the container normalizes them with normalizePickedPoint. */
  onPick: (point: SiteCoordinates) => void
  label: string
}

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_TILE_OPTIONS = {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  // The page sends Referrer-Policy: same-origin; the OSM tile policy requires a referer, so tiles send the origin.
  referrerPolicy: 'strict-origin-when-cross-origin'
} as const satisfies TileLayerOptions

/**
 * The colours Leaflet draws with, the values of two tokens of styles.css: Leaflet writes them as SVG attributes, which cannot
 * read a CSS variable (SiteMapPicker.test.tsx checks they still match). The radius is the brand ink, 3 px over a white halo, so
 * it keeps 3:1 against light tiles and against parks, water and buildings (WCAG 1.4.11); the point is a brand dot ringed in white.
 */
export const MAP_INK_COLOR = '#12372a' // --brand
export const MAP_HALO_COLOR = '#ffffff' // --surface
export const RADIUS_HALO_STYLE = { color: MAP_HALO_COLOR, weight: 7, opacity: 0.9, fill: false, interactive: false } as const
export const RADIUS_STYLE = { color: MAP_INK_COLOR, weight: 3, opacity: 1, fillColor: MAP_INK_COLOR, fillOpacity: 0.12, interactive: false } as const
export const POINT_STYLE = { radius: 9, color: MAP_HALO_COLOR, weight: 3, fillColor: MAP_INK_COLOR, fillOpacity: 1, interactive: false } as const

/** Buenos Aires: where the map starts when the site has no center and the device gives no position. */
export const DEFAULT_MAP_VIEW: SiteMapView = { latitude: -34.6, longitude: -58.4, zoom: 12 }
export const SITE_CENTER_ZOOM = 17
export const DEVICE_POSITION_ZOOM = 16
export const SEARCH_RESULT_ZOOM = 18
const DEFAULT_RADIUS_METERS = 100

/** Seven decimals, the precision the database keeps (about 1 cm). */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(7))
}

/** A tapped point, rounded; the longitude is wrapped into [-180, 180) when the map was panned around the world. */
export function normalizePickedPoint(latitude: number, longitude: number): SiteCoordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90) return null
  // Wrapping only out-of-range values keeps in-range taps bit-exact (the modulo adds floating-point noise).
  const wrapped = longitude >= -180 && longitude < 180 ? longitude : ((((longitude + 180) % 360) + 360) % 360) - 180
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(wrapped) }
}

/** The radius drawn while the owner types: the form's value clamped to 50-500 m, or 100 m until it is a number. */
export function mapRadiusMeters(value: string): number {
  const radius = Number(value.trim())
  if (!value.trim() || !Number.isFinite(radius)) return DEFAULT_RADIUS_METERS
  return Math.min(500, Math.max(50, Math.round(radius)))
}

export function siteMapInitialView(siteCenter: SiteCoordinates | null, devicePosition: SiteCoordinates | null): SiteMapView {
  if (siteCenter) return { ...siteCenter, zoom: SITE_CENTER_ZOOM }
  if (devicePosition) return { ...devicePosition, zoom: DEVICE_POSITION_ZOOM }
  return DEFAULT_MAP_VIEW
}

type GeolocationProvider = Pick<Geolocation, 'getCurrentPosition'>

function browserGeolocation(): GeolocationProvider | null {
  try { return typeof navigator !== 'undefined' && 'geolocation' in navigator && navigator.geolocation ? navigator.geolocation : null }
  catch { return null }
}

/**
 * One rough position of the ADMIN's device, only to center the map when the picker opens: any accuracy is accepted
 * and it is never saved. Every failure resolves to null so the map simply starts on Buenos Aires.
 */
export function approximateDevicePosition(geolocation: GeolocationProvider | null = browserGeolocation(), signal?: AbortSignal): Promise<SiteCoordinates | null> {
  return new Promise((resolve) => {
    if (!geolocation || signal?.aborted) { resolve(null); return }
    let settled = false
    const finish = (value: SiteCoordinates | null) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      resolve(value)
    }
    const abort = () => finish(null)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      geolocation.getCurrentPosition(({ coords }) => {
        const { latitude, longitude } = coords
        const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
        finish(valid ? { latitude, longitude } : null)
      }, () => finish(null), { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 })
    } catch { finish(null) }
  })
}
