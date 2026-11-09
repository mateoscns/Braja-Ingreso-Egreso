export const REGION_TIME_ZONE_MESSAGE = 'Esa zona horaria no sirve. Elegí una provincia de la lista o escribí la zona de una ciudad, por ejemplo America/Santiago.'

/** The Argentine zones of the site form, by the province the owner knows; Buenos Aires is the default. */
export const ARGENTINE_TIME_ZONES: readonly { zone: string; label: string }[] = [
  { zone: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { zone: 'America/Argentina/Catamarca', label: 'Catamarca' },
  { zone: 'America/Argentina/Cordoba', label: 'Córdoba' },
  { zone: 'America/Argentina/Jujuy', label: 'Jujuy' },
  { zone: 'America/Argentina/La_Rioja', label: 'La Rioja' },
  { zone: 'America/Argentina/Mendoza', label: 'Mendoza' },
  { zone: 'America/Argentina/Salta', label: 'Salta' },
  { zone: 'America/Argentina/San_Juan', label: 'San Juan' },
  { zone: 'America/Argentina/San_Luis', label: 'San Luis' },
  { zone: 'America/Argentina/Rio_Gallegos', label: 'Santa Cruz (Río Gallegos)' },
  { zone: 'America/Argentina/Ushuaia', label: 'Tierra del Fuego (Ushuaia)' },
  { zone: 'America/Argentina/Tucuman', label: 'Tucumán' }
]

/** How a site's zone is shown: the province for an Argentine zone, else the zone with spaces instead of underscores. */
export function timeZoneLabel(zone: string): string {
  return ARGENTINE_TIME_ZONES.find((entry) => entry.zone === zone)?.label ?? zone.replace(/_/g, ' ')
}

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
