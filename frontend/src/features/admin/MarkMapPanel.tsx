import { Component, lazy, Suspense, type ReactNode } from 'react'
import { Loading, PageMessage } from '../../app/ui'
import type { SiteCoordinates } from '../../shared/api/types'
import { markPlaceFacts, type MarkGeofence } from './markMap'
import { openStreetMapHref } from './siteMap'

// Leaflet lives in its own chunk, the one of the map of «Locales»: it is downloaded only when an ADMIN opens a map.
const MarkMapCanvas = lazy(() => import('./MarkMapCanvas'))

/** A map that could not load (its chunk, or Leaflet itself) leaves the sentences above it, which say the same in words. */
class MapFailure extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <PageMessage kind="error">No se pudo cargar el mapa. Lo de arriba dice igual dónde se hizo la marca; también podés abrirla en OpenStreetMap.</PageMessage>
      : this.props.children
  }
}

/**
 * 2026-11-13: where a mark was made, opened in place under it from «Ver en el mapa». First the verdict and the sentences, which
 * are the text alternative of the map and stay when it cannot load; then what the map shows, the map and the link to look at
 * the point elsewhere. Presentational: the day detail passes the mark, the area of that day and «Cerrar».
 */
export function MarkMapPanel({ id, headingId, mark, accuracyMeters, geofence, mapLabel, onClose }: {
  id: string; headingId: string; mark: SiteCoordinates; accuracyMeters?: number | null; geofence: MarkGeofence | null
  /** The accessible name of the map: which mark it shows. */
  mapLabel: string
  onClose: () => void
}) {
  const facts = markPlaceFacts(mark, accuracyMeters, geofence)
  const legendId = `${id}-legend`
  // Opened in place like a form of the mark, so its left bar; the focus comes to the whole part, named by its title.
  return <section id={id} className="inline-form" tabIndex={-1} aria-labelledby={headingId}>
    <h3 id={headingId}>Dónde se hizo esta marca</h3>
    <div className="mark-map-facts">
      {facts.noCenter && <p>{facts.noCenter}</p>}
      {facts.verdict && <p className="mark-map-verdict">{facts.verdict}</p>}
      {facts.distance && <p>{facts.distance}</p>}
      {facts.accuracy && <p>{facts.accuracy}</p>}
      {facts.rule && <p className="muted">{facts.rule}</p>}
    </div>
    <span id={legendId} className="visually-hidden">Qué muestra el mapa</span>
    <ul className="mark-map-legend" aria-labelledby={legendId}>
      <li><span className="mark-map-key mark-map-key-mark" aria-hidden="true" />Marca: dónde estaba el celular (punto rojo)</li>
      {geofence && <li><span className="mark-map-key mark-map-key-local" aria-hidden="true" />{`Local: su punto y el círculo de los ${geofence.radiusMeters} m permitidos`}</li>}
    </ul>
    <MapFailure>
      <Suspense fallback={<Loading label="Cargando el mapa…" />}>
        <MarkMapCanvas mark={mark} geofence={geofence} label={mapLabel} />
      </Suspense>
    </MapFailure>
    <div className="mark-map-actions">
      <a href={openStreetMapHref(mark)} target="_blank" rel="noreferrer noopener">Abrir en OpenStreetMap (en otra pestaña)</a>
      {/* Backing out of the part, so a link button (design system 4.1). */}
      <button type="button" className="button button-link" onClick={onClose}>Cerrar</button>
    </div>
  </section>
}
