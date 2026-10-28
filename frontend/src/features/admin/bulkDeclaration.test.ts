import { describe, expect, it } from 'vitest'
import { validateBulkDeclaration } from './bulkDeclaration'

const valid = { employeeIds: ['e-1'], from: '2026-11-02', to: '2026-11-08', weekdays: [1, 2, 3, 4, 5] }

describe('validateBulkDeclaration (D-20261027-11), igual que el servidor', () => {
  it('acepta de 1 a 200 empleados, un rango de hasta 31 días contando ambos extremos y al menos un día de la semana', () => {
    expect(validateBulkDeclaration(valid)).toBe('')
    expect(validateBulkDeclaration({ ...valid, from: '2026-11-01', to: '2026-12-01' })).toBe('')
    expect(validateBulkDeclaration({ ...valid, employeeIds: Array.from({ length: 200 }, (_, index) => `e-${index}`) })).toBe('')
  })

  it('pide al menos un empleado y como máximo 200', () => {
    expect(validateBulkDeclaration({ ...valid, employeeIds: [] })).toBe('Elegí al menos un empleado.')
    expect(validateBulkDeclaration({ ...valid, employeeIds: Array.from({ length: 201 }, (_, index) => `e-${index}`) })).toBe('Elegí como máximo 200 empleados.')
  })

  it('pide las dos fechas, en orden y sin superar 31 días', () => {
    expect(validateBulkDeclaration({ ...valid, to: '' })).toBe('Completá las dos fechas: desde y hasta.')
    expect(validateBulkDeclaration({ ...valid, from: '2026-11-08', to: '2026-11-02' })).toBe('La fecha desde no puede ser posterior a la fecha hasta.')
    expect(validateBulkDeclaration({ ...valid, from: '2026-11-01', to: '2026-12-02' })).toBe('El rango no puede superar los 31 días.')
  })

  it('pide al menos un día de la semana', () => {
    expect(validateBulkDeclaration({ ...valid, weekdays: [] })).toBe('Elegí al menos un día de la semana.')
  })
})
