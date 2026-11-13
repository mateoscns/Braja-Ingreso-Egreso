import { describe, expect, it } from 'vitest'
import { distanceMeters, wholeMeters } from './geo'

// The ADMIN's map of a mark says how far it was from the local with the same formula the server judges the mark with
// (GeofencePolicy.distanceMeters): haversine on a sphere of 6 371 008.8 m.
describe('distance between two points', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters({ latitude: -34.6037, longitude: -58.3816 }, { latitude: -34.6037, longitude: -58.3816 })).toBe(0)
  })

  it('measures about 400 m for 0.0036 degrees of latitude in Buenos Aires', () => {
    const meters = distanceMeters({ latitude: -34.6037, longitude: -58.3816 }, { latitude: -34.6001, longitude: -58.3816 })
    // One degree of latitude on this sphere is 2 * PI * 6 371 008.8 / 360 = 111 195.08 m.
    expect(meters).toBeCloseTo(400.302, 2)
    expect(wholeMeters(meters)).toBe(400)
  })

  it('shrinks the east-west distance by the cosine of the latitude', () => {
    const atEquator = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.001 })
    const atSixty = distanceMeters({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 0.001 })
    expect(atEquator).toBeCloseTo(111.195, 2)
    expect(atSixty).toBeCloseTo(atEquator / 2, 2)
  })

  it('is the same in both directions and across the antimeridian', () => {
    const a = { latitude: -34.6037, longitude: -58.3816 }
    const b = { latitude: -34.61, longitude: -58.39 }
    expect(distanceMeters(a, b)).toBe(distanceMeters(b, a))
    expect(distanceMeters({ latitude: 0, longitude: 179.9995 }, { latitude: 0, longitude: -179.9995 })).toBeCloseTo(111.195, 2)
  })

  it('rounds to whole meters, half up', () => {
    expect(wholeMeters(399.49)).toBe(399)
    expect(wholeMeters(399.5)).toBe(400)
    expect(wholeMeters(0.2)).toBe(0)
  })
})
