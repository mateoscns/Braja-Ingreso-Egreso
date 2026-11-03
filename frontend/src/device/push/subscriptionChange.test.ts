import { describe, expect, it, vi } from 'vitest'
import { decodeVapidKey, isSubscriptionChangedMessage, PUSH_SUBSCRIPTION_CHANGED, renewPushSubscription } from './subscriptionChange'

const OLD = 'https://fcm.googleapis.com/fcm/send/device-old'
const RENEWED = 'https://fcm.googleapis.com/fcm/send/device-renewed'

function setup({ current = null as { endpoint: string } | null, windows = 2 } = {}) {
  const pushManager = { getSubscription: vi.fn().mockResolvedValue(current), subscribe: vi.fn().mockResolvedValue({ endpoint: RENEWED }) }
  const clientWindows = Array.from({ length: windows }, () => ({ postMessage: vi.fn() }))
  const clients = { matchAll: vi.fn().mockResolvedValue(clientWindows) }
  const loadVapidKey = vi.fn().mockResolvedValue('cHVibGljLXZhcGlkLWtleQ')
  return { pushManager, clientWindows, clients, loadVapidKey }
}

describe('renewPushSubscription (service worker pushsubscriptionchange)', () => {
  it('keeps the subscription the browser already renewed and tells every open window the old endpoint', async () => {
    const { pushManager, clientWindows, clients, loadVapidKey } = setup()
    await renewPushSubscription({ pushManager, clients, loadVapidKey, oldSubscription: { endpoint: OLD }, newSubscription: { endpoint: RENEWED } })

    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(loadVapidKey).not.toHaveBeenCalled()
    expect(clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
    for (const client of clientWindows) expect(client.postMessage).toHaveBeenCalledWith({ type: PUSH_SUBSCRIPTION_CHANGED, oldEndpoint: OLD })
  })

  it('subscribes again with the key of the old subscription when the browser gave none', async () => {
    const { pushManager, clientWindows, clients, loadVapidKey } = setup()
    const key = new Uint8Array([1, 2, 3]).buffer
    await renewPushSubscription({ pushManager, clients, loadVapidKey, oldSubscription: { endpoint: OLD, options: { applicationServerKey: key } }, newSubscription: null })

    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key })
    expect(loadVapidKey).not.toHaveBeenCalled()
    expect(clientWindows[0].postMessage).toHaveBeenCalledWith({ type: PUSH_SUBSCRIPTION_CHANGED, oldEndpoint: OLD })
  })

  it('loads the VAPID key from the public configuration when the old subscription is unknown', async () => {
    const { pushManager, clientWindows, clients, loadVapidKey } = setup()
    await renewPushSubscription({ pushManager, clients, loadVapidKey, oldSubscription: null, newSubscription: null })

    expect(loadVapidKey).toHaveBeenCalledTimes(1)
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: decodeVapidKey('cHVibGljLXZhcGlkLWtleQ') })
    expect(clientWindows[0].postMessage).toHaveBeenCalledWith({ type: PUSH_SUBSCRIPTION_CHANGED, oldEndpoint: null })
  })

  it('reuses a new subscription the browser already holds instead of subscribing twice', async () => {
    const { pushManager, clients, loadVapidKey } = setup({ current: { endpoint: RENEWED } })
    await renewPushSubscription({ pushManager, clients, loadVapidKey, oldSubscription: { endpoint: OLD }, newSubscription: null })
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('does nothing when push is disabled on the server', async () => {
    const { pushManager, clientWindows, clients, loadVapidKey } = setup()
    loadVapidKey.mockResolvedValue(null)
    await renewPushSubscription({ pushManager, clients, loadVapidKey, oldSubscription: { endpoint: OLD }, newSubscription: null })
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(clientWindows[0].postMessage).not.toHaveBeenCalled()
  })
})

describe('isSubscriptionChangedMessage', () => {
  it('accepts only the message the service worker sends', () => {
    expect(isSubscriptionChangedMessage({ type: PUSH_SUBSCRIPTION_CHANGED, oldEndpoint: OLD })).toBe(true)
    expect(isSubscriptionChangedMessage({ type: PUSH_SUBSCRIPTION_CHANGED, oldEndpoint: null })).toBe(true)
    expect(isSubscriptionChangedMessage({ type: PUSH_SUBSCRIPTION_CHANGED, oldEndpoint: 42 })).toBe(false)
    expect(isSubscriptionChangedMessage({ type: 'SKIP_WAITING' })).toBe(false)
    expect(isSubscriptionChangedMessage(null)).toBe(false)
  })
})
