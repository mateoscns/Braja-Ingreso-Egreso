import { describe, expect, it } from 'vitest'
import type { Deviation, Jornada, Mark } from '../../shared/api/types'
import {
  allowedActions, confirmationText, daySentence, daySlots, describeDeviation, exitConfirmation, markOptions, markLocationLabel, pauseAllowance, scheduledEnd,
  scheduledStart, zonedInstant
} from './employeeDay'

const timeZone = 'America/Argentina/Buenos_Aires'

function mark(action: Mark['action'], acceptedAt: string, sequence: number, extra: Partial<Mark> = {}): Mark {
  return { id: `mark-${sequence}`, jornadaId: 'j-1', action, sequence, acceptedAt, locationStatus: 'RECIBIDA', ...extra }
}

function jornada(state: Jornada['state'], marks: Mark[] = [], blocks: Jornada['scheduleSnapshot']['blocks'] = [{ startDayOffset: 0, start: '08:00', end: '17:00', endDayOffset: 0 }]): Jornada {
  return {
    id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-11-09', state, toleranceMinutes: 5, sequence: 1, marks,
    scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks, breakfastLimitMinutes: 15, lunchLimitMinutes: 45 }
  }
}

const at = (iso: string) => new Date(iso)

// 2026-11-13, Mateo: before going to lunch the person did not know how long the lunch was; only the return time, once out.
describe('pauseAllowance', () => {
  const limits = (breakfastLimitMinutes: number, lunchLimitMinutes: number): Jornada => {
    const base = jornada('EN_CURSO')
    return { ...base, scheduleSnapshot: { ...base.scheduleSnapshot, breakfastLimitMinutes, lunchLimitMinutes } }
  }

  it('says the minutes of breakfast and of lunch of the schedule of the day', () => {
    expect(pauseAllowance(limits(15, 45))).toBe('Tenés 15 minutos de desayuno y 45 minutos de almuerzo.')
  })

  it('reads an hour or more in hours, like every other duration of the app', () => {
    expect(pauseAllowance(limits(15, 60))).toBe('Tenés 15 minutos de desayuno y 1 hora de almuerzo.')
    expect(pauseAllowance(limits(0, 90))).toBe('Tenés 1 h 30 min de almuerzo.')
    expect(pauseAllowance(limits(0, 240))).toBe('Tenés 4 horas de almuerzo.')
  })

  it('names only the pause the schedule gives, and nothing when it gives none', () => {
    expect(pauseAllowance(limits(0, 45))).toBe('Tenés 45 minutos de almuerzo.')
    expect(pauseAllowance(limits(15, 0))).toBe('Tenés 15 minutos de desayuno.')
    expect(pauseAllowance(limits(0, 0))).toBeNull()
  })

  it('says one minute in the singular', () => {
    expect(pauseAllowance(limits(1, 0))).toBe('Tenés 1 minuto de desayuno.')
    expect(pauseAllowance(limits(0, 1))).toBe('Tenés 1 minuto de almuerzo.')
  })
})

describe('zonedInstant', () => {
  it('turns a wall-clock time of the site into the instant, also on the next day', () => {
    expect(zonedInstant('2026-11-09', 0, '08:00', timeZone).toISOString()).toBe('2026-11-09T11:00:00.000Z')
    expect(zonedInstant('2026-11-09', 1, '06:00:00', timeZone).toISOString()).toBe('2026-11-10T09:00:00.000Z')
  })

  it('follows daylight saving time of the zone', () => {
    // Santiago is UTC-3 in summer (November) and UTC-4 in winter (June).
    expect(zonedInstant('2026-11-09', 0, '08:00', 'America/Santiago').toISOString()).toBe('2026-11-09T11:00:00.000Z')
    expect(zonedInstant('2026-06-09', 0, '08:00', 'America/Santiago').toISOString()).toBe('2026-06-09T12:00:00.000Z')
  })

  it('takes the first and last tramo of the schedule', () => {
    const split = jornada('NO_INGRESO', [], [{ startDayOffset: 0, start: '16:00', end: '20:00', endDayOffset: 0 }, { startDayOffset: 0, start: '08:00', end: '12:00', endDayOffset: 0 }])
    expect(scheduledStart(split, timeZone)?.toISOString()).toBe('2026-11-09T11:00:00.000Z')
    expect(scheduledEnd(split, timeZone)?.toISOString()).toBe('2026-11-09T23:00:00.000Z')
  })
})

