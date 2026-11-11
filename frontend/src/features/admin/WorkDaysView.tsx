// The «Días de trabajo» container (section 'workdays', D-20261111-02 step 2): the monthly load (WorkDaysPanel), the single day
// and the notice of days loaded, taken from the days screen. The list of a date and its detail stay in JourneysView («Hoy»).
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../../shared/api/client'
import type { Employee, Site, Template } from '../../shared/api/types'
import { declarationFailureMessage } from './bulkDeclaration'
import type { AdminSection } from './setupStatus'
import { WorkDaysPanel } from './WorkDaysPanel'
import { WorkDaysViewRender } from './WorkDaysViewRender'
import { errText } from './adminShared'

const dateInBrowserZone = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function WorkDaysView({ coverage, onNavigate, onDaysLoaded }: {
  coverage?: ReactNode; onNavigate?: (section: AdminSection) => void; onDaysLoaded?: () => void
} = {}) {
  const [employees, setEmployees] = useState<Employee[]>([]); const [sites, setSites] = useState<Site[]>([]); const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true); const [dependencyError, setDependencyError] = useState(''); const [busy, setBusy] = useState(false)
  const [employeeId, setEmployeeId] = useState(''); const [siteId, setSiteId] = useState(''); const [templateId, setTemplateId] = useState('')
  const [singleDate, setSingleDate] = useState(dateInBrowserZone); const [singleError, setSingleError] = useState(''); const [singleNotice, setSingleNotice] = useState('')
  async function loadDependencies() {
    setLoading(true); setDependencyError('')
    try {
      const [people, availableSites, availableTemplates] = await Promise.all([
        api.get<Employee[]>('/employees'), api.get<Site[]>('/sites'), api.get<Template[]>('/templates')
      ])
      setEmployees(people); setSites(availableSites); setTemplates(availableTemplates.filter((item) => item.active))
      setEmployeeId(people[0]?.id ?? ''); setSiteId(availableSites[0]?.id ?? '')
    } catch (reason) { setDependencyError(errText(reason)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadDependencies() }, [])
  // No template is preselected: "El que tiene asignado" (empty) sends none and the server uses the employee's assignment in force
  // on that date (D-20261015-02), as the hint says. Choosing a site clears a template of another site.
  const eligibleEmployees = useMemo(() => employees.filter((person) => person.active && person.siteIds.includes(siteId)), [employees, siteId])
  useEffect(() => { setEmployeeId((current) => eligibleEmployees.some((person) => person.id === current) ? current : eligibleEmployees[0]?.id ?? '') }, [eligibleEmployees])
  async function declare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSingleError(''); setSingleNotice(''); setBusy(true)
    try {
      await api.post('/jornadas', { employeeId, siteId, localDate: singleDate, ...(templateId ? { templateId } : {}) })
      setSingleNotice('Día cargado.')
      onDaysLoaded?.()
    }
    catch (reason) { setSingleError(declarationFailureMessage(reason, 'single') ?? errText(reason)) } finally { setBusy(false) }
  }
  const siteTemplates = templates.filter((template) => template.siteId === siteId)
  const workDaysPanel = <WorkDaysPanel sites={sites} employees={employees} templates={templates} disabled={loading}
    onLoaded={() => onDaysLoaded?.()}
    onAssignSchedules={() => onNavigate?.('empleados')} onReviewSchedules={() => onNavigate?.('plantillas')} />
  return <WorkDaysViewRender workDaysPanel={workDaysPanel} coverage={coverage} sites={sites} eligibleEmployees={eligibleEmployees} siteTemplates={siteTemplates}
    loading={loading} dependencyError={dependencyError} busy={busy} employeeId={employeeId} siteId={siteId} templateId={templateId}
    singleDate={singleDate} singleError={singleError} singleNotice={singleNotice} onSingleDateChange={setSingleDate}
    onEmployeeChange={setEmployeeId} onSiteChange={(id) => { setSiteId(id); setTemplateId('') }} onTemplateChange={setTemplateId} onDeclare={declare}
    onRetryDependencies={() => void loadDependencies()} />
}
