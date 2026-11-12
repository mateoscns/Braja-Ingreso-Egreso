import { lazy, Suspense, useId } from 'react'
import { FormField, Loading, PageMessage } from '../../app/ui'
import type { GeocodeResult } from '../../shared/api/geocode'
import type { SiteCoordinates } from '../../shared/api/types'
import type { SiteMapView } from './siteMap'

// Leaflet lives in its own chunk: it is downloaded only when an ADMIN opens the map.
const SiteMapPicker = lazy(() => import('./SiteMapPicker'))

export type SiteMapSearchStatus = 'idle' | 'loading' | 'done' | 'error'
export type SiteMapPanelState = {
  view: SiteMapView; point: SiteCoordinates | null
  query: string; searchStatus: SiteMapSearchStatus; searchMessage: string; results: GeocodeResult[]
  /** «Buscar» with nothing written: the error of the search field, not an answer of the search. */
  queryError?: string
}
/**
 * The panel (one map is open at a time): opening it and an empty search take the focus to its search field inside it, and a
 * result chosen, which empties the list that held it, takes the focus to «Confirmar ubicación» (T12, WCAG 2.4.3).
 */
export const SITE_MAP_PANEL_ID = 'site-map-panel'
export const SITE_MAP_CONFIRM_ID = 'site-map-confirm'

/** D-20261109-01: find the address, tap the exact spot, see the radius and confirm. Data and callbacks come from SitesView. */
export function SiteMapPanel({ state, radiusMeters, disabled, onPick, onQueryChange, onSearch, onChooseResult, onConfirm, onClose }: {
  state: SiteMapPanelState; radiusMeters: number; disabled: boolean
  onPick: (point: SiteCoordinates) => void; onQueryChange: (value: string) => void; onSearch: () => void
  onChooseResult: (result: GeocodeResult) => void; onConfirm: () => void; onClose: () => void
}) {
  const searching = state.searchStatus === 'loading'
  const instructionId = useId()
  // A part of the form around it, in its flow and without a box of its own (design system 4.20).
  return <section id={SITE_MAP_PANEL_ID} className="site-map-panel" aria-label="Mapa para elegir la ubicación del local">
    <div className="site-map-search">
      {/* Not a nested form: Enter searches here instead of submitting the site form around it. The example is the hint, read
          before typing, not a placeholder that typing hides. */}
      <FormField label="Buscá la dirección del local" hint="Calle y número" error={state.queryError}>
        <input type="text" maxLength={200} value={state.query} disabled={disabled} enterKeyHint="search" autoComplete="off"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSearch() } }} />
      </FormField>
      <button type="button" className="button button-secondary" disabled={disabled || searching} onClick={onSearch}>{searching ? 'Buscando…' : 'Buscar'}</button>
    </div>
    {/* What the search said, as a message: an error is an alert; the rest is a status region that mounts before its text. */}
    {state.searchMessage && <PageMessage kind={state.searchStatus === 'error' ? 'error' : 'info'}>{state.searchMessage}</PageMessage>}
    {state.results.length > 0 && <ul className="site-map-results" aria-label="Resultados de la búsqueda">{state.results.map((result, index) => <li key={`${index}-${result.latitude}-${result.longitude}`}>
      <button type="button" className="button button-secondary" disabled={disabled} onClick={() => onChooseResult(result)}>{result.label}</button>
    </li>)}</ul>}
    {/* Above the map, so on a phone the instruction, the map and the confirm button fit on one screen. */}
    <span className="field-hint" id={instructionId} role="status">{state.point
      ? `Punto marcado. El círculo muestra los ${radiusMeters} m alrededor del local. Si no es la puerta, tocá de nuevo.`
      : 'Tocá en el mapa la puerta del local.'}</span>
    <Suspense fallback={<Loading label="Cargando el mapa…" />}>
      <SiteMapPicker view={state.view} point={state.point} radiusMeters={radiusMeters} onPick={onPick} label="Mapa: tocá la puerta del local" />
    </Suspense>
    <div className="button-row">
      {/* Without a point there is nothing to confirm: the instruction over the map says what to do, and the button reads it
          (finding F-09). The instruction, the map and the button fit on one phone screen (design system 4.20). */}
      <button type="button" id={SITE_MAP_CONFIRM_ID} className="button button-primary" aria-describedby={state.point ? undefined : instructionId} disabled={disabled || !state.point} onClick={onConfirm}>Confirmar ubicación</button>
      {/* Backing out of the map, so a link button (design system 4.1). */}
      <button type="button" className="button button-link" disabled={disabled} onClick={onClose}>Cerrar mapa</button>
    </div>
  </section>
}
