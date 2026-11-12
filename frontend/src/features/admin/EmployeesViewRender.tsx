import { Fragment, type FormEvent, type ReactNode } from 'react'
import { Empty, Fieldset, FieldsSummary, FormField, Loading, PageMessage, Panel, StatusTag, TableScroll } from '../../app/ui'
import type { FieldErrors } from '../../app/useFieldErrors'
import type { Employee, Site, Template, TemplateAssignment } from '../../shared/api/types'
import { formatLocalDate } from '../../shared/format'
import { PASSWORD_LENGTH_HINT, PASSWORD_MAX_CHARACTERS } from '../../shared/password'
import { LoadFailure, PageHeading } from './AdminViewsRender'

const TOLERANCE_LABEL = 'Minutos de tolerancia'
const TOLERANCE_HINT = 'Son los minutos que puede llegar tarde o salir antes o después sin que te avisemos.'
const who = (person: Employee) => person.dni ? `DNI ${person.dni}` : 'identificador interno'
const LIST_HEADING_ID = 'employees-title'

/**
 * A temporary password shown once: after a reset, or after creating an employee with one (D-20261027-09). `employeeId` is the
 * person whose record shows the result of a reset.
 */
export type IssuedPassword = { displayName: string; temporaryPassword: string; reason?: 'reset' | 'created'; employeeId?: string }

/** The id of the horarios of an employee, opened under its record; the container scrolls it into view. */
export const employeeDetailId = (employeeId: string) => `employee-detail-${employeeId}`
export const ISSUED_PASSWORD_ID = 'issued-password'

/** Where the result of a form shows (design system 4.7): the add form, or the edit or the reset of one person. */
export const messageKeys = { create: 'create', edit: (id: string) => `edit:${id}`, reset: (id: string) => `reset:${id}`, assignments: 'assignments' }

/**
 * Where the container moves the focus (slice F1): a form that opens takes it, and the button that opened it gets it back when
 * the form closes. The buttons of a record are hidden while its form is open, so they return in the render that closes it.
 */
export const focusIds = {
  createForm: 'employee-create-form',
  editButton: (id: string) => `employee-${id}-edit`,
  editForm: (id: string) => `employee-${id}-edit-form`,
  schedulesButton: (id: string) => `employee-${id}-schedules`,
  /** The form that assigns a horario, in the horarios of a person: a failed «Asignar horario» focuses inside it. */
  assignmentForm: (id: string) => `employee-${id}-assignment-form`,
  resetButton: (id: string) => `employee-${id}-reset`,
  /** The sentence that says what a reset does: it takes the focus, so it is read, and Enter cannot confirm by accident. */
  resetNote: (id: string) => `employee-${id}-reset-note`
}

/** The fields of the add form a submit can find wrong. */
export type CreateField = 'displayName' | 'dni' | 'tolerance' | 'temporaryPassword' | 'siteIds'

/** The state of a person: neutral while active, «waiting» (dashed) while inactive (design system 4.10). */
function PersonStateTag({ active }: { active: boolean }) {
  return active ? <StatusTag tone="neutral" icon="check">Activo</StatusTag> : <StatusTag tone="wait" icon="ban">Inactivo</StatusTag>
}

function IssuedPasswordPanel({ issued, onDismiss }: { issued: IssuedPassword; onDismiss: () => void }) {
  // tabIndex -1: the container moves the keyboard focus here once the password is shown.
  return <section id={ISSUED_PASSWORD_ID} className="issued-password" tabIndex={-1} aria-labelledby={`${ISSUED_PASSWORD_ID}-title`}>
    <h3 id={`${ISSUED_PASSWORD_ID}-title`}>{`Contraseña provisoria de ${issued.displayName}`}</h3>
    <p><code className="issued-password-code">{issued.temporaryPassword}</code></p>
    <p>Entregásela en persona; se pide cambiarla al ingresar.</p>
    <p className="field-hint">{issued.reason === 'created' ? 'No se vuelve a mostrar. Si ese DNI ya tenía cuenta en Fichaje, esta no se usa: sigue entrando con la suya.' : 'No se vuelve a mostrar. Sus sesiones abiertas se cerraron.'}</p>
    {/* Secondary: it closes a result; the filled button of its form, or none in a record (principle 4). */}
    <div className="button-row"><button type="button" className="button button-secondary" onClick={onDismiss}>Listo, ya la entregué</button></div>
  </section>
}

