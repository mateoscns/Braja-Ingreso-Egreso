import { Fragment, type FormEvent } from 'react'
import { Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import type { Deviation, Employee, Jornada, Mark, MarkAction, Site, Template, TemplateBlock } from '../../shared/api/types'
import { formatBlock, formatDateTime, jornadaStateLabel } from '../../shared/format'

export type DeviationClassification = 'JUSTIFICADO' | 'NO_JUSTIFICADO'
export type JourneyRow = Pick<Jornada, 'id' | 'employeeId' | 'siteId' | 'localDate' | 'state'>

type Correction = { deviationId: string; classification: DeviationClassification } | null

function journeysTitle(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Jornadas'
  const parsedDate = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return 'Jornadas'
  const formattedDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'UTC' }).format(parsedDate)
  return `Jornadas del ${formattedDate}`
}

export function AdminInboxRender({ items, timeZones, nextCursor, loading, inboxLoadError, timeZoneLoadError, error, notice, busy, correction, correctionReason, targetDeviation, onReload, onClassify, onRetry, onLoadMore, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  items: Deviation[]; timeZones: Map<string, string>; nextCursor: string | null; loading: boolean; inboxLoadError: string; timeZoneLoadError: string
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
    <Panel title="Casos recientes">{inboxLoadError ? <LoadFailure message={inboxLoadError} onRetry={onRetry} /> : <>
      <DeviationList items={items} loading={loading} busy={busy} onClassify={onClassify} targetId={targetDeviation} timeZones={timeZones}
        correction={correction} correctionReason={correctionReason} onCorrectionReasonChange={onCorrectionReasonChange}
        onSubmitCorrection={onSubmitCorrection} onCancelCorrection={onCancelCorrection} />
      {nextCursor && <div className="load-more"><button className="button button-quiet" disabled={busy === 'page'} onClick={onLoadMore}>{busy === 'page' ? 'Cargando…' : 'Cargar anteriores'}</button></div>}
    </>}
    </Panel>
  </>
}

function DeviationList({ items, loading, busy, onClassify, targetId, timeZones, correction, correctionReason, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  items: Deviation[]; loading: boolean; busy: string; onClassify: (item: Deviation, classification: DeviationClassification) => void
  targetId: string; timeZones: Map<string, string>; correction: Correction; correctionReason: string
  onCorrectionReasonChange: (reason: string) => void; onSubmitCorrection: (item: Deviation) => void; onCancelCorrection: () => void
}) {
  if (loading) return <Loading label="Cargando desvíos…" />
  if (!items.length) return <Empty>No hay desvíos para mostrar.</Empty>
  return <div className="deviation-list">{items.map((item) => <article className={`deviation-card ${targetId === item.id ? 'deviation-target' : ''}`} key={item.id} id={`deviation-${item.id}`}>
    <div className="deviation-symbol">{item.type === 'SIN_INGRESO' ? '!' : '↗'}</div>
    <div className="deviation-main"><div className="deviation-title"><strong>{deviationName(item.type)}</strong><span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span></div>
      <p>{item.employeeDisplayName?.trim() || 'Registro de jornada'} · {dateTime(item.createdAt, item.siteId ? timeZones.get(item.siteId) : undefined)}</p>
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

export function EmployeesViewRender({ employees, sites, loading, loadError, error, notice, busy, dni, displayName, siteIds, tolerance, temporaryPassword, editingId, onReload, onCreate, onDniChange, onDisplayNameChange, onToggleSite, onToleranceChange, onTemporaryPasswordChange, onSave, onUpdateEmployee, onStartEditing }: {
  employees: Employee[]; sites: Site[]; loading: boolean; loadError: string; error: string; notice: string; busy: boolean
  dni: string; displayName: string; siteIds: string[]; tolerance: string; temporaryPassword: string; editingId: string
  onReload: () => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onDniChange: (value: string) => void; onDisplayNameChange: (value: string) => void
  onToggleSite: (id: string) => void; onToleranceChange: (value: string) => void; onTemporaryPasswordChange: (value: string) => void
  onSave: (person: Employee) => void; onUpdateEmployee: (id: string, patch: Partial<Employee>) => void; onStartEditing: (id: string) => void
}) {
  return <>
    <PageHeading eyebrow="EQUIPO" title="Empleados" subtitle="Las cuentas se identifican por DNI. La tolerancia se guarda por empleado." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {notice && <PageMessage kind="success">{notice}</PageMessage>}
    <Panel title={loading || loadError ? 'Empleados' : `Empleados (${employees.length})`}>{loading ? <Loading /> : loadError ? <LoadFailure message={loadError} onRetry={onReload} /> : employees.length ? <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>DNI</th><th>Sedes</th><th>Tolerancia</th><th>Estado</th><th /></tr></thead><tbody>{employees.map((person) => <tr key={person.id}>
      <td>{editingId === person.id ? <input aria-label={`Nombre del empleado con ${who(person)}`} value={person.displayName} onChange={(event) => onUpdateEmployee(person.id, { displayName: event.target.value })} /> : <strong>{person.displayName}</strong>}</td><td>{person.dni ?? '—'}</td>
      <td>{editingId === person.id ? <div className="inline-checks">{sites.map((site) => <label key={site.id}><input type="checkbox" aria-label={`${site.name} (${who(person)})`} checked={person.siteIds.includes(site.id)} onChange={() => onUpdateEmployee(person.id, { siteIds: person.siteIds.includes(site.id) ? person.siteIds.filter((id) => id !== site.id) : [...person.siteIds, site.id] })} />{site.name}</label>)}</div> : person.siteIds.map((id) => sites.find((site) => site.id === id)?.name ?? 'Sede').join(', ')}</td>
      <td>{editingId === person.id ? <input className="short-input" aria-label={`Tolerancia en minutos del empleado con ${who(person)}`} type="number" min="0" max="240" value={person.toleranceMinutes} onChange={(event) => onUpdateEmployee(person.id, { toleranceMinutes: Number(event.target.value) })} /> : `${person.toleranceMinutes} min`}</td>
      <td>{editingId === person.id ? <label><input type="checkbox" aria-label={`Activo (${who(person)})`} checked={person.active} onChange={(event) => onUpdateEmployee(person.id, { active: event.target.checked })} /> Activo</label> : person.active ? 'Activo' : 'Inactivo'}</td>
      <td>{editingId === person.id ? <button className="button button-small button-primary" disabled={busy || person.siteIds.length === 0} onClick={() => onSave(person)}>{busy ? 'Guardando…' : 'Guardar'}</button> : <button className="button button-small button-quiet" aria-label={`Editar empleado ${person.displayName}`} onClick={() => onStartEditing(person.id)}>Editar</button>}</td>
    </tr>)}</tbody></table></div> : <Empty>No hay empleados cargados.</Empty>}</Panel>
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

export function JourneysViewRender({ sites, eligibleEmployees, siteTemplates, jornadas, loading, journeysLoading, journeysDate, journeysError, dependencyError, error, notice, busy, detail, detailLoading, markBusy, date, dateError, employeeId, siteId, templateId, peopleById, detailSite, detailTimeZone, forgotAction, forgotOccurredAt, forgotReason, editingMarkId, correctedAction, correctedOccurredAt, correctionReason, onDateChange, onEmployeeChange, onSiteChange, onTemplateChange, onDeclare, onRetryDependencies, onReloadJourneys, onShowDetail, onForgotActionChange, onForgotOccurredAtChange, onForgotReasonChange, onAddForgottenMark, onBeginMarkCorrection, onCorrectedActionChange, onCorrectedOccurredAtChange, onCorrectionReasonChange, onCorrectMark, onCancelMarkCorrection }: {
  sites: Site[]; eligibleEmployees: Employee[]; siteTemplates: Template[]; jornadas: JourneyRow[]
  loading: boolean; journeysLoading: boolean; journeysDate: string; journeysError: string; dependencyError: string; error: string; notice: string; busy: boolean
  detail: Jornada | null; detailLoading: boolean; markBusy: string; date: string; dateError: string; employeeId: string; siteId: string; templateId: string; peopleById: Map<string, string>
  detailSite?: Site; detailTimeZone: string; forgotAction: MarkAction; forgotOccurredAt: string; forgotReason: string; editingMarkId: string
  correctedAction: MarkAction; correctedOccurredAt: string; correctionReason: string
  onDateChange: (value: string) => void; onEmployeeChange: (value: string) => void; onSiteChange: (value: string) => void; onTemplateChange: (value: string) => void
  onDeclare: (event: FormEvent<HTMLFormElement>) => void; onRetryDependencies: () => void; onReloadJourneys: () => void; onShowDetail: (id: string) => void
  onForgotActionChange: (value: MarkAction) => void; onForgotOccurredAtChange: (value: string) => void; onForgotReasonChange: (value: string) => void; onAddForgottenMark: (event: FormEvent<HTMLFormElement>) => void
  onBeginMarkCorrection: (mark: Mark) => void; onCorrectedActionChange: (value: MarkAction) => void; onCorrectedOccurredAtChange: (value: string) => void; onCorrectionReasonChange: (value: string) => void
  onCorrectMark: (event: FormEvent<HTMLFormElement>, mark: Mark) => void; onCancelMarkCorrection: () => void
}) {
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
      {!date ? <Empty>{dateError}</Empty> : loading || journeysLoading || journeysDate !== date ? <Loading label={loading || !journeysDate ? 'Cargando jornadas…' : 'Actualizando jornadas…'} /> : journeysError ? <LoadFailure message={journeysError} onRetry={onReloadJourneys} /> : jornadas.length ? <div className="table-scroll"><table><thead><tr><th>Empleado</th><th>Sede</th><th>Estado</th><th /></tr></thead><tbody>{jornadas.map((jornada) => <tr key={jornada.id}><td>{peopleById.get(jornada.employeeId) ?? 'Empleado'}</td><td>{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'}</td><td><span className="status-chip">{jornadaStateLabel(jornada.state)}</span></td><td><button className="button button-small button-quiet" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button></td></tr>)}</tbody></table></div> : <Empty>No hay jornadas declaradas para esta fecha.</Empty>}
    </Panel>
    {detailLoading && <Panel title="Detalle"><Loading label="Consultando marcas…" /></Panel>}
    {detail && !detailLoading && <Panel title={`Marcas de ${peopleById.get(detail.employeeId) ?? 'empleado'}`}>
      <p className="muted">Horario asignado: {detail.scheduleSnapshot.name} · tolerancia {detail.toleranceMinutes} min</p>
      {detail.marks.length ? <div className="table-scroll"><table><thead><tr><th>Marca</th><th>Hora del evento</th><th>Alta en servidor</th><th>Ubicación</th><th>Acciones</th></tr></thead><tbody>{detail.marks.map((mark) => <Fragment key={mark.id}>
        <tr><td>{actionName(mark.action)}</td><td>{dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{typeof mark.latitude === 'number' && typeof mark.longitude === 'number' ? `${mark.latitude.toFixed(5)}, ${mark.longitude.toFixed(5)}` : locationName(mark.locationStatus)}</td><td><button className="button button-small button-quiet" aria-label={`Corregir marca ${actionName(mark.action)} de ${dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)}`} disabled={markBusy !== ''} onClick={() => onBeginMarkCorrection(mark)}>Corregir</button></td></tr>
        {editingMarkId === mark.id && <tr><td colSpan={5}><form className="form-stack correction-form" onSubmit={(event) => onCorrectMark(event, mark)}>
          <FormField label="Tipo de marca corregida"><select value={correctedAction} onChange={(event) => onCorrectedActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
          <FormField label={`Hora corregida (${detailSite?.name ?? 'zona horaria de la sede'})`}><input type="datetime-local" step="1" required value={correctedOccurredAt} onChange={(event) => onCorrectedOccurredAtChange(event.target.value)} /></FormField>
          <FormField label="Motivo de corrección de marca"><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
          <div className="button-row"><button className="button button-small button-primary" disabled={markBusy === mark.id || !correctionReason.trim()}>{markBusy === mark.id ? 'Guardando…' : 'Guardar corrección de marca'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === mark.id} onClick={onCancelMarkCorrection}>Cancelar</button></div>
        </form></td></tr>}
      </Fragment>)}</tbody></table></div> : <Empty>Esta jornada todavía no tiene marcas.</Empty>}
      <form className="form-grid forgotten-mark-form" onSubmit={onAddForgottenMark}>
        <div className="field-wide"><h3>Incorporar una marca olvidada</h3><p className="field-hint">La hora del evento se interpreta en la zona horaria de {detailSite?.name ?? 'la sede'}; el alta queda auditada por separado.</p></div>
        <FormField label="Tipo de marca olvidada"><select value={forgotAction} onChange={(event) => onForgotActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora del evento (${detailSite?.name ?? 'sede'})`}><input type="datetime-local" step="1" required value={forgotOccurredAt} onChange={(event) => onForgotOccurredAtChange(event.target.value)} /></FormField>
        <FormField label="Motivo de incorporación"><textarea required maxLength={2000} value={forgotReason} onChange={(event) => onForgotReasonChange(event.target.value)} /></FormField>
        <div className="field-wide"><button className="button button-primary" disabled={markBusy !== '' || !forgotReason.trim()}>{markBusy === 'forgotten' ? 'Guardando…' : 'Registrar marca olvidada'}</button></div>
      </form>
    </Panel>}
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
function locationName(status: string) { return ({ PENDIENTE: 'Ubicación pendiente', RECIBIDA: 'Ubicación recibida', SIN_UBICACION: 'Sin ubicación', NO_APLICA: 'No aplica' } as Record<string, string>)[status] ?? '—' }
