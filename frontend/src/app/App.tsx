import { registerSW } from 'virtual:pwa-register'
import { ENTRY_TITLES, entryScreen, Loading, useDocumentTitle } from './ui'
import { SessionProvider, useSession } from './session'
import { LoginScreen, CompanyScreen, OfflineScreen, PasswordChangeScreen } from '../features/auth/AuthScreens'
import { AdminApp } from '../features/admin/AdminApp'
import { EmployeeApp } from '../features/employee/EmployeeApp'
import { ServiceWorkerUpdate } from '../device/pwa/ServiceWorkerUpdate'

export function App() {
  return <>
    <ServiceWorkerUpdate register={registerSW} />
    <SessionProvider><Application /></SessionProvider>
  </>
}

function Application() {
  const { session, loading, error, unreachable, retry, signIn, signOut, activateCompany, changePassword } = useSession()
  const screen = entryScreen(loading, session, unreachable)
  // Each screen names the browser tab (WCAG 2.4.2); the ADMIN's sections do it themselves (AdminApp).
  useDocumentTitle(ENTRY_TITLES[screen])
  if (screen === 'boot') return <main className="boot-screen"><Loading label="Preparando Fichaje Braja…" /></main>
  if (screen === 'offline') return <OfflineScreen onRetry={retry} />
  if (!session) return <LoginScreen onSignIn={signIn} error={error} />
  if (screen === 'password') return <PasswordChangeScreen onChange={changePassword} onSignOut={() => void signOut()} />
  const active = session.memberships.find((membership) => membership.companyId === session.activeCompanyId)
  if (!active) return <CompanyScreen session={session} onSelect={activateCompany} onSignOut={() => void signOut()} />
  return active.role === 'ADMIN' ? <AdminApp key={active.companyId} /> : <EmployeeApp key={active.companyId} />
}
