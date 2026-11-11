import { useEffect, useRef, useState } from 'react'
import { AppHeader, CompanySwitcher, Loading } from '../../app/ui'
import { useSession } from '../../app/session'
import { api } from '../../shared/api/client'
import type { Deviation } from '../../shared/api/types'
import { AdminHistory, AdminInbox, EmployeesView, JourneysView, SitesView, TemplatesView, type OpenJornadaRequest } from './AdminViews'
import { CoverageNoticeRender, FirstStepsRender } from './FirstSteps'
import { coverageNotice, loadSetupData, readyTomorrow, setupComplete, setupSteps, type AdminSection, type SetupData } from './setupStatus'
import { useAdminSection } from './useAdminSection'
import { AdminPushControl } from '../../device/push/AdminPushControl'
import { InstallControl } from '../../device/pwa/InstallControl'

type NavLink = { id: AdminSection; label: string; icon: string }
const SETUP_LINK: NavLink = { id: 'setup', label: 'Primeros pasos', icon: '✓' }
// Daily work first, then the configuration in the order it is done.
const DAILY_LINKS: NavLink[] = [
  { id: 'inbox', label: 'Para revisar', icon: '◷' }, { id: 'jornadas', label: 'Días de trabajo', icon: '▦' }, { id: 'historial', label: 'Historial', icon: '☰' }
]
const CONFIGURATION_LINKS: NavLink[] = [
  { id: 'sedes', label: 'Locales', icon: '⌖' }, { id: 'plantillas', label: 'Horarios', icon: '▤' }, { id: 'empleados', label: 'Equipo', icon: '♙' }
]
/** Sections whose content depends on the setup status (the guide and the notice of days loaded). */
const STATUS_SECTIONS = new Set<AdminSection>(['setup', 'inbox', 'jornadas'])

export function AdminApp() {
  const { session, signOut, activateCompany } = useSession()
  // Where to open when the address names no section: null until the setup status says it, "Primeros pasos" while a
  // step is missing, Bandeja otherwise.
  const [start, setStart] = useState<AdminSection | null>(null)
  // The section shown lives in the address, so reload and Back keep the place (D-20261111-02).
  const { section, go } = useAdminSection(start)
  const [setup, setSetup] = useState<SetupData | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [openJornada, setOpenJornada] = useState<OpenJornadaRequest | undefined>()
  const [journeysKey, setJourneysKey] = useState(0)
  // Set once the start section is decided. A late status never moves the owner away: once a section is shown, its
  // address is the place, and the start only counts again when an address names no section.
  const chosen = useRef(false)
  const setupRequest = useRef(0)
  const active = session?.memberships.find((membership) => membership.companyId === session.activeCompanyId)
  const companyId = active?.companyId
  async function refreshSetup() {
    const requestId = ++setupRequest.current
    setSetupLoading(true)
    try {
      const data = await loadSetupData((path) => api.get(path))
      if (requestId !== setupRequest.current) return
      setSetup(data); setSetupError('')
      if (!chosen.current) { chosen.current = true; setStart(setupComplete(setupSteps(data)) ? 'inbox' : 'setup') }
    } catch (reason) {
      if (requestId !== setupRequest.current) return
      setSetupError(reason instanceof Error ? reason.message : 'No se pudo revisar la configuración.')
      if (!chosen.current) { chosen.current = true; setStart('inbox') }
    } finally { if (requestId === setupRequest.current) setSetupLoading(false) }
  }
  useEffect(() => {
    if (!companyId) return
    chosen.current = false; setStart(null); setSetup(null); setSetupError('')
    void refreshSetup()
  }, [companyId])
  // Back, Forward or a typed address change the section without navigate(): the status is read again as a menu
  // choice does, so a guide reached with Back does not show a step just done as missing.
  const shown = useRef<AdminSection | null>(null)
  const navigated = useRef(false)
  useEffect(() => {
    const previous = shown.current
    const followed = !navigated.current
    shown.current = section; navigated.current = false
    if (followed && previous !== null && section !== null && section !== previous && STATUS_SECTIONS.has(section)) void refreshSetup()
  }, [section])
  if (!session || !active) return null
  function navigate(next: AdminSection) {
    setOpenJornada(undefined)
    if (next !== section) navigated.current = true
    go(next)
    if (STATUS_SECTIONS.has(next)) void refreshSetup()
  }
  function openDeviationJornada(item: Deviation) {
    navigate('jornadas')
    // "Egreso sin marcar" is fixed by adding the missing exit, so the form starts on it.
    setOpenJornada({ jornadaId: item.jornadaId, forgottenAction: item.type === 'MARCA_FALTANTE' ? 'EGRESO' : undefined })
    setJourneysKey((key) => key + 1)
  }
  function showWorkDaysForm() {
    const form = document.getElementById('work-days')
    if (form && typeof form.scrollIntoView === 'function') form.scrollIntoView({ block: 'start' })
    form?.querySelector<HTMLElement>('select, input, button')?.focus()
  }
  const steps = setup ? setupSteps(setup) : null
  const complete = steps ? setupComplete(steps) : false
  const notice = setup ? coverageNotice(setup) : null
  const renderLink = (link: NavLink) => {
    const current = section === link.id
    return <button key={link.id} type="button" aria-current={current ? 'page' : undefined} className={`nav-link ${current ? 'nav-link-active' : ''}`} onClick={() => navigate(link.id)}>
      <span className="nav-icon" aria-hidden="true">{link.icon}</span>{link.label}
    </button>
  }
  return <div className="app-frame">
    <AppHeader companyName={active.companyName} name={session.displayName?.trim() || (session.dni ? `DNI ${session.dni}` : 'Administración')} onSignOut={() => void signOut()}>
      <InstallControl />
      <CompanySwitcher memberships={session.memberships} activeCompanyId={active.companyId} onSelect={activateCompany} />
    </AppHeader>
    <div className="workspace">
      <aside className="sidebar"><div className="sidebar-caption">ADMINISTRACIÓN</div><nav aria-label="Navegación principal">
        {!complete && renderLink(SETUP_LINK)}
        {DAILY_LINKS.map(renderLink)}
        <div className="sidebar-caption sidebar-caption-group">CONFIGURACIÓN</div>
        {CONFIGURATION_LINKS.map(renderLink)}
        {complete && renderLink(SETUP_LINK)}
      </nav>{window.isSecureContext && <div className="sidebar-footer"><span className="live-dot" />Conexión protegida</div>}</aside>
      <main className="main-content">
        {section === null && <Loading label="Preparando tu panel…" />}
        {section === 'setup' && <FirstStepsRender steps={steps} loading={setupLoading} error={setupError} readyCount={setup ? readyTomorrow(setup) : 0} onGo={navigate} onRetry={() => void refreshSetup()} />}
        {section === 'inbox' && <AdminInbox onOpenJornada={openDeviationJornada}
          coverage={notice && <CoverageNoticeRender notice={notice} actionLabel="Cargar días" onAction={() => navigate('jornadas')} />} />}
        {section === 'jornadas' && <JourneysView key={journeysKey} openJornada={openJornada} onNavigate={navigate} onDaysLoaded={() => void refreshSetup()}
          coverage={notice && <CoverageNoticeRender notice={notice} actionLabel="Cargar días" onAction={showWorkDaysForm} />} />}
        {section === 'historial' && <AdminHistory />}
        {section === 'empleados' && <EmployeesView />}
        {section === 'sedes' && <SitesView />}
        {section === 'plantillas' && <TemplatesView />}
      </main>
    </div>
    <AdminPushControl key={active.companyId} companyName={active.companyName} />
  </div>
}
