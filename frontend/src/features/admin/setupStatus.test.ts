import { describe, expect, it, vi } from 'vitest'
import { ASSIGNMENT_CHECK_LIMIT, coverageNotice, loadSetupData, readyTomorrow, setupComplete, setupSteps, type SetupData } from './setupStatus'

const site = { id: 's-1', name: 'Casa', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
const template = { id: 't-1', siteId: 's-1', name: 'Mañana', active: true, blocks: [{ startDayOffset: 0 as const, start: '09:00', end: '17:00', endDayOffset: 0 as const }], breakfastLimitMinutes: 15, lunchLimitMinutes: 60 }
const person = (id: string, displayName: string, active = true) => ({ id, displayName, siteIds: ['s-1'], toleranceMinutes: 5, active })
const assigned = (employeeId: string, validFrom = '2026-11-01') => ({ id: `a-${employeeId}`, employeeId, siteId: 's-1', templateId: 't-1', templateName: 'Mañana', validFrom, createdAt: '2026-11-01T12:00:00Z' })
const row = (employeeId: string, localDate: string, state: 'NO_INGRESO' | 'CANCELADA' = 'NO_INGRESO') => ({ id: `${employeeId}-${localDate}`, employeeId, siteId: 's-1', localDate, state })

function data(patch: Partial<SetupData> = {}): SetupData {
  return {
    sites: [site], templates: [template], employees: [person('e-1', 'Ana'), person('e-2', 'Pedro')],
    assignments: new Map([['e-1', [assigned('e-1')]], ['e-2', [assigned('e-2')]]]), checkedAll: true,
    tomorrow: new Map([['s-1', '2026-11-10']]),
    jornadas: new Map([['s-1', [row('e-1', '2026-11-10'), row('e-2', '2026-11-10'), row('e-1', '2026-11-12')]]]),
    ...patch
  }
}

describe('primeros pasos', () => {
  it('con todo cargado, los cinco pasos están listos y dice cuántas personas pueden marcar mañana', () => {
    const steps = setupSteps(data())
    expect(steps.map((step) => step.title)).toEqual(['Tu local', 'Tus horarios', 'Tu equipo', 'Cada uno con su horario', 'Días de trabajo cargados'])
    expect(steps.map((step) => step.done)).toEqual([true, true, true, true, true])
    expect(setupComplete(steps)).toBe(true)
    expect(readyTomorrow(data())).toBe(2)
  })

  it('sin nada cargado, todos los pasos están pendientes', () => {
    const empty = data({ sites: [], templates: [], employees: [], assignments: new Map(), tomorrow: new Map(), jornadas: new Map() })
    expect(setupSteps(empty).map((step) => step.done)).toEqual([false, false, false, false, false])
    expect(setupComplete(setupSteps(empty))).toBe(false)
  })

  it('nombra el local sin horario y las personas sin horario asignado', () => {
    const second = { ...site, id: 's-2', name: 'Centro' }
    const steps = setupSteps(data({ sites: [site, second], assignments: new Map([['e-1', [assigned('e-1')]], ['e-2', []]]) }))
    expect(steps[1]).toMatchObject({ done: false, detail: 'Falta en: Centro.' })
    expect(steps[3]).toMatchObject({ done: false, detail: 'Falta para: Pedro.' })
  })

  it('una asignación que empieza después de mañana o de un horario desactivado no cuenta', () => {
    const steps = setupSteps(data({
      templates: [template, { ...template, id: 't-2', active: false }],
      assignments: new Map([['e-1', [assigned('e-1', '2026-11-11')]], ['e-2', [{ ...assigned('e-2'), templateId: 't-2' }]]])
    }))
    expect(steps[3]).toMatchObject({ done: false, detail: 'Falta para: Ana y Pedro.' })
  })

  it('las personas dadas de baja no cuentan', () => {
    const steps = setupSteps(data({ employees: [person('e-1', 'Ana'), person('e-3', 'Baja', false)] }))
    expect(steps[2].done).toBe(true)
    expect(steps[3].done).toBe(true)
  })

  it('más allá del tope de consultas no afirma nada y manda a revisar Empleados', () => {
    const steps = setupSteps(data({ checkedAll: false }))
    expect(steps[3]).toMatchObject({ done: 'unknown', detail: 'Revisá Empleados: son muchas personas para revisarlas desde acá.' })
    expect(setupComplete(steps)).toBe(true)
  })

  it('los días cargados cuentan desde mañana y hasta 7 días después, sin las jornadas canceladas', () => {
    expect(setupSteps(data({ jornadas: new Map([['s-1', [row('e-1', '2026-11-17')]]]) }))[4].done).toBe(true)
    expect(setupSteps(data({ jornadas: new Map([['s-1', [row('e-1', '2026-11-18')]]]) }))[4]).toMatchObject({ done: false, detail: 'Falta en: Casa.' })
    expect(setupSteps(data({ jornadas: new Map([['s-1', [row('e-1', '2026-11-10', 'CANCELADA')]]]) }))[4].done).toBe(false)
  })
})

describe('aviso de días cargados', () => {
  it('avisa hasta qué día hay días cargados', () => {
    expect(coverageNotice(data())).toEqual({ kind: 'info', siteNames: [], text: 'Hay días cargados hasta el jueves 12 de noviembre.' })
  })

  it('es un error cuando mañana nadie tiene día cargado en un local con personas con horario', () => {
    expect(coverageNotice(data({ jornadas: new Map([['s-1', [row('e-1', '2026-11-12')]]]) })))
      .toEqual({ kind: 'error', siteNames: ['Casa'], text: 'Mañana nadie tiene día cargado en Casa: cargalos para que puedan marcar.' })
  })

  it('no avisa nada cuando no hay personas con horario', () => {
    expect(coverageNotice(data({ assignments: new Map([['e-1', []], ['e-2', []]]) }))).toBeNull()
  })
})

describe('loadSetupData', () => {
  it('consulta sedes, horarios, empleados, las asignaciones hasta el tope y los días de cada local desde mañana', async () => {
    const people = Array.from({ length: ASSIGNMENT_CHECK_LIMIT + 2 }, (_, index) => person(`e-${index}`, `P${index}`))
    const get = vi.fn((path: string) => {
      if (path === '/sites') return Promise.resolve([site])
      if (path === '/templates') return Promise.resolve([template])
      if (path === '/employees') return Promise.resolve(people)
      if (path.endsWith('/template-assignments')) return Promise.resolve([])
      if (path.startsWith('/jornadas?')) return Promise.resolve([])
      return Promise.reject(new Error(path))
    })
    const loaded = await loadSetupData(get, new Date('2026-11-10T02:30:00Z'))
    expect(loaded.checkedAll).toBe(false)
    expect(get.mock.calls.filter(([path]) => path.endsWith('/template-assignments'))).toHaveLength(ASSIGNMENT_CHECK_LIMIT)
    expect(loaded.tomorrow.get('s-1')).toBe('2026-11-10')
    expect(get).toHaveBeenCalledWith('/jornadas?from=2026-11-10&to=2026-12-10&siteId=s-1')
  })
})
