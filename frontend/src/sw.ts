/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { createHandlerBoundToURL } from 'workbox-precaching'
import { NetworkOnly } from 'workbox-strategies'
import { API_PATH_PATTERN, isApiPath } from './shared/pwa/routePolicy'
import { safeDeviationNotification } from './device/push/safeNotification'
import { focusOrOpenAdmin } from './device/push/notificationClick'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision?: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

registerRoute(
  ({ url }) => url.origin === self.location.origin && isApiPath(url.pathname),
  new NetworkOnly(),
  'GET'
)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [API_PATH_PATTERN]
}))

self.addEventListener('push', (event) => {
  let payload: unknown
  try { payload = event.data?.json() } catch { payload = undefined }
  const notification = safeDeviationNotification(payload)
  event.waitUntil(self.registration.showNotification(notification.title, notification.options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/admin', self.location.origin)
  const safeUrl = target.origin === self.location.origin && target.pathname === '/admin' ? `${target.pathname}${target.search}` : '/admin'
  event.waitUntil(focusOrOpenAdmin(self.clients, self.location.origin, safeUrl))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})
