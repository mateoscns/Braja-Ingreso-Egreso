import { useEffect, useRef, useState } from 'react'
import { AppHeader, CompanySwitcher, Loading, pageTitle, useDocumentTitle } from '../../app/ui'
import { revealAndFocus } from '../../app/revealAndFocus'
import { useSession } from '../../app/session'
import { api } from '../../shared/api/client'
import type { Deviation } from '../../shared/api/types'
import { AdminInbox, EmployeesView, JourneysView, SitesView, TemplatesView, WorkDaysView, type OpenJornadaRequest } from './AdminViews'
import { AdminNav, CONFIGURATION_PARTS, DESTINATIONS, SETUP_PART } from './AdminNav'
import { ConfigurationPage } from './ConfigurationPage'
import { CoverageNoticeRender, FirstStepsRender } from './FirstSteps'
import { coverageNotice, loadSetupData, readyTomorrow, setupComplete, setupSteps, type AdminSection, type SetupData } from './setupStatus'
import { HISTORY_ADDRESS, SECTION_ADDRESSES, useAdminSection } from './useAdminSection'
import { useAdminPush } from '../../device/push/useAdminPush'
import { InstallControl } from '../../device/pwa/InstallControl'

/**
 * Sections whose content depends on the setup status: the guide, the notice of days loaded, and the «Configuración» page, which
 * lists «Primeros pasos» only while a step is missing.
 */
const STATUS_SECTIONS = new Set<AdminSection>(['setup', 'inbox', 'jornadas', 'workdays', 'config'])

/** The name of each section is the word of its menu item (design system 7.2: one name per thing), so the tab says it too. */
const SECTION_NAMES = Object.fromEntries([...DESTINATIONS, SETUP_PART, ...CONFIGURATION_PARTS].map((item) => [item.section, item.label])) as Record<AdminSection, string>

/**
 * Moves the focus to the title of the section just shown. A title not drawn by PageHeading (the guide's) gets the tabIndex -1
 * it needs to take the focus; Tab still does not stop on it.
 */
function focusSectionTitle(main: HTMLElement | null) {
  const title = main?.querySelector<HTMLElement>('h1')
  if (!title) return
  if (!title.hasAttribute('tabindex')) title.tabIndex = -1
  revealAndFocus(title, title, 'start')
}

export function AdminApp() {
  const { session, signOut, activateCompany } = useSession()
  // Where to open when the address names no section: null until the setup status says it, "Primeros pasos" while a
  // step is missing, Bandeja otherwise.
  const [start, setStart] = useState<AdminSection | null>(null)
  // The section shown lives in the address, so reload and Back keep the place (D-20261111-02).
  const { section, go, retiredAddress } = useAdminSection(start)
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
  // The avisos of this device live here, not on the page that shows them: the hook follows a subscription the browser renews
  // on every screen (D-20261027-04). App.tsx mounts one AdminApp per company, which is the remount the hook asks for.
  const { activate, deactivate, retryConfig, ...push } = useAdminPush(active?.companyName ?? '')
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
  const main = useRef<HTMLElement>(null)
  // The tab names the section shown (WCAG 2.4.2), with the word of its menu item; «Fichaje Braja» while none is decided.
  useDocumentTitle(pageTitle(section ? SECTION_NAMES[section] : undefined))
  useEffect(() => {
    const previous = shown.current
    const followed = !navigated.current
    shown.current = section; navigated.current = false
    const changed = previous !== null && section !== null && section !== previous
    // A change of section the owner made (menu, a button of the content, Back, Forward, a typed address) takes the focus to
    // the new section's title (WCAG 2.4.3): the button pressed may be gone with the old section. The first section is not a
    // change. A section that moves the focus on its own later (a day opened from a case) still does.
    if (changed) focusSectionTitle(main.current)
    if (followed && changed && section !== null && STATUS_SECTIONS.has(section)) void refreshSetup()
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
  /** «Cargar días» of the notice: from another section it goes to «Días de trabajo»; there, the load form is just below. */
  function showWorkDaysForm() {
    if (section !== 'workdays') { navigate('workdays'); return }
    const form = document.getElementById('work-days')
    const control = form?.querySelector<HTMLElement>('select, input, button')
    if (form && control) revealAndFocus(form, control, 'start')
  }
  const steps = setup ? setupSteps(setup) : null
  // «Primeros pasos» is listed only while a step is known to be missing (D-20261111-02); an unread status lists nothing.
  const setupMissing = steps ? !setupComplete(steps) : false
  const notice = setup ? coverageNotice(setup) : null
  return <div className="app-frame admin-frame">
    <AppHeader home={SECTION_ADDRESSES.inbox} companyName={active.companyName} name={session.displayName?.trim() || (session.dni ? `DNI ${session.dni}` : 'Administración')} onSignOut={() => void signOut()}>
      <InstallControl />
      <CompanySwitcher memberships={session.memberships} activeCompanyId={active.companyId} onSelect={activateCompany} />
    </AppHeader>
    <div className="workspace">
      <AdminNav section={section} setupMissing={setupMissing} onNavigate={navigate} />
      <main className="main-content" ref={main}>
        {section === null && <Loading label="Preparando tu panel…" />}
        {section === 'setup' && <FirstStepsRender steps={steps} loading={setupLoading} error={setupError} readyCount={setup ? readyTomorrow(setup) : 0} onGo={navigate} onRetry={() => void refreshSetup()} />}
        {section === 'inbox' && <AdminInbox onOpenJornada={openDeviationJornada}
          coverage={notice && <CoverageNoticeRender notice={notice} actionLabel="Cargar días" onAction={showWorkDaysForm} />} />}
        {/* The old address of «Historial» lands here with its search open. */}
        {section === 'jornadas' && <JourneysView key={journeysKey} openJornada={openJornada} searchOpen={retiredAddress === HISTORY_ADDRESS} />}
        {section === 'workdays' && <WorkDaysView onNavigate={navigate} onDaysLoaded={() => void refreshSetup()}
          coverage={notice && <CoverageNoticeRender notice={notice} actionLabel="Cargar días" onAction={showWorkDaysForm} />} />}
        {section === 'empleados' && <EmployeesView />}
        {section === 'sedes' && <SitesView />}
        {section === 'plantillas' && <TemplatesView />}
        {section === 'config' && <ConfigurationPage setupMissing={setupMissing} secure={window.isSecureContext} onNavigate={navigate}
          push={{ ...push, companyName: active.companyName, onActivate: () => void activate(), onDeactivate: () => void deactivate(), onRetryConfig: retryConfig }} />}
      </main>
    </div>
  </div>
}
