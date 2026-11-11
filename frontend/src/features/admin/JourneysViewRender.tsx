// The days (Jornadas) render: the single-day form, the list of a date, the detail of a day with its mark forms, and its change history.
import { type FormEvent, type ReactNode } from 'react'
import { Empty, FormField, LoadFailure, Loading, PageHeading, PageMessage, Panel } from '../../app/ui'
import type { Deviation, Employee, Jornada, JornadaAudit, JornadaAuditEntry, Mark, MarkAction, Site, Template } from '../../shared/api/types'
import { adminCategoryName as categoryName, adminDeviationName as deviationName, adminDeviationStatusName as statusName, adminMarkLocationName as locationName, adminMarkName as actionName } from '../../shared/labels'
import { dateTime, stateLabel } from './adminRenderShared'

/** L30: cancel and void reasons are kept as free-text audit, so the form warns against health data. */
const HEALTH_DATA_HINT = 'No escribas datos de salud; alcanza con «Licencia».'

export type JourneyRow = Pick<Jornada, 'id' | 'employeeId' | 'siteId' | 'localDate' | 'state'>

function journeysTitle(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Jornadas'
  const parsedDate = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return 'Jornadas'
  const formattedDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'UTC' }).format(parsedDate)
  return `Jornadas del ${formattedDate}`
}

