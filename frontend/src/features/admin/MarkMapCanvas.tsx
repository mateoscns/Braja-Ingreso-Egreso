import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MARK_ALONE_ZOOM, MARK_MAP_MAX_ZOOM, MARK_POINT_STYLE, type MarkMapCanvasProps } from './markMap'
import { OSM_TILE_OPTIONS, OSM_TILE_URL, POINT_STYLE, RADIUS_HALO_STYLE, RADIUS_STYLE } from './siteMap'

/** Room around the two points so their words fit inside the map. */
const FIT_PADDING: L.PointExpression = [36, 36]

/**
 * The Leaflet map of a mark (2026-11-13), lazy-loaded like the map of «Locales» (SiteMapPicker) and drawn with its tiles, credit
 * and colours: the local's point and its radius in the brand ink over a white halo, and the mark as a red dot ringed in white.
 * Each point carries its word («Local», «Marca») on the map, so nothing is told by colour alone. Read-only: it shows what it
 * receives, fitted to show both points; the sentences next to it are its text alternative.
 */
export default function MarkMapCanvas({ mark, geofence, label }: MarkMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // The map is drawn again only when a value changes, not when the owner passes the same values in new objects.
  const { latitude, longitude } = mark
  const areaLatitude = geofence?.latitude
  const areaLongitude = geofence?.longitude
  const areaRadius = geofence?.radiusMeters

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const markPosition = L.latLng(latitude, longitude)
    const area = areaLatitude === undefined || areaLongitude === undefined || areaRadius === undefined ? null
      : { center: L.latLng(areaLatitude, areaLongitude), radiusMeters: areaRadius }
    // The wheel scrolls the page, not the map: this map is read in the middle of a long day detail.
    const map = L.map(element, { center: markPosition, zoom: MARK_ALONE_ZOOM, maxZoom: OSM_TILE_OPTIONS.maxZoom, zoomControl: false, scrollWheelZoom: false })
    L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map)
    map.attributionControl.setPrefix(false)
    L.tileLayer(OSM_TILE_URL, OSM_TILE_OPTIONS).addTo(map)
    let bounds = L.latLngBounds(markPosition, markPosition)
    if (area) {
      // The halo first, so it lies under the radius; the mark last, so it is drawn over the local when they meet.
      L.circle(area.center, { radius: area.radiusMeters, ...RADIUS_HALO_STYLE }).addTo(map)
      L.circle(area.center, { radius: area.radiusMeters, ...RADIUS_STYLE }).addTo(map)
      L.circleMarker(area.center, POINT_STYLE).bindTooltip('Local', { permanent: true, direction: 'bottom', offset: [0, 8] }).addTo(map)
      bounds = area.center.toBounds(area.radiusMeters * 2).extend(markPosition)
    }
    L.circleMarker(markPosition, MARK_POINT_STYLE).bindTooltip('Marca', { permanent: true, direction: 'top', offset: [0, -8] }).addTo(map)
    // A map with no size yet (not laid out) cannot be fitted: it stays on the mark.
    const size = map.getSize()
    if (area && size.x > 0 && size.y > 0) map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: MARK_MAP_MAX_ZOOM })
    return () => { map.remove() }
  }, [latitude, longitude, areaLatitude, areaLongitude, areaRadius])

  // A named group, not an application, like the map of «Locales»; Leaflet still pans and zooms it with the keyboard.
  return <div ref={containerRef} className="site-map-canvas mark-map-canvas" role="group" aria-label={label} />
}
