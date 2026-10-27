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
})
