export const REGION_TIME_ZONE_MESSAGE = 'Usá una zona horaria por región, como America/Argentina/Buenos_Aires. Las abreviaturas (EST, ART), UTC y los desfases fijos (-03:00, GMT-3, Etc/GMT+3) no se aceptan.'

// Area/Location ids of the IANA database, each part starting with an uppercase letter as listed there.
const REGION_ID = /^[A-Z][A-Za-z_]*(?:\/[A-Z0-9][A-Za-z0-9_+-]*)+$/

/**
 * Mirrors D-20261102-05 before any request: the server accepts only Area/Location ids of `ZoneId.getAvailableZoneIds()`,
 * written exactly as listed and not under Etc/. Intl alone also accepts abbreviations (EST), offsets (-03:00) and the
 * offset-only ids (UTC, Etc/GMT+3) the server rejects.
 */
export function isRegionTimeZone(zone: string): boolean {
  if (!REGION_ID.test(zone) || zone.startsWith('Etc/')) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date())
    return true
  } catch {
    return false
  }
}
