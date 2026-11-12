import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import type { Employee, Site, Template } from '../../shared/api/types'
import { deviceDate } from '../../shared/dateRange'
import { Panel } from '../../app/ui'
import { useFocusRequest } from '../../app/revealAndFocus'
import { ScheduleAssignStep, ScheduleEditor, scheduleFocusIds, scheduleMessageKeys, SchedulesViewRender, type AssignmentResult } from './ScheduleEditor'
import {
  addScheduleTramo, changeManualOffsets, changeScheduleTramo, emptyScheduleDraft, pickScheduleType, removeScheduleTramo,
  scheduleDraftFromTemplate, scheduleInput, type ScheduleDraft
} from './scheduleDraft'

const errText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.'
const errCode = (error: unknown) => (error as { code?: string } | null)?.code

type Edit = { templateId: string; draft: ScheduleDraft; error: string }
type Assign = { templateId: string; origin: 'create' | 'edit'; checked: string[]; validFrom: string; busy: boolean; result: AssignmentResult | null }

/** Callbacks of one ScheduleEditor bound to the draft they change. */
function editorCallbacks(update: (change: (draft: ScheduleDraft) => ScheduleDraft) => void) {
  return {
    onNameChange: (name: string) => update((draft) => ({ ...draft, name })),
    onPickType: (id: Parameters<typeof pickScheduleType>[1]) => update((draft) => pickScheduleType(draft, id)),
    onTramoChange: (index: number, patch: Parameters<typeof changeScheduleTramo>[2]) => update((draft) => changeScheduleTramo(draft, index, patch)),
    onAddTramo: () => update(addScheduleTramo),
    onRemoveTramo: (index: number) => update((draft) => removeScheduleTramo(draft, index)),
    onBreakfastChange: (breakfast: string) => update((draft) => ({ ...draft, breakfast })),
    onLunchChange: (lunch: string) => update((draft) => ({ ...draft, lunch })),
    onManualOffsetChange: (index: number, patch: Parameters<typeof changeManualOffsets>[2]) => update((draft) => changeManualOffsets(draft, index, patch)),
    onUseComputedDays: () => update((draft) => ({ ...draft, manualOffsets: null }))
  }
}

