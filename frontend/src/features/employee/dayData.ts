import type { ApiClient } from '../../shared/api/client'
import { queryString } from '../../shared/api/client'
import type { Deviation, Jornada, Site } from '../../shared/api/types'

export type EmployeeDayData = {
  siteDates: Map<string, string>
  jornadas: Jornada[]
  deviations: Deviation[]
}

export function localCalendarDate(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function dateForSite(timeZone: string, selectedDate: string, instant = new Date()): string {
  return selectedDate || localCalendarDate(timeZone, instant)
}

export async function loadEmployeeDayData(
  apiClient: Pick<ApiClient, 'get'>,
  sites: Site[],
  selectedDate: string,
  instant = new Date()
): Promise<EmployeeDayData> {
  const siteDates = new Map(sites.map((site) => [site.id, dateForSite(site.timeZone, selectedDate, instant)]))
  const distinctDates = [...new Set(siteDates.values())]
  const [journeyPages, deviationPages] = await Promise.all([
    Promise.all(distinctDates.map((localDate) => apiClient.get<Jornada[]>(`/jornadas/mine${queryString({ localDate })}`))),
    Promise.all(sites.map((site) => {
      const localDate = siteDates.get(site.id)!
      return apiClient.get<Deviation[]>(`/deviations${queryString({ from: localDate, to: localDate, siteId: site.id })}`)
    }))
  ])

  const jornadas = new Map<string, Jornada>()
  for (const jornada of journeyPages.flat()) {
    if (siteDates.get(jornada.siteId) === jornada.localDate) jornadas.set(jornada.id, jornada)
  }
  const deviations = new Map<string, Deviation>()
  for (const item of deviationPages.flat()) deviations.set(item.id, item)
  return { siteDates, jornadas: [...jornadas.values()], deviations: [...deviations.values()] }
}
