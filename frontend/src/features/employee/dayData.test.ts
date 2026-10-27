import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../shared/api/client'
import type { Deviation, Jornada, Site } from '../../shared/api/types'
import { dateForSite, loadEmployeeDayData, localCalendarDate } from './dayData'

const sites: Site[] = [
  { id: 's-east', name: 'Isla Este', timeZone: 'Pacific/Kiritimati' },
  { id: 's-west', name: 'Isla Oeste', timeZone: 'Pacific/Honolulu' }
]
const instant = new Date('2026-10-16T01:00:00Z')

describe('fechas de jornada según la zona de sede', () => {
  it('calcula días locales distintos para sedes al otro lado de la línea internacional de fecha', () => {
    expect(localCalendarDate(sites[0].timeZone, instant)).toBe('2026-10-16')
    expect(localCalendarDate(sites[1].timeZone, instant)).toBe('2026-10-15')
    expect(dateForSite(sites[0].timeZone, '', instant)).toBe('2026-10-16')
    expect(dateForSite(sites[1].timeZone, '', instant)).toBe('2026-10-15')
  })

  it('carga cada jornada por su fecha local y filtra resultados de otras sedes/fechas', async () => {
    const eastJourney = { id: 'j-east', siteId: 's-east', localDate: '2026-10-16' } as Jornada
    const westJourney = { id: 'j-west', siteId: 's-west', localDate: '2026-10-15' } as Jornada
    const wrongDate = { id: 'wrong', siteId: 's-west', localDate: '2026-10-16' } as Jornada
    const overnight = {
      id: 'j-overnight', siteId: 's-east', localDate: '2026-10-15', state: 'EN_CURSO',
      scheduleSnapshot: { blocks: [{ startDayOffset: 0, start: '22:00', end: '06:00', endDayOffset: 1 }] }
    } as Jornada
    const closedOvernight = { ...overnight, id: 'closed', state: 'EGRESADA' } as Jornada
    const previousDayShift = {
      ...overnight, id: 'day-shift', state: 'EN_CURSO',
      scheduleSnapshot: { blocks: [{ startDayOffset: 0, start: '09:00', end: '17:00', endDayOffset: 0 }] }
    } as Jornada
    const get = vi.fn(async (path: string) => {
      if (path === '/jornadas/mine?localDate=2026-10-16') return [eastJourney, wrongDate] as never
      if (path === '/jornadas/mine?localDate=2026-10-15') return [westJourney, overnight, closedOvernight, previousDayShift] as never
      if (path === '/jornadas/mine?localDate=2026-10-14') return [] as never
      if (path.startsWith('/deviations?')) return [] as never
      throw new Error(`GET inesperado: ${path}`)
    })

    const apiClient = { get: get as unknown as ApiClient['get'] }
    const data = await loadEmployeeDayData(apiClient, sites, '', instant)
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-16')
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-15')
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-14')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-16&to=2026-10-16&siteId=s-east')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-15&to=2026-10-15&siteId=s-west')
    expect(data.jornadas.map((item) => item.id)).toEqual(['j-east', 'j-west', 'j-overnight'])
    expect(data.siteDates).toEqual(new Map([['s-east', '2026-10-16'], ['s-west', '2026-10-15']]))
  })

  it('usa la misma fecha local elegida para todas las sedes', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.startsWith('/jornadas/mine?')) return [] as Jornada[]
      if (path.startsWith('/deviations?')) return [] as Deviation[]
      throw new Error(`GET inesperado: ${path}`)
    })
    const apiClient = { get: get as unknown as ApiClient['get'] }
    const data = await loadEmployeeDayData(apiClient, sites, '2026-10-12', instant)
    expect(get).toHaveBeenCalledTimes(4)
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-12')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-12&to=2026-10-12&siteId=s-east')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-12&to=2026-10-12&siteId=s-west')
    expect([...data.siteDates.values()]).toEqual(['2026-10-12', '2026-10-12'])
  })

  it('no agrega jornadas de la víspera cuando se consulta una fecha elegida', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.startsWith('/jornadas/mine?')) return [] as Jornada[]
      if (path.startsWith('/deviations?')) return [] as Deviation[]
      throw new Error(`GET inesperado: ${path}`)
    })
    const data = await loadEmployeeDayData({ get: get as unknown as ApiClient['get'] }, sites, '2026-10-16', instant)
    expect(get).toHaveBeenCalledTimes(4)
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-16')
    expect(data.jornadas).toEqual([])
  })
})

describe('motivos pendientes de cualquier fecha', () => {
  const pending = (id: string, jornadaId: string): Deviation => ({
    id, jornadaId, siteId: 's-east', type: 'MARCA_FALTANTE', status: 'MOTIVO_PENDIENTE', createdAt: '2026-10-15T09:00:00Z', pushEligible: false
  })

  it('pide los MOTIVO_PENDIENTE sin fecha y los devuelve aparte de los desvíos de la fecha consultada', async () => {
    const overnightPending = pending('d-overnight', 'j-previous-night')
    const oldPending = pending('d-old', 'j-last-month')
    const get = vi.fn(async (path: string) => {
      if (path.startsWith('/jornadas/mine?')) return [] as Jornada[]
      if (path === '/deviations?status=MOTIVO_PENDIENTE&limit=100') return [overnightPending, oldPending]
      if (path.startsWith('/deviations?from=')) return [] as Deviation[]
      throw new Error(`GET inesperado: ${path}`)
    })
    const data = await loadEmployeeDayData({ get: get as unknown as ApiClient['get'] }, sites, '', instant)
    expect(get).toHaveBeenCalledWith('/deviations?status=MOTIVO_PENDIENTE&limit=100')
    expect(data.deviations).toEqual([])
    expect(data.pendingMotives.map((item) => item.id)).toEqual(['d-overnight', 'd-old'])
  })

  it('no continúa una jornada nocturna de la víspera que fue cancelada', async () => {
    const overnight = {
      id: 'j-overnight', siteId: 's-east', localDate: '2026-10-15', state: 'CANCELADA',
      scheduleSnapshot: { blocks: [{ startDayOffset: 0, start: '22:00', end: '06:00', endDayOffset: 1 }] }
    } as Jornada
    const get = vi.fn(async (path: string) => {
      if (path === '/jornadas/mine?localDate=2026-10-15') return [overnight] as Jornada[]
      if (path.startsWith('/jornadas/mine?')) return [] as Jornada[]
      if (path.startsWith('/deviations?')) return [] as Deviation[]
      throw new Error(`GET inesperado: ${path}`)
    })
    const data = await loadEmployeeDayData({ get: get as unknown as ApiClient['get'] }, sites, '', instant)
    expect(data.jornadas).toEqual([])
  })

  it('también los pide cuando se consulta una fecha elegida', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.startsWith('/jornadas/mine?')) return [] as Jornada[]
      if (path === '/deviations?status=MOTIVO_PENDIENTE&limit=100') return [pending('d-1', 'j-1')]
      if (path.startsWith('/deviations?from=')) return [] as Deviation[]
      throw new Error(`GET inesperado: ${path}`)
    })
    const data = await loadEmployeeDayData({ get: get as unknown as ApiClient['get'] }, sites, '2026-10-01', instant)
    expect(data.pendingMotives.map((item) => item.id)).toEqual(['d-1'])
  })
})
