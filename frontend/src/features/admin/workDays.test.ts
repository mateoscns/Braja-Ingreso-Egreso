import { describe, expect, it } from 'vitest'
import { addDays, calendarToday, isoWeekday, periodRange, previewText, summarizeBulkResult, validateWorkDays, workDates } from './workDays'

describe('días de trabajo: calendario de la sede', () => {
  it('toma la fecha de hoy en la zona de la sede, no la del dispositivo', () => {
    const lateNightUtc = new Date('2026-11-10T02:30:00Z')
    expect(calendarToday('America/Argentina/Buenos_Aires', lateNightUtc)).toBe('2026-11-09')
    expect(calendarToday('Europe/Madrid', lateNightUtc)).toBe('2026-11-10')
  })

  it('suma días y da el día de la semana de 1 (lunes) a 7 (domingo)', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(isoWeekday('2026-11-09')).toBe(1)
    expect(isoWeekday('2026-11-15')).toBe(7)
  })
})

describe('períodos rápidos (como máximo 31 días)', () => {
  const monday = '2026-11-09'
  it('esta semana va de hoy al domingo', () => {
    expect(periodRange('this-week', monday)).toEqual({ from: '2026-11-09', to: '2026-11-15' })
    expect(periodRange('this-week', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' })
  })
  it('las próximas 2 semanas son 14 días desde hoy', () => {
    expect(periodRange('two-weeks', monday)).toEqual({ from: '2026-11-09', to: '2026-11-22' })
  })
  it('lo que queda del mes va de hoy al último día del mes', () => {
    expect(periodRange('rest-of-month', monday)).toEqual({ from: '2026-11-09', to: '2026-11-30' })
    expect(periodRange('rest-of-month', '2026-12-31')).toEqual({ from: '2026-12-31', to: '2026-12-31' })
  })
  it('el mes que viene va del 1 al último día del mes siguiente, también en diciembre', () => {
    expect(periodRange('next-month', monday)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodRange('next-month', '2026-12-15')).toEqual({ from: '2027-01-01', to: '2027-01-31' })
    expect(periodRange('next-month', '2027-01-31')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })
  it('ningún período rápido supera los 31 días', () => {
    for (const today of ['2026-01-01', '2026-01-31', '2026-07-01', '2026-12-31']) {
      for (const period of ['this-week', 'two-weeks', 'rest-of-month', 'next-month'] as const) {
        const { from, to } = periodRange(period, today)
        expect(workDates(from, to, [1, 2, 3, 4, 5, 6, 7]).length).toBeLessThanOrEqual(31)
      }
    }
  })
})

describe('workDates: la misma regla que el servidor (bulkDates)', () => {
  it('devuelve las fechas de la ventana que caen en los días elegidos, incluidos los extremos', () => {
    expect(workDates('2026-11-09', '2026-11-15', [1, 2, 3, 4, 5])).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
    expect(workDates('2026-11-09', '2026-11-15', [6, 7])).toEqual(['2026-11-14', '2026-11-15'])
    expect(workDates('2026-12-01', '2026-12-31', [1, 2, 3, 4, 5])).toHaveLength(23)
  })
  it('una ventana inválida no tiene fechas', () => {
    expect(workDates('2026-11-15', '2026-11-09', [1])).toEqual([])
    expect(workDates('', '2026-11-09', [1])).toEqual([])
    expect(workDates('2026-11-01', '2026-12-02', [1, 2, 3, 4, 5, 6, 7])).toEqual([])
  })
})

describe('vista previa', () => {
  it('dice cuántos días, cuáles, qué período y para cuántas personas', () => {
    expect(previewText({ from: '2026-12-01', to: '2026-12-31', weekdays: [1, 2, 3, 4, 5], people: 8 }))
      .toBe('Vas a cargar 23 días (lunes a viernes, del 1 al 31 de diciembre) para 8 personas.')
    expect(previewText({ from: '2026-11-28', to: '2026-12-05', weekdays: [1, 2, 3, 4, 5, 6], people: 1 }))
      .toBe('Vas a cargar 7 días (lunes a sábado, del 28 de noviembre al 5 de diciembre) para 1 persona.')
    expect(previewText({ from: '2026-11-09', to: '2026-11-15', weekdays: [1, 2, 3, 4, 5, 6, 7], people: 2 }))
      .toBe('Vas a cargar 7 días (todos los días, del 9 al 15 de noviembre) para 2 personas.')
    expect(previewText({ from: '2026-11-09', to: '2026-11-15', weekdays: [1, 3, 5], people: 2 }))
      .toBe('Vas a cargar 3 días (lunes, miércoles y viernes, del 9 al 15 de noviembre) para 2 personas.')
    expect(previewText({ from: '2026-12-31', to: '2026-12-31', weekdays: [4], people: 2 }))
      .toBe('Vas a cargar 1 día (jueves, el 31 de diciembre) para 2 personas.')
    expect(previewText({ from: '2026-12-28', to: '2027-01-03', weekdays: [1], people: 2 }))
      .toBe('Vas a cargar 1 día (lunes, del 28 de diciembre de 2026 al 3 de enero de 2027) para 2 personas.')
  })
  it('pide fechas válidas cuando el período elegido a mano está incompleto o es muy largo', () => {
    expect(previewText({ from: '', to: '2026-11-15', weekdays: [1], people: 2 })).toBe('Elegí el primer y el último día.')
    expect(previewText({ from: '2026-11-15', to: '2026-11-09', weekdays: [1], people: 2 })).toBe('Elegí un período de hasta 31 días, del primero al último.')
    expect(previewText({ from: '2026-11-01', to: '2026-12-02', weekdays: [1], people: 2 })).toBe('Elegí un período de hasta 31 días, del primero al último.')
  })
  it('avisa cuando ningún día del período cae en los días elegidos', () => {
    expect(previewText({ from: '2026-11-09', to: '2026-11-13', weekdays: [6, 7], people: 2 }))
      .toBe('Ningún día del período cae en los días elegidos.')
  })
})

describe('validateWorkDays', () => {
  const valid = { employeeIds: ['e-1'], from: '2026-11-09', to: '2026-11-15', weekdays: [1, 2, 3, 4, 5] }
  it('acepta un período válido con al menos un día', () => {
    expect(validateWorkDays(valid)).toBe('')
  })
  it('explica las fechas elegidas a mano en palabras simples', () => {
    expect(validateWorkDays({ ...valid, to: '' })).toBe('Completá el primer y el último día.')
    expect(validateWorkDays({ ...valid, from: '2026-11-15', to: '2026-11-09' })).toBe('El último día no puede ser anterior al primero.')
    expect(validateWorkDays({ ...valid, from: '2026-11-01', to: '2026-12-02' })).toBe('Elegí como máximo 31 días. Para más, cargá un mes y después el siguiente.')
  })
  it('pide personas y días de la semana, y que algún día caiga en el período', () => {
    expect(validateWorkDays({ ...valid, employeeIds: [] })).toBe('Elegí al menos una persona.')
    expect(validateWorkDays({ ...valid, weekdays: [] })).toBe('Elegí al menos un día de la semana.')
    expect(validateWorkDays({ ...valid, from: '2026-11-09', to: '2026-11-13', weekdays: [6, 7] })).toBe('Ningún día del período cae en los días elegidos. Elegí otros días o otro período.')
  })
})

describe('resultado agrupado por motivo', () => {
  const names = new Map([['e-1', 'Ana'], ['e-2', 'Pedro'], ['e-3', 'Lucía']])
  it('cuenta lo cargado y agrupa lo que no se cargó, con los nombres sin repetir', () => {
    const created = (employeeId: string, localDate: string) => ({ id: `${employeeId}-${localDate}`, employeeId, siteId: 's-1', localDate, state: 'NO_INGRESO' as const })
    const summary = summarizeBulkResult({
      created: [created('e-3', '2026-12-01'), created('e-3', '2026-12-02')],
      skipped: [
        { employeeId: 'e-3', localDate: '2026-12-03', reason: 'JORNADA_EXISTS' },
        { employeeId: 'e-1', localDate: '2026-12-01', reason: 'TEMPLATE_REQUIRED' },
        { employeeId: 'e-1', localDate: '2026-12-02', reason: 'TEMPLATE_REQUIRED' },
        { employeeId: 'e-2', localDate: '2026-12-01', reason: 'TEMPLATE_REQUIRED' },
        { employeeId: 'e-2', localDate: '2026-12-02', reason: 'TEMPLATE_INVALID' }
      ]
    }, (id) => names.get(id) ?? 'Una persona')
    expect(summary).toEqual({
      created: 2, skipped: 5,
      existing: { count: 1, names: ['Lucía'] },
      noSchedule: { count: 3, names: ['Ana', 'Pedro'] },
      inactiveSchedule: { count: 1, names: ['Pedro'] }
    })
  })
})
