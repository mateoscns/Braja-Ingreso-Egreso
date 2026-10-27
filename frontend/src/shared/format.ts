import type { JornadaStatus, TemplateBlock } from './api/types'

const STATE_LABELS: Record<JornadaStatus, string> = {
  NO_INGRESO: 'Sin ingreso',
  EN_CURSO: 'En curso',
  PAUSA_ABIERTA: 'En pausa',
  EGRESADA: 'Finalizada',
  CANCELADA: 'Cancelada'
}

export function jornadaStateLabel(state: JornadaStatus): string {
  return STATE_LABELS[state] ?? state
}

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

/** Date and time without seconds, in the given time zone when provided. */
export function formatDateTime(value: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(value))
}
