/**
 * The first mark of a session explains why the location is asked (rule 3). Kept in memory only, never in browser storage
 * (rule 27): a page reload shows it again, a company switch does not.
 */
let seen = false

/** Rule 2: the location never blocks a mark, so it is not worded as a condition (T12, finding A-1). */
export const LOCATION_NOTICE = 'Al marcar, el celular manda tu ubicación una sola vez para saber si estás en el local. Si no llega, la marca igual se registra.'

export function locationNoticeSeen(): boolean { return seen }

export function rememberLocationNotice(): void { seen = true }

/** Shows the notice again on the next mark; used by tests. */
export function forgetLocationNotice(): void { seen = false }

/** A location permission already granted needs no explanation; the Permissions API is optional and may be missing. */
export function skipNoticeIfLocationGranted(): void {
  try {
    void navigator.permissions?.query({ name: 'geolocation' })
      .then((status) => { if (status.state === 'granted') seen = true })
      .catch(() => undefined)
  } catch { /* Sin Permissions API se muestra el aviso. */ }
}