export function EmployeesViewRender({ employees, sites, loading, loadError, error, notice, messageAt = '', busy, dni, displayName, siteIds, tolerance, temporaryPassword, generatedPassword = false, draft, cards = false, assignmentsFor = '', assignmentsPanel, createErrors = {}, editErrors = {}, onReload, onCreate, onDniChange, onDisplayNameChange, onToggleSite, onToleranceChange, onTemporaryPasswordChange, onGeneratePassword = () => undefined, onSave, onDraftChange, onStartEditing, onCancelEditing, onOpenAssignments, resetTarget, issuedPassword, onAskReset, onConfirmReset, onCancelReset, onDismissIssuedPassword }: {
  employees: Employee[]; sites: Site[]; loading: boolean; loadError: string; error: string; notice: string; busy: boolean
  /** The form whose result `error` and `notice` are (messageKeys); they show there and nowhere else. */
  messageAt?: string
  dni: string; displayName: string; siteIds: string[]; tolerance: string; temporaryPassword: string; draft: Employee | null
  /** The temporary password field holds a generated one (shown again after the employee is created). */
  generatedPassword?: boolean
  /** Under 768 px: employees as a list of records instead of the table. Both open the same forms under the record. */
  cards?: boolean
  /** The employee whose horarios are open, and that panel (TemplateAssignmentsRender), shown under the employee. */
  assignmentsFor?: string; assignmentsPanel?: ReactNode
  /** What a submit of the add form, or of the open edit, found wrong: under each field. */
  createErrors?: FieldErrors<CreateField>; editErrors?: FieldErrors<'siteIds'>
  onReload: () => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onDniChange: (value: string) => void; onDisplayNameChange: (value: string) => void
  onToggleSite: (id: string) => void; onToleranceChange: (value: string) => void; onTemporaryPasswordChange: (value: string) => void; onGeneratePassword?: () => void
  onSave: () => void; onDraftChange: (patch: Partial<Employee>) => void; onStartEditing: (id: string) => void; onCancelEditing: () => void
  onOpenAssignments: (id: string) => void
  resetTarget: string | null; issuedPassword: IssuedPassword | null
  onAskReset: (id: string) => void; onConfirmReset: () => void; onCancelReset: () => void; onDismissIssuedPassword: () => void
}) {
  const siteNames = (person: Employee) => person.siteIds.map((id) => sites.find((site) => site.id === id)?.name ?? 'Local').join(', ')
  const toggleDraftSite = (edit: Employee, siteId: string) => onDraftChange({ siteIds: edit.siteIds.includes(siteId) ? edit.siteIds.filter((id) => id !== siteId) : [...edit.siteIds, siteId] })
  const messagesAt = (key: string) => messageAt === key && (error || notice) ? <>{error && <PageMessage kind="error">{error}</PageMessage>}{notice && <PageMessage kind="success">{notice}</PageMessage>}</> : null
  // Link buttons: they open something under the record; the filled button belongs to the form they open.
  const rowActions = (saved: Employee, className: string) => <div className={className}>
    <button type="button" id={focusIds.editButton(saved.id)} className="button button-link" aria-label={`Editar empleado ${saved.displayName}`} disabled={busy} onClick={() => onStartEditing(saved.id)}>Editar</button>
    <button type="button" id={focusIds.schedulesButton(saved.id)} className="button button-link" aria-label={`Horarios de ${saved.displayName}`} aria-expanded={assignmentsFor === saved.id} onClick={() => onOpenAssignments(saved.id)}>Horarios</button>
    <button type="button" id={focusIds.resetButton(saved.id)} className="button button-link" aria-label={`Restablecer contraseña de ${saved.displayName}`} aria-describedby={saved.active ? undefined : `reset-inactive-${saved.id}`} disabled={busy || !saved.active} onClick={() => onAskReset(saved.id)}>Restablecer contraseña</button>
    {!saved.active && <span className="field-hint" id={`reset-inactive-${saved.id}`}>Está inactivo: activalo para restablecer su contraseña.</span>}
  </div>
  // One form for both layouts, under the record: the record keeps showing what is saved while the draft changes here.
  const editForm = (saved: Employee, edit: Employee) => <form id={focusIds.editForm(saved.id)} className="inline-form form-grid employee-edit-form" aria-label={`Editar empleado ${saved.displayName}`} noValidate onSubmit={(event) => { event.preventDefault(); onSave() }}>
    <FormField label="Nombre"><input aria-label={`Nombre del empleado con ${who(saved)}`} value={edit.displayName} onChange={(event) => onDraftChange({ displayName: event.target.value })} /></FormField>
    <FormField label={TOLERANCE_LABEL} hint={TOLERANCE_HINT}><input aria-label={`${TOLERANCE_LABEL} del empleado con ${who(saved)}`} type="number" inputMode="numeric" min="0" max="240" value={edit.toleranceMinutes} onChange={(event) => onDraftChange({ toleranceMinutes: Number(event.target.value) })} /></FormField>
    <Fieldset legend="Locales donde trabaja" className="field-wide" error={editErrors.siteIds}><div className="check-list">{sites.map((site) => <label key={site.id} className="check"><input type="checkbox" aria-label={`${site.name} (${who(saved)})`} checked={edit.siteIds.includes(site.id)} onChange={() => toggleDraftSite(edit, site.id)} />{site.name}</label>)}</div></Fieldset>
    <div className="field-wide"><label className="check"><input type="checkbox" aria-label={`Activo (${who(saved)})`} checked={edit.active} onChange={(event) => onDraftChange({ active: event.target.checked })} />Activo</label></div>
    {messagesAt(messageKeys.edit(saved.id)) && <div className="field-wide form-result">{messagesAt(messageKeys.edit(saved.id))}</div>}
    <div className="field-wide button-row"><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" className="button button-link" disabled={busy} onClick={onCancelEditing}>Cancelar</button></div>
  </form>
  // The step before a reset (D-20261027-09): it closes every session, so it says so and confirms with the danger style.
  const resetForm = (saved: Employee) => <form className="inline-form" onSubmit={(event) => { event.preventDefault(); onConfirmReset() }}>
    <p id={focusIds.resetNote(saved.id)} tabIndex={-1}>Se cierran todas sus sesiones y se genera una contraseña provisoria.</p>
    {messagesAt(messageKeys.reset(saved.id))}
    <div className="button-row"><button className="button button-danger" disabled={busy}>{busy ? 'Restableciendo…' : 'Confirmar restablecimiento'}</button>
      <button type="button" className="button button-link" aria-label="Cancelar restablecimiento" disabled={busy} onClick={onCancelReset}>Cancelar</button></div>
  </form>
  /** What opens under a record: its open form or the result of the one that closed, the password of a reset, its horarios. */
  const under = (saved: Employee) => {
    const edit = draft?.id === saved.id ? draft : null
    const form = edit ? editForm(saved, edit) : resetTarget === saved.id ? resetForm(saved)
      : messagesAt(messageKeys.edit(saved.id)) ?? messagesAt(messageKeys.reset(saved.id))
    const issued = issuedPassword && issuedPassword.reason !== 'created' && issuedPassword.employeeId === saved.id
      ? <IssuedPasswordPanel issued={issuedPassword} onDismiss={onDismissIssuedPassword} /> : null
    const schedules = assignmentsFor === saved.id && assignmentsPanel ? assignmentsPanel : null
    return form || issued || schedules ? <>{form}{issued}{schedules}</> : null
  }
  // While a record's own form is open its buttons give way to the form's.
  const formOpen = (saved: Employee) => draft?.id === saved.id || resetTarget === saved.id

  const table = <TableScroll labelledBy={LIST_HEADING_ID}><table aria-labelledby={LIST_HEADING_ID}><thead><tr><th scope="col">Nombre</th><th scope="col">DNI</th><th scope="col">Locales</th><th scope="col">{TOLERANCE_LABEL}</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>{employees.map((saved) => {
    const open = under(saved)
    return <Fragment key={saved.id}><tr>
      <td>{saved.displayName}</td><td>{saved.dni ?? '—'}</td><td>{siteNames(saved)}</td><td>{`${saved.toleranceMinutes} min`}</td>
      <td><PersonStateTag active={saved.active} /></td><td>{!formOpen(saved) && rowActions(saved, 'button-row')}</td>
    </tr>{open && <tr><td colSpan={6}>{open}</td></tr>}</Fragment>
  })}</tbody></table></TableScroll>

  const recordList = <ul className="record-list" aria-labelledby={LIST_HEADING_ID}>{employees.map((saved) => <li className="record" key={saved.id} aria-labelledby={`employee-${saved.id}-name`}>
    <p className="record-title"><strong id={`employee-${saved.id}-name`}>{saved.displayName}</strong><PersonStateTag active={saved.active} /></p>
    <p className="record-meta">{saved.dni ? `DNI ${saved.dni}` : 'Sin DNI'}</p>
    <p className="record-meta">{`Locales: ${siteNames(saved) || '—'}`}</p>
    <p className="record-meta">{`${TOLERANCE_LABEL}: ${saved.toleranceMinutes}`}</p>
    {!formOpen(saved) && rowActions(saved, 'record-actions')}
    {under(saved)}
  </li>)}</ul>

  const createResult = messagesAt(messageKeys.create)
  const createdPassword = issuedPassword?.reason === 'created' ? <IssuedPasswordPanel issued={issuedPassword} onDismiss={onDismissIssuedPassword} /> : null
  return <>
    <PageHeading title="Equipo" subtitle="Cada persona entra con su DNI. Acá la das de alta, elegís en qué locales trabaja y qué horario tiene." />
    {/* Written out instead of Panel: its title names the table, or the list on a phone. */}
    <section className="panel" aria-labelledby={LIST_HEADING_ID}>
      <div className="panel-heading"><h2 id={LIST_HEADING_ID}>{loading || loadError ? 'Empleados' : `Empleados (${employees.length})`}</h2></div>
      {loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : employees.length ? cards ? recordList : table : <Empty>No hay empleados cargados.</Empty>}
    </section>
    <Panel title="Dar de alta un empleado"><form id={focusIds.createForm} className="form-grid" noValidate onSubmit={onCreate}>
      <FormField label="Nombre y apellido" error={createErrors.displayName}><input required maxLength={160} value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} /></FormField>
      <FormField label="DNI" error={createErrors.dni}><input required minLength={7} maxLength={12} inputMode="numeric" value={dni} onChange={(event) => onDniChange(event.target.value)} /></FormField>
      <FormField label={TOLERANCE_LABEL} hint={TOLERANCE_HINT} error={createErrors.tolerance}><input type="number" inputMode="numeric" min="0" max="240" required value={tolerance} onChange={(event) => onToleranceChange(event.target.value)} /></FormField>
      <div className="form-stack">
        <FormField label="Contraseña provisoria" hint={generatedPassword ? 'Ya generamos una. Te la mostramos al crear el empleado para que se la des.' : `Solo hace falta si el DNI todavía no tiene cuenta. ${PASSWORD_LENGTH_HINT}`} error={createErrors.temporaryPassword}><input type="password" autoComplete="new-password" minLength={12} maxLength={PASSWORD_MAX_CHARACTERS} value={temporaryPassword} onChange={(event) => onTemporaryPasswordChange(event.target.value)} /></FormField>
        <div><button type="button" className="button button-secondary" disabled={busy} onClick={onGeneratePassword}>Generar contraseña</button></div>
      </div>
      {/* Without locals (still loading, a failed load, none created) the hint says why none can be ticked; a submit says it again
          as the error of the group, where «Crear empleado» used to stay disabled (finding F-09). */}
      <Fieldset legend="Locales donde trabaja" className="field-wide" error={createErrors.siteIds}
        hint={sites.length === 0 ? loadError ? 'Reintentá la carga antes de dar de alta un empleado.' : loading ? 'Cargando locales…' : 'Primero creá un local en Locales.' : undefined}>
        <div className="check-list">{sites.map((site) => <label key={site.id} className="check"><input type="checkbox" checked={siteIds.includes(site.id)} onChange={() => onToggleSite(site.id)} />{site.name}</label>)}</div>
      </Fieldset>
      {/* The result of the form, and the password of the person just created, right above its button (design system 4.7). */}
      {(Object.keys(createErrors).length > 1 || createResult || createdPassword) && <div className="field-wide form-result"><FieldsSummary count={Object.keys(createErrors).length} />{createResult}{createdPassword}</div>}
      <div className="field-wide button-row"><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Crear empleado'}</button></div>
    </form></Panel>
  </>
}

