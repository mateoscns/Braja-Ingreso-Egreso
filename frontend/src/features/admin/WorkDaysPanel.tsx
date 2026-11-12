import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import type { BulkDeclarationResult, Employee, Site, Template } from '../../shared/api/types'
import { useFieldErrors } from '../../app/useFieldErrors'
import { validateDateRange } from '../../shared/dateRange'
import { declarationFailureMessage, MAX_BULK_DAYS, MAX_BULK_EMPLOYEES, type BulkDeclarationDraft } from './bulkDeclaration'
import { WORK_DAYS_FORM_ID, WorkDaysFormRender, type WorkDaysField } from './WorkDaysForm'
import { calendarToday, DATE_PROBLEMS, MONDAY_TO_SATURDAY, periodRange, previewText, summarizeBulkResult, validateWorkDays, type BulkResultSummary, type WorkPeriod } from './workDays'

/**
 * The group a problem of validateWorkDays is about, found by the checks it makes in its order: the dates of the period, the
 * people, the range again (years, at most 31 days), and last the weekdays (none chosen, or none falls in the period).
 */
function workDaysField(draft: BulkDeclarationDraft): WorkDaysField {
  if (DATE_PROBLEMS.has(validateWorkDays(draft))) return 'period'
  if (draft.employeeIds.length === 0 || draft.employeeIds.length > MAX_BULK_EMPLOYEES) return 'people'
  if (validateDateRange(draft.from, draft.to, MAX_BULK_DAYS)) return 'period'
  return 'weekdays'
}

/**
 * Container of "Cargar días de trabajo": its own site, weekdays (Monday to Saturday by default, as most shops open), period and
 * people (everyone by default). Sends the same POST /jornadas/bulk as the previous form; onLoaded refreshes the list and the guide.
 */
export function WorkDaysPanel({ sites, employees, templates, disabled, onLoaded, onAssignSchedules, onReviewSchedules }: {
  sites: Site[]; employees: Employee[]; templates: Template[]; disabled: boolean
  onLoaded: () => void; onAssignSchedules: () => void; onReviewSchedules: () => void
}) {
  const [siteId, setSiteId] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>(MONDAY_TO_SATURDAY)
  const [period, setPeriod] = useState<WorkPeriod>('rest-of-month')
  const [customFrom, setCustomFrom] = useState(''); const [customTo, setCustomTo] = useState('')
  // null means "everyone in the site", so people added later are included too.
  const [selected, setSelected] = useState<string[] | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<BulkResultSummary | null>(null)
  // What validateWorkDays finds goes under the group it is about; `error` is the refusal of the server, above the button.
  const fields = useFieldErrors<WorkDaysField>()
  useEffect(() => { setSiteId((current) => sites.some((site) => site.id === current) ? current : sites[0]?.id ?? '') }, [sites])
  const site = sites.find((entry) => entry.id === siteId)
  const people = useMemo(() => employees.filter((person) => person.active && person.siteIds.includes(siteId)), [employees, siteId])
  const selectedIds = selected === null ? people.map((person) => person.id) : selected.filter((id) => people.some((person) => person.id === id))
  const range = period === 'custom' ? { from: customFrom, to: customTo } : periodRange(period, calendarToday(site?.timeZone))
  const names = useMemo(() => new Map(employees.map((person) => [person.id, person.displayName])), [employees])
  function changeSite(id: string) { setSiteId(id); setSelected(null); setTemplateId(''); setResult(null); setError(''); fields.reset() }
  function changePeriod(next: WorkPeriod) {
    // "Elegir fechas" starts from the period that was on screen, so the owner only adjusts it.
    if (next === 'custom' && period !== 'custom') { setCustomFrom(range.from); setCustomTo(range.to) }
    setPeriod(next); setError(''); fields.clear('period', 'weekdays')
  }
  function toggleEmployee(id: string) {
    setSelected(selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id]); fields.clear('people')
  }
  function toggleAll() { setSelected(selectedIds.length === people.length ? [] : null); fields.clear('people') }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null); setError('')
    const draft = { employeeIds: selectedIds, from: range.from, to: range.to, weekdays }
    const problem = validateWorkDays(draft)
    if (!fields.check(WORK_DAYS_FORM_ID, problem ? { [workDaysField(draft)]: problem } : {})) return
    setBusy(true)
    try {
      const response = await api.post<BulkDeclarationResult>('/jornadas/bulk', {
        employeeIds: selectedIds, siteId, from: range.from, to: range.to, weekdays, ...(templateId ? { templateId } : {})
      })
      setResult(summarizeBulkResult(response, (id) => names.get(id) ?? 'Una persona'))
      onLoaded()
    } catch (reason) {
      setError(declarationFailureMessage(reason, 'bulk') ?? (reason instanceof Error ? reason.message : 'No se pudieron cargar los días.'))
      fields.focusProblem(WORK_DAYS_FORM_ID)
    } finally { setBusy(false) }
  }
  // `disabled` (the page still reads its locals and people) turns off the choice of local; the button stays on and a submit
  // with nothing to load says so under its group (finding F-09).
  return <WorkDaysFormRender sites={sites} employees={people} templates={templates.filter((template) => template.siteId === siteId)}
    values={{ siteId, weekdays, period, from: range.from, to: range.to, selectedIds, templateId }}
    preview={previewText({ from: range.from, to: range.to, weekdays, people: selectedIds.length })}
    busy={busy} disabled={disabled || !siteId} error={error} fieldErrors={fields.errors} result={result}
    onSiteChange={changeSite} onWeekdaysChange={(days) => { setWeekdays(days); setError(''); fields.clear('weekdays') }} onPeriodChange={changePeriod}
    onFromChange={(value) => { setCustomFrom(value); fields.clear('period', 'weekdays') }} onToChange={(value) => { setCustomTo(value); fields.clear('period', 'weekdays') }}
    onToggleEmployee={toggleEmployee} onToggleAll={toggleAll}
    onTemplateChange={setTemplateId} onSubmit={(event) => void submit(event)} onAssignSchedules={onAssignSchedules} onReviewSchedules={onReviewSchedules} />
}
