import { describe, expect, it } from 'vitest'
import { formatBlock, formatClock, formatLocalDate, jornadaStateLabel } from './format'

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
})
