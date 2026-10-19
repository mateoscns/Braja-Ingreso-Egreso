import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api } from '../shared/api/client'
import type { Session } from '../shared/api/types'

type SessionContextValue = {
  session: Session | null
  loading: boolean
  error: string
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

  const refresh = useCallback(async () => {
    try {
      const current = await api.get<Session>('/session')
      setSession(current)
      setError('')
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setSession(null)
      else setError(reason instanceof Error ? reason.message : 'No se pudo validar la sesión.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const signIn = useCallback(async (dni: string, password: string) => {
    const current = await api.post<Session>('/session', { dni, password })
    api.clearCsrf()
    setSession(current)
    setError('')
  }, [])

  const signOut = useCallback(async () => {
    let failure = ''
    try { await api.delete('/session') } catch {
      failure = 'No se pudo confirmar el cierre de sesión con el servidor. Cerrá también esta pestaña si terminaste.'
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

  const value = useMemo(() => ({ session, loading, error, signIn, signOut, activateCompany, changePassword }),
    [session, loading, error, signIn, signOut, activateCompany, changePassword])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession debe usarse dentro de SessionProvider.')
  return value
}
