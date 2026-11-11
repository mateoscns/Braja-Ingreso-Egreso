// The employees (Empleados) container: the list, the create and edit forms, the schedule assignments and the password reset.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import type { Employee, PasswordReset, Site, Template, TemplateAssignment } from '../../shared/api/types'
import { deviceDate } from '../../shared/dateRange'
import { useWideTable } from '../../app/useBreakpoint'
import { PASSWORD_TOO_LONG_MESSAGE, passwordTooLong } from '../../shared/password'
import { EmployeesViewRender, employeeDetailId, ISSUED_PASSWORD_ID, TemplateAssignmentsRender, type IssuedPassword } from './EmployeesViewRender'
import { generateTemporaryPassword } from './temporaryPassword'
import { errText } from './adminShared'

export function EmployeesView() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [dni, setDni] = useState(''); const [displayName, setDisplayName] = useState(''); const [siteIds, setSiteIds] = useState<string[]>([])
  const [tolerance, setTolerance] = useState('5'); const [temporaryPassword, setTemporaryPassword] = useState('')
  // A password made with «Generar contraseña»: the form says it is shown after creating the employee.
  const [generatedPassword, setGeneratedPassword] = useState(false)
  const cards = !useWideTable()
  // Edits live in a draft copy; the list only changes with what the server returns.
  const [draft, setDraft] = useState<Employee | null>(null)
  // Template assignments of one employee (D-20261015-02), loaded when its panel opens.
  const [assignmentsFor, setAssignmentsFor] = useState(''); const [assignments, setAssignments] = useState<TemplateAssignment[]>([]); const [assignmentTemplates, setAssignmentTemplates] = useState<Template[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false); const [assignmentsLoadError, setAssignmentsLoadError] = useState(''); const [assignmentError, setAssignmentError] = useState('')
  const [assignmentTemplateId, setAssignmentTemplateId] = useState(''); const [assignmentValidFrom, setAssignmentValidFrom] = useState(''); const [assignmentBusy, setAssignmentBusy] = useState(false)
  const assignmentRequest = useRef(0)
  async function openAssignments(id: string) {
    const requestId = ++assignmentRequest.current
    setAssignmentsFor(id); setAssignments([]); setAssignmentsLoadError(''); setAssignmentError(''); setAssignmentTemplateId(''); setAssignmentValidFrom(deviceDate()); setAssignmentsLoading(true)
    try {
      const [history, available] = await Promise.all([api.get<TemplateAssignment[]>(`/employees/${encodeURIComponent(id)}/template-assignments`), api.get<Template[]>('/templates')])
      if (requestId !== assignmentRequest.current) return
      setAssignments(history); setAssignmentTemplates(available.filter((template) => template.active))
    } catch (reason) { if (requestId === assignmentRequest.current) setAssignmentsLoadError(errText(reason)) }
    finally { if (requestId === assignmentRequest.current) setAssignmentsLoading(false) }
  }
  function closeAssignments() { assignmentRequest.current += 1; setAssignmentsFor(''); setAssignmentsLoading(false) }
  async function assignTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const employeeId = assignmentsFor
    if (!employeeId || !assignmentTemplateId || !assignmentValidFrom) return
    setAssignmentBusy(true); setAssignmentError(''); setNotice('')
    try {
      const created = await api.post<TemplateAssignment>(`/employees/${encodeURIComponent(employeeId)}/template-assignments`, { templateId: assignmentTemplateId, validFrom: assignmentValidFrom })
      setAssignments((current) => [created, ...current].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.localeCompare(a.createdAt)))
      setAssignmentTemplateId(''); setAssignmentValidFrom(deviceDate()); setNotice('Horario asignado.')
    } catch (reason) { setAssignmentError(errText(reason)) } finally { setAssignmentBusy(false) }
  }
  // The horarios open next to the employee; on a long list or a phone they may start off screen.
  useEffect(() => {
    if (!assignmentsFor) return
    const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(employeeDetailId(assignmentsFor))?.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [assignmentsFor])
  async function reload() {
    closeAssignments()
    setLoading(true); setLoadError(''); setError(''); setDraft(null)
    try {
      const [people, availableSites] = await Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites')])
      setEmployees(people); setSites(availableSites)
      setSiteIds((current) => current.length === 0 ? onlySite(availableSites) : current)
    } catch (reason) { setEmployees([]); setSites([]); setLoadError(errText(reason)) } finally { setLoading(false) }
  }
  // 2026-11-10 (#110): with a single site its box came unticked and "Crear empleado" stayed blocked until the owner found it.
  function onlySite(available: Site[]) { return available.length === 1 ? [available[0].id] : [] }
  useEffect(() => { void reload() }, [])
  function toggleSite(id: string) { setSiteIds((current) => current.includes(id) ? current.filter((siteId) => siteId !== id) : [...current, id]) }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (temporaryPassword && passwordTooLong(temporaryPassword)) { setError(PASSWORD_TOO_LONG_MESSAGE); return }
    setBusy(true)
    try {
      const sentPassword = temporaryPassword
      const created = await api.post<Employee>('/employees', { dni: dni.trim(), displayName: displayName.trim(), siteIds, toleranceMinutes: Number(tolerance), ...(sentPassword ? { temporaryPassword: sentPassword } : {}) })
      setEmployees((current) => [...current, created]); setDni(''); setDisplayName(''); setSiteIds(onlySite(sites)); setTolerance('5'); setTemporaryPassword(''); setGeneratedPassword(false)
      // An account that already existed keeps its password and the one sent is not used (OrganizationService.createEmployee).
      if (sentPassword && created.mustChangePassword === false) setNotice('Empleado creado. Ese DNI ya tenía cuenta: sigue entrando con su contraseña de siempre.')
      else {
        setNotice('Empleado creado.')
        if (sentPassword) setIssuedPassword({ displayName: created.displayName, temporaryPassword: sentPassword, reason: 'created' })
      }
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  function generatePassword() { setTemporaryPassword(generateTemporaryPassword()); setGeneratedPassword(true) }
  function typePassword(value: string) { setTemporaryPassword(value); setGeneratedPassword(false) }
  async function saveEmployee() {
    if (!draft) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await api.patch<Employee>(`/employees/${encodeURIComponent(draft.id)}`, { displayName: draft.displayName, siteIds: draft.siteIds, toleranceMinutes: draft.toleranceMinutes, active: draft.active })
      setEmployees((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); setDraft(null); setNotice('Cambios del empleado guardados.')
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  function startEditing(id: string) {
    const person = employees.find((entry) => entry.id === id)
    setDraft(person ? { ...person, siteIds: [...person.siteIds] } : null); setError(''); setNotice('')
  }
  function updateDraft(patch: Partial<Employee>) { setDraft((current) => current ? { ...current, ...patch } : current) }
  const assignmentsEmployee = employees.find((person) => person.id === assignmentsFor)
  const assignmentsPanel = assignmentsEmployee ? <TemplateAssignmentsRender employee={assignmentsEmployee} sites={sites}
    templates={assignmentTemplates.filter((template) => assignmentsEmployee.siteIds.includes(template.siteId))} assignments={assignments}
    loading={assignmentsLoading} loadError={assignmentsLoadError} error={assignmentError} busy={assignmentBusy} templateId={assignmentTemplateId} validFrom={assignmentValidFrom}
    onTemplateChange={setAssignmentTemplateId} onValidFromChange={setAssignmentValidFrom} onSubmit={(event) => void assignTemplate(event)}
    onRetry={() => void openAssignments(assignmentsEmployee.id)} onClose={closeAssignments} /> : null
  // D-20261027-09: the temporary password lives only in this state; it is never written to browser storage and is
  // gone when the ADMIN dismisses the panel or leaves the view.
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [issuedPassword, setIssuedPassword] = useState<IssuedPassword | null>(null)
  // After creating an employee the password panel sits next to the form, below the list; bring it into view. The keyboard
  // focus goes there too (also after a reset, whose confirm button disappears), so it can be read out right away.
  useEffect(() => {
    if (!issuedPassword) return
    const panel = document.getElementById(ISSUED_PASSWORD_ID)
    if (issuedPassword.reason === 'created') panel?.scrollIntoView?.({ block: 'nearest' })
    panel?.focus({ preventScroll: issuedPassword.reason === 'created' })
  }, [issuedPassword])
  function askReset(id: string) { setResetTarget(id); setIssuedPassword(null); setError(''); setNotice('') }
  async function confirmReset() {
    const person = employees.find((entry) => entry.id === resetTarget)
    if (!person) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { temporaryPassword: issued } = await api.post<PasswordReset>(`/employees/${encodeURIComponent(person.id)}/password-reset`)
      setIssuedPassword({ displayName: person.displayName, temporaryPassword: issued })
      setEmployees((current) => current.map((entry) => entry.id === person.id ? { ...entry, mustChangePassword: true } : entry))
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false); setResetTarget(null) }
  }
  return <EmployeesViewRender employees={employees} sites={sites} loading={loading} loadError={loadError} error={error} notice={notice} busy={busy} dni={dni} displayName={displayName} siteIds={siteIds} tolerance={tolerance} temporaryPassword={temporaryPassword} draft={draft}
    generatedPassword={generatedPassword} cards={cards} assignmentsFor={assignmentsFor} assignmentsPanel={assignmentsPanel} onOpenAssignments={(id) => void openAssignments(id)}
    onReload={() => void reload()} onCreate={create} onDniChange={setDni} onDisplayNameChange={setDisplayName} onToggleSite={toggleSite} onToleranceChange={setTolerance} onTemporaryPasswordChange={typePassword} onGeneratePassword={generatePassword}
    onSave={() => void saveEmployee()} onDraftChange={updateDraft} onStartEditing={startEditing} onCancelEditing={() => { setDraft(null); setError('') }}
    resetTarget={resetTarget} issuedPassword={issuedPassword} onAskReset={askReset} onConfirmReset={() => void confirmReset()} onCancelReset={() => setResetTarget(null)} onDismissIssuedPassword={() => setIssuedPassword(null)} />
}
