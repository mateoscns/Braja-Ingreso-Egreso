import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readSource } from '../../app/testing/sourceFiles'
import SiteMapPicker from './SiteMapPicker'
import { MAP_HALO_COLOR, MAP_INK_COLOR, POINT_STYLE, RADIUS_HALO_STYLE, RADIUS_STYLE } from './siteMap'

afterEach(() => cleanup())

const view = { latitude: -34.6, longitude: -58.38, zoom: 17 }
const renderMap = () => render(<SiteMapPicker view={view} point={null} radiusMeters={100} onPick={() => undefined} label="Mapa: tocá la puerta del local" />)

/** The value of a token of styles.css, as written there. */
const token = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`).exec(readSource('styles.css'))?.[1]?.toLowerCase()

// T12: the parts Leaflet draws itself spoke English and drew the radius under 3:1 on parks, water and buildings (WCAG 1.4.11).
describe('the map of a local, as Leaflet draws it', () => {
  it('names its zoom buttons in Spanish', () => {
    const { container } = renderMap()

    const zoomIn = container.querySelector('.leaflet-control-zoom-in')!
    const zoomOut = container.querySelector('.leaflet-control-zoom-out')!
    expect(zoomIn).toHaveAttribute('aria-label', 'Acercar')
    expect(zoomIn).toHaveAttribute('title', 'Acercar')
    expect(zoomOut).toHaveAttribute('aria-label', 'Alejar')
    expect(zoomOut).toHaveAttribute('title', 'Alejar')
    expect(container).not.toHaveTextContent(/Zoom/)
  })

  it('credits OpenStreetMap without the English prefix of the library', () => {
    const { container } = renderMap()

    const attribution = container.querySelector('.leaflet-control-attribution')!
    expect(attribution).toHaveTextContent('© OpenStreetMap')
    expect(attribution).not.toHaveTextContent('Leaflet')
    expect(attribution.querySelector('a[href="https://leafletjs.com"]')).toBeNull()
  })

  it('keeps its name without pretending to be an application', () => {
    const { container } = renderMap()

    const map = container.querySelector('.site-map-canvas')!
    expect(map).not.toHaveAttribute('role', 'application')
    expect(map).toHaveAttribute('role', 'group')
    expect(map).toHaveAttribute('aria-label', 'Mapa: tocá la puerta del local')
  })

  it('draws the radius and the point with the brand ink over a white halo, the values of the tokens of styles.css', () => {
    expect(MAP_INK_COLOR).toBe(token('--brand'))
    expect(MAP_HALO_COLOR).toBe(token('--surface'))
    expect(RADIUS_STYLE).toMatchObject({ color: MAP_INK_COLOR, weight: 3 })
    expect(RADIUS_HALO_STYLE).toMatchObject({ color: MAP_HALO_COLOR, fill: false })
    expect(RADIUS_HALO_STYLE.weight).toBeGreaterThan(RADIUS_STYLE.weight)
    expect(POINT_STYLE).toMatchObject({ color: MAP_HALO_COLOR, fillColor: MAP_INK_COLOR, fillOpacity: 1 })
  })
})
