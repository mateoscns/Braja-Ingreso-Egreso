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

  it('names a zone by its provinces, and any other zone without underscores', () => {
    expect(timeZoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires y CABA')
    expect(timeZoneLabel('America/Argentina/Cordoba')).toBe('Córdoba, Santa Fe, Entre Ríos, Corrientes, Misiones, Chaco, Formosa y Santiago del Estero')
    expect(timeZoneLabel('America/New_York')).toBe('America/New York')
  })

  // 2026-11-10, end-to-end check (#110): twelve provinces were missing, so a shop in Rosario could not find its own.
  // Each province goes with its zone as tzdata's zone1970.tab lists it.
  it.each([
    ['CABA', 'Buenos_Aires'], ['Buenos Aires', 'Buenos_Aires'], ['Catamarca', 'Catamarca'], ['Chaco', 'Cordoba'], ['Chubut', 'Catamarca'],
    ['Córdoba', 'Cordoba'], ['Corrientes', 'Cordoba'], ['Entre Ríos', 'Cordoba'], ['Formosa', 'Cordoba'], ['Jujuy', 'Jujuy'],
    ['La Pampa', 'Salta'], ['La Rioja', 'La_Rioja'], ['Mendoza', 'Mendoza'], ['Misiones', 'Cordoba'], ['Neuquén', 'Salta'],
    ['Río Negro', 'Salta'], ['Salta', 'Salta'], ['San Juan', 'San_Juan'], ['San Luis', 'San_Luis'], ['Santa Cruz', 'Rio_Gallegos'],
    ['Santa Fe', 'Cordoba'], ['Santiago del Estero', 'Cordoba'], ['Tierra del Fuego', 'Ushuaia'], ['Tucumán', 'Tucuman']
  ])('%s is listed once, with the zone America/Argentina/%s', (province, zone) => {
    const named = (label: string) => label.split(/, | y /).includes(province)
    const entries = ARGENTINE_TIME_ZONES.filter((entry) => named(entry.label))
    expect(entries.map((entry) => entry.zone)).toEqual([`America/Argentina/${zone}`])
  })
})
