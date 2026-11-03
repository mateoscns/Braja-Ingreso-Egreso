/** Message the service worker posts to open windows after the browser renewed the push subscription. */
export const PUSH_SUBSCRIPTION_CHANGED = 'PUSH_SUBSCRIPTION_CHANGED'
export type SubscriptionChangedMessage = { type: typeof PUSH_SUBSCRIPTION_CHANGED; oldEndpoint: string | null }

export function decodeVapidKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

export function isSubscriptionChangedMessage(data: unknown): data is SubscriptionChangedMessage {
  if (!data || typeof data !== 'object') return false
  const candidate = data as Record<string, unknown>
  return candidate.type === PUSH_SUBSCRIPTION_CHANGED && (candidate.oldEndpoint === null || typeof candidate.oldEndpoint === 'string')
}

/** Structural subsets of the Push and Clients APIs, so the logic is testable outside a worker. */
type SubscriptionLike = { endpoint: string; options?: { applicationServerKey?: ArrayBuffer | null } }
export type PushManagerLike = {
  getSubscription: () => Promise<SubscriptionLike | null>
  subscribe: (options: { userVisibleOnly: boolean; applicationServerKey: BufferSource }) => Promise<SubscriptionLike>
}
export type MessageClientsLike = {
  matchAll: (options: { type: 'window'; includeUncontrolled: boolean }) => Promise<readonly { postMessage: (message: unknown) => void }[]>
}

/**
 * Handles `pushsubscriptionchange`: makes sure the browser holds a valid subscription again and tells open windows, which
 * re-register it with the server using their session and CSRF token. The worker never calls the authenticated API itself.
 * `loadVapidKey` returns null when push is disabled on the server; then there is nothing to renew.
 */
export async function renewPushSubscription({ pushManager, clients, loadVapidKey, oldSubscription, newSubscription }: {
  pushManager: PushManagerLike
  clients: MessageClientsLike
  loadVapidKey: () => Promise<string | null>
  oldSubscription: SubscriptionLike | null
  newSubscription: SubscriptionLike | null
}): Promise<void> {
  const oldEndpoint = oldSubscription?.endpoint ?? null
  let renewed = newSubscription
  if (!renewed) {
    const current = await pushManager.getSubscription()
    if (current && current.endpoint !== oldEndpoint) renewed = current
  }
  if (!renewed) {
    const previousKey = oldSubscription?.options?.applicationServerKey
    const vapidKey = previousKey ? null : await loadVapidKey()
    if (!previousKey && !vapidKey) return
    const applicationServerKey: BufferSource = previousKey ?? decodeVapidKey(vapidKey as string) as BufferSource
    await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  }
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  const message: SubscriptionChangedMessage = { type: PUSH_SUBSCRIPTION_CHANGED, oldEndpoint }
  windows.forEach((client) => client.postMessage(message))
}
