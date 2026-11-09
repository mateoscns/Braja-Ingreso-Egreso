import { describe, expect, it, vi } from 'vitest'
import {
  approximateDevicePosition,
  DEFAULT_MAP_VIEW,
  mapRadiusMeters,
  normalizePickedPoint,
  OSM_TILE_OPTIONS,
  OSM_TILE_URL,
  roundCoordinate,
  siteMapInitialView
} from './siteMap'

describe('roundCoordinate', () => {
  it('keeps seven decimals, the precision the database stores', () => {
    expect(roundCoordinate(-34.603722449)).toBe(-34.6037224)
    expect(roundCoordinate(-58.38159255)).toBe(-58.3815926)
    expect(roundCoordinate(12)).toBe(12)
  })
})

describe('normalizePickedPoint', () => {
  it('rounds a tapped point and wraps a longitude taken past the antimeridian', () => {
    expect(normalizePickedPoint(-34.603722449, -58.38159255)).toEqual({ latitude: -34.6037224, longitude: -58.3815926 })
    expect(normalizePickedPoint(-34.6, -58.4 + 360)).toEqual({ latitude: -34.6, longitude: -58.4 })
    expect(normalizePickedPoint(10, 180)).toEqual({ latitude: 10, longitude: -180 })
  })

  it('rejects a latitude out of range or a value that is not a number', () => {
    expect(normalizePickedPoint(91, 0)).toBeNull()
    expect(normalizePickedPoint(Number.NaN, 0)).toBeNull()
    expect(normalizePickedPoint(0, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('mapRadiusMeters', () => {
  it('draws the typed radius clamped to 50-500 meters', () => {
    expect(mapRadiusMeters('175')).toBe(175)
    expect(mapRadiusMeters('20')).toBe(50)
    expect(mapRadiusMeters('9000')).toBe(500)
    expect(mapRadiusMeters(' 120 ')).toBe(120)
  })

  it('draws the default 100 meters while the field is empty or not a number', () => {
    expect(mapRadiusMeters('')).toBe(100)
    expect(mapRadiusMeters('abc')).toBe(100)
  })
})

describe('siteMapInitialView', () => {
  it('starts on the site center when the form already has one', () => {
    expect(siteMapInitialView({ latitude: -31.4, longitude: -64.18 }, { latitude: -34.6, longitude: -58.4 }))
      .toEqual({ latitude: -31.4, longitude: -64.18, zoom: 17 })
  })

  it('starts on the device position, however rough, when there is no center', () => {
    expect(siteMapInitialView(null, { latitude: -32.95, longitude: -60.65 })).toEqual({ latitude: -32.95, longitude: -60.65, zoom: 16 })
  })

  it('starts on Buenos Aires when there is neither', () => {
    expect(siteMapInitialView(null, null)).toEqual(DEFAULT_MAP_VIEW)
    expect(DEFAULT_MAP_VIEW).toEqual({ latitude: -34.6, longitude: -58.4, zoom: 12 })
  })
})

describe('OpenStreetMap tiles', () => {
  it('uses the standard tile server with its attribution, zoom limit and a referrer it accepts', () => {
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(OSM_TILE_OPTIONS.maxZoom).toBe(19)
    expect(OSM_TILE_OPTIONS.referrerPolicy).toBe('strict-origin-when-cross-origin')
    expect(OSM_TILE_OPTIONS.attribution).toContain('href="https://www.openstreetmap.org/copyright"')
    expect(OSM_TILE_OPTIONS.attribution).toContain('&copy; <a')
    expect(OSM_TILE_OPTIONS.attribution).toContain('>OpenStreetMap</a>')
  })
})

describe('approximateDevicePosition', () => {
  it('asks once for a cached, low-power position and accepts any accuracy', async () => {
    const getCurrentPosition = vi.fn((...args: Parameters<Geolocation['getCurrentPosition']>) =>
      args[0]({ coords: { latitude: -34.61, longitude: -58.42, accuracy: 124 } } as GeolocationPosition))

    await expect(approximateDevicePosition({ getCurrentPosition })).resolves.toEqual({ latitude: -34.61, longitude: -58.42 })
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false })
  })

  it('gives up quietly without geolocation, on a denied permission or on invalid coordinates', async () => {
    await expect(approximateDevicePosition(null)).resolves.toBeNull()
    await expect(approximateDevicePosition({ getCurrentPosition: (_success, failure) => failure?.({ code: 1 } as GeolocationPositionError) })).resolves.toBeNull()
    await expect(approximateDevicePosition({ getCurrentPosition: (success) => success({ coords: { latitude: 95, longitude: 0, accuracy: 5 } } as GeolocationPosition) })).resolves.toBeNull()
  })

  it('resolves nothing once the caller cancels', async () => {
    const controller = new AbortController()
    let finish: PositionCallback | undefined
    const pending = approximateDevicePosition({ getCurrentPosition: (success) => { finish = success } }, controller.signal)
    controller.abort()
    finish?.({ coords: { latitude: -34.6, longitude: -58.4, accuracy: 30 } } as GeolocationPosition)
    await expect(pending).resolves.toBeNull()
  })
})
