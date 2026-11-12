import { useEffect, useState } from 'react'
import { api, type ApiClient } from '../shared/api/client'
import type { Session } from '../shared/api/types'
import { Icon } from './icons'
import { Status } from './ui'

/**
 * The warning before the session closes for inactivity (D-20261112-02; WCAG 2.2.1, finding F-04). An account that is ADMIN in
 * any company keeps the 30 minute idle limit of rule 23; an account that is only EMPLOYEE keeps 30 days and gets no warning.
 */
export function warnsBeforeIdleClose(session: Session | null): boolean {
  return Boolean(session?.memberships.some((membership) => membership.role === 'ADMIN'))
}

const MINUTE = 60_000
/** The server closes the session 30 minutes after the last request it saw; the warning comes 2 minutes before. */
export const IDLE_WARNING_MS = 28 * MINUTE

export const SESSION_WARNING_TEXT = 'Tu sesión se va a cerrar por inactividad en 2 minutos.'

/**
 * The server's idle clock restarts with every request that reaches it with the session cookie, not with a mouse move: so the
 * warning's clock restarts with every answer the client observes (ApiClient.onResponse), and «Seguir conectado» is one GET of
 * the session, which answers and restarts both. The 30 minutes and the rest of rule 23 stay as they are.
 *
 * It is a status region at the top of the page, in its flow, like the notice of a new version (N-8: nothing floats): it mounts
 * empty and writes its text right after (Status), so it is announced once, politely, when it appears. It does not take the
 * focus (WCAG 2.4.3 and 3.2.2): it may appear while the ADMIN is typing in a long form, and moving the focus would send the next
 * keys elsewhere. WCAG 2.2.1 asks for a warning and at least 20 seconds to extend the time with a simple action: here there are
 * 2 minutes, and the button is the first control of the page, so it is also the first stop of Tab from the top.
 */
export function SessionWarning({ client = api }: { client?: Pick<ApiClient, 'get' | 'onResponse'> }) {
  const [shown, setShown] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const show = () => setShown(true)
    // The session was just read when this mounts, so its clock starts now.
    let timer = window.setTimeout(show, IDLE_WARNING_MS)
    const stop = client.onResponse(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(show, IDLE_WARNING_MS)
      setShown(false); setError('')
    })
    return () => { window.clearTimeout(timer); stop() }
  }, [client])
  async function renew() {
    setRenewing(true); setError('')
    // An answer hides the warning through the observer; a 401 means it already closed, and the login screen says so.
    try { await client.get('/session') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No pudimos mantener tu sesión abierta. Reintentá.') }
    finally { setRenewing(false) }
  }
  if (!shown) return null
  return <Status as="div" className="update-banner session-warning message message-warning">
    <Icon name="alert" />
    <div className="message-body"><p>{SESSION_WARNING_TEXT}</p>{error && <p role="alert">{error}</p>}</div>
    <button type="button" className="button button-secondary" disabled={renewing} onClick={() => void renew()}>Seguir conectado</button>
  </Status>
}
