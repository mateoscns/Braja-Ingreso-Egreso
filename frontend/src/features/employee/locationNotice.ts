/**
 * The first mark of a session explains why the location is asked (rule 3). Kept in memory only, never in browser storage
 * (rule 27): a page reload shows it again, a company switch does not.
 */
let seen = false

export const LOCATION_NOTICE = 'Para marcar necesitamos saber que estás en el local. Solo se mira en el momento de marcar.'

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
