import { describe, expect, it } from 'vitest'
import type { Deviation, JornadaStatus, MarkAction } from './api/types'
import {
  adminCategoryName, adminDeviationName, adminDeviationStatusName, adminMarkLocationName, adminMarkName,
  confirmedMark, forAdmin, forEmployee, jornadaStateLabel, markButtonLabel, markWithArticle
} from './labels'

type DeviationType = Deviation['type']
type DeviationStatus = Deviation['status']
type MotiveCategory = NonNullable<Deviation['category']>

// The words of D-20261111-01 as the design system lists them (7.2): the ADMIN and the employee read the same one.

const MARKS: [MarkAction, string][] = [
  ['INGRESO', 'Entrada'],
  ['EGRESO', 'Salida'],
  // The decision does not name the break marks: both roles read the names the employee already had.
  ['SALIDA_DESAYUNO', 'Salida a desayunar'],
  ['VUELTA_DESAYUNO', 'Vuelta del desayuno'],
  ['SALIDA_ALMUERZO', 'Salida a almorzar'],
  ['VUELTA_ALMUERZO', 'Vuelta del almuerzo']
]

const CASES_OF_THE_ADMIN: [DeviationType, string][] = [
  ['SIN_INGRESO', 'No marcó la entrada'],
  ['LLEGADA_TARDE', 'Llegada tarde'],
  ['EGRESO_TEMPRANO', 'Salió antes'],
  ['EGRESO_TARDIO', 'Salió después de hora'],
  ['MARCA_FALTANTE', 'No marcó la salida'],
  ['EXCESO_DESAYUNO', 'Desayuno largo'],
  ['EXCESO_ALMUERZO', 'Almuerzo largo'],
  ['FUERA_DE_SEDE', 'Fuera del local']
]
// D-20261111-03: the same words, said to the person who reads them. The employee's title sits right above a sentence in
// the second person («No marcaste tu entrada. ¿Qué pasó?»), and a title about "someone" read as if it were about another.
const CASES_OF_THE_EMPLOYEE: [DeviationType, string][] = [
  ['SIN_INGRESO', 'No marcaste la entrada'],
  ['LLEGADA_TARDE', 'Llegada tarde'],
  ['EGRESO_TEMPRANO', 'Saliste antes'],
  ['EGRESO_TARDIO', 'Saliste después de hora'],
  ['MARCA_FALTANTE', 'No marcaste la salida'],
  ['EXCESO_DESAYUNO', 'Desayuno largo'],
  ['EXCESO_ALMUERZO', 'Almuerzo largo'],
  ['FUERA_DE_SEDE', 'Fuera del local']
]

// The one name that still depends on who reads it: the employee is told what is missing, the ADMIN what the person did.
const CASE_STATES_OF_THE_ADMIN: [DeviationStatus, string][] = [
  ['MOTIVO_PENDIENTE', 'Todavía no explicó'],
  ['PENDIENTE_REVISION', 'A revisar'],
  ['JUSTIFICADO', 'Justificado'],
  ['NO_JUSTIFICADO', 'No justificado']
]
const CASE_STATES_OF_THE_EMPLOYEE: [DeviationStatus, string][] = [
  ['MOTIVO_PENDIENTE', 'Falta explicar'],
  ['PENDIENTE_REVISION', 'A revisar'],
  ['JUSTIFICADO', 'Justificado'],
  ['NO_JUSTIFICADO', 'No justificado']
]

const MOTIVE_CATEGORIES: [MotiveCategory, string][] = [
  ['SALUD', 'Salud'],
  ['TRANSPORTE', 'Transporte'],
  ['EMERGENCIA', 'Emergencia'],
  ['OTRA', 'Otra']
]

// The decision leaves the states of a day open, so they keep the words they had.
const JORNADA_STATES: [JornadaStatus, string][] = [
  ['NO_INGRESO', 'Sin ingreso'],
  ['EN_CURSO', 'En curso'],
  ['PAUSA_ABIERTA', 'En pausa'],
  ['EGRESADA', 'Finalizada'],
  ['CANCELADA', 'Cancelada']
]

