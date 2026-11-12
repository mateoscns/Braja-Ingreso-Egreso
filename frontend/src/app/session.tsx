import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, NetworkError, TimeoutError, api } from '../shared/api/client'
import type { Session } from '../shared/api/types'
import { SessionWarning, warnsBeforeIdleClose } from './sessionWarning'

type SessionContextValue = {
  session: Session | null
  loading: boolean
  error: string
  /** The first check of the session got no answer (no internet, a timeout, or a 5xx while the server restarts): there may be a session. */
  unreachable: boolean
  /** Asks the server for the session again, after a check that got no answer. */
  retry: () => Promise<void>
  signIn: (dni: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  activateCompany: (companyId: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unreachable, setUnreachable] = useState(false)
  // Read by the listener of «online», which stays attached so the event is never missed between a render and its effects.
  const unreachableRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const current = await api.get<Session>('/session')
      setSession(current)
      setError('')
      unreachableRef.current = false
      setUnreachable(false)
    } catch (reason) {
      // Issue #169: an answer that never came is not a closed session. The installed app opened without internet showed the
      // sign-in, and an employee with a 30-day session believed they had been signed out.
      const noAnswer = reason instanceof NetworkError || reason instanceof TimeoutError || (reason instanceof ApiError && reason.status >= 500)
      unreachableRef.current = noAnswer
      setUnreachable(noAnswer)
      if (reason instanceof ApiError && reason.status === 401) setSession(null)
      else if (!noAnswer) setError(reason instanceof Error ? reason.message : 'No se pudo validar la sesión.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  // Back online, the check runs again by itself; nothing is stored in the browser meanwhile (rule 27).
  useEffect(() => {
    const again = () => { if (unreachableRef.current) void refresh() }
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [refresh])

  const sessionRef = useRef<Session | null>(null)
  // A layout effect runs in the same commit that shows the session, before anything the user can click: with a passive
  // effect a 401 right after the screen appeared found the ref still empty and dropped the expiry notice (#71, 2026-11-02).
  useLayoutEffect(() => { sessionRef.current = session }, [session])

  // Any 401 outside login and password change means the server session is gone: return to the login screen.
  useEffect(() => api.onSessionExpired(() => {
    if (sessionRef.current) setError('Tu sesión venció. Iniciá sesión nuevamente.')
    setSession(null)
  }), [])

  useEffect(() => api.onPasswordChangeRequired(() => {
    setSession((current) => current ? { ...current, mustChangePassword: true } : current)
  }), [])

  const signIn = useCallback(async (dni: string, password: string) => {
    const current = await api.post<Session>('/session', { dni, password })
    api.clearCsrf()
    setSession(current)
    setError('')
  }, [])

  const signOut = useCallback(async () => {
    let failure = ''
    try { await api.delete('/session') } catch (reason) {
      // A 401 means the server session was already gone, which is what signing out wants.
      if (!(reason instanceof ApiError && reason.status === 401)) {
        failure = 'No pudimos confirmar que la sesión se cerró. Si terminaste, cerrá también esta pestaña.'
      }
    } finally {
      api.clearCsrf()
      setSession(null)
      setError(failure)
    }
  }, [])

  const activateCompany = useCallback(async (companyId: string) => {
    const current = await api.put<Session>('/companies/active', { companyId })
    setSession(current)
    setError('')
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.put('/session/password', { currentPassword, newPassword })
    api.clearCsrf()
    setSession((current) => current ? { ...current, mustChangePassword: false } : current)
  }, [])

  const value = useMemo(() => ({ session, loading, error, unreachable, retry: refresh, signIn, signOut, activateCompany, changePassword }),
    [session, loading, error, unreachable, refresh, signIn, signOut, activateCompany, changePassword])
  // Above every screen of an account with the 30 minute limit, while it has a session (D-20261112-02). It mounts when a session
  // appears, so its clock starts with the session just read; every later answer of the server restarts it.
  return <SessionContext.Provider value={value}>{warnsBeforeIdleClose(session) && <SessionWarning />}{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession debe usarse dentro de SessionProvider.')
  return value
}
