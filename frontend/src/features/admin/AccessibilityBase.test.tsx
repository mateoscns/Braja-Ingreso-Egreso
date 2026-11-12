import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Deviation, Employee, Session, Site } from '../../shared/api/types'
import { CompanyScreen } from '../auth/AuthScreens'
import { AdminInboxRender, EMPTY_INBOX_FILTERS, SitesViewRender } from './AdminViewsRender'
import { EmployeesViewRender } from './EmployeesViewRender'

afterEach(cleanup)

const site: Site = { id: 's-1', name: 'Local Centro', timeZone: 'America/Argentina/Buenos_Aires', latitude: null, longitude: null, geofenceRadiusMeters: 100 }
const inactive: Employee = { id: 'e-1', displayName: 'Ana Pérez', dni: '30111222', siteIds: ['s-1'], toleranceMinutes: 10, active: false }
const noop = vi.fn()

function renderEmployees(siteIds: string[] = []) {
  return render(<EmployeesViewRender employees={[inactive]} sites={[site]} loading={false} loadError="" error="" notice="" busy={false}
    dni="" displayName="" siteIds={siteIds} tolerance="10" temporaryPassword="" draft={null} onReload={noop} onCreate={noop}
    onDniChange={noop} onDisplayNameChange={noop} onToggleSite={noop} onToleranceChange={noop} onTemporaryPasswordChange={noop}
    onSave={noop} onDraftChange={noop} onStartEditing={noop} onCancelEditing={noop} onOpenAssignments={noop}
    resetTarget={null} issuedPassword={null} onAskReset={noop} onConfirmReset={noop} onCancelReset={noop} onDismissIssuedPassword={noop} />)
}

describe('accesibilidad de base en las pantallas existentes', () => {
  it('la columna de botones de la tabla de empleados tiene nombre', () => {
    renderEmployees()

    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument()
  })

  it('explica por qué no se puede crear el empleado sin sede ni restablecer la contraseña de alguien inactivo', () => {
    renderEmployees()

    expect(screen.getByRole('button', { name: 'Crear empleado' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Crear empleado' })).toHaveAccessibleDescription('Marcá al menos un local para crear el empleado.')
    const reset = screen.getByRole('button', { name: 'Restablecer contraseña de Ana Pérez' })
    expect(reset).toBeDisabled()
    expect(reset).toHaveAccessibleDescription('Está inactivo: activalo para restablecer su contraseña.')
  })

  // Slice E6: the employees have no avatar; their state is a tag whose icon is not read.
  it('el estado de una persona es una etiqueta cuyo ícono no se lee, y la lista no tiene avatares', () => {
    const { container } = renderEmployees()

    expect(container.querySelector('.row-avatar')).toBeNull()
    expect(container.querySelector('td .status-chip svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('no muestra la explicación cuando ya hay una sede marcada', () => {
    renderEmployees(['s-1'])

    expect(screen.getByRole('button', { name: 'Crear empleado' })).toBeEnabled()
    expect(screen.queryByText('Marcá al menos un local para crear el empleado.')).not.toBeInTheDocument()
  })

  it('los símbolos decorativos de la bandeja y de las sedes no se leen', () => {
    const deviation: Deviation = { id: 'd-1', jornadaId: 'j-1', siteId: 's-1', type: 'SIN_INGRESO', status: 'MOTIVO_PENDIENTE', createdAt: '2026-11-09T12:00:00Z', pushEligible: false }
    const { container } = render(<AdminInboxRender items={[deviation]} employees={[]} sites={[site]} filters={EMPTY_INBOX_FILTERS} filterError="" filtered={false}
      onFiltersChange={noop} onApplyFilters={noop} onClearFilters={noop} timeZones={new Map()} nextCursor={null} loading={false} inboxLoadError=""
      timeZoneLoadError="" error="" notice="" busy="" correction={null} correctionReason="" targetDeviation="" onReload={noop} onClassify={noop}
      onRetry={noop} onLoadMore={noop} onCorrectionReasonChange={noop} onSubmitCorrection={noop} onCancelCorrection={noop} />)
    // Changed in slice E1: the symbol of a case is gone; its state is a tag whose icon is not read.
    expect(container.querySelector('.deviation-symbol')).toBeNull()
    expect(container.querySelector('.case .status-chip svg')).toHaveAttribute('aria-hidden', 'true')
    cleanup()

    const sites = render(<SitesViewRender sites={[site]} loading={false} loadError="" error="" notice="" name="" timeZone="" busy={false} siteLocation={null}
      locationStatus="idle" locationMessage="" locating={false} onReload={noop} onSubmit={noop} onNameChange={noop} onTimeZoneChange={noop}
      onCaptureLocation={noop} onClearLocation={noop} />)
    expect(sites.container.querySelector('.row-avatar')).toHaveAttribute('aria-hidden', 'true')
  })

  it('la elección de empresa nombra cada botón solo con la empresa y su rol', () => {
    const session = { accountId: 'a-1', memberships: [{ companyId: 'c-1', companyName: 'Braja', role: 'ADMIN' }, { companyId: 'c-2', companyName: 'Otra', role: 'EMPLOYEE' }], mustChangePassword: false } as Session
    render(<CompanyScreen session={session} onSelect={vi.fn(() => Promise.resolve())} onSignOut={noop} />)

    const choice = screen.getByRole('button', { name: /^Braja\s*Administración$/ })
    // Slice D4: the letter in a box and the written arrow went; the arrow is an icon, hidden from screen readers.
    expect(choice.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
