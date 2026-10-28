import { describe, expect, it } from 'vitest'
import { validateDateRange } from './dateRange'

describe('validateDateRange', () => {
  it('acepta hasta 366 días contando desde y hasta, como el servidor', () => {
    expect(validateDateRange('2025-01-01', '2026-01-01')).toBe('')
  })

  it('rechaza 367 días contando desde y hasta', () => {
    expect(validateDateRange('2025-01-01', '2026-01-02')).toBe('El rango no puede superar los 366 días.')
  })

  it('acepta un solo día', () => {
    expect(validateDateRange('2026-03-02', '2026-03-02')).toBe('')
  })

  it('con un máximo propio acepta ese número de días contando desde y hasta y rechaza uno más', () => {
    expect(validateDateRange('2026-11-01', '2026-12-01', 31)).toBe('')
    expect(validateDateRange('2026-11-01', '2026-12-02', 31)).toBe('El rango no puede superar los 31 días.')
  })
})
