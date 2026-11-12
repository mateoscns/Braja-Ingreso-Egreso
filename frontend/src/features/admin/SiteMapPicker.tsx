import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { OSM_TILE_OPTIONS, OSM_TILE_URL, POINT_STYLE, RADIUS_HALO_STYLE, RADIUS_STYLE, type SiteMapPickerProps } from './siteMap'

/**
 * The Leaflet map of the site picker (D-20261109-01), lazy-loaded so Leaflet stays out of the main bundle.
 * Presentational: it draws the view, the point and the radius it receives and reports taps; the container owns the state.
 * Leaflet's CSS is bundled from the npm package (CSP style-src 'self'); the point is an SVG circle, not Leaflet's PNG marker.
 * What Leaflet writes itself speaks Spanish: the zoom buttons take their names from their titles, and the credit keeps only
 * «© OpenStreetMap», without the library's English link.
 */
export default function SiteMapPicker({ view, point, radiusMeters, onPick, label }: SiteMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const haloRef = useRef<L.Circle | null>(null)
  const onPickRef = useRef(onPick)
  const initialViewRef = useRef(view)

  useEffect(() => { onPickRef.current = onPick }, [onPick])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const initial = initialViewRef.current
    const map = L.map(element, { center: [initial.latitude, initial.longitude], zoom: initial.zoom, maxZoom: OSM_TILE_OPTIONS.maxZoom, zoomControl: false })
    L.control.zoom({ zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map)
    map.attributionControl.setPrefix(false)
    L.tileLayer(OSM_TILE_URL, OSM_TILE_OPTIONS).addTo(map)
    map.on('click', (event: L.LeafletMouseEvent) => onPickRef.current({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
      haloRef.current = null
    }
  }, [])

  useEffect(() => {
    mapRef.current?.setView([view.latitude, view.longitude], view.zoom)
  }, [view])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!point) {
      haloRef.current?.remove(); haloRef.current = null
      circleRef.current?.remove(); circleRef.current = null
      markerRef.current?.remove(); markerRef.current = null
      return
    }
    const position = L.latLng(point.latitude, point.longitude)
    // The halo is added first, so it lies under the radius.
    if (haloRef.current) haloRef.current.setLatLng(position).setRadius(radiusMeters)
    else haloRef.current = L.circle(position, { radius: radiusMeters, ...RADIUS_HALO_STYLE }).addTo(map)
    if (circleRef.current) circleRef.current.setLatLng(position).setRadius(radiusMeters)
    else circleRef.current = L.circle(position, { radius: radiusMeters, ...RADIUS_STYLE }).addTo(map)
    if (markerRef.current) markerRef.current.setLatLng(position)
    else markerRef.current = L.circleMarker(position, POINT_STYLE).addTo(map)
  }, [point, radiusMeters])

  // A named group, not an application: nothing here needs the keys a screen reader keeps for itself. The map is placed by
  // its search or by the typed coordinates, without dragging (WCAG 2.5.7); Leaflet still pans and zooms it with the keyboard.
  return <div ref={containerRef} className="site-map-canvas" role="group" aria-label={label} />
}
