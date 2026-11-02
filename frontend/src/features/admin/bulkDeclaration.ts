import { DATE_PAIR_MESSAGE, validateDateRange } from '../../shared/dateRange'

/** Server bounds of POST /jornadas/bulk (JornadaDeclarationService, D-20261027-11). */
export const MAX_BULK_EMPLOYEES = 200
export const MAX_BULK_DAYS = 31

export type BulkDeclarationDraft = { employeeIds: string[]; from: string; to: string; weekdays: number[] }

/** Mirrors the server so the mistake is explained before any request; returns a Spanish message, or '' when valid. */
export function validateBulkDeclaration({ employeeIds, from, to, weekdays }: BulkDeclarationDraft): string {
  if (employeeIds.length === 0) return 'Elegí al menos un empleado.'
  if (employeeIds.length > MAX_BULK_EMPLOYEES) return `Elegí como máximo ${MAX_BULK_EMPLOYEES} empleados.`
  if (!from || !to) return DATE_PAIR_MESSAGE
  const range = validateDateRange(from, to, MAX_BULK_DAYS)
  if (range) return range
  if (weekdays.length === 0) return 'Elegí al menos un día de la semana.'
  return ''
}

/**
 * Specific texts for the declaration codes of D-20261102-06 (TEMPLATE_INVALID) and D-20261102-07 (EMPLOYEE_NOT_IN_SITE).
 * A bulk declaration with either code rejects the whole batch, so its text says no jornada was declared.
 * Returns null for any other failure, which keeps the client's message.
 */
export function declarationFailureMessage(reason: unknown, kind: 'single' | 'bulk'): string | null {
  const code = reason && typeof reason === 'object' && 'code' in reason ? (reason as { code?: unknown }).code : undefined
  if (code === 'EMPLOYEE_NOT_IN_SITE') {
    return kind === 'bulk'
      ? 'No se declaró ninguna jornada: al menos un empleado elegido no está asignado a esta sede. Revisá sus sedes en Empleados y volvé a intentar.'
      : 'Ese empleado no está asignado a esta sede. Agregale la sede desde Empleados y volvé a declarar.'
  }
  if (code === 'TEMPLATE_INVALID') {
    return kind === 'bulk'
      ? 'No se declaró ninguna jornada: la plantilla elegida está inactiva. Elegí otra o usá la plantilla vigente de cada empleado.'
      : 'La plantilla elegida, o la que el empleado tiene asignada, está inactiva. Elegí otra plantilla.'
  }
  return null
}
