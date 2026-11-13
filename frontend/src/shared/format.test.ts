import { describe, expect, it } from 'vitest'
import { formatBlock, formatClock, formatDateTime, formatDuration, formatLocalDate, formatWorkDay, jornadaStateLabel } from './format'

// Issue #177: «Saliste 449 minutos antes» was hard to read. From an hour on, a duration is said in hours and minutes.
describe('formatDuration', () => {
  it('says minutes under an hour', () => {
    expect(formatDuration(1)).toBe('1 minuto')
    expect(formatDuration(12)).toBe('12 minutos')
    expect(formatDuration(59)).toBe('59 minutos')
  })

  it('says hours and minutes from an hour on, and only hours when exact', () => {
    expect(formatDuration(60)).toBe('1 hora')
    expect(formatDuration(120)).toBe('2 horas')
    expect(formatDuration(61)).toBe('1 h 1 min')
    expect(formatDuration(449)).toBe('7 h 29 min')
  })
})

// Issue #177: a case says the day of work it belongs to, with its weekday, not when it was recorded.
describe('formatWorkDay', () => {
  it('names the weekday, the day and the month of a local date, whatever the zone of the device', () => {
    expect(formatWorkDay('2026-11-12')).toBe('jueves 12 nov')
    expect(formatWorkDay('2026-11-01')).toBe('domingo 1 nov')
  })

  it('keeps a value that is not a local date as it is', () => {
    expect(formatWorkDay('otro')).toBe('otro')
  })
})

describe('formatos legibles', () => {
  it('traduce cada estado de jornada con un único mapeo', () => {
    expect(jornadaStateLabel('NO_INGRESO')).toBe('Sin ingreso')
    expect(jornadaStateLabel('EN_CURSO')).toBe('En curso')
    expect(jornadaStateLabel('PAUSA_ABIERTA')).toBe('En pausa')
    expect(jornadaStateLabel('EGRESADA')).toBe('Finalizada')
  })

  it('muestra horas sin segundos', () => {
    expect(formatClock('22:00:00')).toBe('22:00')
    expect(formatClock('09:30')).toBe('09:30')
  })

  it('muestra un bloque que cruza la medianoche como texto, no como D+1', () => {
    expect(formatBlock({ startDayOffset: 0, start: '22:00:00', end: '06:00:00', endDayOffset: 1 })).toBe('22:00 a 06:00 (día siguiente)')
    expect(formatBlock({ startDayOffset: 0, start: '09:00', end: '17:00', endDayOffset: 0 })).toBe('09:00 a 17:00')
  })

  it('formatea una fecha ISO de jornada en es-AR sin correrla por la zona del dispositivo', () => {
    expect(formatLocalDate('2026-10-20')).toMatch(/20 oct\.? 2026/)
  })

  // T12 (UX A-4): es-AR writes «4:05 p. m.» by default, while the employee's day and the horarios read «16:05».
  it('muestra fecha y hora con el reloj de 24 horas, el mismo de la pantalla del empleado y de los horarios', () => {
    const zone = 'America/Argentina/Buenos_Aires'
    expect(formatDateTime('2026-10-16T19:05:00Z', zone)).toMatch(/^16 oct\.? 2026, 16:05$/)
    expect(formatDateTime('2026-10-16T12:05:00Z', zone)).toMatch(/^16 oct\.? 2026, 09:05$/)
    expect(formatDateTime('2026-10-16T03:00:00Z', zone)).toMatch(/^16 oct\.? 2026, 00:00$/)
    expect(formatDateTime('2026-10-16T19:05:00Z', zone)).not.toMatch(/m\./)
  })
})