describe('allowedActions', () => {
  it('offers breakfast before lunch and the exit last', () => {
    expect(allowedActions(jornada('EN_CURSO', [mark('INGRESO', '2026-11-09T11:02:00Z', 1)]))).toEqual(['SALIDA_DESAYUNO', 'SALIDA_ALMUERZO', 'EGRESO'])
  })

  it('does not count a voided mark', () => {
    const marks = [mark('INGRESO', '2026-11-09T11:02:00Z', 1), mark('SALIDA_DESAYUNO', '2026-11-09T13:00:00Z', 2, { voided: true })]
    expect(allowedActions(jornada('EN_CURSO', marks))).toEqual(['SALIDA_DESAYUNO', 'SALIDA_ALMUERZO', 'EGRESO'])
  })
})

describe('markOptions', () => {
  const working = jornada('EN_CURSO', [mark('INGRESO', '2026-11-09T11:02:00Z', 1)])

  it('suggests the entry when the day has not started', () => {
    expect(markOptions(jornada('NO_INGRESO'), timeZone, at('2026-11-09T10:50:00Z'))).toEqual({ primary: 'INGRESO', others: [], exit: null })
  })

  it('suggests the next pause in order while the shift is far from its end, with the exit apart', () => {
    expect(markOptions(working, timeZone, at('2026-11-09T13:00:00Z'))).toEqual({ primary: 'SALIDA_DESAYUNO', others: ['SALIDA_ALMUERZO'], exit: 'EGRESO' })
  })

  it('suggests the exit from 30 minutes before the end of the shift', () => {
    expect(markOptions(working, timeZone, at('2026-11-09T19:30:00Z'))).toEqual({ primary: 'EGRESO', others: ['SALIDA_DESAYUNO', 'SALIDA_ALMUERZO'], exit: null })
  })

  it('suggests the return during an open pause', () => {
    const pause = jornada('PAUSA_ABIERTA', [mark('INGRESO', '2026-11-09T11:02:00Z', 1), mark('SALIDA_ALMUERZO', '2026-11-09T15:00:00Z', 2)])
    expect(markOptions(pause, timeZone, at('2026-11-09T15:10:00Z'))).toEqual({ primary: 'VUELTA_ALMUERZO', others: [], exit: null })
  })

  it('offers nothing on a finished or cancelled day', () => {
    expect(markOptions(jornada('EGRESADA'), timeZone, at('2026-11-09T21:00:00Z'))).toEqual({ primary: null, others: [], exit: null })
    expect(markOptions(jornada('CANCELADA'), timeZone, at('2026-11-09T21:00:00Z'))).toEqual({ primary: null, others: [], exit: null })
  })
})

