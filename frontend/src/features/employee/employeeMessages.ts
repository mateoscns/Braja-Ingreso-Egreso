import { ApiError } from '../../shared/api/client'
import { INTERRUPTED_MARK_MESSAGE } from '../auth/interruptedMark'

const STALE_MARK_CODES = new Set(['INVALID_MARK_TRANSITION', 'INVALID_MARK_ORDER', 'INVALID_MARK_HISTORY'])

/** The result of the mark is unknown; the retry reuses the same Idempotency-Key, so it never records twice. */
export const UNKNOWN_MARK_RESULT = 'No sabemos si llegó. Tocá el mismo botón otra vez: no se marca dos veces.'

export function markFailureMessage(reason: unknown): string {
  if (reason instanceof Error && reason.name === 'TimeoutError') return UNKNOWN_MARK_RESULT
  if (reason instanceof Error && reason.name === 'NetworkError') return 'No hay internet. Tu marca no se registró. Cuando vuelva la conexión, tocá el mismo botón otra vez.'
  // A deploy restarts the backend behind the proxy; the pending attempt keeps its Idempotency-Key, so retrying is safe.
  if (reason instanceof ApiError && reason.status === 503) return 'El sistema se está actualizando. Esperá un minuto y volvé a marcar.'
  if (reason instanceof ApiError && reason.status === 401) return INTERRUPTED_MARK_MESSAGE
  if (reason instanceof ApiError && reason.code === 'RETRYABLE_TRANSACTION_CONFLICT') return 'Tu marca no se registró. Esperá unos segundos y tocá el mismo botón otra vez.'
  if (reason instanceof ApiError && reason.code && STALE_MARK_CODES.has(reason.code)) return 'Tu día cambió y esa marca ya no corresponde. Te mostramos cómo está ahora.'
  return reason instanceof Error ? reason.message : UNKNOWN_MARK_RESULT
}

/** Sending a motive failed; the typed text stays in the card. */
export function motiveFailureMessage(reason: unknown): string {
  if (reason instanceof Error && reason.name === 'NetworkError') return 'No hay internet. Lo que escribiste sigue acá: probá de nuevo cuando vuelva la conexión.'
  if (reason instanceof Error && reason.name === 'TimeoutError') return 'No sabemos si llegó. Probá de nuevo: se guarda una sola vez.'
  if (reason instanceof ApiError && reason.status === 503) return 'El sistema se está actualizando. Esperá un minuto y probá de nuevo.'
  return reason instanceof Error ? reason.message : 'No pudimos enviarlo. Probá otra vez.'
}

/** Loading the day failed: say it in plain words and point to the Reintentar button. */
export function loadFailureMessage(reason: unknown, fallback = 'No pudimos cargar tu día. Tocá Reintentar.'): string {
  if (reason instanceof Error && reason.name === 'NetworkError') return 'No hay internet. Revisá la conexión y tocá Reintentar.'
  if (reason instanceof Error && reason.name === 'TimeoutError') return 'El sistema tardó demasiado en responder. Tocá Reintentar.'
  if (reason instanceof ApiError && reason.status === 503) return 'El sistema se está actualizando. Esperá un minuto y tocá Reintentar.'
  return reason instanceof Error ? reason.message : fallback
}
