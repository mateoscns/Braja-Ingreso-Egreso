import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { OSM_TILE_OPTIONS, OSM_TILE_URL, type SiteMapPickerProps } from './siteMap'

/**
 * The Leaflet map of the site picker (D-20261109-01), lazy-loaded so Leaflet stays out of the main bundle.
 * Presentational: it draws the view, the point and the radius it receives and reports taps; the container owns the state.
 * Leaflet's CSS is bundled from the npm package (CSP style-src 'self'); the point is an SVG circle, not Leaflet's PNG marker.
 */
export default function SiteMapPicker({ view, point, radiusMeters, onPick, label }: SiteMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const onPickRef = useRef(onPick)
  const initialViewRef = useRef(view)

  useEffect(() => { onPickRef.current = onPick }, [onPick])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const initial = initialViewRef.current
    const map = L.map(element, { center: [initial.latitude, initial.longitude], zoom: initial.zoom, maxZoom: OSM_TILE_OPTIONS.maxZoom })
    L.tileLayer(OSM_TILE_URL, OSM_TILE_OPTIONS).addTo(map)
    map.on('click', (event: L.LeafletMouseEvent) => onPickRef.current({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
  }, [])

  useEffect(() => {
    mapRef.current?.setView([view.latitude, view.longitude], view.zoom)
  }, [view])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!point) {
      circleRef.current?.remove(); circleRef.current = null
      markerRef.current?.remove(); markerRef.current = null
      return
    }
    const position = L.latLng(point.latitude, point.longitude)
    if (circleRef.current) circleRef.current.setLatLng(position).setRadius(radiusMeters)
    else circleRef.current = L.circle(position, { radius: radiusMeters, color: '#2f8f5b', weight: 2, fillOpacity: 0.15, interactive: false }).addTo(map)
    if (markerRef.current) markerRef.current.setLatLng(position)
    else markerRef.current = L.circleMarker(position, { radius: 9, color: '#12372a', weight: 3, fillColor: '#2f8f5b', fillOpacity: 1, interactive: false }).addTo(map)
  }, [point, radiusMeters])

  return <div ref={containerRef} className="site-map-canvas" role="application" aria-label={label} />
}
