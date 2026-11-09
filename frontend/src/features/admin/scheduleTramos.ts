import type { TemplateBlock } from '../../shared/api/types'

/** A tramo as the owner types it: the time it starts and the time it ends, without days. */
export type Tramo = { start: string; end: string }
export type TramoErrors = { start?: string; end?: string }
export type DayOffsets = Pick<TemplateBlock, 'startDayOffset' | 'endDayOffset'>
export type TramoComputation = { blocks: TemplateBlock[]; errors: TramoErrors[]; valid: boolean }

export const MAX_TRAMOS = 4
const DAY = 24 * 60
export const NEXT_DAY_LIMIT_MESSAGE = 'Un horario no puede pasar del día siguiente.'
const overlapMessage = (index: number) => `El tramo ${index + 1} empieza antes de que termine el ${index}.`

export type ScheduleTypeId = 'corrido' | 'cortado' | 'noche'
export const SCHEDULE_TYPES: { id: ScheduleTypeId; title: string; description: string; tramos: Tramo[] }[] = [
  { id: 'corrido', title: 'Corrido', description: 'De 09:00 a 17:00', tramos: [{ start: '09:00', end: '17:00' }] },
  { id: 'cortado', title: 'Cortado', description: 'De 09:00 a 13:00 y de 17:00 a 21:00', tramos: [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '21:00' }] },
  { id: 'noche', title: 'De noche', description: 'De 22:00 a 06:00 del día siguiente', tramos: [{ start: '22:00', end: '06:00' }] }
]

/** Minutes since midnight of an HH:MM or HH:MM:SS time, or null when it is not a valid time. */
export function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const [hours, minutes, seconds] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return hours * 60 + minutes + seconds / 60
}

/** The API returns HH:MM:SS; the editor works with HH:MM unless the seconds matter. */
export function clockInput(value: string): string {
  return /^\d{2}:\d{2}:00$/.test(value) ? value.slice(0, 5) : value
}

