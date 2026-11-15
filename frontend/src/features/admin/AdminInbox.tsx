// The inbox (Bandeja de desvíos) container: loads, filters and pages through the deviations, and classifies them.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Deviation, Employee, Site } from '../../shared/api/types'
import { validateDateRange } from '../../shared/dateRange'
import { useWideTable } from '../../app/useBreakpoint'
import { revealAndFocus, useFocusRequest } from '../../app/revealAndFocus'
import { dateRangeErrors, useFieldErrors } from '../../app/useFieldErrors'
import { AdminInboxRender, caseCorrectButtonId, caseCorrectionFormId, caseRowId, EMPTY_INBOX_FILTERS, INBOX_FILTERS_ID, type DeviationClassification, type FailedDecision, type InboxFilterValues, type SavedDecision } from './AdminInboxRender'
import { errText } from './adminShared'

export function AdminInbox({ coverage, onOpenJornada }: { coverage?: ReactNode; onOpenJornada?: (item: Deviation) => void } = {}) {
  const [items, setItems] = useState<Deviation[]>([])
  const [timeZones, setTimeZones] = useState<Map<string, string>>(new Map())
  const [sites, setSites] = useState<Site[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filters, setFilters] = useState<InboxFilterValues>(EMPTY_INBOX_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<InboxFilterValues>(EMPTY_INBOX_FILTERS)
  // The dates of the filters and the reason of a correction are checked on submit, each under its field (design system 4.7).
  const filterFields = useFieldErrors<'from' | 'to'>()
  const correctionFields = useFieldErrors<'reason'>()
  const generation = useRef(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [inboxLoadError, setInboxLoadError] = useState('')
  const [timeZoneLoadError, setTimeZoneLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  // «Cargar anteriores» has its own state (2026-11-13 audit): a decision ending while a page loaded released the shared `busy`
  // and turned the button back on, and a second tap appended the same page twice. The ref also stops a tap in the same render.
  const [paging, setPaging] = useState(false)
  const pagingNow = useRef(false)
  // Which decision is saving: only its button reads «Guardando…» (issue #177: both did).
  const [savingAs, setSavingAs] = useState<DeviationClassification | null>(null)
  // A refused decision and a saved one are told inside the row of their case (design system 4.11), where the ADMIN pressed the
  // button: a saved one used to show at the top of the section, far from a case lower down (T12).
  const [failedDecision, setFailedDecision] = useState<FailedDecision>(null)
  const [savedDecision, setSavedDecision] = useState<SavedDecision>(null)
  const [correction, setCorrection] = useState<{ deviationId: string; classification: DeviationClassification } | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [targetDeviation] = useState(() => new URLSearchParams(window.location.search).get('deviation') ?? '')
  const narrow = !useWideTable()
  // A new filter set always starts from the first page: a cursor is only valid for the filters that produced it.
  const reload = async (active: InboxFilterValues = appliedFilters) => {
    const requestId = ++generation.current
    setLoading(true); setInboxLoadError(''); setTimeZoneLoadError(''); setError(''); setSavedDecision(null); setFailedDecision(null); setNextCursor(null)
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
    if (!filterFields.check(INBOX_FILTERS_ID, dateRangeErrors(filters.from, filters.to, problem))) return
    setAppliedFilters(filters); void reload(filters)
  }
  function clearFilters() {
    setFilters(EMPTY_INBOX_FILTERS); setAppliedFilters(EMPTY_INBOX_FILTERS); filterFields.reset(); void reload(EMPTY_INBOX_FILTERS)
  }
  function changeFilters(patch: Partial<InboxFilterValues>) {
    setFilters((current) => ({ ...current, ...patch }))
    // A date edited loses the error of the range: it was about the two dates together.
    if ('from' in patch || 'to' in patch) filterFields.clear('from', 'to')
  }
  // The case a notification opened comes into view and takes the focus once (design system 4.11): a later decision or page of
  // cases must not pull the focus back to it.
  const targetShown = useRef(false)
  useEffect(() => {
    if (loading || !targetDeviation || targetShown.current) return
    const target = document.getElementById(caseRowId(targetDeviation))
    if (!target) return
    targetShown.current = true
    revealAndFocus(target, target, 'center')
  }, [loading, items, targetDeviation])
  // A decided case keeps one button, «Corregir a …», in place of the pair: the focus goes there after a decision and when its
  // correction form closes, once the row's buttons are enabled again.
  const focusLater = useFocusRequest(busy === '')
  async function classify(item: Deviation, classification: DeviationClassification, reason?: string) {
    setBusy(item.id); setSavingAs(classification); setError(''); setSavedDecision(null); setFailedDecision(null)
    try {
      const updated = await api.put<Deviation>(`/admin/deviations/${encodeURIComponent(item.id)}/classification`, {
        classification, ...(reason?.trim() ? { correctionReason: reason.trim() } : {})
      })
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setCorrection(null); setCorrectionReason('')
      setSavedDecision({ deviationId: item.id })
      focusLater({ id: caseCorrectButtonId(item.id) })
    } catch (reason) {
      setFailedDecision({ deviationId: item.id, message: errText(reason) })
      // The pressed button was disabled while it waited and lost the focus: its refusal, in the row (and in the correction
      // form when one is open), takes it (slice F1's note).
      correctionFields.focusProblem(caseRowId(item.id))
    } finally { setBusy(''); setSavingAs(null) }
  }
  function requestClassification(item: Deviation, classification: DeviationClassification) {
    if (item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO') {
      setCorrection({ deviationId: item.id, classification }); setCorrectionReason(''); correctionFields.reset()
      focusLater({ id: caseCorrectionFormId(item.id), into: true })
    } else void classify(item, classification)
  }
  function submitCorrection(item: Deviation) {
    if (!correction) return
    // The same condition that kept «Guardar corrección» disabled, now said under the field.
    if (!correctionFields.check(caseCorrectionFormId(item.id), { reason: correctionReason.trim() ? '' : 'Escribí el motivo de corrección.' })) return
    void classify(item, correction.classification, correctionReason)
  }
  function cancelCorrection() {
    if (correction) focusLater({ id: caseCorrectButtonId(correction.deviationId) })
    setCorrection(null); setCorrectionReason(''); correctionFields.reset()
  }
  async function loadMore() {
    if (!nextCursor || pagingNow.current) return
    const requestId = generation.current
    pagingNow.current = true; setPaging(true); setError('')
    try {
      const page = await api.get<{ items: Deviation[]; nextCursor?: string | null }>(`/inbox${queryString({ limit: 50, ...appliedFilters, cursor: nextCursor })}`)
      if (requestId !== generation.current) return
      setItems((current) => [...current, ...page.items]); setNextCursor(page.nextCursor ?? null)
    } catch (reason) { if (requestId === generation.current) setError(errText(reason)) } finally { pagingNow.current = false; setPaging(false) }
  }
  const filtered = Object.values(appliedFilters).some(Boolean)
  return <AdminInboxRender narrow={narrow} appliedFilters={appliedFilters} coverage={coverage} onOpenJornada={onOpenJornada} items={items} employees={employees} sites={sites} filters={filters} filterErrors={filterFields.errors} filtered={filtered} onFiltersChange={changeFilters} onApplyFilters={applyFilters} onClearFilters={clearFilters} timeZones={timeZones} nextCursor={nextCursor} loading={loading} inboxLoadError={inboxLoadError} timeZoneLoadError={timeZoneLoadError} error={error} savedDecision={savedDecision} busy={busy} paging={paging} savingAs={savingAs} correction={correction} correctionReason={correctionReason} targetDeviation={targetDeviation} failedDecision={failedDecision}
    correctionError={correctionFields.errors.reason}
    onReload={() => void reload()} onClassify={requestClassification} onRetry={() => void reload()} onLoadMore={() => void loadMore()}
    onCorrectionReasonChange={(reason) => { setCorrectionReason(reason); correctionFields.clear('reason') }}
    onSubmitCorrection={submitCorrection} onCancelCorrection={cancelCorrection} />
}
