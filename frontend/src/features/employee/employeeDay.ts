import type { Deviation, Jornada, Mark, MarkAction, TemplateBlock } from '../../shared/api/types'
import { confirmedMark, forEmployee, markButtonLabel, markWithArticle } from '../../shared/labels'

// The words live in shared/labels.ts; these names stay for the files that import them from here.
export const actionLabel = markButtonLabel
/** What a recorded mark is called in the list of the day. */
export const markName = forEmployee.mark

const MINUTE = 60_000
/** From this long before the end of the shift the exit becomes the suggested mark. */
const EXIT_SUGGESTION_MS = 30 * MINUTE

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
function countedMarks(jornada: Jornada): Mark[] {
  return jornada.marks.filter((mark) => !mark.voided).sort((a, b) => a.sequence - b.sequence)
}

export function allowedActions(jornada: Jornada): MarkAction[] {
  if (jornada.state === 'EGRESADA' || jornada.state === 'CANCELADA') return []
  if (jornada.state === 'NO_INGRESO') return ['INGRESO']
  const marks = countedMarks(jornada)
  if (jornada.state === 'PAUSA_ABIERTA') {
    const last = marks[marks.length - 1]
    if (last?.action === 'SALIDA_DESAYUNO') return ['VUELTA_DESAYUNO']
    if (last?.action === 'SALIDA_ALMUERZO') return ['VUELTA_ALMUERZO']
    return []
  }
  const marked = new Set(marks.map((mark) => mark.action))
  const actions: MarkAction[] = []
  if (!marked.has('SALIDA_DESAYUNO')) actions.push('SALIDA_DESAYUNO')
  if (!marked.has('SALIDA_ALMUERZO')) actions.push('SALIDA_ALMUERZO')
  actions.push('EGRESO')
  return actions
}

export type MarkOptions = { primary: MarkAction | null; others: MarkAction[]; exit: MarkAction | null }

/** One big suggested mark; the other allowed pauses smaller; the exit last and apart unless it is the suggestion. */
export function markOptions(jornada: Jornada, timeZone: string, now: Date): MarkOptions {
  const allowed = allowedActions(jornada)
  if (allowed.length <= 1) return { primary: allowed[0] ?? null, others: [], exit: null }
  const end = scheduledEnd(jornada, timeZone)
  const pauses = allowed.filter((action) => action !== 'EGRESO')
  const limitOf = (action: MarkAction) => action === 'SALIDA_DESAYUNO' ? jornada.scheduleSnapshot.breakfastLimitMinutes : jornada.scheduleSnapshot.lunchLimitMinutes
  const nearEnd = end !== null && now.getTime() >= end.getTime() - EXIT_SUGGESTION_MS
  const primary: MarkAction = nearEnd ? 'EGRESO' : pauses.find((action) => limitOf(action) > 0) ?? pauses[0] ?? 'EGRESO'
  return { primary, others: pauses.filter((action) => action !== primary), exit: primary === 'EGRESO' ? null : 'EGRESO' }
}

/** Question shown before an exit marked earlier than the end of the shift; null when no confirmation is needed. */
export function exitConfirmation(jornada: Jornada, timeZone: string, now: Date): string | null {
  const end = scheduledEnd(jornada, timeZone)
  if (!end || now.getTime() >= end.getTime()) return null
  return `¿Terminás tu día ahora? Tu horario termina a las ${formatTime(end, timeZone)}.`
}

/** The state of today in one sentence. */
export function daySentence(jornada: Jornada | undefined, timeZone: string | undefined, now: Date): string {
  if (!jornada) return 'Hoy no tenés un día de trabajo cargado. Si tenés que trabajar, avisale a tu encargado.'
  const marks = countedMarks(jornada)
  switch (jornada.state) {
    case 'NO_INGRESO': return 'Todavía no marcaste tu entrada.'
    case 'EGRESADA': return 'Ya terminaste tu día.'
    case 'CANCELADA': return 'Tu encargado canceló este día: no tenés que marcar.'
    case 'PAUSA_ABIERTA': {
      const last = marks[marks.length - 1]
      const breakfast = last?.action === 'SALIDA_DESAYUNO'
      if (!last || (!breakfast && last.action !== 'SALIDA_ALMUERZO')) return 'Estás en una pausa.'
      const limit = breakfast ? jornada.scheduleSnapshot.breakfastLimitMinutes : jornada.scheduleSnapshot.lunchLimitMinutes
      const back = new Date(new Date(markInstant(last)).getTime() + limit * MINUTE)
      const doing = breakfast ? 'Estás desayunando' : 'Estás almorzando'
      return now.getTime() <= back.getTime()
        ? `${doing}: volvé antes de las ${formatTime(back, timeZone)}.`
        : `${doing}: tenías que volver a las ${formatTime(back, timeZone)}.`
    }
    case 'EN_CURSO': {
      const entry = marks.find((mark) => mark.action === 'INGRESO')
      return entry ? `Estás trabajando desde las ${formatTime(markInstant(entry), timeZone)}.` : 'Estás trabajando.'
    }
  }
}

