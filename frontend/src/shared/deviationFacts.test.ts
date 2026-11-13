import { describe, expect, it } from 'vitest'
import type { Deviation, Jornada, Mark } from './api/types'
import { describeDeviation } from './deviationFacts'

// Issue #177: the ADMIN decided a case with less than the employee reads. One computation of the facts serves both, each in
// its own person (D-20261111-03): the employee reads «Llegaste…», the ADMIN «Llegó…».
const timeZone = 'America/Argentina/Buenos_Aires'

function mark(action: Mark['action'], acceptedAt: string, sequence: number): Mark {
  return { id: `mark-${sequence}`, jornadaId: 'j-1', action, sequence, acceptedAt, locationStatus: 'RECIBIDA' }
}

function jornada(marks: Mark[] = [], limits = { breakfastLimitMinutes: 15, lunchLimitMinutes: 60 }): Jornada {
  return {
    id: 'j-1', employeeId: 'e-1', siteId: 's-1', localDate: '2026-11-09', state: 'EGRESADA', toleranceMinutes: 5, sequence: 1, marks,
    scheduleSnapshot: { siteId: 's-1', name: 'Mañana', blocks: [{ startDayOffset: 0, start: '08:00', end: '17:00', endDayOffset: 0 }], ...limits }
  }
}

const base: Deviation = { id: 'd-1', jornadaId: 'j-1', type: 'LLEGADA_TARDE', status: 'MOTIVO_PENDIENTE', createdAt: '2026-11-09T11:30:00Z', occurredAt: '2026-11-09T11:12:00Z', pushEligible: true }

describe('describeDeviation for the ADMIN', () => {
  it('says the same facts as the employee reads, in the third person', () => {
    const day = jornada()
    expect(describeDeviation(base, day, timeZone, 'admin')).toBe('Llegó 12 minutos tarde (su entrada era 08:00).')
    expect(describeDeviation({ ...base, type: 'SIN_INGRESO' }, day, timeZone, 'admin')).toBe('No marcó su entrada (su horario empezaba a las 08:00).')
    expect(describeDeviation({ ...base, type: 'EGRESO_TEMPRANO', occurredAt: '2026-11-09T19:40:00Z' }, day, timeZone, 'admin')).toBe('Salió 20 minutos antes (su salida era 17:00).')
    expect(describeDeviation({ ...base, type: 'EGRESO_TARDIO', occurredAt: '2026-11-09T20:30:00Z' }, day, timeZone, 'admin')).toBe('Marcó la salida 30 minutos después de su horario (su salida era 17:00).')
    expect(describeDeviation({ ...base, type: 'MARCA_FALTANTE' }, day, timeZone, 'admin')).toBe('No marcó su salida (su salida era 17:00).')
  })

  it('measures a long pause and says its limit with a unit once a duration reaches an hour', () => {
    const lunch = [mark('INGRESO', '2026-11-09T11:00:00Z', 1), mark('SALIDA_ALMUERZO', '2026-11-09T15:00:00Z', 2), mark('VUELTA_ALMUERZO', '2026-11-09T16:15:00Z', 3)]
    expect(describeDeviation({ ...base, type: 'EXCESO_ALMUERZO' }, jornada(lunch), timeZone, 'admin')).toBe('Su almuerzo duró 1 h 15 min y tenía 1 hora.')
    expect(describeDeviation({ ...base, type: 'EXCESO_ALMUERZO' }, jornada(lunch), timeZone)).toBe('Tu almuerzo duró 1 h 15 min y tenías 1 hora.')
    const breakfast = [mark('INGRESO', '2026-11-09T11:00:00Z', 1), mark('SALIDA_DESAYUNO', '2026-11-09T13:00:00Z', 2), mark('VUELTA_DESAYUNO', '2026-11-09T13:25:00Z', 3)]
    expect(describeDeviation({ ...base, type: 'EXCESO_DESAYUNO' }, jornada(breakfast), timeZone, 'admin')).toBe('Su desayuno duró 25 minutos y tenía 15.')
  })

  it('falls back to the time of the fact when the day is not loaded', () => {
    expect(describeDeviation(base, undefined, timeZone, 'admin')).toBe('Llegó tarde: marcó la entrada a las 08:12.')
    expect(describeDeviation({ ...base, type: 'SIN_INGRESO' }, undefined, timeZone, 'admin')).toBe('No marcó su entrada.')
    expect(describeDeviation({ ...base, type: 'EXCESO_DESAYUNO' }, undefined, timeZone, 'admin')).toBe('Su desayuno duró más de lo que tenía.')
    expect(describeDeviation({ ...base, type: 'FUERA_DE_SEDE', sourceMarkAction: 'INGRESO' }, undefined, timeZone, 'admin')).toBe('Marcó la entrada fuera del local, a las 08:12.')
    expect(describeDeviation({ ...base, type: 'FUERA_DE_SEDE' }, undefined, timeZone, 'admin')).toBe('Una marca quedó fuera del local, a las 08:12.')
  })
})
