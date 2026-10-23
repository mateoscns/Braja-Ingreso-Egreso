const MIN_YEAR = 2000
const MAX_YEAR = 2100
const MAX_SPAN_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000

export const DATE_PAIR_MESSAGE = 'Completá las dos fechas: desde y hasta.'

function parse(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(time) ? null : time
}

/**
 * Mirrors the server rule for local-date ranges (ordered, years 2000 to 2100, at most 366 days apart) so the
 * mistake is explained before any request is made. Both ends empty means "no range" and is valid here.
 * Returns a Spanish message, or an empty string when the range is acceptable.
 */
export function validateDateRange(from: string, to: string): string {
  if (!from && !to) return ''
  if (!from || !to) return DATE_PAIR_MESSAGE
  const start = parse(from)
  const end = parse(to)
  if (start === null || end === null) return 'Revisá las fechas: el formato no es válido.'
  if ([start, end].some((time) => { const year = new Date(time).getUTCFullYear(); return year < MIN_YEAR || year > MAX_YEAR })) return `Las fechas deben estar entre los años ${MIN_YEAR} y ${MAX_YEAR}.`
  if (end < start) return 'La fecha desde no puede ser posterior a la fecha hasta.'
  if (end - start > MAX_SPAN_DAYS * DAY_MS) return `El rango no puede superar los ${MAX_SPAN_DAYS} días.`
  return ''
}

/** Calendar date (YYYY-MM-DD) in the device's own calendar, `daysAgo` days before today. */
export function deviceDate(daysAgo = 0): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
