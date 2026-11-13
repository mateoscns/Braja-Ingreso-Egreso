// The «Hoy» render (section 'jornadas'): the list of a date, the detail of a day inside its own row with each mark form under
// the mark it changes, and the change history of a day, then the search of earlier days (AdminHistory). The monthly load and
// the single day are «Días de trabajo» (WorkDaysViewRender, D-20261111-02 step 2). Lists are record-* rows under 768 px and
// tables named by their section from there (design system 4.12); states are StatusTag (4.10).
import { Fragment, type FormEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../../app/icons'
import { Empty, FormField, LoadFailure, Loading, PageHeading, PageMessage, Panel, StatusTag, TableScroll } from '../../app/ui'
import type { FieldErrors } from '../../app/useFieldErrors'
import type { Deviation, Jornada, JornadaAudit, JornadaAuditEntry, JornadaStatus, Mark, MarkAction, Site } from '../../shared/api/types'
import { formatBlock } from '../../shared/format'
import { adminCategoryName as categoryName, adminDeviationName as deviationName, adminDeviationStatusName as statusName, adminMarkLocationName as locationName, adminMarkName as actionName } from '../../shared/labels'
import { dateTime, stateLabel } from './adminRenderShared'
import { markGeofence } from './markMap'
import { MarkMapPanel } from './MarkMapPanel'

/** L30: cancel and void reasons are kept as free-text audit, so the form warns against health data. */
const HEALTH_DATA_HINT = 'No escribas datos de salud; alcanza con «Licencia».'

export type JourneyRow = Pick<Jornada, 'id' | 'employeeId' | 'siteId' | 'localDate' | 'state'>

/** The parts that open in place, by id, so the container can bring them into view and move the focus to them. */
export const DETAIL_ID = 'jornada-detail'
export const DETAIL_HEADING_ID = 'jornada-detail-title'
export const FORGOTTEN_FORM_ID = 'jornada-forgotten-mark-form'
export const CANCEL_FORM_ID = 'jornada-cancel-form'
export const CANCEL_BUTTON_ID = 'jornada-cancel-button'
/** «Ver marcas» of a day of the list: the day's «Cerrar» gives the focus back to it (#177). */
export const dayButtonId = (jornadaId: string) => `jornada-${jornadaId}-show`
/** The two times of a mark, named the same in the table and on a phone (#177: the first had no name, «Registrada» no meaning). */
const MARK_TIME_LABEL = 'Hora de la marca'
const RECORDED_TIME_LABEL = 'Guardada en el sistema'
/** The message that the local's zone could not be read: it is the reason of the buttons that need a typed time. */
const ZONE_MISSING_ID = 'jornada-zone-missing'
export type MarkFormKind = 'correct' | 'void'
export const markFormId = (kind: MarkFormKind, markId: string) => `mark-${markId}-${kind}-form`
export const markButtonId = (kind: MarkFormKind, markId: string) => `mark-${markId}-${kind}-button`
/** Where the result or error of a form shows: inside the form while it is open, next to its mark once it closed. The other
    places are 'forgotten', 'cancel' and 'detail' (a day that could not be read). */
export const markMessageKey = (kind: MarkFormKind, markId: string) => `${kind}:${markId}`
/** The map of a mark (2026-11-13): it opens under its mark and takes the focus; «Cerrar» gives it back to «Ver en el mapa». */
export const markMapPanelId = (markId: string) => `mark-${markId}-map`
export const markMapButtonId = (markId: string) => `mark-${markId}-map-button`
/** A mark the map can show: it has its point and still counts for the day (a voided one no longer does, D-20261027-08). */
const hasPoint = (mark: Mark) => !mark.voided && typeof mark.latitude === 'number' && typeof mark.longitude === 'number'
/** The title of the list of the date: the table and the phone list are named by it. */
const LIST_HEADING_ID = 'jornadas-list-title'

/** The state of a day is neutral (design system 4.10): it asks nothing of anybody; its icon tells the states apart besides the word. */
const DAY_STATE_ICONS: Record<JornadaStatus, IconName> = { NO_INGRESO: 'waiting', EN_CURSO: 'clock', PAUSA_ABIERTA: 'pause', EGRESADA: 'check', CANCELADA: 'ban' }
function DayStateTag({ state }: { state: JornadaStatus }) {
  return <StatusTag tone="neutral" icon={DAY_STATE_ICONS[state] ?? 'waiting'}>{stateLabel(state)}</StatusTag>
}
/** A voided mark stays listed (D-20261027-08): struck, and named by the same tag as on the employee's day sheet. */
const VoidedTag = () => <StatusTag tone="neutral" icon="ban">Anulada</StatusTag>

// Without a date the title is plain «Días»: «Días de trabajo» is the name of another section now.
function journeysTitle(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Días'
  const parsedDate = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return 'Días'
  const formattedDate = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'UTC' }).format(parsedDate)
  return `Días de trabajo del ${formattedDate}`
}

