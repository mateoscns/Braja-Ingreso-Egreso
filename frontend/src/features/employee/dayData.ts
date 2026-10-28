import type { ApiClient } from '../../shared/api/client'
import { queryString } from '../../shared/api/client'
import type { Deviation, Jornada, Site } from '../../shared/api/types'

export type EmployeeDayData = {
  siteDates: Map<string, string>
  jornadas: Jornada[]
  /** Deviations of the consulted local date at each site. */
  deviations: Deviation[]
  /** MOTIVO_PENDIENTE deviations of every date (overnight and older jornadas included), scoped by the session. */
  pendingMotives: Deviation[]
  /** True when the server returned a full page: older pending motives may exist beyond it. */
  pendingMotivesTruncated: boolean
  /** Message of a failed pending-motives request ('' when it loaded); it never fails the day view. */
  pendingMotivesError: string
}

export type PendingMotives = { items: Deviation[]; truncated: boolean }

/** Upper bound of pending motives loaded at once; the API allows 1 to 200. */
export const PENDING_MOTIVES_LIMIT = 100

/** The API lists newest detection first, so a full page holds the most recent pending motives. */
export async function loadPendingMotives(apiClient: Pick<ApiClient, 'get'>): Promise<PendingMotives> {
  const items = await apiClient.get<Deviation[]>(`/deviations${queryString({ status: 'MOTIVO_PENDIENTE', limit: PENDING_MOTIVES_LIMIT })}`)
  return { items, truncated: items.length >= PENDING_MOTIVES_LIMIT }
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
  return jornada.state !== 'EGRESADA' && jornada.state !== 'CANCELADA' && jornada.scheduleSnapshot.blocks.some((block) => block.endDayOffset === 1)
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
  const [journeyPages, deviationPages, pendingMotives] = await Promise.all([
    Promise.all(distinctDates.map((localDate) => apiClient.get<Jornada[]>(`/jornadas/mine${queryString({ localDate })}`))),
    Promise.all(sites.map((site) => {
      const localDate = siteDates.get(site.id)!
      return apiClient.get<Deviation[]>(`/deviations${queryString({ from: localDate, to: localDate, siteId: site.id })}`)
    })),
    // Settled on its own: a failed pending list is shown in its panel instead of failing the whole day view.
    loadPendingMotives(apiClient).then(
      (pending) => ({ ...pending, error: '' }),
      (reason: unknown) => ({ items: [] as Deviation[], truncated: false, error: reason instanceof Error ? reason.message : 'No se pudieron consultar los motivos pendientes.' })
    )
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
  return {
    siteDates, jornadas: [...jornadas.values()], deviations: [...deviations.values()],
    pendingMotives: pendingMotives.items, pendingMotivesTruncated: pendingMotives.truncated, pendingMotivesError: pendingMotives.error
  }
}