const codes = (table: [string, string][]) => table.map(([code]) => code).sort()

describe('forAdmin', () => {
  it.each(MARKS)('names the mark %s «%s»', (action, word) => {
    expect(forAdmin.mark[action]).toBe(word)
  })

  it.each(CASES_OF_THE_ADMIN)('names the case %s «%s»', (type, word) => {
    expect(forAdmin.deviation[type]).toBe(word)
  })

  it.each(CASE_STATES_OF_THE_ADMIN)('names the state of a case %s «%s»', (status, word) => {
    expect(forAdmin.deviationStatus[status]).toBe(word)
  })

  it.each(MOTIVE_CATEGORIES)('names the category of a motive %s «%s»', (category, word) => {
    expect(forAdmin.motiveCategory[category]).toBe(word)
  })

  it.each(JORNADA_STATES)('names the state of a day %s «%s»', (state, word) => {
    expect(forAdmin.jornadaState[state]).toBe(word)
  })

  it('names nothing else', () => {
    expect(Object.keys(forAdmin.mark).sort()).toEqual(codes(MARKS))
    expect(Object.keys(forAdmin.deviation).sort()).toEqual(codes(CASES_OF_THE_ADMIN))
    expect(Object.keys(forAdmin.deviationStatus).sort()).toEqual(codes(CASE_STATES_OF_THE_ADMIN))
    expect(Object.keys(forAdmin.motiveCategory).sort()).toEqual(codes(MOTIVE_CATEGORIES))
    expect(Object.keys(forAdmin.jornadaState).sort()).toEqual(codes(JORNADA_STATES))
  })
})

describe('forEmployee', () => {
  it.each(MARKS)('names the mark %s «%s»', (action, word) => {
    expect(forEmployee.mark[action]).toBe(word)
  })

  it.each(CASES_OF_THE_EMPLOYEE)('names the case %s «%s»', (type, word) => {
    expect(forEmployee.deviation[type]).toBe(word)
  })

  it.each(CASE_STATES_OF_THE_EMPLOYEE)('names the state of a case %s «%s»', (status, word) => {
    expect(forEmployee.deviationStatus[status]).toBe(word)
  })

  it.each(MOTIVE_CATEGORIES)('names the category of a motive %s «%s»', (category, word) => {
    expect(forEmployee.motiveCategory[category]).toBe(word)
  })

  it.each(JORNADA_STATES)('names the state of a day %s «%s»', (state, word) => {
    expect(forEmployee.jornadaState[state]).toBe(word)
  })

  it('names nothing else', () => {
    expect(Object.keys(forEmployee.mark).sort()).toEqual(codes(MARKS))
    expect(Object.keys(forEmployee.deviation).sort()).toEqual(codes(CASES_OF_THE_EMPLOYEE))
    expect(Object.keys(forEmployee.deviationStatus).sort()).toEqual(codes(CASE_STATES_OF_THE_EMPLOYEE))
    expect(Object.keys(forEmployee.motiveCategory).sort()).toEqual(codes(MOTIVE_CATEGORIES))
    expect(Object.keys(forEmployee.jornadaState).sort()).toEqual(codes(JORNADA_STATES))
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
    for (const [state, word] of JORNADA_STATES) expect(jornadaStateLabel(state)).toBe(word)
  })

  it('shows the code of a state the app does not know', () => {
    expect(jornadaStateLabel('SUSPENDIDA' as JornadaStatus)).toBe('SUSPENDIDA')
  })
})

describe('the lookups of the ADMIN screens', () => {
  it('read the ADMIN words', () => {
    for (const [action, word] of MARKS) expect(adminMarkName(action)).toBe(word)
    for (const [type, word] of CASES_OF_THE_ADMIN) expect(adminDeviationName(type)).toBe(word)
    for (const [status, word] of CASE_STATES_OF_THE_ADMIN) expect(adminDeviationStatusName(status)).toBe(word)
    for (const [category, word] of MOTIVE_CATEGORIES) expect(adminCategoryName(category)).toBe(word)
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
