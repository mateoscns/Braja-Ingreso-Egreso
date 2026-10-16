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
    const get = vi.fn(async (path: string) => {
      if (path === '/jornadas/mine?localDate=2026-10-16') return [eastJourney, wrongDate] as never
      if (path === '/jornadas/mine?localDate=2026-10-15') return [westJourney] as never
      if (path.startsWith('/deviations?')) return [] as never
      throw new Error(`GET inesperado: ${path}`)
    })

    const apiClient = { get: get as unknown as ApiClient['get'] }
    const data = await loadEmployeeDayData(apiClient, sites, '', instant)
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-16')
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-15')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-16&to=2026-10-16&siteId=s-east')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-15&to=2026-10-15&siteId=s-west')
    expect(data.jornadas.map((item) => item.id)).toEqual(['j-east', 'j-west'])
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
    expect(get).toHaveBeenCalledTimes(3)
    expect(get).toHaveBeenCalledWith('/jornadas/mine?localDate=2026-10-12')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-12&to=2026-10-12&siteId=s-east')
    expect(get).toHaveBeenCalledWith('/deviations?from=2026-10-12&to=2026-10-12&siteId=s-west')
    expect([...data.siteDates.values()]).toEqual(['2026-10-12', '2026-10-12'])
  })
})
