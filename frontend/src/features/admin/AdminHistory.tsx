// The history search (Historial) container: loads the employees and sites of the filters and searches the days.
import { useEffect, useRef, useState } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Employee, JornadaSummary, Site } from '../../shared/api/types'
import { deviceDate, validateDateRange, DATE_PAIR_MESSAGE } from '../../shared/dateRange'
import { AdminHistoryRender, type HistoryFilterValues } from './AdminHistoryRender'
import { errText } from './adminShared'

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
        ? 'Son demasiados datos para una sola consulta: acotá el rango de fechas o elegí un empleado o una sede (hasta 366 días y 500 jornadas).'
        : errText(reason))
    } finally { if (requestId === request.current) setLoading(false) }
  }
  return <AdminHistoryRender employees={employees} sites={sites} loadingOptions={loadingOptions} optionsError={optionsError} filters={filters} filterError={filterError} rows={rows} loading={loading} error={error}
    onFiltersChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onSearch={() => void search()} onRetryOptions={() => void loadOptions()} />
}
