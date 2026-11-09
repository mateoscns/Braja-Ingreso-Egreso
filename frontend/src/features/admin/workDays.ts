import type { BulkDeclarationResult } from '../../shared/api/types'
import { MAX_BULK_DAYS, validateBulkDeclaration, type BulkDeclarationDraft } from './bulkDeclaration'

/**
 * Days of work (D-20261027-11): each jornada is created once, no weekly rule is stored (D-20261015-01). These helpers mirror
 * the server (JornadaDeclarationService.bulkDates) so the owner sees what will be loaded before sending anything.
 * Dates are calendar dates (YYYY-MM-DD); "today" is taken in the site's own calendar.
 */
export type WorkPeriod = 'this-week' | 'two-weeks' | 'rest-of-month' | 'next-month' | 'custom'

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

function toTime(date: string): number | null {
  const match = DATE.exec(date)
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date(time).toISOString().slice(0, 10) === date ? time : null
}

const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10)

/** Today's calendar date in the given IANA zone; the device's calendar when the zone is unknown. */
export function calendarToday(timeZone: string | undefined, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')}`
  } catch {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
}

export function addDays(date: string, days: number): string {
  const time = toTime(date)
  return time === null ? date : fromTime(time + days * DAY_MS)
}

/** 1 (Monday) to 7 (Sunday), as java.time.DayOfWeek#getValue. */
export function isoWeekday(date: string): number {
  const time = toTime(date)
  if (time === null) return 0
  const day = new Date(time).getUTCDay()
  return day === 0 ? 7 : day
}

function lastDayOfMonth(year: number, month: number): string {
  return fromTime(Date.UTC(year, month, 0))
}

