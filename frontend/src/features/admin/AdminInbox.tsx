// The inbox (Bandeja de desvíos) container: loads, filters and pages through the deviations, and classifies them.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Deviation, Employee, Site } from '../../shared/api/types'
import { validateDateRange } from '../../shared/dateRange'
import { useWideTable } from '../../app/useBreakpoint'
import { AdminInboxRender, EMPTY_INBOX_FILTERS, type DeviationClassification, type InboxFilterValues } from './AdminInboxRender'
import { errText } from './adminShared'

export function AdminInbox({ coverage, onOpenJornada }: { coverage?: ReactNode; onOpenJornada?: (item: Deviation) => void } = {}) {
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
  const narrow = !useWideTable()
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
  return <AdminInboxRender narrow={narrow} appliedFilters={appliedFilters} coverage={coverage} onOpenJornada={onOpenJornada} items={items} employees={employees} sites={sites} filters={filters} filterError={filterError} filtered={filtered} onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onApplyFilters={applyFilters} onClearFilters={clearFilters} timeZones={timeZones} nextCursor={nextCursor} loading={loading} inboxLoadError={inboxLoadError} timeZoneLoadError={timeZoneLoadError} error={error} notice={notice} busy={busy} correction={correction} correctionReason={correctionReason} targetDeviation={targetDeviation}
    onReload={() => void reload()} onClassify={requestClassification} onRetry={() => void reload()} onLoadMore={() => void loadMore()} onCorrectionReasonChange={setCorrectionReason}
    onSubmitCorrection={(item) => void classify(item, correction!.classification, correctionReason)} onCancelCorrection={() => { setCorrection(null); setCorrectionReason('') }} />
}
