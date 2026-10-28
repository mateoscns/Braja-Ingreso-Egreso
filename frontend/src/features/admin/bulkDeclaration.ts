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
