// The employees (Empleados) container: the list, the create and edit forms, the schedule assignments and the password reset.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import type { Employee, PasswordReset, Site, Template, TemplateAssignment } from '../../shared/api/types'
import { deviceDate } from '../../shared/dateRange'
import { useWideTable } from '../../app/useBreakpoint'
import { reveal, revealAndFocus, useFocusRequest } from '../../app/revealAndFocus'
import { useFieldErrors } from '../../app/useFieldErrors'
import { PASSWORD_MIN_CHARACTERS, PASSWORD_TOO_LONG_MESSAGE, passwordTooLong } from '../../shared/password'
import { EmployeesViewRender, employeeDetailId, focusIds, ISSUED_PASSWORD_ID, messageKeys, TemplateAssignmentsRender, type CreateField, type IssuedPassword } from './EmployeesViewRender'
import { generateTemporaryPassword } from './temporaryPassword'
import { errText } from './adminShared'
import type { AdminSection } from './setupStatus'

/** The shortest DNI the field takes (the server keeps 7 to 12 digits, DniNormalizer). */
const DNI_MIN_CHARACTERS = 7
/** Minutes of tolerance as the field asked the browser: a whole number from 0 to 240. */
const wholeMinutes = (value: string) => /^\d{1,3}$/.test(value.trim()) && Number(value) <= 240