export function confirmationText(action: MarkAction, acceptedAt: string, timeZone?: string): string {
  return `Listo: ${confirmedMark[action]} quedó registrada a las ${formatTime(acceptedAt, timeZone)}.`
}

/** Short location state of a mark in the list of the day; '' when there is nothing useful to say. */
export function markLocationLabel(status: Mark['locationStatus']): string {
  if (status === 'RECIBIDA') return 'Ubicación enviada'
  if (status === 'PENDIENTE') return 'Enviando ubicación…'
  if (status === 'SIN_UBICACION') return 'Sin ubicación'
  return ''
}

export type LocationOutcome = 'PENDING' | 'SENT' | 'MISSING'
export const locationOutcomeText: Record<LocationOutcome, string> = {
  PENDING: 'Enviando ubicación… no cierres la app.',
  /** The view adds a decorative ✔ after it. */
  SENT: 'Ubicación enviada',
  MISSING: 'No llegó tu ubicación: puede figurar como fuera del local. Revisá que el celular tenga la ubicación activada.'
}

export const deviationName = forEmployee.deviation

function minutesWord(minutes: number) { return minutes === 1 ? '1 minuto' : `${minutes} minutos` }

function pauseMinutes(jornada: Jornada, out: MarkAction, back: MarkAction): number | null {
  const marks = countedMarks(jornada)
  const start = marks.find((mark) => mark.action === out)
  const end = marks.find((mark) => mark.action === back)
  if (!start || !end) return null
  return Math.round((new Date(markInstant(end)).getTime() - new Date(markInstant(start)).getTime()) / MINUTE)
}

/**
 * What happened, in words. `jornada` is the day of the deviation when it is loaded on screen; without it the sentence uses only
 * the time of the fact (occurredAt, or the detection time when the server sends none).
 */
export function describeDeviation(item: Deviation, jornada: Jornada | undefined, timeZone?: string): string {
  const fact = item.occurredAt ?? item.createdAt
  const factTime = formatTime(fact, timeZone)
  const factMs = new Date(fact).getTime()
  const start = jornada && timeZone ? scheduledStart(jornada, timeZone) : null
  const end = jornada && timeZone ? scheduledEnd(jornada, timeZone) : null
  switch (item.type) {
    case 'SIN_INGRESO':
      return start ? `No marcaste tu entrada (tu horario empezaba a las ${formatTime(start, timeZone)}).` : 'No marcaste tu entrada.'
    case 'LLEGADA_TARDE': {
      const late = start ? Math.round((factMs - start.getTime()) / MINUTE) : 0
      return start && late > 0 ? `Llegaste ${minutesWord(late)} tarde (tu entrada era ${formatTime(start, timeZone)}).` : `Llegaste tarde: marcaste la entrada a las ${factTime}.`
    }
    case 'EGRESO_TEMPRANO': {
      const early = end ? Math.round((end.getTime() - factMs) / MINUTE) : 0
      return end && early > 0 ? `Saliste ${minutesWord(early)} antes (tu salida era ${formatTime(end, timeZone)}).` : `Marcaste la salida antes de tu horario, a las ${factTime}.`
    }
    case 'EGRESO_TARDIO': {
      const after = end ? Math.round((factMs - end.getTime()) / MINUTE) : 0
      return end && after > 0
        ? `Marcaste la salida ${minutesWord(after)} después de tu horario (tu salida era ${formatTime(end, timeZone)}).`
        : `Marcaste la salida después de tu horario, a las ${factTime}.`
    }
    case 'MARCA_FALTANTE':
      return end ? `No marcaste tu salida (tu salida era ${formatTime(end, timeZone)}).` : 'No marcaste tu salida.'
    case 'EXCESO_DESAYUNO': {
      const minutes = jornada ? pauseMinutes(jornada, 'SALIDA_DESAYUNO', 'VUELTA_DESAYUNO') : null
      return minutes !== null && jornada ? `Tu desayuno duró ${minutesWord(minutes)} y tenías ${jornada.scheduleSnapshot.breakfastLimitMinutes}.` : 'Tu desayuno duró más de lo que tenías.'
    }
    case 'EXCESO_ALMUERZO': {
      const minutes = jornada ? pauseMinutes(jornada, 'SALIDA_ALMUERZO', 'VUELTA_ALMUERZO') : null
      return minutes !== null && jornada ? `Tu almuerzo duró ${minutesWord(minutes)} y tenías ${jornada.scheduleSnapshot.lunchLimitMinutes}.` : 'Tu almuerzo duró más de lo que tenías.'
    }
    case 'FUERA_DE_SEDE':
      return item.sourceMarkAction ? `Marcaste ${markWithArticle[item.sourceMarkAction]} fuera del local, a las ${factTime}.` : `Una marca quedó fuera del local, a las ${factTime}.`
  }
}
