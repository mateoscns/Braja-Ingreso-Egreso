import { describe, expect, it } from 'vitest'
import { isRegionTimeZone } from './siteZone'

describe('isRegionTimeZone', () => {
  it.each(['America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba', 'America/Santiago', 'Europe/Madrid'])('accepts the region id %s, which the server accepts', (zone) => {
    expect(isRegionTimeZone(zone)).toBe(true)
  })

  // D-20261102-05: offset-only ids (UTC, GMT, Etc/*) have no daylight saving rules of a place; the server rejects them.
  it.each(['EST', 'ART', '-03:00', 'Z', 'UTC+3', 'GMT-3', 'GMT', 'UTC', 'Etc/GMT+3', 'Etc/UTC', 'America/Nowhere', 'america/argentina/buenos_aires', ' America/Argentina/Buenos_Aires', ''])('rejects %j: an abbreviation, a fixed offset, an unknown or miswritten id', (zone) => {
    expect(isRegionTimeZone(zone)).toBe(false)
  })
})
