import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Deviation, Employee, Jornada, JornadaAudit, JornadaSummary, Mark, MarkAction, PasswordReset, Site, Template, TemplateBlock, TemplateInput } from '../../shared/api/types'
import { deviceDate, validateDateRange, DATE_PAIR_MESSAGE } from '../../shared/dateRange'
import {
  AdminHistoryRender,
  AdminInboxRender,
  EMPTY_INBOX_FILTERS,
  EmployeesViewRender,
  JourneysViewRender,
  SitesViewRender,
  TemplatesViewRender,
  type DeviationClassification,
  type HistoryFilterValues,
  type InboxFilterValues,
  type JourneyRow
} from './AdminViewsRender'

const dateInBrowserZone = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const errText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.'
function dateTimeParts(value: string, timeZone: string) {
  const entries = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value))
  return Object.fromEntries(entries.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function instantForSiteTime(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const desired = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0) }
  const target = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second)
  if (new Date(target).getUTCFullYear() !== desired.year || new Date(target).getUTCMonth() + 1 !== desired.month || new Date(target).getUTCDate() !== desired.day) return null
  try {
    const candidates = new Set<number>()
    for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
      const sample = target + hours * 60 * 60 * 1000
      const parts = dateTimeParts(new Date(sample).toISOString(), timeZone)
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
      const candidate = target - (asUtc - sample)
      const final = dateTimeParts(new Date(candidate).toISOString(), timeZone)
      if (final.year === desired.year && final.month === desired.month && final.day === desired.day && final.hour === desired.hour && final.minute === desired.minute && final.second === desired.second) candidates.add(candidate)
    }
    if (candidates.size !== 1) return null
    return new Date([...candidates][0]).toISOString()
  } catch { return null }
}