/** The calendar window of a quick period; every one is at most 31 days. */
export function periodRange(period: Exclude<WorkPeriod, 'custom'>, today: string): { from: string; to: string } {
  const [year, month] = today.split('-').map(Number)
  switch (period) {
    case 'this-week': return { from: today, to: addDays(today, 7 - isoWeekday(today)) }
    case 'two-weeks': return { from: today, to: addDays(today, 13) }
    case 'rest-of-month': return { from: today, to: lastDayOfMonth(year, month) }
    case 'next-month': {
      const nextYear = month === 12 ? year + 1 : year
      const nextMonth = month === 12 ? 1 : month + 1
      return { from: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`, to: lastDayOfMonth(nextYear, nextMonth) }
    }
  }
}

/** The dates of the window [from, to] (at most 31 days) that fall on the chosen weekdays; [] when the window is not valid. */
export function workDates(from: string, to: string, weekdays: number[]): string[] {
  const start = toTime(from)
  const end = toTime(to)
  if (start === null || end === null || end < start || end - start >= MAX_BULK_DAYS * DAY_MS) return []
  const selected = new Set(weekdays)
  const dates: string[] = []
  for (let time = start; time <= end; time += DAY_MS) {
    const date = fromTime(time)
    if (selected.has(isoWeekday(date))) dates.push(date)
  }
  return dates
}

const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function sameDays(weekdays: number[], expected: number[]): boolean {
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b)
  return sorted.length === expected.length && sorted.every((day, index) => day === expected[index])
}

export const MONDAY_TO_FRIDAY = [1, 2, 3, 4, 5]
export const MONDAY_TO_SATURDAY = [1, 2, 3, 4, 5, 6]
export const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7]

function joinWords(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`
}

export function weekdaysText(weekdays: number[]): string {
  if (sameDays(weekdays, MONDAY_TO_FRIDAY)) return 'lunes a viernes'
  if (sameDays(weekdays, MONDAY_TO_SATURDAY)) return 'lunes a sábado'
  if (sameDays(weekdays, EVERY_DAY)) return 'todos los días'
  return joinWords([...new Set(weekdays)].sort((a, b) => a - b).map((day) => WEEKDAY_NAMES[day - 1]).filter(Boolean))
}

function dateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

/** "del 1 al 31 de diciembre", "del 28 de noviembre al 5 de diciembre", "el 3 de diciembre". */
export function rangeText(from: string, to: string): string {
  const start = dateParts(from)
  const end = dateParts(to)
  const monthOf = (part: { month: number }) => MONTH_NAMES[part.month - 1]
  if (from === to) return `el ${start.day} de ${monthOf(start)}`
  if (start.year !== end.year) return `del ${start.day} de ${monthOf(start)} de ${start.year} al ${end.day} de ${monthOf(end)} de ${end.year}`
  if (start.month !== end.month) return `del ${start.day} de ${monthOf(start)} al ${end.day} de ${monthOf(end)}`
  return `del ${start.day} al ${end.day} de ${monthOf(end)}`
}

/** "jueves 12 de noviembre": a calendar date in the owner's words, independent of the device zone. */
export function dayText(date: string): string {
  const { day, month } = dateParts(date)
  return `${WEEKDAY_NAMES[isoWeekday(date) - 1] ?? ''} ${day} de ${MONTH_NAMES[month - 1] ?? ''}`.trim()
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function previewText({ from, to, weekdays, people }: { from: string; to: string; weekdays: number[]; people: number }): string {
  if (!from || !to) return 'Elegí el primer y el último día.'
  const start = toTime(from)
  const end = toTime(to)
  if (start === null || end === null || end < start || end - start >= MAX_BULK_DAYS * DAY_MS) return `Elegí un período de hasta ${MAX_BULK_DAYS} días, del primero al último.`
  const days = workDates(from, to, weekdays).length
  if (days === 0) return 'Ningún día del período cae en los días elegidos.'
  return `Vas a cargar ${plural(days, 'día', 'días')} (${weekdaysText(weekdays)}, ${rangeText(from, to)}) para ${plural(people, 'persona', 'personas')}.`
}

const DATES_MISSING = 'Completá el primer y el último día.'
const DATES_REVERSED = 'El último día no puede ser anterior al primero.'
const DATES_TOO_LONG = `Elegí como máximo ${MAX_BULK_DAYS} días. Para más, cargá un mes y después el siguiente.`
/** The validation messages that belong to the date fields of "Elegir fechas". */
export const DATE_PROBLEMS: ReadonlySet<string> = new Set([DATES_MISSING, DATES_REVERSED, DATES_TOO_LONG])

/** The problem with the draft in the owner's words, or '' when it can be sent. */
export function validateWorkDays(draft: BulkDeclarationDraft): string {
  const { from, to } = draft
  if (!from || !to) return DATES_MISSING
  const start = toTime(from)
  const end = toTime(to)
  if (start !== null && end !== null) {
    if (end < start) return DATES_REVERSED
    if (end - start >= MAX_BULK_DAYS * DAY_MS) return DATES_TOO_LONG
  }
  const problem = validateBulkDeclaration(draft)
  if (problem) return problem
  if (workDates(from, to, draft.weekdays).length === 0) return 'Ningún día del período cae en los días elegidos. Elegí otros días o otro período.'
  return ''
}

export type BulkResultSummary = {
  created: number; skipped: number; existing: number
  noSchedule: { count: number; names: string[] }; inactiveSchedule: { count: number; names: string[] }
}

/** Counts by reason instead of one row per skipped date; names appear once each. */
export function summarizeBulkResult(result: BulkDeclarationResult, nameOf: (employeeId: string) => string): BulkResultSummary {
  const group = (reason: string) => {
    const items = result.skipped.filter((item) => item.reason === reason)
    return { count: items.length, names: [...new Set(items.map((item) => nameOf(item.employeeId)))] }
  }
  return {
    created: result.created.length, skipped: result.skipped.length,
    existing: result.skipped.filter((item) => item.reason === 'JORNADA_EXISTS').length,
    noSchedule: group('TEMPLATE_REQUIRED'), inactiveSchedule: group('TEMPLATE_INVALID')
  }
}
