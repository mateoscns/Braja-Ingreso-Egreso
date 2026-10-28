import { Fragment, type FormEvent } from 'react'
import { Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import type { Deviation, Employee, Jornada, JornadaSummary, Mark, MarkAction, Site, Template, TemplateBlock } from '../../shared/api/types'
import { formatBlock, formatDateTime, formatLocalDate, jornadaStateLabel } from '../../shared/format'

const stateLabel = jornadaStateLabel
/** L30: cancel and void reasons are kept as free-text audit, so the form warns against health data. */
const HEALTH_DATA_HINT = 'No escribas datos de salud; alcanza con «Licencia».'

export type DeviationClassification = 'JUSTIFICADO' | 'NO_JUSTIFICADO'
export type JourneyRow = Pick<Jornada, 'id' | 'employeeId' | 'siteId' | 'localDate' | 'state'>

export type InboxFilterValues = { employeeId: string; siteId: string; from: string; to: string }
export const EMPTY_INBOX_FILTERS: InboxFilterValues = { employeeId: '', siteId: '', from: '', to: '' }

type Correction = { deviationId: string; classification: DeviationClassification } | null

function journeysTitle(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Jornadas'
  const parsedDate = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return 'Jornadas'
  const formattedDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'UTC' }).format(parsedDate)
  return `Jornadas del ${formattedDate}`
}

export function AdminInboxRender({ items, employees, sites, filters, filterError, filtered, onFiltersChange, onApplyFilters, onClearFilters, timeZones, nextCursor, loading, inboxLoadError, timeZoneLoadError, error, notice, busy, correction, correctionReason, targetDeviation, onReload, onClassify, onRetry, onLoadMore, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  items: Deviation[]; employees: Employee[]; sites: Site[]; filters: InboxFilterValues; filterError: string; filtered: boolean
  onFiltersChange: (patch: Partial<InboxFilterValues>) => void; onApplyFilters: () => void; onClearFilters: () => void
  timeZones: Map<string, string>; nextCursor: string | null; loading: boolean; inboxLoadError: string; timeZoneLoadError: string
  error: string; notice: string; busy: string; correction: Correction; correctionReason: string; targetDeviation: string
  onReload: () => void; onClassify: (item: Deviation, classification: DeviationClassification) => void; onRetry: () => void; onLoadMore: () => void
  onCorrectionReasonChange: (reason: string) => void; onSubmitCorrection: (item: Deviation) => void; onCancelCorrection: () => void
}) {
  return <>
    <div className="page-title-row"><div><p className="eyebrow">CENTRO DE CONTROL</p><h1>Bandeja de desvíos</h1><p className="muted">Revisá motivos y resolvé cada caso. Las notificaciones no incluyen datos privados.</p></div><button className="button button-quiet" disabled={loading} onClick={onReload}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    {timeZoneLoadError && <PageMessage kind="error">No se pudieron cargar las zonas horarias de las sedes: {timeZoneLoadError} Las horas se muestran en la zona horaria de este dispositivo.</PageMessage>}
    {targetDeviation && items.some((item) => item.id === targetDeviation) && <PageMessage kind="success">Abriste el desvío indicado por la notificación.</PageMessage>}
    <form className="filter-bar" aria-label="Filtros de la bandeja" noValidate onSubmit={(event) => { event.preventDefault(); onApplyFilters() }}>
      <FormField label="Empleado"><select value={filters.employeeId} onChange={(event) => onFiltersChange({ employeeId: event.target.value })}><option value="">Todos</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></FormField>
      <FormField label="Sede"><select value={filters.siteId} onChange={(event) => onFiltersChange({ siteId: event.target.value })}><option value="">Todas</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField>
      <FormField label="Desde"><input type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} /></FormField>
      <FormField label="Hasta"><input type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} /></FormField>
      <div className="button-row filter-actions"><button className="button button-primary" disabled={loading}>Aplicar</button><button type="button" className="button button-quiet" disabled={loading} onClick={onClearFilters}>Limpiar</button></div>
      {filterError && <div className="filter-error"><PageMessage kind="error">{filterError}</PageMessage></div>}
    </form>
    <Panel title="Casos recientes">{inboxLoadError ? <LoadFailure message={inboxLoadError} onRetry={onRetry} /> : <>
      <DeviationList items={items} filtered={filtered} loading={loading} busy={busy} onClassify={onClassify} targetId={targetDeviation} timeZones={timeZones}
        correction={correction} correctionReason={correctionReason} onCorrectionReasonChange={onCorrectionReasonChange}
        onSubmitCorrection={onSubmitCorrection} onCancelCorrection={onCancelCorrection} />
      {nextCursor && <div className="load-more"><button className="button button-quiet" disabled={busy === 'page'} onClick={onLoadMore}>{busy === 'page' ? 'Cargando…' : 'Cargar anteriores'}</button></div>}
    </>}
    </Panel>
  </>
}