/** Horarios (schedule templates, D-20261015-02): created and changed per local, then assigned to who works with them. */
export function SchedulesView() {
  const [sites, setSites] = useState<Site[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [employeesLoading, setEmployeesLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState('')
  const [notice, setNotice] = useState('')
  // The form whose result `notice` is (scheduleMessageKeys): it shows there, not at the top of the page.
  const [noticeAt, setNoticeAt] = useState('')
  const [siteId, setSiteId] = useState('')
  const [draft, setDraft] = useState<ScheduleDraft>(emptyScheduleDraft)
  const [createError, setCreateError] = useState('')
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [assign, setAssign] = useState<Assign | null>(null)
  const employeesRequest = useRef(0)
  // A form or step that opens takes the focus, and what opened it gets the focus back when it closes (design system 4.7); the
  // buttons are disabled while a save runs, so the move waits for it.
  const focusLater = useFocusRequest(!busy)

  async function loadEmployees() {
    const requestId = ++employeesRequest.current
    setEmployeesLoading(true); setEmployeesError('')
    try {
      const people = await api.get<Employee[]>('/employees')
      if (requestId === employeesRequest.current) setEmployees(people)
    } catch (reason) { if (requestId === employeesRequest.current) setEmployeesError(errText(reason)) }
    finally { if (requestId === employeesRequest.current) setEmployeesLoading(false) }
  }
  async function load() {
    setLoading(true); setLoadError(''); setNotice('')
    try {
      const [availableSites, availableTemplates] = await Promise.all([api.get<Site[]>('/sites'), api.get<Template[]>('/templates')])
      setSites(availableSites); setTemplates(availableTemplates)
      setSiteId((current) => availableSites.some((site) => site.id === current) ? current : availableSites[0]?.id ?? '')
    } catch (reason) { setSites([]); setTemplates([]); setLoadError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void load(); void loadEmployees() }, [])

  const siteTemplates = useMemo(() => templates.filter((template) => template.siteId === siteId), [templates, siteId])
  const assignTemplate = assign ? templates.find((template) => template.id === assign.templateId) : undefined
  const assignEmployees = assignTemplate ? employees.filter((person) => person.active && person.siteIds.includes(assignTemplate.siteId)) : []

  /** The step replaces the form just saved, so the focus goes into it (finding F-27). */
  function openAssign(templateId: string, origin: Assign['origin']) {
    setAssign({ templateId, origin, checked: [], validFrom: deviceDate(), busy: false, result: null })
    focusLater({ id: scheduleFocusIds.assignStep, into: true })
  }
  /** Closing the step gives the focus back to what it replaced: the record's «Cambiar horario», or the create form. */
  function closeAssign() {
    if (assign) focusLater(assign.origin === 'edit' ? { id: scheduleFocusIds.editButton(assign.templateId) } : { id: scheduleFocusIds.createForm, into: true })
    setAssign(null)
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(''); setCreateError('')
    const payload = scheduleInput(draft, siteId)
    if (!payload) { setDraft((current) => ({ ...current, showErrors: true })); return }
    setBusy(true)
    try {
      const saved = await api.post<Template>('/templates', payload)
      setTemplates((current) => [...current, saved]); setDraft(emptyScheduleDraft())
      setNotice(`Horario «${saved.name}» creado.`); setNoticeAt(scheduleMessageKeys.create); openAssign(saved.id, 'create')
    } catch (reason) { setCreateError(errText(reason)) } finally { setBusy(false) }
  }

  function beginEdit(template: Template) {
    setEdit({ templateId: template.id, draft: scheduleDraftFromTemplate(template), error: '' }); setNotice('')
    if (assign?.origin === 'edit') setAssign(null)
    focusLater({ id: scheduleFocusIds.editForm(template.id), into: true })
  }
  function cancelEdit() {
    if (edit) focusLater({ id: scheduleFocusIds.editButton(edit.templateId) })
    setEdit(null)
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice('')
    if (!edit) return
    const template = templates.find((entry) => entry.id === edit.templateId)
    if (!template) return
    // The local of a horario does not change here: a horario already used cannot move (409 TEMPLATE_IN_USE).
    const payload = scheduleInput(edit.draft, template.siteId)
    if (!payload) { setEdit({ ...edit, draft: { ...edit.draft, showErrors: true } }); return }
    setBusy(true)
    try {
      const saved = await api.patch<Template>(`/templates/${encodeURIComponent(template.id)}`, payload)
      setTemplates((current) => current.map((entry) => entry.id === saved.id ? saved : entry)); setEdit(null)
      setNotice(`Horario «${saved.name}» actualizado.`); setNoticeAt(scheduleMessageKeys.edit(saved.id)); openAssign(saved.id, 'edit')
    } catch (reason) { setEdit((current) => current && { ...current, error: errText(reason) }) } finally { setBusy(false) }
  }

  async function submitAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assign || !assign.checked.length || !assign.validFrom) return
    const { templateId, validFrom, checked } = assign
    setAssign({ ...assign, busy: true, result: null })
    const result: AssignmentResult = { assigned: [], existing: [], failed: [] }
    const done: string[] = []
    // One request per employee, the same POST the Empleados screen makes; one failure does not stop the others.
    for (const employeeId of checked) {
      const name = employees.find((person) => person.id === employeeId)?.displayName ?? 'Empleado'
      try {
        await api.post(`/employees/${encodeURIComponent(employeeId)}/template-assignments`, { templateId, validFrom })
        result.assigned.push(name); done.push(employeeId)
      } catch (reason) {
        if (errCode(reason) === 'ASSIGNMENT_EXISTS') { result.existing.push(name); done.push(employeeId) }
        else result.failed.push({ name, message: errText(reason) })
      }
    }
    setAssign((current) => current?.templateId === templateId ? { ...current, busy: false, result, checked: current.checked.filter((id) => !done.includes(id)) } : current)
  }

  // Writing a new horario is the next action: the result of the last one, shown above the same button, goes.
  const updateDraft = (change: (current: ScheduleDraft) => ScheduleDraft) => {
    setDraft(change)
    if (noticeAt === scheduleMessageKeys.create) setNotice('')
  }
  const updateEdit = (change: (current: ScheduleDraft) => ScheduleDraft) => setEdit((current) => current && { ...current, draft: change(current.draft) })

  const assignStep = assign && assignTemplate ? <ScheduleAssignStep templateName={assignTemplate.name} employees={assignEmployees} employeesLoading={employeesLoading} employeesError={employeesError}
    checked={assign.checked} validFrom={assign.validFrom} busy={assign.busy} result={assign.result} asPanel={assign.origin === 'create'}
    notice={noticeAt === (assign.origin === 'create' ? scheduleMessageKeys.create : scheduleMessageKeys.edit(assign.templateId)) ? notice : ''}
    onToggle={(id) => setAssign((current) => current && { ...current, checked: current.checked.includes(id) ? current.checked.filter((entry) => entry !== id) : [...current.checked, id] })}
    onValidFromChange={(validFrom) => setAssign((current) => current && { ...current, validFrom })}
    onSubmit={(event) => void submitAssign(event)} onRetryEmployees={() => void loadEmployees()} onClose={closeAssign} /> : null

  const editTemplate = edit ? templates.find((template) => template.id === edit.templateId) : undefined
  const openCardId = edit?.templateId ?? (assign?.origin === 'edit' ? assign.templateId : '')
  const cardSlot = edit && editTemplate ? <ScheduleEditor id={scheduleFocusIds.editForm(editTemplate.id)} draft={edit.draft} busy={busy} error={edit.error} editing
    submitLabel="Guardar cambios" formLabel={`Cambiar horario ${editTemplate.name}`} {...editorCallbacks(updateEdit)}
    onSubmit={(event) => void saveEdit(event)} onCancel={cancelEdit} /> : assign?.origin === 'edit' ? assignStep : null

  const createPanel = assign?.origin === 'create' && assignStep ? assignStep : <Panel title="Crear un horario">
    <ScheduleEditor id={scheduleFocusIds.createForm} draft={draft} busy={busy} disabled={loading || Boolean(loadError) || !siteId} error={createError} notice={noticeAt === scheduleMessageKeys.create ? notice : ''} submitLabel="Crear horario" formLabel="Crear un horario"
      sites={sites} siteId={siteId} onSiteChange={setSiteId} showTypes {...editorCallbacks(updateDraft)} onSubmit={(event) => void create(event)} />
  </Panel>

  return <SchedulesViewRender sites={sites} siteId={siteId} siteTemplates={siteTemplates} loading={loading} loadError={loadError} notice={notice} messageAt={noticeAt} busy={busy}
    openCardId={openCardId} cardSlot={cardSlot} createPanel={createPanel} onReload={() => void load()} onBeginEdit={beginEdit} />
}