/** `onNavigate` follows the links of the next steps to another section (AdminApp.navigate). */
export function EmployeesView({ onNavigate }: { onNavigate?: (section: AdminSection) => void } = {}) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // The form whose result error and notice are (messageKeys): it shows there, never at the top of the page (design system 4.7).
  const [messageAt, setMessageAt] = useState('')
  // The person the add form just created: its result says what is still missing for them to clock in (#177).
  const [createdEmployee, setCreatedEmployee] = useState<Employee | null>(null)
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
  // A form of a record takes the focus when it opens and gives it back to its button when it closes (design system 4.7); the
  // buttons are disabled while a request runs, so the move waits for it.
  const focusLater = useFocusRequest(!busy)
  // Each form is checked on submit with the words of each field (design system 4.7); what kept a button disabled is one of
  // these errors now (finding F-09). A refusal of the server takes the focus to its message.
  const createFields = useFieldErrors<CreateField>()
  const editFields = useFieldErrors<'siteIds'>()
  const assignmentFields = useFieldErrors<'templateId' | 'validFrom'>()
  async function openAssignments(id: string) {
    const requestId = ++assignmentRequest.current
    assignmentFields.reset()
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
    if (!employeeId) return
    const formId = focusIds.assignmentForm(employeeId)
    setAssignmentError(''); setNotice('')
    const valid = assignmentFields.check(formId, {
      templateId: assignmentTemplateId ? '' : 'Elegí un horario.',
      validFrom: assignmentValidFrom ? '' : 'Elegí desde qué día.'
    })
    if (!valid) return
    setAssignmentBusy(true); setMessageAt(messageKeys.assignments)
    try {
      const created = await api.post<TemplateAssignment>(`/employees/${encodeURIComponent(employeeId)}/template-assignments`, { templateId: assignmentTemplateId, validFrom: assignmentValidFrom })
      setAssignments((current) => [created, ...current].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.localeCompare(a.createdAt)))
      setAssignmentTemplateId(''); setAssignmentValidFrom(deviceDate()); setNotice('Horario asignado.')
    } catch (reason) { setAssignmentError(errText(reason)); assignmentFields.focusProblem(formId) } finally { setAssignmentBusy(false) }
  }
  // The horarios open next to the employee; on a long list or a phone they may start off screen. «Horarios» is a disclosure:
  // the focus stays on it while they come into view.
  useEffect(() => {
    if (!assignmentsFor) return
    const panel = document.getElementById(employeeDetailId(assignmentsFor))
    if (panel) reveal(panel)
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
  function toggleSite(id: string) { setSiteIds((current) => current.includes(id) ? current.filter((siteId) => siteId !== id) : [...current, id]); createFields.clear('siteIds') }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setMessageAt(messageKeys.create); setCreatedEmployee(null)
    // The checks the browser made (required, the DNI's 7 characters, 0 to 240 whole minutes, a password of 12 characters), the
    // byte limit of the password, and the local that kept the button disabled: all at once, each under its field.
    const valid = createFields.check(focusIds.createForm, {
      displayName: displayName.trim() ? '' : 'Escribí el nombre y apellido.',
      dni: !dni.trim() ? 'Escribí el DNI.' : dni.length < DNI_MIN_CHARACTERS ? 'El DNI tiene que tener de 7 a 12 números.' : '',
      tolerance: wholeMinutes(tolerance) ? '' : 'Poné un número de 0 a 240.',
      temporaryPassword: !temporaryPassword ? '' : temporaryPassword.length < PASSWORD_MIN_CHARACTERS ? 'La contraseña provisoria tiene que tener al menos 12 caracteres.'
        : passwordTooLong(temporaryPassword) ? PASSWORD_TOO_LONG_MESSAGE : '',
      siteIds: siteIds.length ? '' : 'Marcá al menos un local para crear el empleado.'
    })
    if (!valid) return
    setBusy(true)
    try {
      const sentPassword = temporaryPassword
      const created = await api.post<Employee>('/employees', { dni: dni.trim(), displayName: displayName.trim(), siteIds, toleranceMinutes: Number(tolerance), ...(sentPassword ? { temporaryPassword: sentPassword } : {}) })
      setEmployees((current) => [...current, created]); setCreatedEmployee(created); setDni(''); setDisplayName(''); setSiteIds(onlySite(sites)); setTolerance('5'); setTemporaryPassword(''); setGeneratedPassword(false)
      // An account that already existed keeps its password and the one sent is not used (OrganizationService.createEmployee).
      const issued = Boolean(sentPassword) && created.mustChangePassword !== false
      if (sentPassword && !issued) setNotice('Empleado creado. Ese DNI ya tenía cuenta: sigue entrando con su contraseña de siempre.')
      else {
        setNotice('Empleado creado.')
        if (issued) setIssuedPassword({ displayName: created.displayName, temporaryPassword: sentPassword, reason: 'created' })
      }
      // «Crear empleado» was disabled while it sent and lost the focus (slice G2): it goes back to the emptied form, unless the
      // password to hand over takes it. Shown from its top: the form is taller than a phone, and «nearest» left its first field
      // above the screen.
      if (!issued) focusLater({ id: focusIds.createForm, into: true, block: 'start' })
    } catch (reason) { setError(errText(reason)); createFields.focusProblem(focusIds.createForm) } finally { setBusy(false) }
  }
  function generatePassword() { setTemporaryPassword(generateTemporaryPassword()); setGeneratedPassword(true); createFields.clear('temporaryPassword') }
  function typePassword(value: string) { setTemporaryPassword(value); setGeneratedPassword(false); createFields.clear('temporaryPassword') }
  async function saveEmployee() {
    if (!draft) return
    const formId = focusIds.editForm(draft.id)
    setError(''); setNotice(''); setMessageAt(messageKeys.edit(draft.id))
    // The condition that kept «Guardar» disabled, now said under its group.
    if (!editFields.check(formId, { siteIds: draft.siteIds.length ? '' : 'Marcá al menos un local.' })) return
    setBusy(true)
    try {
      const updated = await api.patch<Employee>(`/employees/${encodeURIComponent(draft.id)}`, { displayName: draft.displayName, siteIds: draft.siteIds, toleranceMinutes: draft.toleranceMinutes, active: draft.active })
      // Deactivating or reactivating says what happened (#177): a person inactive cannot sign in nor clock in (rule 7).
      const before = employees.find((entry) => entry.id === updated.id)
      const saved = before && before.active !== updated.active
        ? updated.active ? `${updated.displayName} quedó activo otra vez.` : `${updated.displayName} quedó inactivo.`
        : 'Cambios del empleado guardados.'
      setEmployees((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); setDraft(null); setNotice(saved)
      focusLater({ id: focusIds.editButton(updated.id) })
    } catch (reason) { setError(errText(reason)); editFields.focusProblem(formId) } finally { setBusy(false) }
  }
  function startEditing(id: string) {
    const person = employees.find((entry) => entry.id === id)
    setDraft(person ? { ...person, siteIds: [...person.siteIds] } : null); setError(''); setNotice(''); editFields.reset()
    if (person) focusLater({ id: focusIds.editForm(id), into: true })
  }
  function cancelEditing() {
    if (draft) focusLater({ id: focusIds.editButton(draft.id) })
    setDraft(null); setError(''); editFields.reset()
  }
  function updateDraft(patch: Partial<Employee>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
    if ('siteIds' in patch) editFields.clear('siteIds')
  }
  const assignmentsEmployee = employees.find((person) => person.id === assignmentsFor)
  const assignmentsPanel = assignmentsEmployee ? <TemplateAssignmentsRender employee={assignmentsEmployee} sites={sites}
    templates={assignmentTemplates.filter((template) => assignmentsEmployee.siteIds.includes(template.siteId))} assignments={assignments}
    loading={assignmentsLoading} loadError={assignmentsLoadError} error={assignmentError} notice={messageAt === messageKeys.assignments ? notice : ''} busy={assignmentBusy} templateId={assignmentTemplateId} validFrom={assignmentValidFrom}
    fieldErrors={assignmentFields.errors}
    onTemplateChange={(value) => { setAssignmentTemplateId(value); assignmentFields.clear('templateId') }} onValidFromChange={(value) => { setAssignmentValidFrom(value); assignmentFields.clear('validFrom') }} onSubmit={(event) => void assignTemplate(event)}
    onRetry={() => void openAssignments(assignmentsEmployee.id)} onNavigate={onNavigate} onClose={() => { focusLater({ id: focusIds.schedulesButton(assignmentsEmployee.id) }); closeAssignments() }} /> : null
  // D-20261027-09: the temporary password lives only in this state; it is never written to browser storage and is
  // gone when the ADMIN dismisses the panel or leaves the view.
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [issuedPassword, setIssuedPassword] = useState<IssuedPassword | null>(null)
  // After creating an employee the password panel sits inside the form, below the list; bring it into view. The keyboard
  // focus goes there too (also after a reset, whose confirm button disappears), so it can be read out right away.
  useEffect(() => {
    if (!issuedPassword) return
    const panel = document.getElementById(ISSUED_PASSWORD_ID)
    if (panel) revealAndFocus(panel)
  }, [issuedPassword])
  function askReset(id: string) {
    setResetTarget(id); setIssuedPassword(null); setError(''); setNotice('')
    // The sentence that says what a reset does, not the button that confirms it.
    focusLater({ id: focusIds.resetNote(id) })
  }
  function cancelReset() {
    if (resetTarget) focusLater({ id: focusIds.resetButton(resetTarget) })
    setResetTarget(null)
  }
  async function confirmReset() {
    const person = employees.find((entry) => entry.id === resetTarget)
    if (!person) return
    setBusy(true); setError(''); setNotice(''); setMessageAt(messageKeys.reset(person.id))
    try {
      const { temporaryPassword: issued } = await api.post<PasswordReset>(`/employees/${encodeURIComponent(person.id)}/password-reset`)
      // employeeId: the password shows in the record of that person, and takes the focus (the effect above).
      setIssuedPassword({ displayName: person.displayName, temporaryPassword: issued, employeeId: person.id })
      setEmployees((current) => current.map((entry) => entry.id === person.id ? { ...entry, mustChangePassword: true } : entry))
    } catch (reason) {
      setError(errText(reason))
      // The form closes with the refusal: its button comes back, next to the message.
      focusLater({ id: focusIds.resetButton(person.id) })
    } finally { setBusy(false); setResetTarget(null) }
  }
  /** The password was handed over: the focus goes back to where it came from, the reset of that person or the add form. */
  function dismissIssuedPassword() {
    // The add form from its top, as after a creation without a password (above, in create).
    if (issuedPassword?.reason === 'created') focusLater({ id: focusIds.createForm, into: true, block: 'start' })
    else if (issuedPassword?.employeeId) focusLater({ id: focusIds.resetButton(issuedPassword.employeeId) })
    setIssuedPassword(null)
  }
  /** The next step of a person just created: their horarios open under their record, with the keyboard on their «Horarios». */
  function assignCreated(id: string) {
    void openAssignments(id)
    focusLater({ id: focusIds.schedulesButton(id) })
  }
  return <EmployeesViewRender employees={employees} sites={sites} loading={loading} loadError={loadError} error={error} notice={notice} messageAt={messageAt} busy={busy}
    createdEmployee={createdEmployee} onNavigate={onNavigate} onAssignCreated={assignCreated}
    onShowCreateForm={() => focusLater({ id: focusIds.createForm, into: true, block: 'start' })} dni={dni} displayName={displayName} siteIds={siteIds} tolerance={tolerance} temporaryPassword={temporaryPassword} draft={draft}
    generatedPassword={generatedPassword} cards={cards} assignmentsFor={assignmentsFor} assignmentsPanel={assignmentsPanel} onOpenAssignments={(id) => void openAssignments(id)}
    createErrors={createFields.errors} editErrors={editFields.errors}
    onReload={() => void reload()} onCreate={create} onDniChange={(value) => { setDni(value); createFields.clear('dni') }} onDisplayNameChange={(value) => { setDisplayName(value); createFields.clear('displayName') }}
    onToggleSite={toggleSite} onToleranceChange={(value) => { setTolerance(value); createFields.clear('tolerance') }} onTemporaryPasswordChange={typePassword} onGeneratePassword={generatePassword}
    onSave={() => void saveEmployee()} onDraftChange={updateDraft} onStartEditing={startEditing} onCancelEditing={cancelEditing}
    resetTarget={resetTarget} issuedPassword={issuedPassword} onAskReset={askReset} onConfirmReset={() => void confirmReset()} onCancelReset={cancelReset} onDismissIssuedPassword={dismissIssuedPassword} />
}
