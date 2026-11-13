import type { Deviation, Jornada, MarkAction } from './api/types'
import { formatDuration } from './format'
import { countedMarks, formatTime, markInstant, scheduledEnd, scheduledStart } from './jornadaTime'
import { markWithArticle } from './labels'

/**
 * Who reads the facts of a case (D-20261111-03): the employee about themselves («Llegaste…»), the ADMIN about the employee
 * («Llegó…»). Issue #177: the ADMIN decided a case with less than the employee read; both now read the same facts.
 */
export type FactReader = 'employee' | 'admin'

type Words = {
  /** «No marcaste» / «No marcó». */ didNotMark: string
  /** «Llegaste» / «Llegó». */ arrived: string
  /** «Saliste» / «Salió». */ left: string
  /** «Marcaste» / «Marcó». */ marked: string
  /** «tu» / «su». */ own: string
  /** «Tu» / «Su», starting a sentence. */ Own: string
  /** «tenías» / «tenía». */ had: string
}
const WORDS: Record<FactReader, Words> = {
  employee: { didNotMark: 'No marcaste', arrived: 'Llegaste', left: 'Saliste', marked: 'Marcaste', own: 'tu', Own: 'Tu', had: 'tenías' },
  admin: { didNotMark: 'No marcó', arrived: 'Llegó', left: 'Salió', marked: 'Marcó', own: 'su', Own: 'Su', had: 'tenía' }
}

const MINUTE = 60_000

function pauseMinutes(jornada: Jornada, out: MarkAction, back: MarkAction): number | null {
  const marks = countedMarks(jornada)
  const start = marks.find((mark) => mark.action === out)
  const end = marks.find((mark) => mark.action === back)
  if (!start || !end) return null
  // The server flags a pause longer than its limit by any amount (DeviationPolicy.pause): a started minute counts, so a long
  // pause never reads as long as its limit (T12).
  return Math.ceil((new Date(markInstant(end)).getTime() - new Date(markInstant(start)).getTime()) / MINUTE)
}

/** «Tu desayuno duró 25 minutos y tenías 15.»: the limit takes its unit once either side reaches an hour («y tenías 1 hora»). */
function pauseSentence(words: Words, pause: string, minutes: number, limit: number): string {
  const allowed = minutes >= 60 || limit >= 60 ? formatDuration(limit) : String(limit)
  return `${words.Own} ${pause} duró ${formatDuration(minutes)} y ${words.had} ${allowed}.`
}

/**
 * What happened, in words, for the person who reads it. `jornada` is the day of the case when it is loaded on screen; without it
 * the sentence uses only the time of the fact (occurredAt, or the detection time when the server sends none).
 */
export function describeDeviation(item: Deviation, jornada: Jornada | undefined, timeZone?: string, reader: FactReader = 'employee'): string {
  const words = WORDS[reader]
  const fact = item.occurredAt ?? item.createdAt
  const factTime = formatTime(fact, timeZone)
  const factMs = new Date(fact).getTime()
  const start = jornada && timeZone ? scheduledStart(jornada, timeZone) : null
  const end = jornada && timeZone ? scheduledEnd(jornada, timeZone) : null
  const marked = words.marked.toLowerCase()
  switch (item.type) {
    case 'SIN_INGRESO':
      return start ? `${words.didNotMark} ${words.own} entrada (${words.own} horario empezaba a las ${formatTime(start, timeZone)}).` : `${words.didNotMark} ${words.own} entrada.`
    case 'LLEGADA_TARDE': {
      const late = start ? Math.round((factMs - start.getTime()) / MINUTE) : 0
      return start && late > 0
        ? `${words.arrived} ${formatDuration(late)} tarde (${words.own} entrada era ${formatTime(start, timeZone)}).`
        : `${words.arrived} tarde: ${marked} la entrada a las ${factTime}.`
    }
    case 'EGRESO_TEMPRANO': {
      const early = end ? Math.round((end.getTime() - factMs) / MINUTE) : 0
      return end && early > 0
        ? `${words.left} ${formatDuration(early)} antes (${words.own} salida era ${formatTime(end, timeZone)}).`
        : `${words.marked} la salida antes de ${words.own} horario, a las ${factTime}.`
    }
    case 'EGRESO_TARDIO': {
      const after = end ? Math.round((factMs - end.getTime()) / MINUTE) : 0
      return end && after > 0
        ? `${words.marked} la salida ${formatDuration(after)} después de ${words.own} horario (${words.own} salida era ${formatTime(end, timeZone)}).`
        : `${words.marked} la salida después de ${words.own} horario, a las ${factTime}.`
    }
    case 'MARCA_FALTANTE':
      return end ? `${words.didNotMark} ${words.own} salida (${words.own} salida era ${formatTime(end, timeZone)}).` : `${words.didNotMark} ${words.own} salida.`
    case 'EXCESO_DESAYUNO': {
      const minutes = jornada ? pauseMinutes(jornada, 'SALIDA_DESAYUNO', 'VUELTA_DESAYUNO') : null
      return minutes !== null && jornada ? pauseSentence(words, 'desayuno', minutes, jornada.scheduleSnapshot.breakfastLimitMinutes) : `${words.Own} desayuno duró más de lo que ${words.had}.`
    }
    case 'EXCESO_ALMUERZO': {
      const minutes = jornada ? pauseMinutes(jornada, 'SALIDA_ALMUERZO', 'VUELTA_ALMUERZO') : null
      return minutes !== null && jornada ? pauseSentence(words, 'almuerzo', minutes, jornada.scheduleSnapshot.lunchLimitMinutes) : `${words.Own} almuerzo duró más de lo que ${words.had}.`
    }
    case 'FUERA_DE_SEDE':
      return item.sourceMarkAction ? `${words.marked} ${markWithArticle[item.sourceMarkAction]} fuera del local, a las ${factTime}.` : `Una marca quedó fuera del local, a las ${factTime}.`
  }
}
