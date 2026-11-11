import type { Deviation, JornadaStatus, Mark, MarkAction } from './api/types'

type MotiveCategory = NonNullable<Deviation['category']>

/**
 * The visible name of every mark, case (deviation), state and category. Screens read them from here so a word changes in
 * one place. The ADMIN and the employee still read different words; D-20261111-01 asks for one set, and until it is applied
 * here both are kept with the same shape, so that they can become one.
 */
export type Vocabulary = {
  mark: Record<MarkAction, string>
  deviation: Record<Deviation['type'], string>
  deviationStatus: Record<Deviation['status'], string>
  motiveCategory: Record<MotiveCategory, string>
  jornadaState: Record<JornadaStatus, string>
}

// The words both roles already share are written once.
const jornadaState: Record<JornadaStatus, string> = {
  NO_INGRESO: 'Sin ingreso',
  EN_CURSO: 'En curso',
  PAUSA_ABIERTA: 'En pausa',
  EGRESADA: 'Finalizada',
  CANCELADA: 'Cancelada'
}
const motiveCategory: Record<MotiveCategory, string> = { SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' }

export const forAdmin: Vocabulary = {
  mark: {
    INGRESO: 'Ingreso', EGRESO: 'Egreso', SALIDA_DESAYUNO: 'Salida desayuno', VUELTA_DESAYUNO: 'Vuelta desayuno',
    SALIDA_ALMUERZO: 'Salida almuerzo', VUELTA_ALMUERZO: 'Vuelta almuerzo'
  },
  deviation: {
    SIN_INGRESO: 'Sin ingreso', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Egreso temprano', EGRESO_TARDIO: 'Egreso tardío',
    MARCA_FALTANTE: 'Egreso sin marcar', EXCESO_DESAYUNO: 'Exceso de desayuno', EXCESO_ALMUERZO: 'Exceso de almuerzo', FUERA_DE_SEDE: 'Fuera de sede'
  },
  deviationStatus: { MOTIVO_PENDIENTE: 'Falta motivo', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado' },
  motiveCategory,
  jornadaState
}

export const forEmployee: Vocabulary = {
  mark: {
    INGRESO: 'Entrada', SALIDA_DESAYUNO: 'Salida a desayunar', VUELTA_DESAYUNO: 'Vuelta del desayuno',
    SALIDA_ALMUERZO: 'Salida a almorzar', VUELTA_ALMUERZO: 'Vuelta del almuerzo', EGRESO: 'Salida'
  },
  deviation: {
    SIN_INGRESO: 'Faltó la entrada', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Salida temprana', EGRESO_TARDIO: 'Salida tarde',
    MARCA_FALTANTE: 'Faltó la salida', EXCESO_DESAYUNO: 'Desayuno largo', EXCESO_ALMUERZO: 'Almuerzo largo', FUERA_DE_SEDE: 'Fuera del local'
  },
  deviationStatus: { MOTIVO_PENDIENTE: 'Falta explicar', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado' },
  motiveCategory,
  jornadaState
}

/** A state the app does not know yet is shown by its code instead of an empty tag. */
export function jornadaStateLabel(state: JornadaStatus): string {
  return jornadaState[state] ?? state
}

// Only the employee marks, so these forms of a mark's name have no ADMIN side: the button, and the name inside a sentence.

/** Phase 1 glossary: what each button says. */
export const markButtonLabel: Record<MarkAction, string> = {
  INGRESO: 'Marcar entrada', SALIDA_DESAYUNO: 'Me voy a desayunar', VUELTA_DESAYUNO: 'Volví del desayuno',
  SALIDA_ALMUERZO: 'Me voy a almorzar', VUELTA_ALMUERZO: 'Volví del almuerzo', EGRESO: 'Marcar salida'
}
export const markWithArticle: Record<MarkAction, string> = {
  INGRESO: 'la entrada', SALIDA_DESAYUNO: 'la salida a desayunar', VUELTA_DESAYUNO: 'la vuelta del desayuno',
  SALIDA_ALMUERZO: 'la salida a almorzar', VUELTA_ALMUERZO: 'la vuelta del almuerzo', EGRESO: 'la salida'
}
export const confirmedMark: Record<MarkAction, string> = {
  INGRESO: 'tu entrada', SALIDA_DESAYUNO: 'tu salida a desayunar', VUELTA_DESAYUNO: 'tu vuelta del desayuno',
  SALIDA_ALMUERZO: 'tu salida a almorzar', VUELTA_ALMUERZO: 'tu vuelta del almuerzo', EGRESO: 'tu salida'
}

// The ADMIN screens look a name up by its code.

export function adminMarkName(action: MarkAction): string { return forAdmin.mark[action] }
export function adminDeviationName(type: Deviation['type']): string { return forAdmin.deviation[type] }
export function adminDeviationStatusName(status: Deviation['status']): string { return forAdmin.deviationStatus[status] }
export function adminCategoryName(category: MotiveCategory): string { return forAdmin.motiveCategory[category] }

/**
 * Not part of the pair above: the employee reads the location of a mark as progress of its own action
 * (markLocationLabel in features/employee/employeeDay.ts), and that hides the states the ADMIN gets a name for.
 */
const adminMarkLocation: Record<Mark['locationStatus'], string> = {
  PENDIENTE: 'Ubicación pendiente', RECIBIDA: 'Ubicación recibida', SIN_UBICACION: 'Sin ubicación', PURGADA: 'Ubicación depurada', NO_APLICA: 'No aplica'
}
export function adminMarkLocationName(status: string): string {
  return (adminMarkLocation as Record<string, string>)[status] ?? '—'
}
