export type SafeNotification = {
  title: string
  options: NotificationOptions
  url: string
}

const GENERIC_BODY = 'Hay un desvío para revisar en la bandeja.'
const GENERIC_TAG = 'braja-desvios-pendientes'
const MAX_COUNT = 1_000_000

type SiteCount = { siteName: string; count: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_COUNT
}

function safeNotificationTag(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : GENERIC_TAG
}

function cleanSiteName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!name || name.length > 80) return null
  return name
}

function getValidatedPayload(payload: unknown): { totalCount: number; siteCounts: SiteCount[] } | null {
  if (!isRecord(payload) || !validCount(payload.totalCount)) return null
  if (!Array.isArray(payload.siteCounts)) return payload.siteCounts == null ? { totalCount: payload.totalCount, siteCounts: [] } : null

  const siteCounts: SiteCount[] = []
  for (const value of payload.siteCounts) {
    if (!isRecord(value) || !validCount(value.count)) return null
    const siteName = cleanSiteName(value.siteName)
    if (!siteName) return null
    siteCounts.push({ siteName, count: value.count })
  }
  const siteTotal = siteCounts.reduce((sum, site) => sum + site.count, 0)
  if (siteCounts.length > 0 && siteTotal !== payload.totalCount) return null
  return { totalCount: payload.totalCount, siteCounts }
}

function notificationBody(payload: unknown): string {
  const validated = getValidatedPayload(payload)
  if (!validated) return GENERIC_BODY
  const countLabel = validated.totalCount === 1 ? '1 desvío nuevo' : `${validated.totalCount} desvíos nuevos`
  const breakdown = validated.siteCounts.map(({ siteName, count }) => `${siteName}: ${count}`).join(' · ')
  return breakdown ? `Hay ${countLabel} para revisar. ${breakdown}` : `Hay ${countLabel} para revisar en la bandeja.`
}

export function safeDeviationNotification(payload?: unknown): SafeNotification {
  const url = '/admin'
  const tag = isRecord(payload) ? safeNotificationTag(payload.tag) : GENERIC_TAG
  return {
    title: 'Fichaje Braja · Desvíos pendientes',
    options: {
      body: notificationBody(payload),
      tag,
      icon: '/icon-192.png',
      badge: '/favicon.svg',
      data: { url }
    },
    url
  }
}