function clockText(minutes: number): string {
  const normalized = ((Math.round(minutes) % DAY) + DAY) % DAY
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function missingTimes(tramo: Tramo): TramoErrors {
  const errors: TramoErrors = {}
  if (clockMinutes(tramo.start) === null) errors.start = 'Elegí a qué hora entra.'
  if (clockMinutes(tramo.end) === null) errors.end = 'Elegí a qué hora sale.'
  return errors
}

/**
 * Days of each tramo with the rules OrganizationService.validateTemplate checks: the first tramo starts on day 0, a tramo
 * that ends at or before its start ends the next day, a tramo that starts before the previous one ended starts the next
 * day, and nothing goes past the next day. A tramo only moves to the next day while the whole schedule stays within 24 hours
 * of its first start (assumption, stricter than the server): 09:00-13:00 then 12:00-16:00 is a typing mistake, not a
 * 31-hour schedule.
 */
export function computeTramos(tramos: Tramo[]): TramoComputation {
  const errors: TramoErrors[] = tramos.map(missingTimes)
  const blocks: TemplateBlock[] = []
  let previous: { day: number; minutes: number } | null = null
  let firstStart = 0
  let broken = false
  tramos.forEach((tramo, index) => {
    const start = clockMinutes(tramo.start)
    const end = clockMinutes(tramo.end)
    if (start === null || end === null || broken) {
      blocks.push({ startDayOffset: 0, start: tramo.start, end: tramo.end, endDayOffset: 0 })
      broken = true
      return
    }
    let startDay = 0
    if (previous) {
      startDay = start >= previous.minutes ? previous.day : previous.day + 1
      if (startDay > 1 || startDay * DAY + start - firstStart >= DAY) {
        errors[index].start = overlapMessage(index)
        blocks.push({ startDayOffset: 0, start: tramo.start, end: tramo.end, endDayOffset: 0 })
        broken = true
        return
      }
    } else firstStart = start
    const endDay = end > start ? startDay : startDay + 1
    if (endDay > 1) {
      errors[index].end = NEXT_DAY_LIMIT_MESSAGE
      broken = true
    }
    blocks.push({ startDayOffset: startDay as 0 | 1, start: tramo.start, end: tramo.end, endDayOffset: Math.min(endDay, 1) as 0 | 1 })
    previous = { day: endDay, minutes: end }
  })
  const valid = tramos.length >= 1 && tramos.length <= MAX_TRAMOS && errors.every((entry) => !entry.start && !entry.end)
  return { blocks, errors, valid }
}

/** Hand-typed days of a saved template (Opciones avanzadas), checked with the same rules as the server. */
export function validateManualBlocks(blocks: TemplateBlock[]): TramoErrors[] {
  const errors = blocks.map(missingTimes)
  let previous: { day: number; minutes: number } | null = null
  blocks.forEach((block, index) => {
    const start = clockMinutes(block.start)
    const end = clockMinutes(block.end)
    if (start === null || end === null) return
    if (index === 0 && block.startDayOffset !== 0) errors[index].start = 'El primer tramo tiene que empezar el mismo día.'
    if (block.endDayOffset < block.startDayOffset || (block.endDayOffset === block.startDayOffset && end <= start)) {
      errors[index].end = 'Tiene que salir después de entrar. Si sale al otro día, elegí «Día siguiente».'
    }
    if (previous && (block.startDayOffset < previous.day || (block.startDayOffset === previous.day && start < previous.minutes))) {
      errors[index].start ??= overlapMessage(index)
    }
    previous = { day: block.endDayOffset, minutes: end }
  })
  return errors
}

/** The blocks to send: computed days, or the hand-typed ones of a legacy template when manual is given. */
export function draftBlocks(tramos: Tramo[], manual: DayOffsets[] | null): TramoComputation {
  if (!manual) return computeTramos(tramos)
  const blocks = tramos.map((tramo, index) => ({ startDayOffset: manual[index]?.startDayOffset ?? 0, start: tramo.start, end: tramo.end, endDayOffset: manual[index]?.endDayOffset ?? 0 }))
  const errors = validateManualBlocks(blocks)
  const valid = blocks.length >= 1 && blocks.length <= MAX_TRAMOS && errors.every((entry) => !entry.start && !entry.end)
  return { blocks, errors, valid }
}

export function tramosFromBlocks(blocks: TemplateBlock[]): Tramo[] {
  return blocks.map((block) => ({ start: clockInput(block.start), end: clockInput(block.end) }))
}

/** True when the computation gives back the saved days, so the owner never needs to see them. */
export function offsetsAreComputed(blocks: TemplateBlock[]): boolean {
  const computed = computeTramos(tramosFromBlocks(blocks))
  return computed.valid && computed.blocks.every((block, index) => block.startDayOffset === blocks[index].startDayOffset && block.endDayOffset === blocks[index].endDayOffset)
}

export function tramoHints(block: TemplateBlock): TramoErrors {
  const hints: TramoErrors = {}
  if (block.startDayOffset === 1) hints.start = `Entra al día siguiente (${clockInput(block.start).slice(0, 5)}).`
  if (block.endDayOffset === 1) hints.end = `Sale al día siguiente (${clockInput(block.end).slice(0, 5)}).`
  return hints
}

function pauseChip(minutes: number, meal: 'desayuno' | 'almuerzo'): string {
  if (minutes === 0) return meal === 'desayuno' ? 'sin tiempo para desayunar' : 'sin tiempo para almorzar'
  return `${meal} hasta ${minutes} min`
}

/** The schedule in short chips: each tramo and the pause limits (left out while not a valid number), without total hours. */
export function scheduleChips(blocks: TemplateBlock[], breakfastMinutes: number | null, lunchMinutes: number | null): string[] {
  const tramos = blocks.map((block) => {
    const range = `${clockInput(block.start).slice(0, 5)}–${clockInput(block.end).slice(0, 5)}`
    if (block.startDayOffset === 1) return `${range} (al día siguiente)`
    return block.endDayOffset === 1 ? `${range} (sale al día siguiente)` : range
  })
  return [
    ...tramos,
    ...(breakfastMinutes === null ? [] : [pauseChip(breakfastMinutes, 'desayuno')]),
    ...(lunchMinutes === null ? [] : [pauseChip(lunchMinutes, 'almuerzo')])
  ]
}

/** A new tramo one hour after the previous one ends, four hours long. */
export function nextTramo(previous: Tramo | undefined): Tramo {
  const previousEnd = previous ? clockMinutes(previous.end) : null
  const start = previousEnd === null ? 14 * 60 : previousEnd + 60
  return { start: clockText(start), end: clockText(start + 4 * 60) }
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}
