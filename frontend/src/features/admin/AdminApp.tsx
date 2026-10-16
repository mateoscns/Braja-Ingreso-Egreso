import { useState } from 'react'
import { AppHeader, CompanySwitcher } from '../../app/ui'
import { useSession } from '../../app/session'
import { AdminInbox, EmployeesView, JourneysView, SitesView, TemplatesView } from './AdminViews'
import { AdminPushControl } from '../../device/push/AdminPushControl'
import { InstallControl } from '../../device/pwa/InstallControl'

type AdminSection = 'inbox' | 'jornadas' | 'empleados' | 'sedes' | 'plantillas'
const links: { id: AdminSection; label: string; icon: string }[] = [
  { id: 'inbox', label: 'Bandeja', icon: '◷' }, { id: 'jornadas', label: 'Jornadas', icon: '▦' },
  { id: 'empleados', label: 'Empleados', icon: '♙' }, { id: 'sedes', label: 'Sedes', icon: '⌖' }, { id: 'plantillas', label: 'Plantillas', icon: '▤' }
]

export function AdminApp() {
  const { session, signOut, activateCompany } = useSession()
  const [section, setSection] = useState<AdminSection>('inbox')
  const active = session?.memberships.find((membership) => membership.companyId === session.activeCompanyId)
  if (!session || !active) return null
  return <div className="app-frame">
    <AppHeader companyName={active.companyName} name={session.dni ? `DNI ${session.dni}` : 'Administración'} onSignOut={() => void signOut()}>
      <InstallControl />
      <CompanySwitcher memberships={session.memberships} activeCompanyId={active.companyId} onSelect={activateCompany} />
    </AppHeader>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-caption">ADMINISTRACIÓN</div><nav aria-label="Navegación principal">
        {links.map((link) => <button key={link.id} className={`nav-link ${section === link.id ? 'nav-link-active' : ''}`} onClick={() => setSection(link.id)}><span className="nav-icon">{link.icon}</span>{link.label}{link.id === 'inbox' && <span className="nav-dot" />}</button>)}
      </nav><div className="sidebar-footer"><span className="live-dot" />Conexión protegida</div></aside>
      <main className="main-content">
        {section === 'inbox' && <AdminInbox />}
        {section === 'jornadas' && <JourneysView />}
        {section === 'empleados' && <EmployeesView />}
        {section === 'sedes' && <SitesView />}
        {section === 'plantillas' && <TemplatesView />}
      </main>
    </div>
    <AdminPushControl />
  </div>
}
