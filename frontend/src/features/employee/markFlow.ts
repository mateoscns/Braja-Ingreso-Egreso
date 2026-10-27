import { ApiError, TimeoutError, type ApiClient } from '../../shared/api/client'

export type MarkAction = 'INGRESO' | 'EGRESO' | 'SALIDA_DESAYUNO' | 'VUELTA_DESAYUNO' | 'SALIDA_ALMUERZO' | 'VUELTA_ALMUERZO'
export type MarkAttempt = { jornadaId: string; action: MarkAction; idempotencyKey: string }
export type MarkReceipt = { id: string; acceptedAt: string }
export type LocationFix = { latitude: number; longitude: number; accuracyMeters: number }

const LOCATION_WINDOW_MS = 30_000
const MAX_GPS_WAIT_MS = 25_000
/** Deadline for the whole mark submission, including the single conflict retry. */
export const MARK_TIMEOUT_MS = 15_000
const MAX_RETRY_DELAY_MS = 5_000

export function createMarkAttempt(jornadaId: string, action: MarkAction): MarkAttempt {
  return { jornadaId, action, idempotencyKey: crypto.randomUUID() }
}

export function captureLocation(): Promise<LocationFix | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    let finished = false
    const timeout = window.setTimeout(() => {
      finished = true
      resolve(null)
    }, MAX_GPS_WAIT_MS)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (finished) return
        finished = true
        window.clearTimeout(timeout)
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy
        })
      },
      () => {
        if (finished) return
        finished = true
        window.clearTimeout(timeout)
        resolve(null)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: MAX_GPS_WAIT_MS }
    )
  })
}

export async function submitMark(
  apiClient: ApiClient,
  attempt: MarkAttempt,
  locate: () => Promise<LocationFix | null> = captureLocation
): Promise<MarkReceipt> {
  const startedAt = performance.now()
  const locationPromise = safelyLocate(locate)
  const controller = new AbortController()
  const deadline = window.setTimeout(() => controller.abort(new DOMException('Mark deadline expired', 'TimeoutError')), MARK_TIMEOUT_MS)
  let receipt: MarkReceipt
  try {
    receipt = await postWithOneRetry(apiClient, attempt, controller.signal)
  } finally { window.clearTimeout(deadline) }
  if (!receipt || typeof receipt.id !== 'string' || typeof receipt.acceptedAt !== 'string' || Number.isNaN(Date.parse(receipt.acceptedAt))) {
    throw new Error('El servidor no confirmó la marca con su hora oficial. Podés reintentar con la misma acción.')
  }

  void locationPromise.then(async (location) => {
    if (!location || performance.now() - startedAt >= LOCATION_WINDOW_MS) return
    try { await apiClient.attachLocation(receipt.id, location) } catch { /* La marca ya fue confirmada; el GPS es accesorio. */ }
  })
  return receipt
}

/**
 * A RETRYABLE_TRANSACTION_CONFLICT means the server rolled back without recording the mark,
 * so one automatic retry with the same Idempotency-Key is safe. A second conflict is reported.
 */
async function postWithOneRetry(apiClient: ApiClient, attempt: MarkAttempt, signal: AbortSignal): Promise<MarkReceipt> {
  const send = () => apiClient.post<MarkReceipt>(
    `/jornadas/${encodeURIComponent(attempt.jornadaId)}/marks`,
    { action: attempt.action },
    { 'Idempotency-Key': attempt.idempotencyKey },
    { signal }
  )
  try {
    return await send()
  } catch (reason) {
    if (!(reason instanceof ApiError) || reason.code !== 'RETRYABLE_TRANSACTION_CONFLICT') throw reason
    await waitBeforeRetry(reason.retryAfterSeconds, signal)
    return await send()
  }
}

function waitBeforeRetry(retryAfterSeconds: number | undefined, signal: AbortSignal): Promise<void> {
  const seconds = retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 1
  const delay = Math.min(seconds * 1000, MAX_RETRY_DELAY_MS)
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new TimeoutError()); return }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, delay)
    function onAbort() { window.clearTimeout(timer); reject(new TimeoutError()) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function safelyLocate(locate: () => Promise<LocationFix | null>): Promise<LocationFix | null> {
  try { return Promise.resolve(locate()).catch(() => null) } catch { return Promise.resolve(null) }
}