export function JourneysViewRender({ workDaysPanel, coverage, narrow = false, sites, eligibleEmployees, siteTemplates, jornadas, loading, journeysLoading, journeysDate, journeysError, dependencyError, error, notice, busy, detail, detailLoading, markBusy, date, dateError, employeeId, siteId, templateId, singleDate, singleError = '', singleNotice = '', peopleById, detailSite, detailTimeZone, forgotAction, forgotOccurredAt, forgotReason, editingMarkId, correctedAction, correctedOccurredAt, correctionReason, cancelOpen, cancelReason, voidingMarkId, voidReason, auditOpen, audit, auditLoading, auditError, onToggleAudit, onRetryAudit, onDateChange, onSingleDateChange, onEmployeeChange, onSiteChange, onTemplateChange, onDeclare, onRetryDependencies, onReloadJourneys, onShowDetail, onForgotActionChange, onForgotOccurredAtChange, onForgotReasonChange, onAddForgottenMark, onBeginMarkCorrection, onCorrectedActionChange, onCorrectedOccurredAtChange, onCorrectionReasonChange, onCorrectMark, onCancelMarkCorrection, onBeginCancel, onCancelReasonChange, onConfirmCancel, onAbortCancel, onBeginVoid, onVoidReasonChange, onConfirmVoid, onAbortVoid }: {
  /** "Cargar días de trabajo" (WorkDaysPanel), the main form of the page; coverage is the notice of days loaded. */
  workDaysPanel?: ReactNode; coverage?: ReactNode
  /** Phone width: the marks of a jornada are shown as cards instead of a table. */
  narrow?: boolean
  sites: Site[]; eligibleEmployees: Employee[]; siteTemplates: Template[]; jornadas: JourneyRow[]
  loading: boolean; journeysLoading: boolean; journeysDate: string; journeysError: string; dependencyError: string; error: string; notice: string; busy: boolean
  detail: Jornada | null; detailLoading: boolean; markBusy: string; date: string; dateError: string; employeeId: string; siteId: string; templateId: string; peopleById: Map<string, string>
  /** The single day ("Cargar o cambiar un solo día") has its own date and messages. */
  singleDate: string; singleError?: string; singleNotice?: string; onSingleDateChange: (value: string) => void
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
  auditOpen: boolean; audit: JornadaAudit | null; auditLoading: boolean; auditError: string; onToggleAudit: () => void; onRetryAudit: () => void
}) {
  const cancellable = detail?.state === 'NO_INGRESO' && detail.marks.every((mark) => mark.voided)
  const messages = <>{error && <PageMessage kind="error">{error}</PageMessage>}{notice && <PageMessage kind="success">{notice}</PageMessage>}</>
  const markTime = (mark: Mark) => dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)
  const markLocation = (mark: Mark) => <>{locationName(mark.locationStatus)}{typeof mark.latitude === 'number' && typeof mark.longitude === 'number' && <small className="mark-coordinates">{`${mark.latitude.toFixed(5)}, ${mark.longitude.toFixed(5)}`}</small>}</>
  const markButtons = (mark: Mark) => <div className="button-row"><button className="button button-small button-quiet" aria-label={`Corregir marca ${actionName(mark.action)} de ${markTime(mark)}`} disabled={markBusy !== '' || !detailTimeZone} onClick={() => onBeginMarkCorrection(mark)}>Corregir</button><button className="button button-small button-danger-outline" aria-label={`Anular marca ${actionName(mark.action)} de ${markTime(mark)}`} disabled={markBusy !== ''} onClick={() => onBeginVoid(mark)}>Anular</button></div>
  const voidedNote = (mark: Mark) => `${mark.voidedAt ? `Anulada el ${dateTime(mark.voidedAt, detailTimeZone)}` : 'Anulada'}${mark.voidReason ? ` · ${mark.voidReason}` : ''}`
  const editingMark = detail?.marks.find((mark) => mark.id === editingMarkId && !mark.voided)
  const voidingMark = detail?.marks.find((mark) => mark.id === voidingMarkId && !mark.voided)
  return <>
    <PageHeading eyebrow="DÍAS DE TRABAJO" title="Jornadas" subtitle="Cargá los días que trabaja cada persona y revisá sus marcas. Cada día sigue el calendario de su local." />
    {!detail && messages}
    {dependencyError && <div className="form-stack"><PageMessage kind="error">{dependencyError}</PageMessage><button type="button" className="button button-quiet" disabled={loading || journeysLoading} onClick={onRetryDependencies}>Reintentar datos de la jornada</button></div>}
    {coverage}
    {workDaysPanel}
    <section className="panel" aria-labelledby="single-day-title"><details className="fold">
      <summary><h2 id="single-day-title">Cargar o cambiar un solo día</h2></summary>
      <p className="muted">Para una excepción: un día suelto o un horario distinto. Para cambiar un día ya cargado, abrilo en la lista de abajo, cancelalo y cargalo de nuevo.</p>
      <form className="form-grid" onSubmit={onDeclare}>
        <FormField label="Local"><select required value={siteId} onChange={(event) => onSiteChange(event.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></FormField>
        <FormField label="Empleado" hint={eligibleEmployees.length === 0 ? 'No hay personas activas en este local.' : undefined}><select required value={employeeId} onChange={(event) => onEmployeeChange(event.target.value)}>{eligibleEmployees.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select></FormField>
        <FormField label="Día"><input type="date" required disabled={loading} value={singleDate} onChange={(event) => onSingleDateChange(event.target.value)} /></FormField>
        <FormField label="Horario" hint="Si no elegís otro, se usa el horario que la persona tiene asignado para ese día."><select value={templateId} onChange={(event) => onTemplateChange(event.target.value)}><option value="">El que tiene asignado</option>{siteTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></FormField>
        {singleError && <div className="field-wide"><PageMessage kind="error">{singleError}</PageMessage></div>}
        {singleNotice && <div className="field-wide"><PageMessage kind="success">{singleNotice}</PageMessage></div>}
        <div className="field-wide"><button className="button button-primary" disabled={busy || loading || journeysLoading || !singleDate || !employeeId}>{busy ? 'Guardando…' : 'Cargar este día'}</button></div>
      </form>
    </details></section>
    <Panel title={journeysTitle(date)} action={<button className="button button-small button-quiet" disabled={journeysLoading} onClick={onReloadJourneys}>{journeysLoading ? 'Actualizando…' : 'Actualizar'}</button>}>
      <div className="toolbar"><FormField label="Fecha" hint={dateError || undefined}><input type="date" required aria-invalid={Boolean(dateError)} disabled={loading} value={date} onChange={(event) => onDateChange(event.target.value)} /></FormField></div>
      {!date ? <Empty>{dateError}</Empty> : loading || journeysLoading || journeysDate !== date ? <Loading label={loading || !journeysDate ? 'Cargando jornadas…' : 'Actualizando jornadas…'} /> : journeysError ? <LoadFailure message={journeysError} onRetry={onReloadJourneys} /> : jornadas.length ? narrow ? <div className="history-list">{jornadas.map((jornada) => {
        // Phones: one card per day loaded, so "Ver marcas" is in sight without swiping a table sideways.
        const person = peopleById.get(jornada.employeeId) ?? 'Empleado'
        return <article className="history-card" key={jornada.id} aria-labelledby={`jornada-${jornada.id}-person`}>
          <div className="history-head"><strong id={`jornada-${jornada.id}-person`}>{person}</strong><span className="muted">{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'}</span><span className={`status-chip status-${jornada.state.toLowerCase()}`}>{stateLabel(jornada.state)}</span></div>
          <button className="button button-small button-quiet" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button>
        </article>
      })}</div> : <div className="table-scroll"><table><thead><tr><th>Empleado</th><th>Sede</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{jornadas.map((jornada) => <tr key={jornada.id}><td>{peopleById.get(jornada.employeeId) ?? 'Empleado'}</td><td>{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'}</td><td><span className={`status-chip status-${jornada.state.toLowerCase()}`}>{stateLabel(jornada.state)}</span></td><td><button className="button button-small button-quiet" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button></td></tr>)}</tbody></table></div> : <Empty>No hay días cargados para esta fecha.</Empty>}
    </Panel>
    {detailLoading && <Panel title="Detalle"><Loading label="Consultando marcas…" /></Panel>}
    {detail && !detailLoading && <div id="jornada-detail"><Panel title={`Marcas de ${peopleById.get(detail.employeeId) ?? 'empleado'}`}>
      {messages}
      <p className="muted">Horario asignado: {detail.scheduleSnapshot.name} · tolerancia {detail.toleranceMinutes} min</p>
      {!detailTimeZone && <PageMessage kind="error">No se pudo cargar la zona horaria de la sede. Reintentá los datos de la jornada antes de incorporar o corregir marcas.</PageMessage>}
      {detail.state === 'CANCELADA' && <PageMessage>Jornada cancelada el {dateTime(detail.cancelledAt ?? '', detailTimeZone)}.{detail.cancelReason ? ` Motivo: ${detail.cancelReason}` : ''}</PageMessage>}
      {cancellable && (cancelOpen ? <form className="form-stack correction-form" onSubmit={onConfirmCancel}>
        <FormField label="Motivo de cancelación" hint={`La jornada queda cancelada con tu nombre, la hora y este motivo; sus desvíos se cierran y podés volver a cargarla. ${HEALTH_DATA_HINT}`}><textarea required maxLength={2000} value={cancelReason} onChange={(event) => onCancelReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-danger-outline" disabled={markBusy !== '' || !cancelReason.trim()}>{markBusy === 'cancel' ? 'Cancelando…' : 'Confirmar cancelación'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === 'cancel'} onClick={onAbortCancel}>Volver</button></div>
      </form> : <div className="button-row"><button type="button" className="button button-small button-danger-outline" disabled={markBusy !== ''} onClick={onBeginCancel}>Cancelar jornada</button></div>)}
      {!detail.marks.length ? <Empty>{detail.state === 'CANCELADA' ? 'Esta jornada fue cancelada y no tiene marcas.' : 'Esta jornada todavía no tiene marcas.'}</Empty>
        : narrow ? <ul className="history-items" aria-label="Marcas de la jornada">{detail.marks.map((mark) => <li key={mark.id} className={mark.voided ? 'mark-voided' : undefined}>
          <strong>{mark.voided ? <s>{actionName(mark.action)}</s> : actionName(mark.action)}</strong><span>{mark.voided ? <s>{markTime(mark)}</s> : markTime(mark)}</span>
          <small>{mark.voided ? voidedNote(mark) : markLocation(mark)}</small>
          {!mark.voided && markButtons(mark)}
        </li>)}</ul>
        : <div className="table-scroll"><table><thead><tr><th>Marca</th><th>Hora</th><th>Registrada</th><th>Ubicación</th><th>Acciones</th></tr></thead><tbody>{detail.marks.map((mark) => mark.voided
          ? <tr key={mark.id} className="mark-voided"><td><s>{actionName(mark.action)}</s> <span className="status-chip">Anulada</span></td><td><s>{markTime(mark)}</s></td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{markLocation(mark)}</td><td><small>{voidedNote(mark)}</small></td></tr>
          : <tr key={mark.id}><td>{actionName(mark.action)}</td><td>{markTime(mark)}</td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{markLocation(mark)}</td><td>{markButtons(mark)}</td></tr>)}</tbody></table></div>}
      {voidingMark && <form className="form-stack correction-form" aria-label={`Anular la marca ${actionName(voidingMark.action)} de ${markTime(voidingMark)}`} onSubmit={(event) => onConfirmVoid(event, voidingMark)}>
        <FormField label="Motivo de anulación" hint={`La marca no se borra: queda visible como anulada, con tu nombre, la hora y este motivo, y deja de contar para la jornada y los desvíos. ${HEALTH_DATA_HINT}`}><textarea required maxLength={2000} value={voidReason} onChange={(event) => onVoidReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-danger-outline" disabled={markBusy === voidingMark.id || !voidReason.trim()}>{markBusy === voidingMark.id ? 'Anulando…' : 'Confirmar anulación'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === voidingMark.id} onClick={onAbortVoid}>Volver</button></div>
      </form>}
      {editingMark && <form className="form-stack correction-form" aria-label={`Corregir la marca ${actionName(editingMark.action)} de ${markTime(editingMark)}`} onSubmit={(event) => onCorrectMark(event, editingMark)}>
        <FormField label="Tipo de marca corregida"><select value={correctedAction} onChange={(event) => onCorrectedActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora corregida (${detailSite?.name ?? 'zona horaria de la sede'})`}><input type="datetime-local" required value={correctedOccurredAt} onChange={(event) => onCorrectedOccurredAtChange(event.target.value)} /></FormField>
        <FormField label="Motivo de corrección de marca"><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-primary" disabled={markBusy === editingMark.id || !correctionReason.trim()}>{markBusy === editingMark.id ? 'Guardando…' : 'Guardar corrección de marca'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === editingMark.id} onClick={onCancelMarkCorrection}>Cancelar</button></div>
      </form>}
      {detail.state !== 'CANCELADA' && <form className="forgotten-mark-form" onSubmit={onAddForgottenMark}><fieldset className="form-grid fieldset-plain" disabled={!detailTimeZone}>
        <div className="field-wide"><h3>Agregar una marca que faltó</h3><p className="field-hint">Escribí la hora de {detailSite?.name ?? 'la sede'}. Queda guardado que la agregaste vos y por qué.</p></div>
        <FormField label="¿Qué marca faltó?"><select value={forgotAction} onChange={(event) => onForgotActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora (${detailSite?.name ?? 'sede'})`}><input type="datetime-local" required value={forgotOccurredAt} onChange={(event) => onForgotOccurredAtChange(event.target.value)} /></FormField>
        <FormField label="¿Por qué la agregás?"><textarea required maxLength={2000} value={forgotReason} onChange={(event) => onForgotReasonChange(event.target.value)} /></FormField>
        <div className="field-wide"><button className="button button-primary" disabled={markBusy !== '' || !forgotReason.trim()}>{markBusy === 'forgotten' ? 'Guardando…' : 'Agregar marca'}</button></div>
      </fieldset></form>}
      <JornadaAuditSection open={auditOpen} audit={audit} loading={auditLoading} error={auditError} onToggle={onToggleAudit} onRetry={onRetryAudit} />
    </Panel></div>}
  </>
}

/** Issue #60: the jornada's change history, collapsed until the ADMIN asks for it; times in the jornada's time zone. */
export function JornadaAuditSection({ open, audit, loading, error, onToggle, onRetry }: {
  open: boolean; audit: JornadaAudit | null; loading: boolean; error: string; onToggle: () => void; onRetry: () => void
}) {
  return <section className="audit-history" aria-labelledby="audit-history-title">
    <div className="form-subhead"><h3 id="audit-history-title">Historial de cambios</h3>
      <button type="button" className="button button-small button-quiet" aria-expanded={open} aria-controls="audit-history-body" onClick={onToggle}>{open ? 'Ocultar historial' : 'Ver historial'}</button></div>
    {open && <div id="audit-history-body">{loading ? <Loading label="Cargando historial de cambios…" /> : error ? <LoadFailure message={error} onRetry={onRetry} /> : !audit ? null : audit.entries.length === 0 ? <Empty>Esta jornada no tiene cambios registrados.</Empty> : <>
      {audit.truncated && <PageMessage>Se muestran los primeros {audit.entries.length} cambios de esta jornada.</PageMessage>}
      <ol className="history-items audit-items" aria-label="Cambios de la jornada">{audit.entries.map((entry, index) => <li key={`${entry.kind}-${entry.changedAt}-${index}`}>
        <strong>{auditTitle(entry, audit.timeZone)}</strong><span>{dateTime(entry.changedAt, audit.timeZone)}</span>
        <small>{entry.actorAccountId ? `Por ${entry.actorDisplayName?.trim() || 'una persona sin nombre registrado'}` : 'Automático del sistema'}</small>
        {entry.reason && showsReason(entry) && <small>Motivo: {entry.reason}</small>}
      </li>)}</ol>
    </>}</div>}
  </section>
}

/** Reasons written by people; the system's own reconciliation notes are not shown. */
function showsReason(entry: JornadaAuditEntry) { return entry.kind !== 'DEVIATION' || entry.changeType === 'CLASSIFICATION_CHANGED' }

function auditTitle(entry: JornadaAuditEntry, timeZone: string): string {
  const markAt = (action?: MarkAction | null, at?: string | null) => `${action ? actionName(action) : 'Marca'}${at ? ` de ${dateTime(at, timeZone)}` : ''}`
  const type = (value?: Deviation['type'] | null) => value ? deviationName(value) : 'Desvío'
  const classification = (value?: 'JUSTIFICADO' | 'NO_JUSTIFICADO' | null) => value ? statusName(value).toLowerCase() : 'sin clasificar'
  const category = (value?: Deviation['category']) => value ? categoryName(value) : 'sin categoría'
  switch (entry.kind) {
    case 'JORNADA_CANCELLATION': return 'Jornada cancelada'
    case 'FORGOTTEN_MARK': return `Marca olvidada incorporada: ${markAt(entry.afterAction, entry.afterOccurredAt)}`
    case 'MARK_CORRECTION': return `Marca corregida: ${markAt(entry.beforeAction, entry.beforeOccurredAt)} → ${markAt(entry.afterAction, entry.afterOccurredAt)}`
    case 'MARK_VOID': return `Marca anulada: ${markAt(entry.beforeAction, entry.beforeOccurredAt)}`
    case 'DEVIATION': break
  }
  const current = type(entry.deviationType)
  switch (entry.changeType) {
    case 'CREATED': return `Desvío detectado: ${type(entry.afterType ?? entry.deviationType)}`
    case 'TYPE_REPLACED': return `Desvío actualizado: ${type(entry.beforeType)} → ${type(entry.afterType)}`
    case 'RETRACTED': return `Desvío cerrado: ${type(entry.beforeType ?? entry.deviationType)}`
    case 'CLASSIFICATION_CHANGED': return entry.beforeClassification
      ? `${current}: clasificación corregida de ${classification(entry.beforeClassification)} a ${classification(entry.afterClassification)}`
      : `${current}: clasificado como ${classification(entry.afterClassification)}`
    case 'CLASSIFICATION_RESET': return `${current}: vuelve a revisión (se quitó la clasificación ${classification(entry.beforeClassification)})`
    case 'MOTIVE_SUBMITTED': return `${current}: motivo cargado, categoría ${category(entry.afterMotiveCategory)}`
    case 'MOTIVE_CORRECTED': return `${current}: motivo corregido, categoría ${category(entry.beforeMotiveCategory)} → ${category(entry.afterMotiveCategory)}`
    default: return `${current}: cambio registrado`
  }
}

const MARK_ACTIONS: MarkAction[] = ['INGRESO', 'EGRESO', 'SALIDA_DESAYUNO', 'VUELTA_DESAYUNO', 'SALIDA_ALMUERZO', 'VUELTA_ALMUERZO']
