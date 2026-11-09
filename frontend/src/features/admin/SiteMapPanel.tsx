import { lazy, Suspense } from 'react'
import { FormField, Loading } from '../../app/ui'
import type { GeocodeResult } from '../../shared/api/geocode'
import type { SiteCoordinates } from '../../shared/api/types'
import type { SiteMapView } from './siteMap'

// Leaflet lives in its own chunk: it is downloaded only when an ADMIN opens the map.
const SiteMapPicker = lazy(() => import('./SiteMapPicker'))

export type SiteMapSearchStatus = 'idle' | 'loading' | 'done' | 'error'
export type SiteMapPanelState = {
  view: SiteMapView; point: SiteCoordinates | null
  query: string; searchStatus: SiteMapSearchStatus; searchMessage: string; results: GeocodeResult[]
}

/** D-20261109-01: find the address, tap the exact spot, see the radius and confirm. Data and callbacks come from SitesView. */
export function SiteMapPanel({ state, radiusMeters, disabled, onPick, onQueryChange, onSearch, onChooseResult, onConfirm, onClose }: {
  state: SiteMapPanelState; radiusMeters: number; disabled: boolean
  onPick: (point: SiteCoordinates) => void; onQueryChange: (value: string) => void; onSearch: () => void
  onChooseResult: (result: GeocodeResult) => void; onConfirm: () => void; onClose: () => void
}) {
  const searching = state.searchStatus === 'loading'
  return <section className="site-map-panel" aria-label="Mapa para elegir la ubicación de la sede">
    <div className="site-map-search">
      {/* Not a nested form: Enter searches here instead of submitting the site form around it. */}
      <FormField label="Buscá la dirección del local">
        <input type="text" maxLength={200} value={state.query} disabled={disabled} placeholder="Calle y número" enterKeyHint="search" autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSearch() } }} />
      </FormField>
      <button type="button" className="button button-outline" disabled={disabled || searching} onClick={onSearch}>{searching ? 'Buscando…' : 'Buscar'}</button>
    </div>
    {state.searchMessage && <span className={`site-location-message site-location-message-${state.searchStatus === 'error' ? 'error' : 'selected'}`} role={state.searchStatus === 'error' ? 'alert' : 'status'}>{state.searchMessage}</span>}
    {state.results.length > 0 && <ul className="site-map-results" aria-label="Resultados de la búsqueda">{state.results.map((result, index) => <li key={`${index}-${result.latitude}-${result.longitude}`}>
      <button type="button" className="button button-small button-quiet" disabled={disabled} onClick={() => onChooseResult(result)}>{result.label}</button>
    </li>)}</ul>}
    {/* Above the map, so on a phone the instruction, the map and the confirm button fit on one screen. */}
    <span className="field-hint" role="status">{state.point
      ? `Punto marcado. El círculo muestra los ${radiusMeters} m permitidos para marcar. Si no es la puerta, tocá de nuevo.`
      : 'Tocá en el mapa la puerta del local.'}</span>
    <Suspense fallback={<Loading label="Cargando el mapa…" />}>
      <SiteMapPicker view={state.view} point={state.point} radiusMeters={radiusMeters} onPick={onPick} label="Mapa: tocá la puerta del local" />
    </Suspense>
    <div className="button-row">
      <button type="button" className="button button-primary" disabled={disabled || !state.point} onClick={onConfirm}>Confirmar ubicación</button>
      <button type="button" className="button button-quiet" disabled={disabled} onClick={onClose}>Cerrar mapa</button>
    </div>
  </section>
}
