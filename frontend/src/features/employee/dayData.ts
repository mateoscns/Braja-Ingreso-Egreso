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

function previousDate(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function isOpenOvernight(jornada: Jornada): boolean {
  return jornada.state !== 'EGRESADA' && jornada.scheduleSnapshot.blocks.some((block) => block.endDayOffset === 1)
}

export async function loadEmployeeDayData(
  apiClient: Pick<ApiClient, 'get'>,
  sites: Site[],
  selectedDate: string,
  instant = new Date()
): Promise<EmployeeDayData> {
  const siteDates = new Map(sites.map((site) => [site.id, dateForSite(site.timeZone, selectedDate, instant)]))
  const previousDates = new Map([...siteDates].map(([siteId, localDate]) => [siteId, previousDate(localDate)]))
  const distinctDates = [...new Set([...siteDates.values(), ...(selectedDate ? [] : previousDates.values())])]
  const [journeyPages, deviationPages] = await Promise.all([
    Promise.all(distinctDates.map((localDate) => apiClient.get<Jornada[]>(`/jornadas/mine${queryString({ localDate })}`))),
    Promise.all(sites.map((site) => {
      const localDate = siteDates.get(site.id)!
      return apiClient.get<Deviation[]>(`/deviations${queryString({ from: localDate, to: localDate, siteId: site.id })}`)
    }))
  ])

  const jornadas = new Map<string, Jornada>()
  for (const jornada of journeyPages.flat()) {
    const currentDate = siteDates.get(jornada.siteId)
    const isCurrentDay = currentDate === jornada.localDate
    const isContinuingOvernight = !selectedDate && previousDates.get(jornada.siteId) === jornada.localDate && isOpenOvernight(jornada)
    if (isCurrentDay || isContinuingOvernight) jornadas.set(jornada.id, jornada)
  }
  const deviations = new Map<string, Deviation>()
  for (const item of deviationPages.flat()) deviations.set(item.id, item)
  return { siteDates, jornadas: [...jornadas.values()], deviations: [...deviations.values()] }
}