describe('daySentence', () => {
  it('says what is going on today in one sentence', () => {
    expect(daySentence(undefined, timeZone, at('2026-11-09T12:00:00Z'))).toBe('Hoy no tenés un día de trabajo cargado. Si tenés que trabajar, avisale a tu encargado.')
    expect(daySentence(jornada('NO_INGRESO'), timeZone, at('2026-11-09T10:50:00Z'))).toBe('Todavía no marcaste tu entrada.')
    expect(daySentence(jornada('EN_CURSO', [mark('INGRESO', '2026-11-09T11:02:00Z', 1)]), timeZone, at('2026-11-09T12:00:00Z'))).toBe('Estás trabajando desde las 08:02.')
    expect(daySentence(jornada('EGRESADA'), timeZone, at('2026-11-09T21:00:00Z'))).toBe('Ya terminaste tu día.')
    expect(daySentence(jornada('CANCELADA'), timeZone, at('2026-11-09T21:00:00Z'))).toBe('Tu encargado canceló este día: no tenés que marcar.')
  })

  it('tells until when an open pause lasts, and when that time already passed', () => {
    const breakfast = jornada('PAUSA_ABIERTA', [mark('INGRESO', '2026-11-09T11:02:00Z', 1), mark('SALIDA_DESAYUNO', '2026-11-09T13:05:00Z', 2)])
    expect(daySentence(breakfast, timeZone, at('2026-11-09T13:10:00Z'))).toBe('Estás desayunando: volvé antes de las 10:20.')
    expect(daySentence(breakfast, timeZone, at('2026-11-09T13:30:00Z'))).toBe('Estás desayunando: tenías que volver a las 10:20.')
    const lunch = jornada('PAUSA_ABIERTA', [mark('INGRESO', '2026-11-09T11:02:00Z', 1), mark('SALIDA_ALMUERZO', '2026-11-09T16:00:00Z', 2)])
    expect(daySentence(lunch, timeZone, at('2026-11-09T16:10:00Z'))).toBe('Estás almorzando: volvé antes de las 13:45.')
  })

  // 2026-11-10 (#115): a mark the ADMIN loaded or corrected carries the time it happened in occurredAt, and acceptedAt
  // is when it was stored. The employee read the stored time: a day loaded at night said "desde las 21:15".
  it('tells the time a mark happened, not the time the ADMIN stored it', () => {
    const stored = '2026-11-10T00:15:00Z'
    const working = jornada('EN_CURSO', [mark('INGRESO', stored, 1, { occurredAt: '2026-11-09T11:00:00Z' })])
    expect(daySentence(working, timeZone, at('2026-11-09T12:00:00Z'))).toBe('Estás trabajando desde las 08:00.')
    const breakfast = jornada('PAUSA_ABIERTA', [mark('INGRESO', stored, 1, { occurredAt: '2026-11-09T11:00:00Z' }), mark('SALIDA_DESAYUNO', stored, 2, { occurredAt: '2026-11-09T13:05:00Z' })])
    expect(daySentence(breakfast, timeZone, at('2026-11-09T13:10:00Z'))).toBe('Estás desayunando: volvé antes de las 10:20.')
  })
})

describe('exitConfirmation', () => {
  const working = jornada('EN_CURSO', [mark('INGRESO', '2026-11-09T11:02:00Z', 1)])

  it('asks before an exit earlier than the end of the shift', () => {
    expect(exitConfirmation(working, timeZone, at('2026-11-09T18:00:00Z'))).toBe('¿Terminás tu día ahora? Tu horario termina a las 17:00.')
  })

  it('does not ask at or after the end of the shift', () => {
    expect(exitConfirmation(working, timeZone, at('2026-11-09T20:00:00Z'))).toBeNull()
  })
})

describe('confirmationText', () => {
  it('says which mark was recorded and at what time', () => {
    expect(confirmationText('INGRESO', '2026-11-09T11:02:00Z', timeZone)).toBe('Listo: tu entrada quedó registrada a las 08:02.')
    expect(confirmationText('VUELTA_DESAYUNO', '2026-11-09T13:20:00Z', timeZone)).toBe('Listo: tu vuelta del desayuno quedó registrada a las 10:20.')
    expect(confirmationText('EGRESO', '2026-11-09T20:00:00Z', timeZone)).toBe('Listo: tu salida quedó registrada a las 17:00.')
  })
})

describe('markLocationLabel', () => {
  it('names the location state of each mark and hides what does not apply', () => {
    expect(markLocationLabel('RECIBIDA')).toBe('Ubicación enviada')
    expect(markLocationLabel('PENDIENTE')).toBe('Enviando ubicación…')
    expect(markLocationLabel('SIN_UBICACION')).toBe('Sin ubicación')
    expect(markLocationLabel('PURGADA')).toBe('')
    expect(markLocationLabel('NO_APLICA')).toBe('')
  })
})

