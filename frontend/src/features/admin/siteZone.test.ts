import { describe, expect, it } from 'vitest'
import { ARGENTINE_TIME_ZONES, isRegionTimeZone, timeZoneLabel } from './siteZone'

describe('isRegionTimeZone', () => {
  it.each(['America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba', 'America/Santiago', 'Europe/Madrid'])('accepts the region id %s, which the server accepts', (zone) => {
    expect(isRegionTimeZone(zone)).toBe(true)
  })

  // D-20261102-05: offset-only ids (UTC, GMT, Etc/*) have no daylight saving rules of a place; the server rejects them.
  it.each(['EST', 'ART', '-03:00', 'Z', 'UTC+3', 'GMT-3', 'GMT', 'UTC', 'Etc/GMT+3', 'Etc/UTC', 'America/Nowhere', 'america/argentina/buenos_aires', ' America/Argentina/Buenos_Aires', ''])('rejects %j: an abbreviation, a fixed offset, an unknown or miswritten id', (zone) => {
    expect(isRegionTimeZone(zone)).toBe(false)
  })
})

describe('the Argentine zones of the site form', () => {
  it.each(ARGENTINE_TIME_ZONES.map((entry) => entry.zone))('%s is a region id the server accepts', (zone) => {
    expect(isRegionTimeZone(zone)).toBe(true)
  })

  it('names a zone by its province, and any other zone without underscores', () => {
    expect(timeZoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
    expect(timeZoneLabel('America/Argentina/Cordoba')).toBe('Córdoba')
    expect(timeZoneLabel('America/New_York')).toBe('America/New York')
  })
})
