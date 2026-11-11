import { describe, expect, it } from 'vitest'
import type { Deviation, JornadaStatus, MarkAction } from './api/types'
import {
  adminCategoryName, adminDeviationName, adminDeviationStatusName, adminMarkLocationName, adminMarkName,
  confirmedMark, forAdmin, forEmployee, jornadaStateLabel, markButtonLabel, markWithArticle
} from './labels'

// The words each role read on 2026-11-11, before D-20261111-01 is applied: gathering them in one module must not change any.

const JORNADA_STATES = { NO_INGRESO: 'Sin ingreso', EN_CURSO: 'En curso', PAUSA_ABIERTA: 'En pausa', EGRESADA: 'Finalizada', CANCELADA: 'Cancelada' }
const MOTIVE_CATEGORIES = { SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' }

describe('forAdmin', () => {
  it('names every mark', () => {
    expect(forAdmin.mark).toEqual({
      INGRESO: 'Ingreso', EGRESO: 'Egreso', SALIDA_DESAYUNO: 'Salida desayuno', VUELTA_DESAYUNO: 'Vuelta desayuno',
      SALIDA_ALMUERZO: 'Salida almuerzo', VUELTA_ALMUERZO: 'Vuelta almuerzo'
    })
  })

  it('names every case', () => {
    expect(forAdmin.deviation).toEqual({
      SIN_INGRESO: 'Sin ingreso', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Egreso temprano', EGRESO_TARDIO: 'Egreso tardío',
      MARCA_FALTANTE: 'Egreso sin marcar', EXCESO_DESAYUNO: 'Exceso de desayuno', EXCESO_ALMUERZO: 'Exceso de almuerzo', FUERA_DE_SEDE: 'Fuera de sede'
    })
  })

  it('names every state of a case', () => {
    expect(forAdmin.deviationStatus).toEqual({
      MOTIVO_PENDIENTE: 'Falta motivo', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado'
    })
  })

  it('names every category of a motive', () => {
    expect(forAdmin.motiveCategory).toEqual(MOTIVE_CATEGORIES)
  })

  it('names every state of a day', () => {
    expect(forAdmin.jornadaState).toEqual(JORNADA_STATES)
  })
})

describe('forEmployee', () => {
  it('names every mark', () => {
    expect(forEmployee.mark).toEqual({
      INGRESO: 'Entrada', EGRESO: 'Salida', SALIDA_DESAYUNO: 'Salida a desayunar', VUELTA_DESAYUNO: 'Vuelta del desayuno',
      SALIDA_ALMUERZO: 'Salida a almorzar', VUELTA_ALMUERZO: 'Vuelta del almuerzo'
    })
  })

  it('names every case', () => {
    expect(forEmployee.deviation).toEqual({
      SIN_INGRESO: 'Faltó la entrada', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Salida temprana', EGRESO_TARDIO: 'Salida tarde',
      MARCA_FALTANTE: 'Faltó la salida', EXCESO_DESAYUNO: 'Desayuno largo', EXCESO_ALMUERZO: 'Almuerzo largo', FUERA_DE_SEDE: 'Fuera del local'
    })
  })

  it('names every state of a case', () => {
    expect(forEmployee.deviationStatus).toEqual({
      MOTIVO_PENDIENTE: 'Falta explicar', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado'
    })
  })

  it('names every category of a motive', () => {
    expect(forEmployee.motiveCategory).toEqual(MOTIVE_CATEGORIES)
  })

  it('names every state of a day', () => {
    expect(forEmployee.jornadaState).toEqual(JORNADA_STATES)
  })
})

describe('the forms of a mark only the employee reads', () => {
  it('says what each button does', () => {
    expect(markButtonLabel).toEqual({
      INGRESO: 'Marcar entrada', SALIDA_DESAYUNO: 'Me voy a desayunar', VUELTA_DESAYUNO: 'Volví del desayuno',
      SALIDA_ALMUERZO: 'Me voy a almorzar', VUELTA_ALMUERZO: 'Volví del almuerzo', EGRESO: 'Marcar salida'
    })
  })

  it('names a mark inside a sentence', () => {
    expect(markWithArticle).toEqual({
      INGRESO: 'la entrada', SALIDA_DESAYUNO: 'la salida a desayunar', VUELTA_DESAYUNO: 'la vuelta del desayuno',
      SALIDA_ALMUERZO: 'la salida a almorzar', VUELTA_ALMUERZO: 'la vuelta del almuerzo', EGRESO: 'la salida'
    })
  })

  it('names a mark in its confirmation', () => {
    expect(confirmedMark).toEqual({
      INGRESO: 'tu entrada', SALIDA_DESAYUNO: 'tu salida a desayunar', VUELTA_DESAYUNO: 'tu vuelta del desayuno',
      SALIDA_ALMUERZO: 'tu salida a almorzar', VUELTA_ALMUERZO: 'tu vuelta del almuerzo', EGRESO: 'tu salida'
    })
  })
})

describe('jornadaStateLabel', () => {
  it('names every state of a day', () => {
    for (const [state, word] of Object.entries(JORNADA_STATES)) expect(jornadaStateLabel(state as JornadaStatus)).toBe(word)
  })

  it('shows the code of a state the app does not know', () => {
    expect(jornadaStateLabel('SUSPENDIDA' as JornadaStatus)).toBe('SUSPENDIDA')
  })
})

describe('the lookups of the ADMIN screens', () => {
  it('read the ADMIN words', () => {
    for (const [action, word] of Object.entries(forAdmin.mark)) expect(adminMarkName(action as MarkAction)).toBe(word)
    for (const [type, word] of Object.entries(forAdmin.deviation)) expect(adminDeviationName(type as Deviation['type'])).toBe(word)
    for (const [status, word] of Object.entries(forAdmin.deviationStatus)) expect(adminDeviationStatusName(status as Deviation['status'])).toBe(word)
    for (const [category, word] of Object.entries(forAdmin.motiveCategory)) expect(adminCategoryName(category as NonNullable<Deviation['category']>)).toBe(word)
  })

  it('name where the location of a mark stands, with a dash for a state the app does not know', () => {
    expect(adminMarkLocationName('PENDIENTE')).toBe('Ubicación pendiente')
    expect(adminMarkLocationName('RECIBIDA')).toBe('Ubicación recibida')
    expect(adminMarkLocationName('SIN_UBICACION')).toBe('Sin ubicación')
    expect(adminMarkLocationName('PURGADA')).toBe('Ubicación depurada')
    expect(adminMarkLocationName('NO_APLICA')).toBe('No aplica')
    expect(adminMarkLocationName('OTRO')).toBe('—')
  })
})