function siteTimeInput(value: string, timeZone: string): string {
  try {
    const parts = dateTimeParts(value, timeZone)
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`
  } catch { return '' }
}

export function AdminInbox() {
  const [items, setItems] = useState<Deviation[]>([])
  const [timeZones, setTimeZones] = useState<Map<string, string>>(new Map())
  const [sites, setSites] = useState<Site[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filters, setFilters] = useState<InboxFilterValues>(EMPTY_INBOX_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<InboxFilterValues>(EMPTY_INBOX_FILTERS)
  const [filterError, setFilterError] = useState('')
  const generation = useRef(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inboxLoadError, setInboxLoadError] = useState('')
  const [timeZoneLoadError, setTimeZoneLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [correction, setCorrection] = useState<{ deviationId: string; classification: DeviationClassification } | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [targetDeviation] = useState(() => new URLSearchParams(window.location.search).get('deviation') ?? '')
  // A new filter set always starts from the first page: a cursor is only valid for the filters that produced it.
  const reload = async (active: InboxFilterValues = appliedFilters) => {
    const requestId = ++generation.current
    setLoading(true); setInboxLoadError(''); setTimeZoneLoadError(''); setError(''); setNotice(''); setNextCursor(null)
    try {
      const [page, sitesResult] = await Promise.all([
        api.get<{ items: Deviation[]; nextCursor?: string | null }>(`/inbox${queryString({ limit: 50, ...active })}`),
        api.get<Site[]>('/sites').then(
          (sites) => ({ sites, error: '' }),
          (reason) => ({ sites: [] as Site[], error: errText(reason) })
        )
      ])
      if (requestId !== generation.current) return
      setItems(page.items); setNextCursor(page.nextCursor ?? null)
      setSites(sitesResult.sites)
      setTimeZones(new Map(sitesResult.sites.map((site) => [site.id, site.timeZone])))
      setTimeZoneLoadError(sitesResult.error)
    }
    catch (reason) { if (requestId !== generation.current) return; setItems([]); setNextCursor(null); setInboxLoadError(errText(reason)) } finally { if (requestId === generation.current) setLoading(false) }
  }
  useEffect(() => { void reload(EMPTY_INBOX_FILTERS) }, [])
  useEffect(() => { api.get<Employee[]>('/employees').then(setEmployees, () => setEmployees([])) }, [])
  function applyFilters() {
    const problem = validateDateRange(filters.from, filters.to)
    if (problem) { setFilterError(problem); return }
    setFilterError(''); setAppliedFilters(filters); void reload(filters)
  }
  function clearFilters() {
    setFilters(EMPTY_INBOX_FILTERS); setAppliedFilters(EMPTY_INBOX_FILTERS); setFilterError(''); void reload(EMPTY_INBOX_FILTERS)
  }
  useEffect(() => {
    if (!loading && targetDeviation) {
      const target = document.getElementById(`deviation-${targetDeviation}`)
      if (!target) return
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    }
  }, [loading, items, targetDeviation])
  async function classify(item: Deviation, classification: DeviationClassification, reason?: string) {
    setBusy(item.id); setError(''); setNotice('')
    try {
      const updated = await api.put<Deviation>(`/admin/deviations/${encodeURIComponent(item.id)}/classification`, {
        classification, ...(reason?.trim() ? { correctionReason: reason.trim() } : {})
      })
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setCorrection(null); setCorrectionReason('')
      setNotice('Clasificación guardada.')
    } catch (reason) { setError(errText(reason)) } finally { setBusy('') }
  }
  function requestClassification(item: Deviation, classification: DeviationClassification) {
    if (item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO') {
      setCorrection({ deviationId: item.id, classification }); setCorrectionReason('')
    } else void classify(item, classification)
  }
  async function loadMore() {
    if (!nextCursor) return
    const requestId = generation.current
    setBusy('page'); setError('')
    try {
      const page = await api.get<{ items: Deviation[]; nextCursor?: string | null }>(`/inbox${queryString({ limit: 50, ...appliedFilters, cursor: nextCursor })}`)
      if (requestId !== generation.current) return
      setItems((current) => [...current, ...page.items]); setNextCursor(page.nextCursor ?? null)
    } catch (reason) { if (requestId === generation.current) setError(errText(reason)) } finally { setBusy('') }
  }
  const filtered = Object.values(appliedFilters).some(Boolean)
  return <AdminInboxRender items={items} employees={employees} sites={sites} filters={filters} filterError={filterError} filtered={filtered} onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onApplyFilters={applyFilters} onClearFilters={clearFilters} timeZones={timeZones} nextCursor={nextCursor} loading={loading} inboxLoadError={inboxLoadError} timeZoneLoadError={timeZoneLoadError} error={error} notice={notice} busy={busy} correction={correction} correctionReason={correctionReason} targetDeviation={targetDeviation}
    onReload={() => void reload()} onClassify={requestClassification} onRetry={() => void reload()} onLoadMore={() => void loadMore()} onCorrectionReasonChange={setCorrectionReason}
    onSubmitCorrection={(item) => void classify(item, correction!.classification, correctionReason)} onCancelCorrection={() => { setCorrection(null); setCorrectionReason('') }} />
}

export function AdminHistory() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [filters, setFilters] = useState<HistoryFilterValues>(() => ({ employeeId: '', siteId: '', from: deviceDate(6), to: deviceDate() }))
  const [filterError, setFilterError] = useState('')
  const [rows, setRows] = useState<JornadaSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  async function loadOptions() {
    setLoadingOptions(true); setOptionsError('')
    try {
      const [people, availableSites] = await Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites')])
      setEmployees(people); setSites(availableSites)
    } catch (reason) { setOptionsError(errText(reason)) } finally { setLoadingOptions(false) }
  }
  useEffect(() => { void loadOptions() }, [])
  async function search() {
    const problem = !filters.employeeId && !filters.siteId ? 'Elegí un empleado o una sede.' : !filters.from || !filters.to ? DATE_PAIR_MESSAGE : validateDateRange(filters.from, filters.to)
    if (problem) { setFilterError(problem); return }
    const requestId = ++request.current
    setFilterError(''); setError(''); setLoading(true)
    try {
      const result = await api.get<JornadaSummary[]>(`/jornadas${queryString({ from: filters.from, to: filters.to, employeeId: filters.employeeId, siteId: filters.siteId, includeDetail: 'true' })}`)
      if (requestId === request.current) setRows(result)
    } catch (reason) {
      if (requestId !== request.current) return
      setRows(null)
      setError((reason as { status?: number } | null)?.status === 422
        ? 'El servidor rechazó la consulta: acotá el rango de fechas o elegí un empleado o una sede (máximo 366 días y 500 jornadas).'
        : errText(reason))
    } finally { if (requestId === request.current) setLoading(false) }
  }
  return <AdminHistoryRender employees={employees} sites={sites} loadingOptions={loadingOptions} optionsError={optionsError} filters={filters} filterError={filterError} rows={rows} loading={loading} error={error}
    onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onSearch={() => void search()} onRetryOptions={() => void loadOptions()} />
}

export function SitesView() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState('America/Argentina/Buenos_Aires')
  const [busy, setBusy] = useState(false)
  async function reload() {
    setLoading(true); setLoadError(''); setError(''); setNotice('')
    try { setSites(await api.get<Site[]>('/sites')) } catch (reason) { setSites([]); setLoadError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date()) }
    catch { setError('Usá una zona horaria IANA válida, por ejemplo America/Argentina/Buenos_Aires.'); setBusy(false); return }
    try { const created = await api.post<Site>('/sites', { name: name.trim(), timeZone }); setSites((current) => [...current, created]); setLoadError(''); setName(''); setNotice('Sede creada.') }
    catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  return <SitesViewRender sites={sites} loading={loading} loadError={loadError} error={error} notice={notice} name={name} timeZone={timeZone} busy={busy}
    onReload={() => void reload()} onSubmit={submit} onNameChange={setName} onTimeZoneChange={setTimeZone} />
}

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
  // Edits live in a draft copy; the list only changes with what the server returns.
  const [draft, setDraft] = useState<Employee | null>(null)
  async function reload() {
    setLoading(true); setLoadError(''); setError(''); setDraft(null)
    try {
      const [people, availableSites] = await Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites')])
      setEmployees(people); setSites(availableSites)
    } catch (reason) { setEmployees([]); setSites([]); setLoadError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])
  function toggleSite(id: string) { setSiteIds((current) => current.includes(id) ? current.filter((siteId) => siteId !== id) : [...current, id]) }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      const created = await api.post<Employee>('/employees', { dni: dni.trim(), displayName: displayName.trim(), siteIds, toleranceMinutes: Number(tolerance), ...(temporaryPassword ? { temporaryPassword } : {}) })
      setEmployees((current) => [...current, created]); setDni(''); setDisplayName(''); setSiteIds([]); setTolerance('5'); setTemporaryPassword(''); setNotice('Empleado creado.')
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
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
  // D-20261027-09: the temporary password lives only in this state; it is never written to browser storage and is
  // gone when the ADMIN dismisses the panel or leaves the view.
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [issuedPassword, setIssuedPassword] = useState<{ displayName: string; temporaryPassword: string } | null>(null)
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
    onReload={() => void reload()} onCreate={create} onDniChange={setDni} onDisplayNameChange={setDisplayName} onToggleSite={toggleSite} onToleranceChange={setTolerance} onTemporaryPasswordChange={setTemporaryPassword}
    onSave={() => void saveEmployee()} onDraftChange={updateDraft} onStartEditing={startEditing} onCancelEditing={() => { setDraft(null); setError('') }}
    resetTarget={resetTarget} issuedPassword={issuedPassword} onAskReset={askReset} onConfirmReset={() => void confirmReset()} onCancelReset={() => setResetTarget(null)} onDismissIssuedPassword={() => setIssuedPassword(null)} />
}

export function TemplatesView() {
  const [sites, setSites] = useState<Site[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedSite, setSelectedSite] = useState('')
  const [editing, setEditing] = useState('')
  const [name, setName] = useState('')
  const [blocks, setBlocks] = useState<TemplateBlock[]>([{ startDayOffset: 0, start: '09:00', end: '13:00', endDayOffset: 0 }, { startDayOffset: 0, start: '14:00', end: '18:00', endDayOffset: 0 }])
  const [breakfast, setBreakfast] = useState('15'); const [lunch, setLunch] = useState('60')
  async function load() {
    setLoading(true); setLoadError(''); setError(''); setNotice('')
    try { const [availableSites, availableTemplates] = await Promise.all([api.get<Site[]>('/sites'), api.get<Template[]>('/templates')]); setSites(availableSites); setTemplates(availableTemplates); setSelectedSite((current) => current || availableSites[0]?.id || '') }
    catch (reason) { setSites([]); setTemplates([]); setLoadError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const siteTemplates = useMemo(() => templates.filter((template) => template.siteId === selectedSite), [templates, selectedSite])
  function setBlock(index: number, patch: Partial<TemplateBlock>) { setBlocks((current) => current.map((block, position) => position === index ? { ...block, ...patch } : block)) }
  function beginEdit(template: Template) { setEditing(template.id); setSelectedSite(template.siteId); setName(template.name); setBlocks(template.blocks.map((block) => ({ ...block }))); setBreakfast(String(template.breakfastLimitMinutes)); setLunch(String(template.lunchLimitMinutes)) }
  function resetForm() { setEditing(''); setName(''); setBlocks([{ startDayOffset: 0, start: '09:00', end: '13:00', endDayOffset: 0 }, { startDayOffset: 0, start: '14:00', end: '18:00', endDayOffset: 0 }]); setBreakfast('15'); setLunch('60') }
  function validBlocks() {
    const mins = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
    let previousEnd = -1
    return blocks.every((block, index) => {
      const start = block.startDayOffset * 1440 + mins(block.start)
      const end = block.endDayOffset * 1440 + mins(block.end)
      const valid = (index > 0 || block.startDayOffset === 0) && end > start && start >= previousEnd
      previousEnd = end
      return valid
    })
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('')
    if (!validBlocks()) { setError('Revisá los bloques: deben estar en orden, no superponerse y terminar después de empezar.'); return }
    setBusy(true)
    const payload: TemplateInput = { siteId: selectedSite, name: name.trim(), blocks, breakfastLimitMinutes: Number(breakfast), lunchLimitMinutes: Number(lunch) }
    try {
      const saved = editing ? await api.patch<Template>(`/templates/${encodeURIComponent(editing)}`, payload) : await api.post<Template>('/templates', payload)
      setTemplates((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]); resetForm(); setNotice(editing ? 'Plantilla actualizada.' : 'Plantilla creada.')
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  return <TemplatesViewRender sites={sites} siteTemplates={siteTemplates} loading={loading} loadError={loadError} error={error} notice={notice} busy={busy} selectedSite={selectedSite} editing={editing} name={name} blocks={blocks} breakfast={breakfast} lunch={lunch}
    onReload={() => void load()} onSiteChange={(id) => { setSelectedSite(id); if (editing) resetForm() }} onBeginEdit={beginEdit} onSubmit={submit} onNameChange={setName} onBlockChange={setBlock}
    onRemoveBlock={(index) => setBlocks((current) => current.filter((_, position) => position !== index))} onAddBlock={() => setBlocks((current) => [...current, { startDayOffset: 0, start: '18:00', end: '22:00', endDayOffset: 0 }])}
    onBreakfastChange={setBreakfast} onLunchChange={setLunch} onResetForm={resetForm} />
}

export function JourneysView() {
  const [employees, setEmployees] = useState<Employee[]>([]); const [sites, setSites] = useState<Site[]>([]); const [templates, setTemplates] = useState<Template[]>([])
  const [jornadas, setJornadas] = useState<JourneyRow[]>([]); const [loading, setLoading] = useState(true); const [journeysLoading, setJourneysLoading] = useState(false); const [journeysDate, setJourneysDate] = useState(''); const [journeysError, setJourneysError] = useState(''); const [dependencyError, setDependencyError] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<Jornada | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [markBusy, setMarkBusy] = useState('')
  const [date, setDate] = useState(dateInBrowserZone); const [dateError, setDateError] = useState(''); const [employeeId, setEmployeeId] = useState(''); const [siteId, setSiteId] = useState(''); const [templateId, setTemplateId] = useState('')
  const journeyRequest = useRef(0)
  const detailRequest = useRef(0)
  const [forgotAction, setForgotAction] = useState<MarkAction>('INGRESO'); const [forgotOccurredAt, setForgotOccurredAt] = useState(''); const [forgotReason, setForgotReason] = useState('')
  const [editingMarkId, setEditingMarkId] = useState(''); const [correctedAction, setCorrectedAction] = useState<MarkAction>('INGRESO'); const [correctedOccurredAt, setCorrectedOccurredAt] = useState(''); const [correctionReason, setCorrectionReason] = useState('')
  // Cancelling a jornada (D-20261027-07) and voiding a mark (D-20261027-08) both ask for a reason in a second, confirming step.
  const [cancelOpen, setCancelOpen] = useState(false); const [cancelReason, setCancelReason] = useState('')
  const [voidingMarkId, setVoidingMarkId] = useState(''); const [voidReason, setVoidReason] = useState('')
  // Change history (issue #60): collapsed by default and loaded only when the ADMIN opens it; auditFor is the open jornada.
  const [auditFor, setAuditFor] = useState(''); const [audit, setAudit] = useState<JornadaAudit | null>(null); const [auditLoading, setAuditLoading] = useState(false); const [auditError, setAuditError] = useState('')
  const auditRequest = useRef(0)
  async function loadAudit(jornadaId: string) {
    const requestId = ++auditRequest.current
    setAudit(null); setAuditError(''); setAuditLoading(true)
    try {
      const result = await api.get<JornadaAudit>(`/admin/jornadas/${encodeURIComponent(jornadaId)}/audit`)
      if (requestId === auditRequest.current) setAudit(result)
    } catch (reason) {
      if (requestId === auditRequest.current) setAuditError(errText(reason))
    } finally { if (requestId === auditRequest.current) setAuditLoading(false) }
  }
  function closeAudit() { auditRequest.current += 1; setAuditFor(''); setAudit(null); setAuditError(''); setAuditLoading(false) }
  function toggleAudit() {
    if (!detail) return
    if (auditFor === detail.id) { closeAudit(); return }
    setAuditFor(detail.id); void loadAudit(detail.id)
  }
  async function loadJourneys(requestedDate = date, preserveNotice = false) {
    const requestId = ++journeyRequest.current
    detailRequest.current += 1
    setJourneysLoading(true); setJourneysError(''); setError(''); if (!preserveNotice) setNotice(''); setDetail(null); setDetailLoading(false)
    try {
      const rows = await api.get<JourneyRow[]>(`/jornadas${queryString({ from: requestedDate, to: requestedDate })}`)
      if (requestId !== journeyRequest.current) return
      setJornadas(rows); setJourneysDate(requestedDate)
    } catch (reason) {
      if (requestId !== journeyRequest.current) return
      setJornadas([]); setJourneysDate(requestedDate); setJourneysError(errText(reason))
    } finally { if (requestId === journeyRequest.current) setJourneysLoading(false) }
  }
  async function loadDependencies(requestedDate: string) {
    setLoading(true); setDependencyError(''); setError('')
    try {
      const [people, availableSites, availableTemplates] = await Promise.all([
        api.get<Employee[]>('/employees'), api.get<Site[]>('/sites'), api.get<Template[]>('/templates')
      ])
      setEmployees(people); setSites(availableSites); setTemplates(availableTemplates.filter((item) => item.active))
      setEmployeeId(people[0]?.id ?? ''); setSiteId(availableSites[0]?.id ?? '')
    } catch (reason) { setDependencyError(errText(reason)) }
    finally { setLoading(false) }
    await loadJourneys(requestedDate)
  }
  useEffect(() => { void loadDependencies(date) }, [])
  useEffect(() => { setTemplateId(templates.find((item) => item.siteId === siteId)?.id ?? '') }, [siteId, templates])
  const eligibleEmployees = useMemo(() => employees.filter((person) => person.active && person.siteIds.includes(siteId)), [employees, siteId])
  useEffect(() => { setEmployeeId((current) => eligibleEmployees.some((person) => person.id === current) ? current : eligibleEmployees[0]?.id ?? '') }, [eligibleEmployees])
  async function declare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try { await api.post('/jornadas', { employeeId, siteId, localDate: date, templateId }); setNotice('Jornada declarada.'); await loadJourneys(date, true) }
    catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  /** refreshAudit: after a change made from the detail, an open history is reloaded; opening a jornada starts it collapsed. */
  async function showDetail(jornadaId: string, refreshAudit = false) {
    const requestId = ++detailRequest.current
    if (refreshAudit && auditFor === jornadaId) void loadAudit(jornadaId)
    else closeAudit()
    setDetail(null); setCancelOpen(false); setCancelReason(''); setVoidingMarkId(''); setVoidReason('')
    setDetailLoading(true); setError('')
    try {
      const jornada = await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`)
      if (requestId === detailRequest.current) setDetail(jornada)
    } catch (reason) {
      if (requestId === detailRequest.current) setError(errText(reason))
    } finally { if (requestId === detailRequest.current) setDetailLoading(false) }
  }
  const detailSite = detail ? sites.find((site) => site.id === detail.siteId) : undefined
  // Without the site's zone a typed time cannot be converted safely; the device zone would silently shift it.
  const detailTimeZone = detailSite?.timeZone
  async function addForgottenMark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || !detailTimeZone) return
    const occurredAt = instantForSiteTime(forgotOccurredAt, detailTimeZone)
    if (!occurredAt) { setError('Esa hora no existe en la zona horaria de la sede. Revisá la fecha y la hora.'); return }
    if (!forgotReason.trim()) { setError('Escribí el motivo de incorporación.'); return }
    setMarkBusy('forgotten'); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/jornadas/${encodeURIComponent(detail.id)}/forgotten-marks`, { action: forgotAction, occurredAt, auditReason: forgotReason.trim() })
      setForgotOccurredAt(''); setForgotReason(''); setNotice('Marca olvidada registrada.'); await showDetail(detail.id, true)
    } catch (reason) { setError(errText(reason)) } finally { setMarkBusy('') }
  }
  function beginMarkCorrection(mark: Mark) {
    if (!detailTimeZone) return
    setVoidingMarkId(''); setEditingMarkId(mark.id); setCorrectedAction(mark.action); setCorrectedOccurredAt(siteTimeInput(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)); setCorrectionReason('')
  }
  async function correctMark(event: FormEvent<HTMLFormElement>, mark: Mark) {
    event.preventDefault()
    if (!detail || !detailTimeZone) return
    const correctedAt = instantForSiteTime(correctedOccurredAt, detailTimeZone)
    if (!correctedAt) { setError('Esa hora no existe en la zona horaria de la sede. Revisá la fecha y la hora.'); return }
    if (!correctionReason.trim()) { setError('Escribí el motivo de corrección.'); return }
    setMarkBusy(mark.id); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/marks/${encodeURIComponent(mark.id)}/correction`, { correctedAction, correctedOccurredAt: correctedAt, auditReason: correctionReason.trim() })
      setEditingMarkId(''); setCorrectionReason(''); setNotice('Marca corregida.'); await showDetail(detail.id, true)
    } catch (reason) { setError(errText(reason)) } finally { setMarkBusy('') }
  }
  function beginVoid(mark: Mark) { setEditingMarkId(''); setVoidingMarkId(mark.id); setVoidReason('') }
  async function voidMark(event: FormEvent<HTMLFormElement>, mark: Mark) {
    event.preventDefault()
    if (!detail) return
    if (!voidReason.trim()) { setError('Escribí el motivo de anulación.'); return }
    setMarkBusy(mark.id); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/marks/${encodeURIComponent(mark.id)}/void`, { reason: voidReason.trim() })
      setVoidingMarkId(''); setVoidReason(''); setNotice('Marca anulada.'); await showDetail(detail.id, true)
    } catch (reason) {
      // A retry whose first attempt committed (response lost) answers MARK_VOIDED: the void is done, show it as done.
      if ((reason as { code?: string } | null)?.code === 'MARK_VOIDED') {
        setVoidingMarkId(''); setVoidReason(''); setNotice('La marca ya estaba anulada.'); await showDetail(detail.id, true)
        return
      }
      // The server reuses INVALID_MARK_HISTORY; for a void it means the marks left would not form a valid jornada.
      setError((reason as { code?: string } | null)?.code === 'INVALID_MARK_HISTORY'
        ? 'No se puede anular esa marca: las marcas que quedan no forman una jornada válida (por ejemplo, un ingreso con marcas posteriores). Anulá o corregí antes las posteriores.'
        : errText(reason))
    } finally { setMarkBusy('') }
  }
  async function cancelJornada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    if (!cancelReason.trim()) { setError('Escribí el motivo de cancelación.'); return }
    const jornadaId = detail.id
    setMarkBusy('cancel'); setError(''); setNotice('')
    try {
      await api.post(`/admin/jornadas/${encodeURIComponent(jornadaId)}/cancellation`, { reason: cancelReason.trim() })
      setCancelOpen(false); setCancelReason(''); setNotice('Jornada cancelada.')
      await loadJourneys(date, true); await showDetail(jornadaId, true)
    } catch (reason) {
      // A retry whose first attempt committed answers JORNADA_CANCELLED: the cancellation is done, show it as done.
      if ((reason as { code?: string } | null)?.code === 'JORNADA_CANCELLED') {
        setCancelOpen(false); setCancelReason(''); setNotice('La jornada ya estaba cancelada.')
        await loadJourneys(date, true); await showDetail(jornadaId, true)
      } else setError(errText(reason))
    } finally { setMarkBusy('') }
  }
  function changeDate(value: string) {
    setDate(value)
    if (!value) {
      journeyRequest.current += 1; detailRequest.current += 1
      setDateError('Elegí una fecha para ver o declarar jornadas.'); setJornadas([]); setJourneysError(''); setJourneysLoading(false); setDetail(null); setDetailLoading(false)
      return
    }
    setDateError('')
    void loadJourneys(value)
  }
  const peopleById = useMemo(() => new Map(employees.map((person) => [person.id, person.displayName])), [employees])
  const siteTemplates = templates.filter((template) => template.siteId === siteId)
  return <JourneysViewRender sites={sites} eligibleEmployees={eligibleEmployees} siteTemplates={siteTemplates} jornadas={jornadas} loading={loading} journeysLoading={journeysLoading} journeysDate={journeysDate} journeysError={journeysError} dependencyError={dependencyError} error={error} notice={notice} busy={busy} detail={detail} detailLoading={detailLoading} markBusy={markBusy} date={date} employeeId={employeeId} siteId={siteId} templateId={templateId} peopleById={peopleById} dateError={dateError} detailSite={detailSite} detailTimeZone={detailTimeZone} forgotAction={forgotAction} forgotOccurredAt={forgotOccurredAt} forgotReason={forgotReason} editingMarkId={editingMarkId} correctedAction={correctedAction} correctedOccurredAt={correctedOccurredAt} correctionReason={correctionReason}
    cancelOpen={cancelOpen} cancelReason={cancelReason} voidingMarkId={voidingMarkId} voidReason={voidReason}
    auditOpen={Boolean(detail) && auditFor === detail?.id} audit={audit} auditLoading={auditLoading} auditError={auditError} onToggleAudit={toggleAudit} onRetryAudit={() => { if (auditFor) void loadAudit(auditFor) }}
    onBeginCancel={() => { setCancelOpen(true); setCancelReason('') }} onCancelReasonChange={setCancelReason} onConfirmCancel={(event) => void cancelJornada(event)} onAbortCancel={() => { setCancelOpen(false); setCancelReason('') }}
    onBeginVoid={beginVoid} onVoidReasonChange={setVoidReason} onConfirmVoid={(event, mark) => void voidMark(event, mark)} onAbortVoid={() => { setVoidingMarkId(''); setVoidReason('') }}
    onDateChange={changeDate} onEmployeeChange={setEmployeeId} onSiteChange={setSiteId} onTemplateChange={setTemplateId} onDeclare={declare} onRetryDependencies={() => void loadDependencies(date)} onReloadJourneys={() => void loadJourneys(date)} onShowDetail={(id) => void showDetail(id)}
    onForgotActionChange={setForgotAction} onForgotOccurredAtChange={setForgotOccurredAt} onForgotReasonChange={setForgotReason} onAddForgottenMark={(event) => void addForgottenMark(event)} onBeginMarkCorrection={beginMarkCorrection} onCorrectedActionChange={setCorrectedAction} onCorrectedOccurredAtChange={setCorrectedOccurredAt} onCorrectionReasonChange={setCorrectionReason} onCorrectMark={(event, mark) => void correctMark(event, mark)} onCancelMarkCorrection={() => setEditingMarkId('')} />
}
