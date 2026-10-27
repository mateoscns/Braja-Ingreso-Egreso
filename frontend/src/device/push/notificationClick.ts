/** Structural subset of the Service Worker `Clients`/`WindowClient` APIs, so the logic is testable outside a worker. */
export type WindowClientLike = {
  url: string
  focus: () => Promise<unknown>
  navigate?: (url: string) => Promise<WindowClientLike | null>
}
export type ClientsLike = {
  matchAll: (options: { type: 'window'; includeUncontrolled: boolean }) => Promise<readonly WindowClientLike[]>
  openWindow: (url: string) => Promise<unknown>
}

const isAdminPath = (client: WindowClientLike) => new URL(client.url).pathname === '/admin'

/**
 * Brings the ADMIN view to the front after a notification click. `navigate` is missing in some browsers and
 * rejects for windows this worker does not control, so each step falls back instead of doing nothing.
 */
export async function focusOrOpenAdmin(clients: ClientsLike, origin: string, targetUrl: string): Promise<void> {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  const own = windows.filter((client) => new URL(client.url).origin === origin)
  const candidate = own.find(isAdminPath) ?? own[0]
  if (candidate && typeof candidate.navigate === 'function') {
    try {
      const navigated = await candidate.navigate(targetUrl)
      if (navigated) {
        await navigated.focus()
        return
      }
    } catch { /* Uncontrolled window: try the next fallback. */ }
  }
  const adminWindow = own.find(isAdminPath)
  if (adminWindow) {
    try {
      await adminWindow.focus()
      return
    } catch { /* Focus can be refused; open a new window instead. */ }
  }
  await clients.openWindow(targetUrl)
}
