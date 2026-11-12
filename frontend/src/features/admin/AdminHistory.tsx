// The search of earlier days, a fold of «Hoy» (it was the «Historial» section until D-20261111-02, step 2): it searches the
// days of a person or a local in a range, and a day found opens in the detail of «Hoy». The people and the locals of the
// filters are the ones «Hoy» already read, so nothing is loaded here until «Buscar».
import { useEffect, useRef, useState } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Employee, JornadaSummary, Site } from '../../shared/api/types'
import { deviceDate, validateDateRange, DATE_PAIR_MESSAGE } from '../../shared/dateRange'
import { AdminHistoryRender, type HistoryFilterValues } from './AdminHistoryRender'
import { errText } from './adminShared'

export function AdminHistory({ employees, sites, loadingOptions, opening, openOnArrival = false, onOpenDay }: {
  employees: Employee[]; sites: Site[]
  /** «Hoy» is still reading the people and the locals: the filters wait for them. */
  loadingOptions: boolean
  /** A day is being read for the detail of «Hoy»: «Ver marcas» waits, as it does on the list of the date. */
  opening: boolean
  /** The old address of «Historial» was followed: the fold opens. */
  openOnArrival?: boolean
  onOpenDay: (jornadaId: string) => void
}) {
  const [open, setOpen] = useState(openOnArrival)
  // Also when «Hoy» is already on screen and the old address is followed again.
  useEffect(() => { if (openOnArrival) setOpen(true) }, [openOnArrival])
  const [filters, setFilters] = useState<HistoryFilterValues>(() => ({ employeeId: '', siteId: '', from: deviceDate(6), to: deviceDate() }))
  const [filterError, setFilterError] = useState('')
  const [rows, setRows] = useState<JornadaSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  async function search() {
    const problem = !filters.employeeId && !filters.siteId ? 'Elegí un empleado o un local.' : !filters.from || !filters.to ? DATE_PAIR_MESSAGE : validateDateRange(filters.from, filters.to)
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
        ? 'Son demasiados datos para una sola consulta: acotá el rango de fechas o elegí un empleado o un local (hasta 366 días y 500 días de trabajo).'
        : errText(reason))
    } finally { if (requestId === request.current) setLoading(false) }
  }
  return <AdminHistoryRender open={open} onOpenChange={setOpen} employees={employees} sites={sites} loadingOptions={loadingOptions} filters={filters} filterError={filterError} rows={rows} loading={loading} error={error} opening={opening}
    onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onSearch={() => void search()} onOpenDay={onOpenDay} />
}
