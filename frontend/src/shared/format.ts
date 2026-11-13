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
 * A day of work by its weekday, day and month («jueves 12 nov»), independent of the device time zone (issue #177: a case
 * showed when it was recorded, not the day it belongs to). A value that is not a local date is returned as it is.
 */
export function formatWorkDay(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate
  const parsed = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  const parts = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(parsed)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value.replace(/\.$/, '') ?? ''
  return `${part('weekday')} ${part('day')} ${part('month')}`
}

/**
 * A duration said the way people say it (issue #177: «Saliste 449 minutos antes» was hard to read): under an hour in minutes
 * («1 minuto», «12 minutos»), from an hour on in hours and minutes («7 h 29 min»), and only hours when exact («1 hora»).
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return minutes === 1 ? '1 minuto' : `${minutes} minutos`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return hours === 1 ? '1 hora' : `${hours} horas`
  return `${hours} h ${rest} min`
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
