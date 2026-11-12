// The search of earlier days, a fold of «Hoy» (it was the «Historial» section until D-20261111-02, step 2): it searches the
// days of a person or a local in a range, and a day found opens in the detail of «Hoy». The people and the locals of the
// filters are the ones «Hoy» already read, so nothing is loaded here until «Buscar».
import { useEffect, useRef, useState } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Employee, JornadaSummary, Site } from '../../shared/api/types'
import { deviceDate, validateDateRange, DATE_PAIR_MESSAGE } from '../../shared/dateRange'
import { dateRangeErrors, useFieldErrors } from '../../app/useFieldErrors'
import { AdminHistoryRender, HISTORY_FILTERS_ID, type HistoryFilterValues } from './AdminHistoryRender'
import { errText } from './adminShared'

export function AdminHistory({ employees, sites, loadingOptions, optionsError = '', onRetryOptions = () => undefined, opening, arrival = 0, onOpenDay }: {
  employees: Employee[]; sites: Site[]
  /** «Hoy» is still reading the people and the locals: the filters wait for them. */
  loadingOptions: boolean
  /** «Hoy» could not read them: the filters would offer only «Todos», so the search says so and retries them (T12). */
  optionsError?: string; onRetryOptions?: () => void
  /** A day is being read for the detail of «Hoy»: «Ver marcas» waits, as it does on the list of the date. */
  opening: boolean
  /** How many times the old address of «Historial» was followed (0: never): each new arrival opens the fold. */
  arrival?: number
  onOpenDay: (jornadaId: string) => void
}) {
  const [open, setOpen] = useState(arrival > 0)
  // Also when «Hoy» is already on screen and the old address is followed again, after the owner closed the fold (T12, QA B5).
  useEffect(() => { if (arrival > 0) setOpen(true) }, [arrival])
  const [filters, setFilters] = useState<HistoryFilterValues>(() => ({ employeeId: '', siteId: '', from: deviceDate(6), to: deviceDate() }))
  // The same checks as before, each under the filter it is about and all at once (design system 4.7).
  const fields = useFieldErrors<'who' | 'from' | 'to'>()
  const [rows, setRows] = useState<JornadaSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  async function search() {
    const range = !filters.from || !filters.to ? DATE_PAIR_MESSAGE : validateDateRange(filters.from, filters.to)
    const valid = fields.check(HISTORY_FILTERS_ID, {
      who: !filters.employeeId && !filters.siteId ? 'Elegí un empleado o un local.' : '',
      ...dateRangeErrors(filters.from, filters.to, range)
    })
    if (!valid) return
    const requestId = ++request.current
    setError(''); setLoading(true)
    try {
      const result = await api.get<JornadaSummary[]>(`/jornadas${queryString({ from: filters.from, to: filters.to, employeeId: filters.employeeId, siteId: filters.siteId, includeDetail: 'true' })}`)
      if (requestId === request.current) setRows(result)
    } catch (reason) {
      if (requestId !== request.current) return
      setRows(null)
      setError((reason as { status?: number } | null)?.status === 422
        ? 'Son demasiados datos para una sola consulta: acotá el rango de fechas o elegí un empleado o un local (hasta 366 días y 500 días de trabajo).'
        : errText(reason))
    } finally { if (requestId === request.current) setLoading(false) }
  }
  function changeFilters(patch: Partial<HistoryFilterValues>) {
    setFilters((current) => ({ ...current, ...patch }))
    // A person or a local answers «un empleado o un local»; a date edited, the range it was part of.
    if ('employeeId' in patch || 'siteId' in patch) fields.clear('who')
    if ('from' in patch || 'to' in patch) fields.clear('from', 'to')
  }
  return <AdminHistoryRender open={open} onOpenChange={setOpen} employees={employees} sites={sites} loadingOptions={loadingOptions} optionsFailed={Boolean(optionsError)} onRetryOptions={onRetryOptions} filters={filters} filterErrors={fields.errors} rows={rows} loading={loading} error={error} opening={opening}
    onFiltersChange={changeFilters} onSearch={() => void search()} onOpenDay={onOpenDay} />
}
