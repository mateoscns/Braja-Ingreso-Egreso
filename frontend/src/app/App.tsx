import { useEffect } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { Loading } from './ui'
import { SessionProvider, useSession } from './session'
import { LoginScreen, CompanyScreen, PasswordChangeScreen } from '../features/auth/AuthScreens'
import { AdminApp } from '../features/admin/AdminApp'
import { EmployeeApp } from '../features/employee/EmployeeApp'

export function App() {
  useEffect(() => { registerSW({ immediate: true }) }, [])
  return <SessionProvider><Application /></SessionProvider>
}

function Application() {
  const { session, loading, error, signIn, signOut, activateCompany, changePassword } = useSession()
  if (loading) return <main className="boot-screen"><Loading label="Preparando Fichaje Braja…" /></main>
  if (!session) return <LoginScreen onSignIn={signIn} error={error} />
  if (session.mustChangePassword) return <PasswordChangeScreen onChange={changePassword} onSignOut={() => void signOut()} />
  const active = session.memberships.find((membership) => membership.companyId === session.activeCompanyId)
  if (!active) return <CompanyScreen session={session} onSelect={activateCompany} onSignOut={() => void signOut()} />
  return active.role === 'ADMIN' ? <AdminApp key={active.companyId} /> : <EmployeeApp key={active.companyId} />
}