function DeviationList({ items, filtered, loading, busy, onClassify, targetId, timeZones, correction, correctionReason, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  items: Deviation[]; filtered: boolean; loading: boolean; busy: string; onClassify: (item: Deviation, classification: DeviationClassification) => void
  targetId: string; timeZones: Map<string, string>; correction: Correction; correctionReason: string
  onCorrectionReasonChange: (reason: string) => void; onSubmitCorrection: (item: Deviation) => void; onCancelCorrection: () => void
}) {
  if (loading) return <Loading label="Cargando desvíos…" />
  if (!items.length) return <Empty>{filtered ? 'Ningún desvío coincide con los filtros aplicados.' : 'No hay desvíos para mostrar.'}</Empty>
  return <div className="deviation-list">{items.map((item) => <article className={`deviation-card ${targetId === item.id ? 'deviation-target' : ''}`} key={item.id} id={`deviation-${item.id}`}>
    <div className="deviation-symbol">{item.type === 'SIN_INGRESO' ? '!' : '↗'}</div>
    <div className="deviation-main"><div className="deviation-title"><strong>{deviationName(item.type)}</strong><span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span></div>
      <p>{item.employeeDisplayName?.trim() || 'Registro de jornada'} · {dateTime(item.occurredAt ?? item.createdAt, item.siteId ? timeZones.get(item.siteId) : undefined)}</p>
      {item.category && <p className="reason-line"><b>Motivo:</b> {categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
    </div>
    <div className="deviation-actions">
      {item.status === 'JUSTIFICADO' ? <button className="button button-small button-danger-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'NO_JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'Corregir a no justificado'}</button> :
        item.status === 'NO_JUSTIFICADO' ? <button className="button button-small button-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'Corregir a justificado'}</button> : <>
          <button className="button button-small button-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'Justificado'}</button>
          <button className="button button-small button-danger-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'NO_JUSTIFICADO')}>{busy === item.id ? 'Guardando…' : 'No justificado'}</button>
        </>}
      {correction?.deviationId === item.id && <form className="form-stack correction-form" onSubmit={(event) => { event.preventDefault(); onSubmitCorrection(item) }}>
        <FormField label="Motivo de corrección"><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-primary" disabled={busy === item.id || !correctionReason.trim()}>{busy === item.id ? 'Guardando…' : 'Guardar corrección'}</button><button type="button" className="button button-small button-quiet" disabled={busy === item.id} onClick={onCancelCorrection}>Cancelar</button></div>
      </form>}
    </div>
  </article>)}</div>
}

export function SitesViewRender({ sites, loading, loadError, error, notice, name, timeZone, busy, onReload, onSubmit, onNameChange, onTimeZoneChange }: {
  sites: Site[]; loading: boolean; loadError: string; error: string; notice: string; name: string; timeZone: string; busy: boolean
  onReload: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onNameChange: (value: string) => void; onTimeZoneChange: (value: string) => void
}) {
  return <>
    <PageHeading eyebrow="ORGANIZACIÓN" title="Sedes" subtitle="Cada sede define su zona horaria y sus plantillas." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <div className="content-grid"><Panel title="Sedes registradas">{loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : sites.length ? <div className="simple-list">{sites.map((site) => <div key={site.id} className="simple-row"><span className="row-avatar">⌖</span><span><strong>{site.name}</strong><small>{site.timeZone}</small></span></div>)}</div> : <Empty>Todavía no hay sedes.</Empty>}</Panel>
      <Panel title="Agregar sede"><form className="form-stack" onSubmit={onSubmit}><FormField label="Nombre de la sede"><input required maxLength={120} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ej. Local Centro" /></FormField><FormField label="Zona horaria" hint="Usá un identificador IANA, como America/Argentina/Buenos_Aires."><input required maxLength={120} value={timeZone} onChange={(event) => onTimeZoneChange(event.target.value)} placeholder="America/Argentina/Buenos_Aires" /></FormField><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Crear sede'}</button></form></Panel>
    </div>
  </>
}

export function EmployeesViewRender({ employees, sites, loading, loadError, error, notice, busy, dni, displayName, siteIds, tolerance, temporaryPassword, draft, onReload, onCreate, onDniChange, onDisplayNameChange, onToggleSite, onToleranceChange, onTemporaryPasswordChange, onSave, onDraftChange, onStartEditing, onCancelEditing, resetTarget, issuedPassword, onAskReset, onConfirmReset, onCancelReset, onDismissIssuedPassword }: {
  employees: Employee[]; sites: Site[]; loading: boolean; loadError: string; error: string; notice: string; busy: boolean
  dni: string; displayName: string; siteIds: string[]; tolerance: string; temporaryPassword: string; draft: Employee | null
  onReload: () => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onDniChange: (value: string) => void; onDisplayNameChange: (value: string) => void
  onToggleSite: (id: string) => void; onToleranceChange: (value: string) => void; onTemporaryPasswordChange: (value: string) => void
  onSave: () => void; onDraftChange: (patch: Partial<Employee>) => void; onStartEditing: (id: string) => void; onCancelEditing: () => void
  resetTarget: string | null; issuedPassword: { displayName: string; temporaryPassword: string } | null
  onAskReset: (id: string) => void; onConfirmReset: () => void; onCancelReset: () => void; onDismissIssuedPassword: () => void
}) {
  const rowActions = (saved: Employee) => resetTarget === saved.id
    ? <div className="button-row"><span>Se cierran todas sus sesiones y se genera una contraseña provisoria.</span>
      <button className="button button-small button-primary" disabled={busy} onClick={onConfirmReset}>{busy ? 'Restableciendo…' : 'Confirmar restablecimiento'}</button>
      <button type="button" className="button button-small button-quiet" aria-label="Cancelar restablecimiento" disabled={busy} onClick={onCancelReset}>Cancelar</button></div>
    : <div className="button-row"><button className="button button-small button-quiet" aria-label={`Editar empleado ${saved.displayName}`} disabled={busy} onClick={() => onStartEditing(saved.id)}>Editar</button>
      <button className="button button-small button-quiet" aria-label={`Restablecer contraseña de ${saved.displayName}`} disabled={busy || !saved.active} onClick={() => onAskReset(saved.id)}>Restablecer contraseña</button></div>
  return <>
    <PageHeading eyebrow="EQUIPO" title="Empleados" subtitle="Las cuentas se identifican por DNI. La tolerancia se guarda por empleado." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    {issuedPassword && <Panel title={`Contraseña provisoria de ${issuedPassword.displayName}`}>
      <p><code>{issuedPassword.temporaryPassword}</code></p>
      <p>Entregásela en persona; se pide cambiarla al ingresar.</p>
      <p className="field-hint">No se vuelve a mostrar. Sus sesiones abiertas se cerraron.</p>
      <button type="button" className="button button-small button-primary" onClick={onDismissIssuedPassword}>Listo, ya la entregué</button>
    </Panel>}
    <Panel title={loading || loadError ? 'Empleados' : `Empleados (${employees.length})`}>{loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : employees.length ? <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>DNI</th><th>Sedes</th><th>Tolerancia</th><th>Estado</th><th /></tr></thead><tbody>{employees.map((saved) => {
      const edit = draft?.id === saved.id ? draft : null
      return <tr key={saved.id}>
        <td>{edit ? <input aria-label={`Nombre del empleado con ${who(saved)}`} value={edit.displayName} onChange={(event) => onDraftChange({ displayName: event.target.value })} /> : <strong>{saved.displayName}</strong>}</td><td>{saved.dni ?? '—'}</td>
        <td>{edit ? <div className="inline-checks">{sites.map((site) => <label key={site.id}><input type="checkbox" aria-label={`${site.name} (${who(saved)})`} checked={edit.siteIds.includes(site.id)} onChange={() => onDraftChange({ siteIds: edit.siteIds.includes(site.id) ? edit.siteIds.filter((id) => id !== site.id) : [...edit.siteIds, site.id] })} />{site.name}</label>)}</div> : saved.siteIds.map((id) => sites.find((site) => site.id === id)?.name ?? 'Sede').join(', ')}</td>
        <td>{edit ? <input className="short-input" aria-label={`Tolerancia en minutos del empleado con ${who(saved)}`} type="number" min="0" max="240" value={edit.toleranceMinutes} onChange={(event) => onDraftChange({ toleranceMinutes: Number(event.target.value) })} /> : `${saved.toleranceMinutes} min`}</td>
        <td>{edit ? <label><input type="checkbox" aria-label={`Activo (${who(saved)})`} checked={edit.active} onChange={(event) => onDraftChange({ active: event.target.checked })} /> Activo</label> : saved.active ? 'Activo' : 'Inactivo'}</td>
        <td>{edit ? <div className="button-row"><button className="button button-small button-primary" disabled={busy || edit.siteIds.length === 0} onClick={onSave}>{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" className="button button-small button-quiet" disabled={busy} onClick={onCancelEditing}>Cancelar</button></div> : rowActions(saved)}</td>
      </tr>
    })}</tbody></table></div> : <Empty>No hay empleados cargados.</Empty>}</Panel>
    <Panel title="Dar de alta un empleado"><form className="form-grid" onSubmit={onCreate}>
      <FormField label="Nombre y apellido"><input required maxLength={160} value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} /></FormField>
      <FormField label="DNI"><input required minLength={7} maxLength={12} inputMode="numeric" value={dni} onChange={(event) => onDniChange(event.target.value)} /></FormField>
      <FormField label="Tolerancia individual (minutos)"><input type="number" min="0" max="240" required value={tolerance} onChange={(event) => onToleranceChange(event.target.value)} /></FormField>
      <FormField label="Contraseña provisoria" hint="Solo hace falta si el DNI todavía no tiene cuenta."><input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={temporaryPassword} onChange={(event) => onTemporaryPasswordChange(event.target.value)} /></FormField>
      <fieldset className="field field-wide"><legend className="field-label">Sedes habilitadas</legend><div className="check-grid">{sites.map((site) => <label key={site.id}><input type="checkbox" checked={siteIds.includes(site.id)} onChange={() => onToggleSite(site.id)} />{site.name}</label>)}</div>{sites.length === 0 && <span className="field-hint">{loadError ? 'Reintentá la carga antes de dar de alta un empleado.' : loading ? 'Cargando sedes…' : 'Primero creá una sede.'}</span>}</fieldset>
      <div className="field-wide"><button className="button button-primary" disabled={busy || loading || Boolean(loadError) || siteIds.length === 0}>{busy ? 'Guardando…' : 'Crear empleado'}</button></div>
    </form></Panel>
  </>
}

export function TemplatesViewRender({ sites, siteTemplates, loading, loadError, error, notice, busy, selectedSite, editing, name, blocks, breakfast, lunch, onReload, onSiteChange, onBeginEdit, onSubmit, onNameChange, onBlockChange, onRemoveBlock, onAddBlock, onBreakfastChange, onLunchChange, onResetForm }: {
  sites: Site[]; siteTemplates: Template[]; loading: boolean; loadError: string; error: string; notice: string; busy: boolean; selectedSite: string; editing: string; name: string; blocks: TemplateBlock[]; breakfast: string; lunch: string
  onReload: () => void; onSiteChange: (id: string) => void; onBeginEdit: (template: Template) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onNameChange: (value: string) => void; onBlockChange: (index: number, patch: Partial<TemplateBlock>) => void; onRemoveBlock: (index: number) => void; onAddBlock: () => void
  onBreakfastChange: (value: string) => void; onLunchChange: (value: string) => void; onResetForm: () => void
}) {
  return <>
    <PageHeading eyebrow="HORARIOS" title="Plantillas" subtitle="Configurá bloques por sede. Los horarios pueden cruzar la medianoche." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <div className="toolbar"><FormField label="Sede"><select value={selectedSite} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField></div>
    <div className="content-grid"><Panel title="Plantillas de la sede">{loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : siteTemplates.length ? <div className="template-list">{siteTemplates.map((template) => <article className="template-card" key={template.id}><div><div className="template-title"><strong>{template.name}</strong><span className={`status-chip ${template.active ? 'status-justificado' : 'status-inactivo'}`}>{template.active ? 'Activa' : 'Inactiva'}</span></div><p>{template.blocks.map(formatBlock).join(' · ')}</p><small>Pausas: desayuno {template.breakfastLimitMinutes} min · almuerzo {template.lunchLimitMinutes} min</small></div><button className="button button-small button-quiet" aria-label={`Editar plantilla ${template.name}`} onClick={() => onBeginEdit(template)}>Editar</button></article>)}</div> : <Empty>No hay plantillas para esta sede.</Empty>}</Panel>
      <Panel title={editing ? 'Editar plantilla' : 'Crear plantilla'}><form className="form-stack" onSubmit={onSubmit}>
        <FormField label="Nombre"><input required maxLength={120} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Mañana, tarde, noche…" /></FormField>
        <div className="form-subhead"><strong>Bloques de trabajo</strong><span>{blocks.length}/4</span></div>
        {blocks.map((block, index) => <fieldset className="block-editor" key={index}><legend>Bloque {index + 1}</legend><div className="block-fields">
          <FormField label="Empieza"><input type="time" required value={block.start} onChange={(event) => onBlockChange(index, { start: event.target.value })} /></FormField>
          <FormField label="Empieza el día"><select value={block.startDayOffset} disabled={index === 0} onChange={(event) => onBlockChange(index, { startDayOffset: Number(event.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
          <FormField label="Termina"><input type="time" required value={block.end} onChange={(event) => onBlockChange(index, { end: event.target.value })} /></FormField>
          <FormField label="Termina el día"><select value={block.endDayOffset} onChange={(event) => onBlockChange(index, { endDayOffset: Number(event.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
          {blocks.length > 1 && <button type="button" className="button button-small button-quiet remove-block" onClick={() => onRemoveBlock(index)}>Quitar</button>}
        </div></fieldset>)}
        <button type="button" className="button button-quiet" disabled={blocks.length >= 4} onClick={onAddBlock}>+ Agregar bloque</button>
        <div className="form-grid"><FormField label="Límite desayuno (min)"><input type="number" min="0" max="240" required value={breakfast} onChange={(event) => onBreakfastChange(event.target.value)} /></FormField><FormField label="Límite almuerzo (min)"><input type="number" min="0" max="240" required value={lunch} onChange={(event) => onLunchChange(event.target.value)} /></FormField></div>
        <div className="button-row"><button className="button button-primary" disabled={busy || loading || Boolean(loadError) || !selectedSite}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear plantilla'}</button>{editing && <button type="button" className="button button-quiet" onClick={onResetForm}>Cancelar</button>}</div>
      </form></Panel>
    </div>
  </>
}

export function JourneysViewRender({ sites, eligibleEmployees, siteTemplates, jornadas, loading, journeysLoading, journeysDate, journeysError, dependencyError, error, notice, busy, detail, detailLoading, markBusy, date, dateError, employeeId, siteId, templateId, peopleById, detailSite, detailTimeZone, forgotAction, forgotOccurredAt, forgotReason, editingMarkId, correctedAction, correctedOccurredAt, correctionReason, cancelOpen, cancelReason, voidingMarkId, voidReason, onDateChange, onEmployeeChange, onSiteChange, onTemplateChange, onDeclare, onRetryDependencies, onReloadJourneys, onShowDetail, onForgotActionChange, onForgotOccurredAtChange, onForgotReasonChange, onAddForgottenMark, onBeginMarkCorrection, onCorrectedActionChange, onCorrectedOccurredAtChange, onCorrectionReasonChange, onCorrectMark, onCancelMarkCorrection, onBeginCancel, onCancelReasonChange, onConfirmCancel, onAbortCancel, onBeginVoid, onVoidReasonChange, onConfirmVoid, onAbortVoid }: {
  sites: Site[]; eligibleEmployees: Employee[]; siteTemplates: Template[]; jornadas: JourneyRow[]
  loading: boolean; journeysLoading: boolean; journeysDate: string; journeysError: string; dependencyError: string; error: string; notice: string; busy: boolean
  detail: Jornada | null; detailLoading: boolean; markBusy: string; date: string; dateError: string; employeeId: string; siteId: string; templateId: string; peopleById: Map<string, string>
  detailSite?: Site; detailTimeZone?: string; forgotAction: MarkAction; forgotOccurredAt: string; forgotReason: string; editingMarkId: string
  correctedAction: MarkAction; correctedOccurredAt: string; correctionReason: string
  onDateChange: (value: string) => void; onEmployeeChange: (value: string) => void; onSiteChange: (value: string) => void; onTemplateChange: (value: string) => void
  onDeclare: (event: FormEvent<HTMLFormElement>) => void; onRetryDependencies: () => void; onReloadJourneys: () => void; onShowDetail: (id: string) => void
  onForgotActionChange: (value: MarkAction) => void; onForgotOccurredAtChange: (value: string) => void; onForgotReasonChange: (value: string) => void; onAddForgottenMark: (event: FormEvent<HTMLFormElement>) => void
  onBeginMarkCorrection: (mark: Mark) => void; onCorrectedActionChange: (value: MarkAction) => void; onCorrectedOccurredAtChange: (value: string) => void; onCorrectionReasonChange: (value: string) => void
  onCorrectMark: (event: FormEvent<HTMLFormElement>, mark: Mark) => void; onCancelMarkCorrection: () => void
  cancelOpen: boolean; cancelReason: string; voidingMarkId: string; voidReason: string
  onBeginCancel: () => void; onCancelReasonChange: (value: string) => void; onConfirmCancel: (event: FormEvent<HTMLFormElement>) => void; onAbortCancel: () => void
  onBeginVoid: (mark: Mark) => void; onVoidReasonChange: (value: string) => void; onConfirmVoid: (event: FormEvent<HTMLFormElement>, mark: Mark) => void; onAbortVoid: () => void
}) {
  const cancellable = detail?.state === 'NO_INGRESO' && detail.marks.every((mark) => mark.voided)
  return <>
    <PageHeading eyebrow="PLANIFICACIÓN POR FECHA" title="Jornadas" subtitle="Declaralas para una fecha y sede. La fecha sigue el calendario local de cada sede; no hay recurrencia semanal." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {dependencyError && <div className="form-stack"><PageMessage kind="error">{dependencyError}</PageMessage><button type="button" className="button button-quiet" disabled={loading || journeysLoading} onClick={onRetryDependencies}>Reintentar datos de la jornada</button></div>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <Panel title="Declarar una jornada"><form className="form-grid" onSubmit={onDeclare}>
      <FormField label="Fecha" hint={dateError || 'La fecha inicial usa el calendario local de este dispositivo; la fecha elegida se aplica como día local en cada sede.'}><input type="date" required aria-invalid={Boolean(dateError)} disabled={loading} value={date} onChange={(event) => onDateChange(event.target.value)} /></FormField>
      <FormField label="Empleado" hint={eligibleEmployees.length === 0 ? 'No hay empleados activos habilitados para esta sede.' : undefined}><select required value={employeeId} onChange={(event) => onEmployeeChange(event.target.value)}>{eligibleEmployees.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select></FormField>
      <FormField label="Sede"><select required value={siteId} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></FormField>
      <FormField label="Plantilla horaria"><select required value={templateId} onChange={(event) => onTemplateChange(event.target.value)}>{siteTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></FormField>
      <div className="field-wide"><button className="button button-primary" disabled={busy || loading || journeysLoading || !date || !templateId || !employeeId}>{busy ? 'Guardando…' : 'Declarar jornada'}</button></div>
    </form></Panel>
    <Panel title={journeysTitle(date)} action={<button className="button button-small button-quiet" disabled={journeysLoading} onClick={onReloadJourneys}>{journeysLoading ? 'Actualizando…' : 'Actualizar'}</button>}>
      {!date ? <Empty>{dateError}</Empty> : loading || journeysLoading || journeysDate !== date ? <Loading label={loading || !journeysDate ? 'Cargando jornadas…' : 'Actualizando jornadas…'} /> : journeysError ? <LoadFailure message={journeysError} onRetry={onReloadJourneys} /> : jornadas.length ? <div className="table-scroll"><table><thead><tr><th>Empleado</th><th>Sede</th><th>Estado</th><th /></tr></thead><tbody>{jornadas.map((jornada) => <tr key={jornada.id}><td>{peopleById.get(jornada.employeeId) ?? 'Empleado'}</td><td>{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'}</td><td><span className="status-chip">{stateLabel(jornada.state)}</span></td><td><button className="button button-small button-quiet" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button></td></tr>)}</tbody></table></div> : <Empty>No hay jornadas declaradas para esta fecha.</Empty>}
    </Panel>
    {detailLoading && <Panel title="Detalle"><Loading label="Consultando marcas…" /></Panel>}
    {detail && !detailLoading && <Panel title={`Marcas de ${peopleById.get(detail.employeeId) ?? 'empleado'}`}>
      <p className="muted">Horario asignado: {detail.scheduleSnapshot.name} · tolerancia {detail.toleranceMinutes} min</p>
      {!detailTimeZone && <PageMessage kind="error">No se pudo cargar la zona horaria de la sede. Reintentá los datos de la jornada antes de incorporar o corregir marcas.</PageMessage>}
      {detail.state === 'CANCELADA' && <PageMessage>Jornada cancelada el {dateTime(detail.cancelledAt ?? '', detailTimeZone)}.{detail.cancelReason ? ` Motivo: ${detail.cancelReason}` : ''}</PageMessage>}
      {cancellable && (cancelOpen ? <form className="form-stack correction-form" onSubmit={onConfirmCancel}>
        <FormField label="Motivo de cancelación" hint={`La jornada queda cancelada con tu nombre, la hora y este motivo; sus desvíos se cierran y podés volver a declararla. ${HEALTH_DATA_HINT}`}><textarea required maxLength={2000} value={cancelReason} onChange={(event) => onCancelReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-danger-outline" disabled={markBusy !== '' || !cancelReason.trim()}>{markBusy === 'cancel' ? 'Cancelando…' : 'Confirmar cancelación'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === 'cancel'} onClick={onAbortCancel}>Volver</button></div>
      </form> : <div className="button-row"><button type="button" className="button button-small button-danger-outline" disabled={markBusy !== ''} onClick={onBeginCancel}>Cancelar jornada</button></div>)}
      {detail.marks.length ? <div className="table-scroll"><table><thead><tr><th>Marca</th><th>Hora del evento</th><th>Alta en servidor</th><th>Ubicación</th><th>Acciones</th></tr></thead><tbody>{detail.marks.map((mark) => <Fragment key={mark.id}>
        {mark.voided ? <tr className="mark-voided"><td><s>{actionName(mark.action)}</s> <span className="status-chip">Anulada</span></td><td><s>{dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)}</s></td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{typeof mark.latitude === 'number' && typeof mark.longitude === 'number' ? `${mark.latitude.toFixed(5)}, ${mark.longitude.toFixed(5)}` : locationName(mark.locationStatus)}</td><td><small>{mark.voidedAt ? `Anulada el ${dateTime(mark.voidedAt, detailTimeZone)}` : 'Anulada'}{mark.voidReason ? ` · ${mark.voidReason}` : ''}</small></td></tr> :
        <tr><td>{actionName(mark.action)}</td><td>{dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{typeof mark.latitude === 'number' && typeof mark.longitude === 'number' ? `${mark.latitude.toFixed(5)}, ${mark.longitude.toFixed(5)}` : locationName(mark.locationStatus)}</td><td><div className="button-row"><button className="button button-small button-quiet" aria-label={`Corregir marca ${actionName(mark.action)} de ${dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)}`} disabled={markBusy !== '' || !detailTimeZone} onClick={() => onBeginMarkCorrection(mark)}>Corregir</button><button className="button button-small button-danger-outline" aria-label={`Anular marca ${actionName(mark.action)} de ${dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)}`} disabled={markBusy !== ''} onClick={() => onBeginVoid(mark)}>Anular</button></div></td></tr>}
        {voidingMarkId === mark.id && !mark.voided && <tr><td colSpan={5}><form className="form-stack correction-form" onSubmit={(event) => onConfirmVoid(event, mark)}>
          <FormField label="Motivo de anulación" hint={`La marca no se borra: queda visible como anulada, con tu nombre, la hora y este motivo, y deja de contar para la jornada y los desvíos. ${HEALTH_DATA_HINT}`}><textarea required maxLength={2000} value={voidReason} onChange={(event) => onVoidReasonChange(event.target.value)} /></FormField>
          <div className="button-row"><button className="button button-small button-danger-outline" disabled={markBusy === mark.id || !voidReason.trim()}>{markBusy === mark.id ? 'Anulando…' : 'Confirmar anulación'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === mark.id} onClick={onAbortVoid}>Volver</button></div>
        </form></td></tr>}
        {editingMarkId === mark.id && <tr><td colSpan={5}><form className="form-stack correction-form" onSubmit={(event) => onCorrectMark(event, mark)}>
          <FormField label="Tipo de marca corregida"><select value={correctedAction} onChange={(event) => onCorrectedActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
          <FormField label={`Hora corregida (${detailSite?.name ?? 'zona horaria de la sede'})`}><input type="datetime-local" step="1" required value={correctedOccurredAt} onChange={(event) => onCorrectedOccurredAtChange(event.target.value)} /></FormField>
          <FormField label="Motivo de corrección de marca"><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
          <div className="button-row"><button className="button button-small button-primary" disabled={markBusy === mark.id || !correctionReason.trim()}>{markBusy === mark.id ? 'Guardando…' : 'Guardar corrección de marca'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === mark.id} onClick={onCancelMarkCorrection}>Cancelar</button></div>
        </form></td></tr>}
      </Fragment>)}</tbody></table></div> : <Empty>{detail.state === 'CANCELADA' ? 'Esta jornada fue cancelada y no tiene marcas.' : 'Esta jornada todavía no tiene marcas.'}</Empty>}
      {detail.state !== 'CANCELADA' && <form className="forgotten-mark-form" onSubmit={onAddForgottenMark}><fieldset className="form-grid fieldset-plain" disabled={!detailTimeZone}>
        <div className="field-wide"><h3>Incorporar una marca olvidada</h3><p className="field-hint">La hora del evento se interpreta en la zona horaria de {detailSite?.name ?? 'la sede'}; el alta queda auditada por separado.</p></div>
        <FormField label="Tipo de marca olvidada"><select value={forgotAction} onChange={(event) => onForgotActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora del evento (${detailSite?.name ?? 'sede'})`}><input type="datetime-local" step="1" required value={forgotOccurredAt} onChange={(event) => onForgotOccurredAtChange(event.target.value)} /></FormField>
        <FormField label="Motivo de incorporación"><textarea required maxLength={2000} value={forgotReason} onChange={(event) => onForgotReasonChange(event.target.value)} /></FormField>
        <div className="field-wide"><button className="button button-primary" disabled={markBusy !== '' || !forgotReason.trim()}>{markBusy === 'forgotten' ? 'Guardando…' : 'Registrar marca olvidada'}</button></div>
      </fieldset></form>}
    </Panel>}
  </>
}

export type HistoryFilterValues = { employeeId: string; siteId: string; from: string; to: string }

export function AdminHistoryRender({ employees, sites, loadingOptions, optionsError, filters, filterError, rows, loading, error, onFiltersChange, onSearch, onRetryOptions }: {
  employees: Employee[]; sites: Site[]; loadingOptions: boolean; optionsError: string; filters: HistoryFilterValues; filterError: string
  rows: JornadaSummary[] | null; loading: boolean; error: string
  onFiltersChange: (patch: Partial<HistoryFilterValues>) => void; onSearch: () => void; onRetryOptions: () => void
}) {
  const siteById = new Map(sites.map((site) => [site.id, site]))
  const nameById = new Map(employees.map((person) => [person.id, person.displayName]))
  return <>
    <PageHeading eyebrow="CONSULTA" title="Historial" subtitle="Jornadas, marcas y desvíos de un empleado o una sede en un rango de fechas." />
    {optionsError && <div className="form-stack"><PageMessage kind="error">{optionsError}</PageMessage><button type="button" className="button button-quiet" disabled={loadingOptions} onClick={onRetryOptions}>Reintentar datos</button></div>}
    <form className="filter-bar" aria-label="Filtros del historial" noValidate onSubmit={(event) => { event.preventDefault(); onSearch() }}>
      <FormField label="Empleado"><select value={filters.employeeId} disabled={loadingOptions} onChange={(event) => onFiltersChange({ employeeId: event.target.value })}><option value="">Todos</option>{employees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></FormField>
      <FormField label="Sede"><select value={filters.siteId} disabled={loadingOptions} onChange={(event) => onFiltersChange({ siteId: event.target.value })}><option value="">Todas</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField>
      <FormField label="Desde"><input type="date" value={filters.from} onChange={(event) => onFiltersChange({ from: event.target.value })} /></FormField>
      <FormField label="Hasta"><input type="date" value={filters.to} onChange={(event) => onFiltersChange({ to: event.target.value })} /></FormField>
      <div className="button-row filter-actions"><button className="button button-primary" disabled={loading || loadingOptions}>{loading ? 'Buscando…' : 'Buscar'}</button></div>
      {filterError && <div className="filter-error"><PageMessage kind="error">{filterError}</PageMessage></div>}
    </form>
    <Panel title={rows && !loading && !error ? `Jornadas encontradas (${rows.length})` : 'Jornadas encontradas'}>
      {loading ? <Loading label="Consultando el historial…" /> : error ? <LoadFailure message={error} onRetry={onSearch} /> : rows === null ? <Empty>Elegí un empleado o una sede y un rango de fechas, y tocá Buscar.</Empty> : rows.length === 0 ? <Empty>No hay jornadas para esos filtros en el rango elegido.</Empty> : <div className="history-list">{rows.map((row) => {
        const timeZone = siteById.get(row.siteId)?.timeZone
        const person = row.employeeDisplayName?.trim() || nameById.get(row.employeeId) || 'Empleado'
        const marks = row.marks ?? []
        const deviations = row.deviations ?? []
        return <article className="history-card" key={row.id} aria-label={`Jornada del ${formatLocalDate(row.localDate)} de ${person}`}>
          <div className="history-head"><strong>{formatLocalDate(row.localDate)}</strong><span>{person}</span><span className="muted">{siteById.get(row.siteId)?.name ?? 'Sede'}</span><span className="status-chip">{stateLabel(row.state)}</span></div>
          {marks.length ? <ul className="history-items" aria-label="Marcas">{marks.map((mark) => <li key={mark.id} className={mark.voided ? 'mark-voided' : undefined}><strong>{mark.voided ? <s>{actionName(mark.action)}</s> : actionName(mark.action)}</strong><span>{dateTime(mark.occurredAt ?? mark.acceptedAt, timeZone)}</span><small>{mark.voided ? `Anulada${mark.voidReason ? ` · ${mark.voidReason}` : ''}` : locationName(mark.locationStatus)}</small></li>)}</ul> : <p className="muted small-copy">Sin marcas.</p>}
          {deviations.length ? <ul className="history-items history-deviations" aria-label="Desvíos">{deviations.map((item) => <li key={item.id}><strong>{deviationName(item.type)}</strong><span>{dateTime(item.occurredAt ?? item.createdAt, timeZone)}</span><span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span>{item.category && <small>{categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</small>}</li>)}</ul> : <p className="muted small-copy">Sin desvíos.</p>}
        </article>
      })}</div>}
    </Panel>
  </>
}

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="form-stack"><PageMessage kind="error">{message}</PageMessage><button type="button" className="button button-quiet" onClick={onRetry}>Reintentar</button></div>
}

const who = (person: Employee) => person.dni ? `DNI ${person.dni}` : 'identificador interno'

function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="page-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{subtitle}</p></div></div>
}

const dateTime = formatDateTime
const MARK_ACTIONS: MarkAction[] = ['INGRESO', 'EGRESO', 'SALIDA_DESAYUNO', 'VUELTA_DESAYUNO', 'SALIDA_ALMUERZO', 'VUELTA_ALMUERZO']
function actionName(action: MarkAction) { return ({ INGRESO: 'Ingreso', EGRESO: 'Egreso', SALIDA_DESAYUNO: 'Salida desayuno', VUELTA_DESAYUNO: 'Vuelta desayuno', SALIDA_ALMUERZO: 'Salida almuerzo', VUELTA_ALMUERZO: 'Vuelta almuerzo' } as const)[action] }
function deviationName(type: Deviation['type']) { return ({ SIN_INGRESO: 'Sin ingreso', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Egreso temprano', EGRESO_TARDIO: 'Egreso tardío', MARCA_FALTANTE: 'Egreso sin marcar', EXCESO_DESAYUNO: 'Exceso de desayuno', EXCESO_ALMUERZO: 'Exceso de almuerzo' } as const)[type] }
function statusName(status: Deviation['status']) { return ({ MOTIVO_PENDIENTE: 'Falta motivo', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado' } as const)[status] }
function categoryName(category: NonNullable<Deviation['category']>) { return ({ SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' } as const)[category] }
function locationName(status: string) { return ({ PENDIENTE: 'Ubicación pendiente', RECIBIDA: 'Ubicación recibida', SIN_UBICACION: 'Sin ubicación', PURGADA: 'Ubicación depurada', NO_APLICA: 'No aplica' } as Record<string, string>)[status] ?? '—' }
