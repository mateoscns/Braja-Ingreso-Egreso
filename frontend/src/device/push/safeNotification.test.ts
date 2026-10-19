import { describe, expect, it } from 'vitest'
import { safeDeviationNotification } from './safeNotification'

describe('notificación push privada por defecto', () => {
  it('muestra conteo total y por sede usando solo campos validados', () => {
    const notification = safeDeviationNotification({
      title: 'Salud', body: 'texto del motivo', motiveText: 'dato privado', category: 'SALUD', navigation: '/privado',
      tag: 'stable_hash-42', totalCount: 3, siteCounts: [{ siteName: 'Local Centro', count: 2 }, { siteName: 'Depósito Norte', count: 1 }]
    })
    const serialized = JSON.stringify(notification)
    expect(notification.options.data).toEqual({ url: '/admin' })
    expect(notification.title).toBe('Fichaje Braja · Desvíos pendientes')
    expect(notification.options.body).toContain('3 desvíos')
    expect(notification.options.body).toContain('Local Centro: 2')
    expect(notification.options.body).toContain('Depósito Norte: 1')
    expect(notification.options.tag).toBe('stable_hash-42')
    expect(serialized).not.toContain('texto del motivo')
    expect(serialized).not.toContain('dato privado')
    expect(serialized).not.toContain('SALUD')
    expect(serialized).not.toContain('/privado')
  })

  it('abre la bandeja genérica porque el contrato no define un identificador de aviso agrupado', () => {
    expect(safeDeviationNotification({ totalCount: 1, siteCounts: [{ siteName: 'Centro', count: 1 }] }).url).toBe('/admin')
  })

  it('descarta conteos o nombres de sede inconsistentes y vuelve al aviso genérico', () => {
    const notification = safeDeviationNotification({ totalCount: 99, siteCounts: [{ siteName: '   ', count: -2 }] })
    expect(notification.options.body).toBe('Hay un desvío para revisar en la bandeja.')
    expect(notification.options.data).toEqual({ url: '/admin' })
  })

  it('usa una clave estable solo si tiene formato seguro y aplica un tag genérico ante valores inválidos', () => {
    expect(safeDeviationNotification({ tag: 'stable-KEY_42' }).options.tag).toBe('stable-KEY_42')
    expect(safeDeviationNotification({ tag: '../private tag' }).options.tag).toBe('braja-desvios-pendientes')
    expect(safeDeviationNotification({ tag: 42 }).options.tag).toBe('braja-desvios-pendientes')
  })
})
