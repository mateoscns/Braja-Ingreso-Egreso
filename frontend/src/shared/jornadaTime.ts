import type { Jornada, Mark, TemplateBlock } from './api/types'

// The times of a day of work, shared by the employee's screen and the ADMIN's (issue #177: the facts of a case are computed
// once for both). features/employee/employeeDay.ts re-exports them for the files that import them from there.

/** Clock time HH:MM in the zone of the site. */
export function formatTime(instant: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) }).format(new Date(instant))
}

function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(instant))
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const wall = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour') % 24, value('minute'), value('second'))
  return wall - Math.floor(instant / 1000) * 1000
}

/** Instant of a wall-clock time of the site, `dayOffset` days after the local date of the jornada. */
export function zonedInstant(localDate: string, dayOffset: number, clock: string, timeZone: string): Date {
  const [year, month, day] = localDate.split('-').map(Number)
  const [hour, minute] = clock.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day + dayOffset, hour, minute)
  const firstGuess = wall - zoneOffsetMs(wall, timeZone)
  return new Date(wall - zoneOffsetMs(firstGuess, timeZone))
}

function blockStart(jornada: Jornada, block: TemplateBlock, timeZone: string) { return zonedInstant(jornada.localDate, block.startDayOffset, block.start, timeZone) }
function blockEnd(jornada: Jornada, block: TemplateBlock, timeZone: string) { return zonedInstant(jornada.localDate, block.endDayOffset, block.end, timeZone) }

export function scheduledStart(jornada: Jornada, timeZone: string): Date | null {
  const starts = jornada.scheduleSnapshot.blocks.map((block) => blockStart(jornada, block, timeZone).getTime())
  return starts.length ? new Date(Math.min(...starts)) : null
}

export function scheduledEnd(jornada: Jornada, timeZone: string): Date | null {
  const ends = jornada.scheduleSnapshot.blocks.map((block) => blockEnd(jornada, block, timeZone).getTime())
  return ends.length ? new Date(Math.max(...ends)) : null
}

/**
 * When a mark happened. A mark the ADMIN loaded or corrected carries that time in occurredAt, and acceptedAt is only
 * when it was stored (2026-11-10, #115: the employee read the stored time).
 */
export function markInstant(mark: Mark): string {
  return mark.occurredAt ?? mark.acceptedAt
}

/** A voided mark stays visible but no longer counts (D-20261027-08), exactly as the server derives the state. */
export function countedMarks(jornada: Jornada): Mark[] {
  return jornada.marks.filter((mark) => !mark.voided).sort((a, b) => a.sequence - b.sequence)
}