/**
 * D-20261015-02: history (newest start first) and a new horario from a day; the horarios are those of the employee's locales.
 * It opens under the record of the employee, so it is a part of that record and not a section of the page: an h3 with «Cerrar».
 */
export function TemplateAssignmentsRender({ employee, sites, templates, assignments, loading, loadError, error, notice = '', fieldErrors = {}, busy, templateId, validFrom, onTemplateChange, onValidFromChange, onSubmit, onRetry, onClose }: {
  employee: Employee; sites: Site[]; templates: Template[]; assignments: TemplateAssignment[]; loading: boolean; loadError: string; error: string
  /** The result of the last assignment, shown inside its form. */
  notice?: string
  /** What a submit found missing, under its field. */
  fieldErrors?: FieldErrors<'templateId' | 'validFrom'>
  busy: boolean
  templateId: string; validFrom: string; onTemplateChange: (value: string) => void; onValidFromChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onRetry: () => void; onClose: () => void
}) {
  const siteName = (id: string) => sites.find((site) => site.id === id)?.name ?? 'Local'
  const headingId = `${employeeDetailId(employee.id)}-title`
  return <section id={employeeDetailId(employee.id)} className="inline-form" aria-labelledby={headingId}>
    <div className="subsection-head"><h3 id={headingId}>{`Horarios de ${employee.displayName}`}</h3><button type="button" className="button button-link" onClick={onClose}>Cerrar</button></div>
    <p className="muted">Elegí el horario y desde qué día lo usa. Si trabaja en varios locales, cada local tiene el suyo. Los días que ya cargaste no cambian.</p>
    {loading ? <Loading label="Cargando horarios…" /> : loadError ? <LoadFailure message={loadError} onRetry={onRetry} /> : <>
      {assignments.length ? <ul className="record-list" aria-label={`Historial de horarios de ${employee.displayName}`}>{assignments.map((item) => <li key={item.id} className="record">{`${item.templateName} · ${siteName(item.siteId)} · desde ${formatLocalDate(item.validFrom)}`}</li>)}</ul> : <Empty>Todavía no tiene horarios asignados.</Empty>}
      <form id={focusIds.assignmentForm(employee.id)} className="form-grid" noValidate onSubmit={onSubmit}>
        <FormField label="Horario" hint={templates.length === 0 ? 'No hay horarios en los locales de esta persona. Crealos en Horarios.' : undefined} error={fieldErrors.templateId}><select required value={templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">Elegí un horario</option>{templates.map((template) => <option key={template.id} value={template.id}>{`${template.name} · ${siteName(template.siteId)}`}</option>)}</select></FormField>
        <FormField label="Desde el día" error={fieldErrors.validFrom}><input type="date" required value={validFrom} onChange={(event) => onValidFromChange(event.target.value)} /></FormField>
        {(error || notice) && <div className="field-wide form-result">{error && <PageMessage kind="error">{error}</PageMessage>}{notice && <PageMessage kind="success">{notice}</PageMessage>}</div>}
        <div className="field-wide button-row"><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Asignar horario'}</button></div>
      </form>
    </>}
  </section>
}
