import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Jornada, Site } from '../../shared/api/types'
import { DayMarksPanel } from './EmployeeViews'

afterEach(cleanup)

const site: Site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }

describe('DayMarksPanel', () => {
  // 2026-11-10 (#115): a day whose marks the ADMIN loaded for 08:00 and 16:02 showed both at 21:15, the time they
  // were stored, while the ADMIN's own screens showed the right times.
  it('lists each mark at the time it happened, also when the ADMIN loaded it later', () => {
    const stored = '2026-11-10T00:15:00Z'
    const jornada: Jornada = {
      id: 'j-1', employeeId: 'e-1', siteId: site.id, localDate: '2026-11-09', state: 'EGRESADA', toleranceMinutes: 5, sequence: 1,
      scheduleSnapshot: { siteId: site.id, name: 'Mañana', blocks: [{ startDayOffset: 0, start: '08:00', end: '16:00', endDayOffset: 0 }], breakfastLimitMinutes: 15, lunchLimitMinutes: 45 },
      marks: [
        { id: 'm-1', jornadaId: 'j-1', action: 'INGRESO', sequence: 1, acceptedAt: stored, occurredAt: '2026-11-09T11:00:00Z', locationStatus: 'NO_APLICA' },
        { id: 'm-2', jornadaId: 'j-1', action: 'EGRESO', sequence: 2, acceptedAt: stored, occurredAt: '2026-11-09T19:02:00Z', locationStatus: 'NO_APLICA' }
      ]
    }
    render(<DayMarksPanel title="Tus marcas" jornada={jornada} site={site} />)

    expect(screen.getByText('08:00')).toBeInTheDocument()
    expect(screen.getByText('16:02')).toBeInTheDocument()
    expect(screen.queryByText('21:15')).not.toBeInTheDocument()
  })

  it('keeps the server time for a mark the employee made', () => {
    const jornada: Jornada = {
      id: 'j-1', employeeId: 'e-1', siteId: site.id, localDate: '2026-11-09', state: 'EN_CURSO', toleranceMinutes: 5, sequence: 1,
      scheduleSnapshot: { siteId: site.id, name: 'Mañana', blocks: [{ startDayOffset: 0, start: '08:00', end: '16:00', endDayOffset: 0 }], breakfastLimitMinutes: 15, lunchLimitMinutes: 45 },
      marks: [{ id: 'm-1', jornadaId: 'j-1', action: 'INGRESO', sequence: 1, acceptedAt: '2026-11-09T11:02:00Z', locationStatus: 'RECIBIDA' }]
    }
    render(<DayMarksPanel title="Tus marcas" jornada={jornada} site={site} />)

    expect(screen.getByText('08:02')).toBeInTheDocument()
  })
})