export function JourneysViewRender({ daySearch, narrow = false, sites, jornadas, loading, journeysLoading, journeysDate, journeysError, dependencyError, error, notice, messageAt, detail, detailFor, detailLoading, markBusy, date, dateError, peopleById, detailSite, detailTimeZone, forgotAction, forgotOccurredAt, forgotReason, editingMarkId, correctedAction, correctedOccurredAt, correctionReason, cancelOpen, cancelReason, voidingMarkId, voidReason, forgottenErrors = {}, correctionErrors = {}, voidError, cancelError, auditOpen, audit, auditLoading, auditError, onToggleAudit, onRetryAudit, mapMarkId = '', onToggleMarkMap = () => undefined, onCloseMarkMap = () => undefined, onDateChange, onRetryDependencies, onReloadJourneys, onShowDetail, onCloseDetail = () => undefined, onForgotActionChange, onForgotOccurredAtChange, onForgotReasonChange, onAddForgottenMark, onBeginMarkCorrection, onCorrectedActionChange, onCorrectedOccurredAtChange, onCorrectionReasonChange, onCorrectMark, onCancelMarkCorrection, onBeginCancel, onCancelReasonChange, onConfirmCancel, onAbortCancel, onBeginVoid, onVoidReasonChange, onConfirmVoid, onAbortVoid }: {
  /** The search of earlier days (AdminHistory), a fold under the list of the date. */
  daySearch?: ReactNode
  /** Under 768 px: the days and the marks of a day are lists instead of tables. */
  narrow?: boolean
  sites: Site[]; jornadas: JourneyRow[]
  loading: boolean; journeysLoading: boolean; journeysDate: string; journeysError: string; dependencyError: string; error: string; notice: string
  /** The place of error and notice: markMessageKey(...), 'forgotten', 'cancel' or 'detail'. */
  messageAt: string
  /** detailFor is the jornada asked for: its row holds the detail, its loading and a failure to read it. */
  detail: Jornada | null; detailFor: string; detailLoading: boolean; markBusy: string; date: string; dateError: string; peopleById: Map<string, string>
  detailSite?: Site; detailTimeZone?: string; forgotAction: MarkAction; forgotOccurredAt: string; forgotReason: string; editingMarkId: string
  correctedAction: MarkAction; correctedOccurredAt: string; correctionReason: string
  onDateChange: (value: string) => void
  onRetryDependencies: () => void; onReloadJourneys: () => void; onShowDetail: (id: string) => void
  /** «Cerrar» of the open day: the container closes it and gives the focus back to the «Ver marcas» that opened it. */
  onCloseDetail?: () => void
  onForgotActionChange: (value: MarkAction) => void; onForgotOccurredAtChange: (value: string) => void; onForgotReasonChange: (value: string) => void; onAddForgottenMark: (event: FormEvent<HTMLFormElement>) => void
  onBeginMarkCorrection: (mark: Mark) => void; onCorrectedActionChange: (value: MarkAction) => void; onCorrectedOccurredAtChange: (value: string) => void; onCorrectionReasonChange: (value: string) => void
  onCorrectMark: (event: FormEvent<HTMLFormElement>, mark: Mark) => void; onCancelMarkCorrection: () => void
  cancelOpen: boolean; cancelReason: string; voidingMarkId: string; voidReason: string
  /** What each form found wrong on submit, under its field. */
  forgottenErrors?: FieldErrors<'occurredAt' | 'reason'>; correctionErrors?: FieldErrors<'occurredAt' | 'reason'>; voidError?: string; cancelError?: string
  onBeginCancel: () => void; onCancelReasonChange: (value: string) => void; onConfirmCancel: (event: FormEvent<HTMLFormElement>) => void; onAbortCancel: () => void
  onBeginVoid: (mark: Mark) => void; onVoidReasonChange: (value: string) => void; onConfirmVoid: (event: FormEvent<HTMLFormElement>, mark: Mark) => void; onAbortVoid: () => void
  auditOpen: boolean; audit: JornadaAudit | null; auditLoading: boolean; auditError: string; onToggleAudit: () => void; onRetryAudit: () => void
  /** The mark whose map is open under it ('' for none); one map at a time. */
  mapMarkId?: string; onToggleMarkMap?: (mark: Mark) => void; onCloseMarkMap?: () => void
}) {
  const cancellable = detail?.state === 'NO_INGRESO' && detail.marks.every((mark) => mark.voided)
  // A result or error shows where its form is (design system 4.7), never at the top of the page.
  const messagesAt = (key: string) => messageAt === key && (error || notice) ? <>{error && <PageMessage kind="error">{error}</PageMessage>}{notice && <PageMessage kind="success">{notice}</PageMessage>}</> : null
  const markTime = (mark: Mark) => dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)
  const recordedTime = (mark: Mark) => dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)
  const markLocation = (mark: Mark) => <>{locationName(mark.locationStatus)}{typeof mark.latitude === 'number' && typeof mark.longitude === 'number' && <span className="mark-coordinates">{`${mark.latitude.toFixed(5)}, ${mark.longitude.toFixed(5)}`}</span>}</>
  // Correcting changes the mark (secondary); voiding takes it out of the day (the one danger style, outlined).
  // Without the local's zone a time cannot be typed: the buttons that need one say why, with the message above the marks.
  const zoneReason = detailTimeZone ? undefined : ZONE_MISSING_ID
  // «Ver en el mapa» is a link button (it opens something to look at, it changes nothing); open, it reads «Ocultar mapa».
  const mapButton = (mark: Mark) => {
    if (!hasPoint(mark)) return null
    const open = mark.id === mapMarkId
    return <button type="button" id={markMapButtonId(mark.id)} className="button button-link" aria-expanded={open} aria-controls={open ? markMapPanelId(mark.id) : undefined}
      aria-label={`${open ? 'Ocultar mapa de' : 'Ver en el mapa'} la marca ${actionName(mark.action)} de ${markTime(mark)}`} onClick={() => onToggleMarkMap(mark)}>{open ? 'Ocultar mapa' : 'Ver en el mapa'}</button>
  }
  const markMap = (mark: Mark) => detail && mark.id === mapMarkId && hasPoint(mark)
    ? <MarkMapPanel id={markMapPanelId(mark.id)} headingId={`${markMapPanelId(mark.id)}-title`} mark={{ latitude: mark.latitude as number, longitude: mark.longitude as number }}
      accuracyMeters={mark.accuracyMeters} geofence={markGeofence(detail)} mapLabel={`Mapa de la marca ${actionName(mark.action)} de ${markTime(mark)}`} onClose={onCloseMarkMap} />
    : null
  const markButtons = (mark: Mark, className: string, lead?: ReactNode) => <div className={className}>{lead}<button id={markButtonId('correct', mark.id)} className="button button-secondary" aria-label={`Corregir marca ${actionName(mark.action)} de ${markTime(mark)}`} aria-describedby={zoneReason} disabled={markBusy !== '' || !detailTimeZone} onClick={() => onBeginMarkCorrection(mark)}>Corregir</button><button id={markButtonId('void', mark.id)} className="button button-danger" aria-label={`Anular marca ${actionName(mark.action)} de ${markTime(mark)}`} disabled={markBusy !== ''} onClick={() => onBeginVoid(mark)}>Anular</button></div>
  const voidedNote = (mark: Mark) => `${mark.voidedAt ? `Anulada el ${dateTime(mark.voidedAt, detailTimeZone)}` : 'Anulada'}${mark.voidReason ? ` · ${mark.voidReason}` : ''}`
  // Backing out of a form is a link button: it never borrows the look, or the word, of the action it backs out of.
  const voidForm = (mark: Mark) => <form id={markFormId('void', mark.id)} className="inline-form" aria-label={`Anular la marca ${actionName(mark.action)} de ${markTime(mark)}`} noValidate onSubmit={(event) => onConfirmVoid(event, mark)}>
    <FormField label="Motivo de anulación" hint={`La marca no se borra: queda visible como anulada, con tu nombre, la hora y este motivo, y deja de contar para el día y los casos. ${HEALTH_DATA_HINT}`} error={voidError}><textarea required maxLength={2000} value={voidReason} onChange={(event) => onVoidReasonChange(event.target.value)} /></FormField>
    {messagesAt(markMessageKey('void', mark.id))}
    <div className="button-row"><button className="button button-danger" disabled={markBusy === mark.id}>{markBusy === mark.id ? 'Anulando…' : 'Confirmar anulación'}</button><button type="button" className="button button-link" disabled={markBusy === mark.id} onClick={onAbortVoid}>Volver</button></div>
  </form>
  const correctionForm = (mark: Mark) => <form id={markFormId('correct', mark.id)} className="inline-form" aria-label={`Corregir la marca ${actionName(mark.action)} de ${markTime(mark)}`} noValidate onSubmit={(event) => onCorrectMark(event, mark)}>
    <FormField label="Tipo de marca corregida"><select value={correctedAction} onChange={(event) => onCorrectedActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
    <FormField label={`Hora corregida (${detailSite?.name ?? 'zona horaria del local'})`} error={correctionErrors.occurredAt}><input type="datetime-local" required value={correctedOccurredAt} onChange={(event) => onCorrectedOccurredAtChange(event.target.value)} /></FormField>
    <FormField label="Motivo de corrección de marca" error={correctionErrors.reason}><textarea required maxLength={2000} value={correctionReason} onChange={(event) => onCorrectionReasonChange(event.target.value)} /></FormField>
    {messagesAt(markMessageKey('correct', mark.id))}
    <div className="button-row"><button className="button button-primary" disabled={markBusy === mark.id}>{markBusy === mark.id ? 'Guardando…' : 'Guardar corrección de marca'}</button><button type="button" className="button button-link" disabled={markBusy === mark.id} onClick={onCancelMarkCorrection}>Cancelar</button></div>
  </form>
  /** What opens under a mark: its open form, or else the result of the form that closed on it. */
  const formUnderMark = (mark: Mark) => mark.voided ? messagesAt(markMessageKey('void', mark.id))
    : mark.id === voidingMarkId ? voidForm(mark)
    : mark.id === editingMarkId ? correctionForm(mark)
    : messagesAt(markMessageKey('void', mark.id)) ?? messagesAt(markMessageKey('correct', mark.id))
  /** Its map, when open, then its form or result. */
  const underMark = (mark: Mark) => {
    const map = markMap(mark)
    const form = formUnderMark(mark)
    return map || form ? <>{map}{form}</> : null
  }
  const detailBlock = detailLoading ? <Panel title="Detalle"><Loading label="Consultando marcas…" /></Panel>
    : detail ? jornadaDetail(detail) : messagesAt('detail')
  // The detail goes in the row of its day; while that row is not on screen (the list is reloading, failed or is of another
  // date) it goes under the list, as before.
  const listShown = Boolean(date) && !loading && !journeysLoading && journeysDate === date && !journeysError
  const detailInRow = listShown && jornadas.some((jornada) => jornada.id === detailFor)
  const detailIn = (jornadaId: string) => detailInRow && jornadaId === detailFor ? detailBlock : null
  // A plain function, not a component: a component declared here would be new on every render and lose the typed text.
  function jornadaDetail(detail: Jornada) {
    const forgottenMessages = messagesAt('forgotten')
    // Written out instead of Panel: the title takes the focus when the day opens (tabIndex -1), and names the table of marks.
    return <section id={DETAIL_ID} className="panel day-detail" aria-labelledby={DETAIL_HEADING_ID}>
      <div className="panel-heading"><h2 id={DETAIL_HEADING_ID} tabIndex={-1}>{`Marcas de ${peopleById.get(detail.employeeId) ?? 'empleado'}`}</h2>
        <button type="button" className="button button-link" disabled={markBusy !== ''} onClick={onCloseDetail}>Cerrar</button></div>
      {/* The hours of the schedule the day was loaded with (#177: only its name was shown). */}
      <p className="muted">{`Horario asignado: ${scheduleText(detail.scheduleSnapshot)} · tolerancia ${detail.toleranceMinutes} min`}</p>
      {!detailTimeZone && <div id={ZONE_MISSING_ID}><PageMessage kind="error">No se pudo cargar la zona horaria del local. Reintentá los datos del día antes de incorporar o corregir marcas.</PageMessage></div>}
      {detail.state === 'CANCELADA' && <PageMessage>Día cancelado el {dateTime(detail.cancelledAt ?? '', detailTimeZone)}.{detail.cancelReason ? ` Motivo: ${detail.cancelReason}` : ''}</PageMessage>}
      {cancellable && cancelOpen ? <form id={CANCEL_FORM_ID} className="inline-form" noValidate onSubmit={onConfirmCancel}>
        <FormField label="Motivo de cancelación" hint={`El día queda cancelado con tu nombre, la hora y este motivo; sus casos se cierran y podés volver a cargarlo. ${HEALTH_DATA_HINT}`} error={cancelError}><textarea required maxLength={2000} value={cancelReason} onChange={(event) => onCancelReasonChange(event.target.value)} /></FormField>
        {messagesAt('cancel')}
        <div className="button-row"><button className="button button-danger" disabled={markBusy !== ''}>{markBusy === 'cancel' ? 'Cancelando…' : 'Confirmar cancelación'}</button><button type="button" className="button button-link" disabled={markBusy === 'cancel'} onClick={onAbortCancel}>Volver</button></div>
      </form> : <>{messagesAt('cancel')}{cancellable && <div className="button-row"><button id={CANCEL_BUTTON_ID} type="button" className="button button-danger" disabled={markBusy !== ''} onClick={onBeginCancel}>Cancelar el día</button></div>}</>}
      {!detail.marks.length ? <Empty>{detail.state === 'CANCELADA' ? 'Este día fue cancelado y no tiene marcas.' : 'Este día todavía no tiene marcas.'}</Empty>
        : narrow ? <ul className="record-list" aria-label="Marcas del día">{detail.marks.map((mark) => <li key={mark.id} className={mark.voided ? 'record record-voided' : 'record'}>
          <p className="record-title"><strong>{mark.voided ? <s>{actionName(mark.action)}</s> : actionName(mark.action)}</strong>{mark.voided && <VoidedTag />}</p>
          {/* The table's «Registrada» column, so no information depends on the width of the screen. */}
          <p className="record-meta"><span>{`${MARK_TIME_LABEL}: `}{mark.voided ? <s>{markTime(mark)}</s> : markTime(mark)}</span><span>{`${RECORDED_TIME_LABEL}: ${recordedTime(mark)}`}</span></p>
          <p className="record-meta">{mark.voided ? voidedNote(mark) : markLocation(mark)}</p>
          {/* On a phone «Ver en el mapa» leads the row of the mark's buttons, a whole target like them. */}
          {!mark.voided && markButtons(mark, 'record-actions', mapButton(mark))}
          {underMark(mark)}
        </li>)}</ul>
        : <TableScroll labelledBy={DETAIL_HEADING_ID}><table aria-labelledby={DETAIL_HEADING_ID}><thead><tr><th scope="col">Marca</th><th scope="col">{MARK_TIME_LABEL}</th><th scope="col">{RECORDED_TIME_LABEL}</th><th scope="col">Ubicación</th><th scope="col">Acciones</th></tr></thead><tbody>{detail.marks.map((mark) => {
          const under = underMark(mark)
          return <Fragment key={mark.id}>{mark.voided
            ? <tr className="record-voided"><td><s>{actionName(mark.action)}</s> <VoidedTag /></td><td><s>{markTime(mark)}</s></td><td>{recordedTime(mark)}</td><td>{markLocation(mark)}</td><td>{voidedNote(mark)}</td></tr>
            : <tr><td>{actionName(mark.action)}</td><td>{markTime(mark)}</td><td>{recordedTime(mark)}</td><td>{markLocation(mark)}{mapButton(mark)}</td><td>{markButtons(mark, 'button-row')}</td></tr>}
            {/* The form of a mark, or its result, in a full-width row right under it (design system 4.12). */}
            {under && <tr><td colSpan={5}>{under}</td></tr>}</Fragment>
        })}</tbody></table></TableScroll>}
      {detail.state !== 'CANCELADA' && <form id={FORGOTTEN_FORM_ID} className="inline-form" noValidate onSubmit={onAddForgottenMark}><fieldset className="form-grid field-group" disabled={!detailTimeZone}>
        <div className="field-wide"><h3>Agregar una marca que faltó</h3><p className="field-hint">Escribí la hora de {detailSite?.name ?? 'el local'}. Queda guardado que la agregaste vos y por qué.</p></div>
        <FormField label="¿Qué marca faltó?"><select value={forgotAction} onChange={(event) => onForgotActionChange(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora (${detailSite?.name ?? 'local'})`} error={forgottenErrors.occurredAt}><input type="datetime-local" required value={forgotOccurredAt} onChange={(event) => onForgotOccurredAtChange(event.target.value)} /></FormField>
        <FormField label="¿Por qué la agregás?" error={forgottenErrors.reason}><textarea required maxLength={2000} value={forgotReason} onChange={(event) => onForgotReasonChange(event.target.value)} /></FormField>
        {forgottenMessages && <div className="field-wide">{forgottenMessages}</div>}
        <div className="field-wide"><button className="button button-primary" aria-describedby={zoneReason} disabled={markBusy !== ''}>{markBusy === 'forgotten' ? 'Guardando…' : 'Agregar marca'}</button></div>
      </fieldset></form>}
      <JornadaAuditSection open={auditOpen} audit={audit} loading={auditLoading} error={auditError} onToggle={onToggleAudit} onRetry={onRetryAudit} />
    </section>
  }
  return <>
    <PageHeading title="Hoy" subtitle="Revisá las marcas de cada día y corregí lo que haga falta. Cada día sigue el calendario de su local." />
    {dependencyError && <LoadFailure message={dependencyError} retryLabel="Reintentar datos del día" disabled={loading || journeysLoading} onRetry={onRetryDependencies} />}
    {/* Written out instead of Panel: its title names the table, or the list on a phone. */}
    <section className="panel" aria-labelledby={LIST_HEADING_ID}>
      <div className="panel-heading"><h2 id={LIST_HEADING_ID}>{journeysTitle(date)}</h2><button className="button button-secondary" disabled={journeysLoading} onClick={onReloadJourneys}><Icon name="refresh" />{journeysLoading ? 'Actualizando…' : 'Actualizar'}</button></div>
      <div className="toolbar"><FormField label="Fecha" error={dateError}><input type="date" required disabled={loading} value={date} onChange={(event) => onDateChange(event.target.value)} /></FormField></div>
      {!date ? <Empty>{dateError}</Empty> : loading || journeysLoading || journeysDate !== date ? <Loading label={loading || !journeysDate ? 'Cargando días…' : 'Actualizando días…'} /> : journeysError ? <LoadFailure message={journeysError} onRetry={onReloadJourneys} /> : jornadas.length ? narrow ? <ul className="record-list" aria-labelledby={LIST_HEADING_ID}>{jornadas.map((jornada) => {
        // Phones: one row per day loaded, so "Ver marcas" is in sight without swiping a table sideways.
        const person = peopleById.get(jornada.employeeId) ?? 'Empleado'
        return <li className="record" key={jornada.id} aria-labelledby={`jornada-${jornada.id}-person`}>
          <p className="record-title"><strong id={`jornada-${jornada.id}-person`}>{person}</strong><DayStateTag state={jornada.state} /></p>
          <p className="record-meta">{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Local'}</p>
          <div className="record-actions"><button id={dayButtonId(jornada.id)} className="button button-link" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button></div>
          {detailIn(jornada.id)}
        </li>
      })}</ul> : <TableScroll labelledBy={LIST_HEADING_ID}><table aria-labelledby={LIST_HEADING_ID}><thead><tr><th scope="col">Empleado</th><th scope="col">Local</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>{jornadas.map((jornada) => {
        const open = detailIn(jornada.id)
        return <Fragment key={jornada.id}><tr><td>{peopleById.get(jornada.employeeId) ?? 'Empleado'}</td><td>{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Local'}</td><td><DayStateTag state={jornada.state} /></td><td><button id={dayButtonId(jornada.id)} className="button button-link" aria-label={`Ver marcas de ${peopleById.get(jornada.employeeId) ?? 'empleado'}`} disabled={detailLoading} onClick={() => onShowDetail(jornada.id)}>Ver marcas</button></td></tr>
          {/* The day opens in a full-width row under its own; once read, the row is named by the day's title. */}
          {open && <tr aria-labelledby={detail && !detailLoading ? DETAIL_HEADING_ID : undefined}><td colSpan={4}>{open}</td></tr>}</Fragment>
      })}</tbody></table></TableScroll> : <Empty>No hay días cargados para esta fecha.</Empty>}
    </section>
    {daySearch}
    {/* A day that is not a row of the list (one found by the search, or the list could not show it) opens here, right
        under the search that found it. */}
    {!detailInRow && detailBlock}
  </>
}

/** Issue #60: the jornada's change history, collapsed until the ADMIN asks for it; times in the jornada's time zone. */
export function JornadaAuditSection({ open, audit, loading, error, onToggle, onRetry }: {
  open: boolean; audit: JornadaAudit | null; loading: boolean; error: string; onToggle: () => void; onRetry: () => void
}) {
  return <section className="day-changes" aria-labelledby="audit-history-title">
    <div className="subsection-head"><h3 id="audit-history-title">Historial de cambios</h3>
      <button type="button" className="button button-secondary" aria-expanded={open} aria-controls="audit-history-body" onClick={onToggle}>{open ? 'Ocultar historial' : 'Ver historial'}</button></div>
    {open && <div id="audit-history-body">{loading ? <Loading label="Cargando historial de cambios…" /> : error ? <LoadFailure message={error} onRetry={onRetry} /> : !audit ? null : audit.entries.length === 0 ? <Empty>Este día no tiene cambios registrados.</Empty> : <>
      {audit.truncated && <PageMessage>Se muestran los primeros {audit.entries.length} cambios de este día.</PageMessage>}
      {/* Each change is a row: what changed, then when and who on one line, then the reason a person wrote. */}
      <ol className="record-list" aria-label="Cambios del día">{audit.entries.map((entry, index) => <li key={`${entry.kind}-${entry.changedAt}-${index}`} className="record">
        <strong>{auditTitle(entry, audit.timeZone)}</strong>
        <p className="record-meta"><span>{dateTime(entry.changedAt, audit.timeZone)}</span><span>{entry.actorAccountId ? `Por ${entry.actorDisplayName?.trim() || 'una persona sin nombre registrado'}` : 'Automático del sistema'}</span></p>
        {entry.reason && showsReason(entry) && <p className="record-meta">Motivo: {entry.reason}</p>}
      </li>)}</ol>
    </>}</div>}
  </section>
}

/** «Mañana (09:00 a 13:00 y 17:00 a 21:00)»: the name of a schedule with its hours. */
function scheduleText(schedule: Jornada['scheduleSnapshot']): string {
  return schedule.blocks.length ? `${schedule.name} (${schedule.blocks.map(formatBlock).join(' y ')})` : schedule.name
}

/** Reasons written by people; the system's own reconciliation notes are not shown. */
function showsReason(entry: JornadaAuditEntry) { return entry.kind !== 'DEVIATION' || entry.changeType === 'CLASSIFICATION_CHANGED' }

function auditTitle(entry: JornadaAuditEntry, timeZone: string): string {
  const markAt = (action?: MarkAction | null, at?: string | null) => `${action ? actionName(action) : 'Marca'}${at ? ` de ${dateTime(at, timeZone)}` : ''}`
  const type = (value?: Deviation['type'] | null) => value ? deviationName(value) : 'Caso'
  const classification = (value?: 'JUSTIFICADO' | 'NO_JUSTIFICADO' | null) => value ? statusName(value).toLowerCase() : 'sin clasificar'
  const category = (value?: Deviation['category']) => value ? categoryName(value) : 'sin categoría'
  switch (entry.kind) {
    case 'JORNADA_CANCELLATION': return 'Día cancelado'
    case 'FORGOTTEN_MARK': return `Marca olvidada incorporada: ${markAt(entry.afterAction, entry.afterOccurredAt)}`
    case 'MARK_CORRECTION': return `Marca corregida: de ${markAt(entry.beforeAction, entry.beforeOccurredAt)} a ${markAt(entry.afterAction, entry.afterOccurredAt)}`
    case 'MARK_VOID': return `Marca anulada: ${markAt(entry.beforeAction, entry.beforeOccurredAt)}`
    case 'DEVIATION': break
  }
  const current = type(entry.deviationType)
  switch (entry.changeType) {
    case 'CREATED': return `Caso detectado: ${type(entry.afterType ?? entry.deviationType)}`
    case 'TYPE_REPLACED': return `Caso actualizado: de ${type(entry.beforeType)} a ${type(entry.afterType)}`
    case 'RETRACTED': return `Caso cerrado: ${type(entry.beforeType ?? entry.deviationType)}`
    case 'CLASSIFICATION_CHANGED': return entry.beforeClassification
      ? `${current}: clasificación corregida de ${classification(entry.beforeClassification)} a ${classification(entry.afterClassification)}`
      : `${current}: clasificado como ${classification(entry.afterClassification)}`
    case 'CLASSIFICATION_RESET': return `${current}: vuelve a revisión (se quitó la clasificación ${classification(entry.beforeClassification)})`
    case 'MOTIVE_SUBMITTED': return `${current}: motivo cargado, categoría ${category(entry.afterMotiveCategory)}`
    case 'MOTIVE_CORRECTED': return `${current}: motivo corregido, categoría de ${category(entry.beforeMotiveCategory)} a ${category(entry.afterMotiveCategory)}`
    default: return `${current}: cambio registrado`
  }
}

const MARK_ACTIONS: MarkAction[] = ['INGRESO', 'EGRESO', 'SALIDA_DESAYUNO', 'VUELTA_DESAYUNO', 'SALIDA_ALMUERZO', 'VUELTA_ALMUERZO']
