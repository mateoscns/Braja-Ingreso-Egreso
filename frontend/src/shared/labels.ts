import type { Deviation, JornadaStatus, Mark, MarkAction } from './api/types'

type MotiveCategory = NonNullable<Deviation['category']>

/**
 * The visible name of every mark, case (deviation), state and category. Screens read them from here so a word changes in
 * one place. D-20261111-01 gives the ADMIN and the employee one set of words; the two vocabularies below keep the same
 * shape and share everything except the names that depend on who reads them: the ADMIN reads about another person, the
 * employee about themselves (D-20261111-03).
 */
export type Vocabulary = {
  mark: Record<MarkAction, string>
  deviation: Record<Deviation['type'], string>
  deviationStatus: Record<Deviation['status'], string>
  motiveCategory: Record<MotiveCategory, string>
  jornadaState: Record<JornadaStatus, string>
}

// The words both roles read are written once.

// The decision names only the entry and the exit. The break marks are still open: until the owner chooses, both roles read
// the names the employee already had.
const mark: Record<MarkAction, string> = {
  INGRESO: 'Entrada', SALIDA_DESAYUNO: 'Salida a desayunar', VUELTA_DESAYUNO: 'Vuelta del desayuno',
  SALIDA_ALMUERZO: 'Salida a almorzar', VUELTA_ALMUERZO: 'Vuelta del almuerzo', EGRESO: 'Salida'
}
// A case has the same name for both roles unless the name carries a verb: then each role reads it in its own person.
const sharedCase = { LLEGADA_TARDE: 'Llegada tarde', EXCESO_DESAYUNO: 'Desayuno largo', EXCESO_ALMUERZO: 'Almuerzo largo', FUERA_DE_SEDE: 'Fuera del local' }
const reviewedStatus: Record<Exclude<Deviation['status'], 'MOTIVO_PENDIENTE'>, string> = {
  PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado'
}
// The decision leaves the states of a day open, so they keep their words («Sin ingreso» included).
const jornadaState: Record<JornadaStatus, string> = {
  NO_INGRESO: 'Sin ingreso',
  EN_CURSO: 'En curso',
  PAUSA_ABIERTA: 'En pausa',
  EGRESADA: 'Finalizada',
  CANCELADA: 'Cancelada'
}
const motiveCategory: Record<MotiveCategory, string> = { SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' }

export const forAdmin: Vocabulary = {
  mark,
  deviation: { ...sharedCase, SIN_INGRESO: 'No marcó la entrada', EGRESO_TEMPRANO: 'Salió antes', EGRESO_TARDIO: 'Salió después de hora', MARCA_FALTANTE: 'No marcó la salida' },
  // The ADMIN reads about another person, so the tag says what that person has not done yet (the word of the decision).
  deviationStatus: { MOTIVO_PENDIENTE: 'Todavía no explicó', ...reviewedStatus },
  motiveCategory,
  jornadaState
}

export const forEmployee: Vocabulary = {
  mark,
  // The title sits right above a sentence in the second person («No marcaste tu entrada. ¿Qué pasó?»): the same words, said
  // to the person who reads them (D-20261111-03).
  deviation: { ...sharedCase, SIN_INGRESO: 'No marcaste la entrada', EGRESO_TEMPRANO: 'Saliste antes', EGRESO_TARDIO: 'Saliste después de hora', MARCA_FALTANTE: 'No marcaste la salida' },
  // The employee reads about themselves: the same state, said as what is left for them to do. Kept as an assumption, since
  // the decision names only the ADMIN's word.
  deviationStatus: { MOTIVO_PENDIENTE: 'Falta explicar', ...reviewedStatus },
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
/** The four rows of the employee's day sheet (design system 4.14): the entry, each break with its two marks, the exit. */
export type DaySlotKind = 'ENTRADA' | 'DESAYUNO' | 'ALMUERZO' | 'SALIDA'
export const daySlotName: Record<DaySlotKind, string> = { ENTRADA: mark.INGRESO, DESAYUNO: 'Desayuno', ALMUERZO: 'Almuerzo', SALIDA: mark.EGRESO }

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
  // Issue #177: «No aplica» and «Ubicación depurada» did not say what happened. NO_APLICA is a mark the ADMIN loaded (the
  // employee reads «Cargada por tu encargado»); PURGADA is a location deleted after 90 days (CLAUDE.md, rule 3).
  PENDIENTE: 'Ubicación pendiente', RECIBIDA: 'Ubicación recibida', SIN_UBICACION: 'Sin ubicación', PURGADA: 'Ubicación borrada a los 90 días', NO_APLICA: 'Cargada a mano'
}
export function adminMarkLocationName(status: string): string {
  return (adminMarkLocation as Record<string, string>)[status] ?? '—'
}