// Slice D2 (design system 4.14): the day is a sheet of four fixed rows, so the employee sees at a glance what is done and what
// is missing. Times are the site's (UTC-3).
describe('daySlots', () => {
  const row = (day: Jornada, name: string) => daySlots(day, timeZone).find((slot) => slot.name === name)!

  it('siempre devuelve las cuatro filas en el mismo orden, también sin marcas', () => {
    const slots = daySlots(jornada('NO_INGRESO'), timeZone)

    expect(slots.map((slot) => slot.name)).toEqual(['Entrada', 'Desayuno', 'Almuerzo', 'Salida'])
    for (const slot of slots) expect(slot, slot.name).toMatchObject({ times: [], note: null, voided: [] })
  })

  it('una pausa muestra una hora mientras estás afuera y el rango cuando volviste', () => {
    const out = jornada('PAUSA_ABIERTA', [mark('INGRESO', '2026-11-09T11:02:00Z', 1), mark('SALIDA_DESAYUNO', '2026-11-09T12:30:00Z', 2)])
    expect(row(out, 'Desayuno').times).toEqual(['09:30'])

    const back = jornada('EN_CURSO', [...out.marks, mark('VUELTA_DESAYUNO', '2026-11-09T12:48:00Z', 3)])
    expect(row(back, 'Desayuno').times).toEqual(['09:30 a 09:48'])
    expect(row(back, 'Entrada').times).toEqual(['08:02'])
    expect(row(back, 'Almuerzo').times).toEqual([])
  })

  it('una marca anulada nunca llena su fila y queda listada aparte, debajo de su fila', () => {
    const onlyVoided = jornada('NO_INGRESO', [mark('INGRESO', '2026-11-09T11:02:00Z', 1, { voided: true })])
    expect(row(onlyVoided, 'Entrada')).toMatchObject({ times: [], voided: ['08:02'], note: null })

    const replaced = jornada('EN_CURSO', [mark('INGRESO', '2026-11-09T11:02:00Z', 1, { voided: true }), mark('INGRESO', '2026-11-09T11:05:00Z', 2)])
    expect(row(replaced, 'Entrada')).toMatchObject({ times: ['08:05'], voided: ['08:02'] })

    const voidedBreak = jornada('EN_CURSO', [mark('INGRESO', '2026-11-09T11:02:00Z', 1), mark('SALIDA_ALMUERZO', '2026-11-09T15:00:00Z', 2, { voided: true })])
    expect(row(voidedBreak, 'Almuerzo')).toMatchObject({ times: [], voided: ['12:00'] })
  })

  // A mark the ADMIN loaded is stored with no location (NO_APLICA, MarkService.forgottenMark), and acceptedAt is when it was
  // stored: the row shows the declared time and says who loaded it instead of a location line.
  it('una marca que cargó tu encargado muestra la hora declarada y la nota «Cargada por tu encargado»', () => {
    const stored = '2026-11-10T00:15:00Z'
    const loaded = jornada('EGRESADA', [
      mark('INGRESO', stored, 1, { occurredAt: '2026-11-09T11:00:00Z', locationStatus: 'NO_APLICA' }),
      mark('SALIDA_DESAYUNO', '2026-11-09T12:30:00Z', 2), mark('VUELTA_DESAYUNO', stored, 3, { occurredAt: '2026-11-09T12:45:00Z', locationStatus: 'NO_APLICA' }),
      mark('EGRESO', '2026-11-09T19:02:00Z', 4)
    ])

    expect(row(loaded, 'Entrada')).toMatchObject({ times: ['08:00'], note: { kind: 'loaded', text: 'Cargada por tu encargado' } })
    // The two marks of a break differ: the note of the one the ADMIN loaded wins.
    expect(row(loaded, 'Desayuno')).toMatchObject({ times: ['09:30 a 09:45'], note: { kind: 'loaded', text: 'Cargada por tu encargado' } })
    expect(row(loaded, 'Salida')).toMatchObject({ times: ['16:02'], note: { kind: 'sent', text: 'Ubicación enviada' } })
  })

  it('dos marcas del mismo tipo se listan las dos, cada pausa con su rango', () => {
    const twice = jornada('EGRESADA', [
      mark('INGRESO', '2026-11-09T11:00:00Z', 1), mark('SALIDA_DESAYUNO', '2026-11-09T12:00:00Z', 2), mark('VUELTA_DESAYUNO', '2026-11-09T12:15:00Z', 3),
      mark('SALIDA_DESAYUNO', '2026-11-09T15:00:00Z', 4), mark('VUELTA_DESAYUNO', '2026-11-09T15:10:00Z', 5),
      mark('EGRESO', '2026-11-09T19:00:00Z', 6), mark('EGRESO', '2026-11-09T19:05:00Z', 7, { locationStatus: 'NO_APLICA' })
    ])

    expect(row(twice, 'Desayuno').times).toEqual(['09:00 a 09:15', '12:00 a 12:10'])
    expect(row(twice, 'Salida').times).toEqual(['16:00', '16:05'])
  })

  it('la nota de ubicación de una fila es una sola línea: enviando, sin ubicación o enviada', () => {
    const note = (statuses: Mark['locationStatus'][]) => {
      const out = mark('SALIDA_ALMUERZO', '2026-11-09T15:00:00Z', 2, { locationStatus: statuses[0] })
      const back = statuses[1] ? [mark('VUELTA_ALMUERZO', '2026-11-09T15:40:00Z', 3, { locationStatus: statuses[1] })] : []
      return row(jornada('EN_CURSO', [mark('INGRESO', '2026-11-09T11:00:00Z', 1), out, ...back]), 'Almuerzo').note
    }

    expect(note(['RECIBIDA', 'PENDIENTE'])).toEqual({ kind: 'pending', text: 'Enviando ubicación…' })
    expect(note(['SIN_UBICACION', 'RECIBIDA'])).toEqual({ kind: 'missing', text: 'Sin ubicación' })
    expect(note(['RECIBIDA', 'RECIBIDA'])).toEqual({ kind: 'sent', text: 'Ubicación enviada' })
    // Purged after 90 days: nothing useful to say.
    expect(note(['PURGADA', 'RECIBIDA'])).toBeNull()
  })
})

