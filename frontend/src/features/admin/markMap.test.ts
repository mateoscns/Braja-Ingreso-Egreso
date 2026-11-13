import { describe, expect, it } from 'vitest'
import { markGeofence, markPlaceFacts } from './markMap'
import { openStreetMapHref } from './siteMap'

const center = { latitude: -34.6037, longitude: -58.3816 }
const area = { ...center, radiusMeters: 100 }
// 0.0036 degrees of latitude north of the center: 400.30 m on the server's sphere.
const far = { latitude: -34.6001, longitude: -58.3816 }

// 2026-11-13: what the ADMIN reads next to the map of a mark, the text alternative of the map. The verdict follows the server's
// rule (GeofencePolicy.isOutside): inside only when the distance plus the reported accuracy fits in the radius.
describe('what the day detail says about where a mark was made', () => {
  it('a mark 400 m away with ±23.46 m is outside by about 324 m, with the distance and the accuracy in words', () => {
    const facts = markPlaceFacts(far, 23.46, area)

    expect(facts.inside).toBe(false)
    expect(facts.verdict).toBe('Fuera del local: aproximadamente 324 m más allá de la distancia permitida.')
    expect(facts.distance).toBe('Esta marca se hizo aproximadamente a 400 m del local.')
    expect(facts.accuracy).toBe('Precisión informada por el celular: aproximadamente ±23 m.')
    expect(facts.rule).toBe('Cuenta como dentro del local cuando la distancia más la precisión no pasa de los 100 m permitidos.')
    expect(facts.noCenter).toBeUndefined()
  })

  it('a mark whose accuracy circle fits in the radius is inside', () => {
    const near = { latitude: -34.6033, longitude: -58.3816 } // 44.48 m
    const facts = markPlaceFacts(near, 20, area)

    expect(facts.inside).toBe(true)
    expect(facts.verdict).toBe('Dentro del local.')
    expect(facts.accuracy).toBe('Precisión informada por el celular: ±20 m.')
  })

  it('the edge counts as inside, as on the server: distance plus accuracy equal to the radius', () => {
    expect(markPlaceFacts(center, 100, area).inside).toBe(true)
    expect(markPlaceFacts(center, 100.01, area)).toMatchObject({ inside: false, verdict: 'Fuera del local: menos de 1 m más allá de la distancia permitida.' })
  })

  it('a close point says less than one meter instead of «0 m»', () => {
    expect(markPlaceFacts(center, 5, area).distance).toBe('Esta marca se hizo a menos de 1 m del local.')
  })

  it('a large distance groups its thousands as in Argentina', () => {
    const away = { latitude: -34.5937, longitude: -58.3816 } // 0.01 degrees: 1 111.95 m
    expect(markPlaceFacts(away, 10, area).distance).toBe('Esta marca se hizo aproximadamente a 1.112 m del local.')
  })

  it('without the local\'s point that day there is no distance nor verdict, and it says why', () => {
    const facts = markPlaceFacts(far, 23.46, null)

    expect(facts.inside).toBeNull()
    expect(facts.noCenter).toBe('Ese día el local no tenía ubicación cargada.')
    expect(facts.verdict).toBeUndefined()
    expect(facts.distance).toBeUndefined()
    expect(facts.rule).toBeUndefined()
    expect(facts.accuracy).toBe('Precisión informada por el celular: aproximadamente ±23 m.')
  })

  it('without the accuracy the accuracy line is left out and no verdict is guessed', () => {
    const facts = markPlaceFacts(far, null, area)

    expect(facts.accuracy).toBeUndefined()
    expect(facts.inside).toBeNull()
    expect(facts.verdict).toBe('Sin la precisión del celular no se puede saber si estaba dentro del local.')
    expect(facts.distance).toBe('Esta marca se hizo aproximadamente a 400 m del local.')
  })
})

describe('the area of the day', () => {
  it('is the snapshot of the jornada when it has a center and a radius', () => {
    expect(markGeofence({ geofenceLatitude: -34.6, geofenceLongitude: -58.38, geofenceRadiusMeters: 150 })).toEqual({ latitude: -34.6, longitude: -58.38, radiusMeters: 150 })
  })

  it('is none when any of the three is missing', () => {
    expect(markGeofence({})).toBeNull()
    expect(markGeofence({ geofenceLatitude: -34.6, geofenceLongitude: -58.38, geofenceRadiusMeters: null })).toBeNull()
    expect(markGeofence({ geofenceLatitude: null, geofenceLongitude: -58.38, geofenceRadiusMeters: 100 })).toBeNull()
  })
})

describe('the link to OpenStreetMap', () => {
  it('puts a pin on the point and opens close to it', () => {
    expect(openStreetMapHref(far)).toBe('https://www.openstreetmap.org/?mlat=-34.6001&mlon=-58.3816#map=17/-34.6001/-58.3816')
  })
})
