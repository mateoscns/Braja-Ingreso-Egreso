import { Fragment, type FormEvent, type ReactNode } from 'react'
import { Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import type { Employee, Site, Template, TemplateAssignment } from '../../shared/api/types'
import { formatLocalDate } from '../../shared/format'
import { PASSWORD_LENGTH_HINT, PASSWORD_MAX_CHARACTERS } from '../../shared/password'
import { LoadFailure, PageHeading } from './AdminViewsRender'

const TOLERANCE_LABEL = 'Minutos de tolerancia'
const TOLERANCE_HINT = 'Son los minutos que puede llegar tarde o salir antes o después sin que te avisemos.'
const who = (person: Employee) => person.dni ? `DNI ${person.dni}` : 'identificador interno'

/** A temporary password shown once: after a reset, or after creating an employee with one (D-20261027-09). */
export type IssuedPassword = { displayName: string; temporaryPassword: string; reason?: 'reset' | 'created' }

/** The id of the block next to an employee where its horarios open; the container scrolls it into view. */
export const employeeDetailId = (employeeId: string) => `employee-detail-${employeeId}`
export const ISSUED_PASSWORD_ID = 'issued-password'

function IssuedPasswordPanel({ issued, onDismiss }: { issued: IssuedPassword; onDismiss: () => void }) {
  // tabIndex -1: the container moves the keyboard focus here once the password is shown.
  return <div id={ISSUED_PASSWORD_ID} className="employee-detail" tabIndex={-1}><Panel title={`Contraseña provisoria de ${issued.displayName}`}>
    <p><code className="issued-password-code">{issued.temporaryPassword}</code></p>
    <p>Entregásela en persona; se pide cambiarla al ingresar.</p>
    <p className="field-hint">{issued.reason === 'created' ? 'No se vuelve a mostrar. Si ese DNI ya tenía cuenta en Fichaje, esta no se usa: sigue entrando con la suya.' : 'No se vuelve a mostrar. Sus sesiones abiertas se cerraron.'}</p>
    <button type="button" className="button button-small button-primary" onClick={onDismiss}>Listo, ya la entregué</button>
  </Panel></div>
}

export function EmployeesViewRender({ employees, sites, loading, loadError, error, notice, busy, dni, displayName, siteIds, tolerance, temporaryPassword, generatedPassword = false, draft, cards = false, assignmentsFor = '', assignmentsPanel, onReload, onCreate, onDniChange, onDisplayNameChange, onToggleSite, onToleranceChange, onTemporaryPasswordChange, onGeneratePassword = () => undefined, onSave, onDraftChange, onStartEditing, onCancelEditing, onOpenAssignments, resetTarget, issuedPassword, onAskReset, onConfirmReset, onCancelReset, onDismissIssuedPassword }: {
  employees: Employee[]; sites: Site[]; loading: boolean; loadError: string; error: string; notice: string; busy: boolean
  dni: string; displayName: string; siteIds: string[]; tolerance: string; temporaryPassword: string; draft: Employee | null
  /** The temporary password field holds a generated one (shown again after the employee is created). */
  generatedPassword?: boolean
  /** Phones (520 px or less): employees as cards, with the edit form inside the card instead of table cells. */
  cards?: boolean
  /** The employee whose horarios are open, and that panel (TemplateAssignmentsRender), shown next to the employee. */
  assignmentsFor?: string; assignmentsPanel?: ReactNode
  onReload: () => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onDniChange: (value: string) => void; onDisplayNameChange: (value: string) => void
  onToggleSite: (id: string) => void; onToleranceChange: (value: string) => void; onTemporaryPasswordChange: (value: string) => void; onGeneratePassword?: () => void
  onSave: () => void; onDraftChange: (patch: Partial<Employee>) => void; onStartEditing: (id: string) => void; onCancelEditing: () => void
  onOpenAssignments: (id: string) => void
  resetTarget: string | null; issuedPassword: IssuedPassword | null
  onAskReset: (id: string) => void; onConfirmReset: () => void; onCancelReset: () => void; onDismissIssuedPassword: () => void
}) {
  const siteNames = (person: Employee) => person.siteIds.map((id) => sites.find((site) => site.id === id)?.name ?? 'Local').join(', ')
  const toggleDraftSite = (edit: Employee, siteId: string) => onDraftChange({ siteIds: edit.siteIds.includes(siteId) ? edit.siteIds.filter((id) => id !== siteId) : [...edit.siteIds, siteId] })
  const rowActions = (saved: Employee) => resetTarget === saved.id
    ? <div className="button-row"><span>Se cierran todas sus sesiones y se genera una contraseña provisoria.</span>
      <button className="button button-small button-primary" disabled={busy} onClick={onConfirmReset}>{busy ? 'Restableciendo…' : 'Confirmar restablecimiento'}</button>
      <button type="button" className="button button-small button-quiet" aria-label="Cancelar restablecimiento" disabled={busy} onClick={onCancelReset}>Cancelar</button></div>
    : <div className="button-row"><button className="button button-small button-quiet" aria-label={`Editar empleado ${saved.displayName}`} disabled={busy} onClick={() => onStartEditing(saved.id)}>Editar</button>
      <button className="button button-small button-quiet" aria-label={`Horarios de ${saved.displayName}`} onClick={() => onOpenAssignments(saved.id)}>Horarios</button>
      <button className="button button-small button-quiet" aria-label={`Restablecer contraseña de ${saved.displayName}`} aria-describedby={saved.active ? undefined : `reset-inactive-${saved.id}`} disabled={busy || !saved.active} onClick={() => onAskReset(saved.id)}>Restablecer contraseña</button>
      {!saved.active && <span className="field-hint" id={`reset-inactive-${saved.id}`}>Está inactivo: activalo para restablecer su contraseña.</span>}</div>
  const editButtons = (edit: Employee) => <div className="button-row"><button className="button button-small button-primary" disabled={busy || edit.siteIds.length === 0} onClick={onSave}>{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" className="button button-small button-quiet" disabled={busy} onClick={onCancelEditing}>Cancelar</button></div>
  const detail = (saved: Employee) => assignmentsFor === saved.id && assignmentsPanel ? <div id={employeeDetailId(saved.id)} className="employee-detail">{assignmentsPanel}</div> : null

  const table = <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>DNI</th><th>Locales</th><th>{TOLERANCE_LABEL}</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{employees.map((saved) => {
    const edit = draft?.id === saved.id ? draft : null
    const open = detail(saved)
    return <Fragment key={saved.id}><tr>
      <td>{edit ? <input aria-label={`Nombre del empleado con ${who(saved)}`} value={edit.displayName} onChange={(event) => onDraftChange({ displayName: event.target.value })} /> : <strong>{saved.displayName}</strong>}</td><td>{saved.dni ?? '—'}</td>
      <td>{edit ? <div className="inline-checks site-selection-checks">{sites.map((site) => <label key={site.id}><input type="checkbox" aria-label={`${site.name} (${who(saved)})`} checked={edit.siteIds.includes(site.id)} onChange={() => toggleDraftSite(edit, site.id)} />{site.name}</label>)}</div> : siteNames(saved)}</td>
      <td>{edit ? <input className="short-input" aria-label={`${TOLERANCE_LABEL} del empleado con ${who(saved)}`} type="number" min="0" max="240" value={edit.toleranceMinutes} onChange={(event) => onDraftChange({ toleranceMinutes: Number(event.target.value) })} /> : `${saved.toleranceMinutes} min`}</td>
      <td>{edit ? <label><input type="checkbox" aria-label={`Activo (${who(saved)})`} checked={edit.active} onChange={(event) => onDraftChange({ active: event.target.checked })} /> Activo</label> : saved.active ? 'Activo' : 'Inactivo'}</td>
      <td>{edit ? editButtons(edit) : rowActions(saved)}</td>
    </tr>{open && <tr><td colSpan={6}>{open}</td></tr>}</Fragment>
  })}</tbody></table></div>

  const cardList = <div className="history-list">{employees.map((saved) => {
    const edit = draft?.id === saved.id ? draft : null
    return <article className="history-card" key={saved.id} aria-labelledby={`employee-${saved.id}-name`}>
      <div className="history-head"><strong id={`employee-${saved.id}-name`}>{saved.displayName}</strong><span className={`status-chip ${saved.active ? 'status-justificado' : 'status-inactivo'}`}>{saved.active ? 'Activo' : 'Inactivo'}</span></div>
      {edit ? <div className="form-stack">
        <FormField label="Nombre y apellido"><input aria-label={`Nombre y apellido del empleado con ${who(saved)}`} value={edit.displayName} onChange={(event) => onDraftChange({ displayName: event.target.value })} /></FormField>
        <fieldset className="field fieldset-plain"><legend className="field-label">Locales donde trabaja</legend><div className="check-grid site-selection-checks">{sites.map((site) => <label key={site.id}><input type="checkbox" aria-label={`${site.name} (${who(saved)})`} checked={edit.siteIds.includes(site.id)} onChange={() => toggleDraftSite(edit, site.id)} />{site.name}</label>)}</div></fieldset>
        <FormField label={TOLERANCE_LABEL} hint={TOLERANCE_HINT}><input aria-label={`${TOLERANCE_LABEL} del empleado con ${who(saved)}`} type="number" inputMode="numeric" min="0" max="240" value={edit.toleranceMinutes} onChange={(event) => onDraftChange({ toleranceMinutes: Number(event.target.value) })} /></FormField>
        <div className="check-grid"><label><input type="checkbox" aria-label={`Activo (${who(saved)})`} checked={edit.active} onChange={(event) => onDraftChange({ active: event.target.checked })} />Activo</label></div>
        {editButtons(edit)}
      </div> : <>
        <ul className="history-items">
          <li><span>{saved.dni ? `DNI ${saved.dni}` : 'Sin DNI'}</span></li>
          <li><span>{`Locales: ${siteNames(saved) || '—'}`}</span></li>
          <li><span>{`${TOLERANCE_LABEL}: ${saved.toleranceMinutes}`}</span></li>
        </ul>
        {rowActions(saved)}
      </>}
      {detail(saved)}
    </article>
  })}</div>

  return <>
    <PageHeading title="Equipo" subtitle="Cada persona entra con su DNI. Acá la das de alta, elegís en qué locales trabaja y qué horario tiene." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    {issuedPassword && issuedPassword.reason !== 'created' && <IssuedPasswordPanel issued={issuedPassword} onDismiss={onDismissIssuedPassword} />}
    <Panel title={loading || loadError ? 'Empleados' : `Empleados (${employees.length})`}>{loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : employees.length ? cards ? cardList : table : <Empty>No hay empleados cargados.</Empty>}</Panel>
    {issuedPassword?.reason === 'created' && <IssuedPasswordPanel issued={issuedPassword} onDismiss={onDismissIssuedPassword} />}
    <Panel title="Dar de alta un empleado"><form className="form-grid" onSubmit={onCreate}>
      <FormField label="Nombre y apellido"><input required maxLength={160} value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} /></FormField>
      <FormField label="DNI"><input required minLength={7} maxLength={12} inputMode="numeric" value={dni} onChange={(event) => onDniChange(event.target.value)} /></FormField>
      <FormField label={TOLERANCE_LABEL} hint={TOLERANCE_HINT}><input type="number" inputMode="numeric" min="0" max="240" required value={tolerance} onChange={(event) => onToleranceChange(event.target.value)} /></FormField>
      <div className="form-stack">
        <FormField label="Contraseña provisoria" hint={generatedPassword ? 'Ya generamos una. Te la mostramos al crear el empleado para que se la des.' : `Solo hace falta si el DNI todavía no tiene cuenta. ${PASSWORD_LENGTH_HINT}`}><input type="password" autoComplete="new-password" minLength={12} maxLength={PASSWORD_MAX_CHARACTERS} value={temporaryPassword} onChange={(event) => onTemporaryPasswordChange(event.target.value)} /></FormField>
        <div><button type="button" className="button button-small button-outline" disabled={busy} onClick={onGeneratePassword}>Generar contraseña</button></div>
      </div>
      <fieldset className="field field-wide"><legend className="field-label">Locales donde trabaja</legend><div className="check-grid site-selection-checks">{sites.map((site) => <label key={site.id}><input type="checkbox" checked={siteIds.includes(site.id)} onChange={() => onToggleSite(site.id)} />{site.name}</label>)}</div>{sites.length === 0 && <span className="field-hint">{loadError ? 'Reintentá la carga antes de dar de alta un empleado.' : loading ? 'Cargando locales…' : 'Primero creá un local en Locales.'}</span>}</fieldset>
      <div className="field-wide button-row"><button className="button button-primary" aria-describedby={sites.length > 0 && siteIds.length === 0 ? 'create-employee-needs-site' : undefined} disabled={busy || loading || Boolean(loadError) || siteIds.length === 0}>{busy ? 'Guardando…' : 'Crear empleado'}</button>
        {sites.length > 0 && siteIds.length === 0 && <span className="field-hint" id="create-employee-needs-site">Marcá al menos un local para crear el empleado.</span>}</div>
    </form></Panel>
  </>
}

/** D-20261015-02: history (newest start first) and a new horario from a day; the horarios are those of the employee's locales. */
export function TemplateAssignmentsRender({ employee, sites, templates, assignments, loading, loadError, error, busy, templateId, validFrom, onTemplateChange, onValidFromChange, onSubmit, onRetry, onClose }: {
  employee: Employee; sites: Site[]; templates: Template[]; assignments: TemplateAssignment[]; loading: boolean; loadError: string; error: string; busy: boolean
  templateId: string; validFrom: string; onTemplateChange: (value: string) => void; onValidFromChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onRetry: () => void; onClose: () => void
}) {
  const siteName = (id: string) => sites.find((site) => site.id === id)?.name ?? 'Local'
  return <Panel title={`Horarios de ${employee.displayName}`} action={<button type="button" className="button button-small button-quiet" onClick={onClose}>Cerrar</button>}>
    <p className="muted">Elegí el horario y desde qué día lo usa. Si trabaja en varios locales, cada local tiene el suyo. Los días que ya cargaste no cambian.</p>
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {loading ? <Loading label="Cargando horarios…" /> : loadError ? <LoadFailure message={loadError} onRetry={onRetry} /> : <>
      {assignments.length ? <ul className="simple-list" aria-label={`Historial de horarios de ${employee.displayName}`}>{assignments.map((item) => <li key={item.id} className="simple-row">{`${item.templateName} · ${siteName(item.siteId)} · desde ${formatLocalDate(item.validFrom)}`}</li>)}</ul> : <Empty>Todavía no tiene horarios asignados.</Empty>}
      <form className="form-grid" onSubmit={onSubmit}>
        <FormField label="Horario" hint={templates.length === 0 ? 'No hay horarios en los locales de esta persona. Crealos en Horarios.' : undefined}><select required value={templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">Elegí un horario</option>{templates.map((template) => <option key={template.id} value={template.id}>{`${template.name} · ${siteName(template.siteId)}`}</option>)}</select></FormField>
        <FormField label="Desde el día"><input type="date" required value={validFrom} onChange={(event) => onValidFromChange(event.target.value)} /></FormField>
        <div className="field-wide"><button className="button button-primary" disabled={busy || !templateId || !validFrom}>{busy ? 'Guardando…' : 'Asignar horario'}</button></div>
      </form>
    </>}
  </Panel>
}