describe('describeDeviation', () => {
  const base: Deviation = { id: 'd-1', jornadaId: 'j-1', type: 'LLEGADA_TARDE', status: 'MOTIVO_PENDIENTE', createdAt: '2026-11-09T11:30:00Z', occurredAt: '2026-11-09T11:18:00Z', pushEligible: true }

  it('counts the minutes against the schedule of a loaded day', () => {
    expect(describeDeviation(base, jornada('EN_CURSO'), timeZone)).toBe('Llegaste 18 minutos tarde (tu entrada era 08:00).')
    expect(describeDeviation({ ...base, type: 'EGRESO_TEMPRANO', occurredAt: '2026-11-09T19:40:00Z' }, jornada('EGRESADA'), timeZone)).toBe('Saliste 20 minutos antes (tu salida era 17:00).')
    expect(describeDeviation({ ...base, type: 'EGRESO_TARDIO', occurredAt: '2026-11-09T21:01:00Z' }, jornada('EGRESADA'), timeZone)).toBe('Marcaste la salida 1 h 1 min después de tu horario (tu salida era 17:00).')
  })

  // Issue #177: «Saliste 449 minutos antes» was hard to read; from an hour on, hours and minutes.
  it('says a long difference in hours and minutes', () => {
    expect(describeDeviation({ ...base, type: 'EGRESO_TEMPRANO', occurredAt: '2026-11-09T12:31:00Z' }, jornada('EGRESADA'), timeZone)).toBe('Saliste 7 h 29 min antes (tu salida era 17:00).')
    expect(describeDeviation({ ...base, occurredAt: '2026-11-09T13:00:00Z' }, jornada('EN_CURSO'), timeZone)).toBe('Llegaste 2 horas tarde (tu entrada era 08:00).')
  })

  it('measures a long pause from its marks', () => {
    const marks = [mark('INGRESO', '2026-11-09T11:00:00Z', 1), mark('SALIDA_DESAYUNO', '2026-11-09T13:00:00Z', 2), mark('VUELTA_DESAYUNO', '2026-11-09T13:25:00Z', 3)]
    expect(describeDeviation({ ...base, type: 'EXCESO_DESAYUNO' }, jornada('EN_CURSO', marks), timeZone)).toBe('Tu desayuno duró 25 minutos y tenías 15.')
  })

  // T12 (#114, 2026-11-12): the server flags a pause longer than its limit, even by seconds (DeviationPolicy.pause), and the
  // minutes were rounded: «Tu almuerzo duró 45 minutos y tenías 45.» A started minute counts.
  it('counts a started minute of a long pause, so it never reads as long as its limit', () => {
    const marks = [mark('INGRESO', '2026-11-09T11:00:00Z', 1), mark('SALIDA_ALMUERZO', '2026-11-09T15:00:00Z', 2), mark('VUELTA_ALMUERZO', '2026-11-09T15:45:20Z', 3)]
    expect(describeDeviation({ ...base, type: 'EXCESO_ALMUERZO' }, jornada('EN_CURSO', marks), timeZone)).toBe('Tu almuerzo duró 46 minutos y tenías 45.')
    const exact = [mark('INGRESO', '2026-11-09T11:00:00Z', 1), mark('SALIDA_DESAYUNO', '2026-11-09T13:00:00Z', 2), mark('VUELTA_DESAYUNO', '2026-11-09T13:16:00Z', 3)]
    expect(describeDeviation({ ...base, type: 'EXCESO_DESAYUNO' }, jornada('EN_CURSO', exact), timeZone)).toBe('Tu desayuno duró 16 minutos y tenías 15.')
  })

  // 2026-11-10 (#115): both marks of a pause the ADMIN loaded are stored at the same moment.
  it('measures a pause the ADMIN loaded from the times it happened', () => {
    const stored = '2026-11-10T00:15:00Z'
    const marks = [
      mark('INGRESO', stored, 1, { occurredAt: '2026-11-09T11:00:00Z' }), mark('SALIDA_DESAYUNO', stored, 2, { occurredAt: '2026-11-09T13:00:00Z' }),
      mark('VUELTA_DESAYUNO', stored, 3, { occurredAt: '2026-11-09T13:25:00Z' })
    ]
    expect(describeDeviation({ ...base, type: 'EXCESO_DESAYUNO' }, jornada('EN_CURSO', marks), timeZone)).toBe('Tu desayuno duró 25 minutos y tenías 15.')
  })

  it('falls back to the time of the fact when the day is not loaded', () => {
    expect(describeDeviation(base, undefined, timeZone)).toBe('Llegaste tarde: marcaste la entrada a las 08:18.')
    expect(describeDeviation({ ...base, type: 'SIN_INGRESO' }, undefined, timeZone)).toBe('No marcaste tu entrada.')
    expect(describeDeviation({ ...base, type: 'MARCA_FALTANTE' }, undefined, timeZone)).toBe('No marcaste tu salida.')
    expect(describeDeviation({ ...base, type: 'EXCESO_ALMUERZO' }, undefined, timeZone)).toBe('Tu almuerzo duró más de lo que tenías.')
  })

  it('names the mark that was outside the shop, without sequence numbers', () => {
    expect(describeDeviation({ ...base, type: 'FUERA_DE_SEDE', sourceMarkAction: 'SALIDA_ALMUERZO', sourceMarkSequence: 2 }, undefined, timeZone))
      .toBe('Marcaste la salida a almorzar fuera del local, a las 08:18.')
  })
})
