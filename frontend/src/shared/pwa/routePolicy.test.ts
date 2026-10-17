import { describe, expect, it } from 'vitest'
import { isApiPath } from './routePolicy'

describe('reglas de ruta de la PWA', () => {
  it('mantiene cualquier ruta API fuera del fallback de navegación', () => {
    expect(isApiPath('/api/v1')).toBe(true)
    expect(isApiPath('/api/v1/session')).toBe(true)
    expect(isApiPath('/api/v1/marks/123/location')).toBe(true)
    expect(isApiPath('/api')).toBe(false)
    expect(isApiPath('/api/v10/session')).toBe(false)
    expect(isApiPath('/admin')).toBe(false)
  })
})
