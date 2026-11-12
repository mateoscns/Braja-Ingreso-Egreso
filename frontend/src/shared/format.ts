import type { TemplateBlock } from './api/types'

// The names of the states live in labels.ts; this export stays for the files that import it from here.
export { jornadaStateLabel } from './labels'

/** The API may return HH:MM:SS; people are shown HH:MM. */
export function formatClock(value: string): string {
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : value
}

export function formatBlock(block: TemplateBlock): string {
  const range = `${formatClock(block.start)} a ${formatClock(block.end)}`
  return block.endDayOffset === 1 ? `${range} (día siguiente)` : range
}

/** Calendar date (YYYY-MM-DD) formatted for es-AR; independent of the device time zone. */
export function formatLocalDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate
  const parsed = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed)
}

/**
 * Date and time without seconds, in the given time zone when provided, on the 24-hour clock of the employee's day and the
 * horarios («16 oct 2026, 16:05»): es-AR alone writes «4:05 p. m.». The date and the time are formatted apart because asking
 * es-AR for a 24-hour clock with the date in one format also changes the date to «16 de oct de 2026».
 */
export function formatDateTime(value: string, timeZone?: string): string {
  const zone = timeZone ? { timeZone } : {}
  const instant = new Date(value)
  const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', ...zone }).format(instant)
  const time = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zone }).format(instant)
  return `${date}, ${time}`
}
