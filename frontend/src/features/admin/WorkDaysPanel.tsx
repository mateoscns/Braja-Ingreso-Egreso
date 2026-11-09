import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import type { BulkDeclarationResult, Employee, Site, Template } from '../../shared/api/types'
import { declarationFailureMessage } from './bulkDeclaration'
import { WorkDaysFormRender } from './WorkDaysForm'
import { calendarToday, DATE_PROBLEMS, MONDAY_TO_SATURDAY, periodRange, previewText, summarizeBulkResult, validateWorkDays, type BulkResultSummary, type WorkPeriod } from './workDays'


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
  useEffect(() => { setSiteId((current) => sites.some((site) => site.id === current) ? current : sites[0]?.id ?? '') }, [sites])
  const site = sites.find((entry) => entry.id === siteId)
  const people = useMemo(() => employees.filter((person) => person.active && person.siteIds.includes(siteId)), [employees, siteId])
  const selectedIds = selected === null ? people.map((person) => person.id) : selected.filter((id) => people.some((person) => person.id === id))
  const range = period === 'custom' ? { from: customFrom, to: customTo } : periodRange(period, calendarToday(site?.timeZone))
  const names = useMemo(() => new Map(employees.map((person) => [person.id, person.displayName])), [employees])
  function changeSite(id: string) { setSiteId(id); setSelected(null); setTemplateId(''); setResult(null); setError('') }
  function changePeriod(next: WorkPeriod) {
    // "Elegir fechas" starts from the period that was on screen, so the owner only adjusts it.
    if (next === 'custom' && period !== 'custom') { setCustomFrom(range.from); setCustomTo(range.to) }
    setPeriod(next); setError('')
  }
  function toggleEmployee(id: string) {
    setSelected(selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id])
  }
  function toggleAll() { setSelected(selectedIds.length === people.length ? [] : null) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const problem = validateWorkDays({ employeeIds: selectedIds, from: range.from, to: range.to, weekdays })
    if (problem) { setError(problem); return }
    setError(''); setBusy(true)
    try {
      const response = await api.post<BulkDeclarationResult>('/jornadas/bulk', {
        employeeIds: selectedIds, siteId, from: range.from, to: range.to, weekdays, ...(templateId ? { templateId } : {})
      })
      setResult(summarizeBulkResult(response, (id) => names.get(id) ?? 'Una persona'))
      onLoaded()
    } catch (reason) {
      setError(declarationFailureMessage(reason, 'bulk') ?? (reason instanceof Error ? reason.message : 'No se pudieron cargar los días.'))
    } finally { setBusy(false) }
  }
  return <WorkDaysFormRender sites={sites} employees={people} templates={templates.filter((template) => template.siteId === siteId)}
    values={{ siteId, weekdays, period, from: range.from, to: range.to, selectedIds, templateId }}
    preview={previewText({ from: range.from, to: range.to, weekdays, people: selectedIds.length })}
    busy={busy} disabled={disabled || !siteId} error={error} dateError={period === 'custom' && DATE_PROBLEMS.has(error)} result={result}
    onSiteChange={changeSite} onWeekdaysChange={(days) => { setWeekdays(days); setError('') }} onPeriodChange={changePeriod}
    onFromChange={setCustomFrom} onToChange={setCustomTo} onToggleEmployee={toggleEmployee} onToggleAll={toggleAll}
    onTemplateChange={setTemplateId} onSubmit={(event) => void submit(event)} onAssignSchedules={onAssignSchedules} onReviewSchedules={onReviewSchedules} />
}
