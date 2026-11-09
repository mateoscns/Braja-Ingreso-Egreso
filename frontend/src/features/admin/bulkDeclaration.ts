import { DATE_PAIR_MESSAGE, validateDateRange } from '../../shared/dateRange'

/** Server bounds of POST /jornadas/bulk (JornadaDeclarationService, D-20261027-11). */
export const MAX_BULK_EMPLOYEES = 200
export const MAX_BULK_DAYS = 31

export type BulkDeclarationDraft = { employeeIds: string[]; from: string; to: string; weekdays: number[] }

/** Mirrors the server so the mistake is explained before any request; returns a Spanish message, or '' when valid. */
export function validateBulkDeclaration({ employeeIds, from, to, weekdays }: BulkDeclarationDraft): string {
  if (employeeIds.length === 0) return 'Elegí al menos una persona.'
  if (employeeIds.length > MAX_BULK_EMPLOYEES) return `Elegí como máximo ${MAX_BULK_EMPLOYEES} personas.`
  if (!from || !to) return DATE_PAIR_MESSAGE
  const range = validateDateRange(from, to, MAX_BULK_DAYS)
  if (range) return range
  if (weekdays.length === 0) return 'Elegí al menos un día de la semana.'
  return ''
}

/**
 * Specific texts for the declaration codes of D-20261102-06 (TEMPLATE_INVALID) and D-20261102-07 (EMPLOYEE_NOT_IN_SITE).
 * A bulk declaration with either code rejects the whole batch, so its text says no day was loaded.
 * Returns null for any other failure, which keeps the client's message.
 */
export function declarationFailureMessage(reason: unknown, kind: 'single' | 'bulk'): string | null {
  const code = reason && typeof reason === 'object' && 'code' in reason ? (reason as { code?: unknown }).code : undefined
  if (code === 'EMPLOYEE_NOT_IN_SITE') {
    return kind === 'bulk'
      ? 'No se cargó ningún día: al menos una de las personas elegidas no trabaja en este local. Revisá sus locales en Empleados y volvé a intentar.'
      : 'Esa persona no trabaja en este local. Agregale el local desde Empleados y volvé a cargar el día.'
  }
  if (code === 'TEMPLATE_INVALID') {
    return kind === 'bulk'
      ? 'No se cargó ningún día: el horario elegido está desactivado. Elegí otro o usá el que tiene asignado cada persona.'
      : 'El horario elegido, o el que la persona tiene asignado, está desactivado. Elegí otro horario.'
  }
  return null
}
