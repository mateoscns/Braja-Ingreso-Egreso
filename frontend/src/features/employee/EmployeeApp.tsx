import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AppHeader, CompanySwitcher, Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import { useSession } from '../../app/session'
import { ApiError, api } from '../../shared/api/client'
import type { Deviation, Jornada, Site } from '../../shared/api/types'
import { createMarkAttempt, submitMark, type MarkAction, type MarkAttempt, type MarkReceipt } from './markFlow'
import { loadEmployeeDayData, loadPendingMotives, PENDING_MOTIVES_LIMIT } from './dayData'
import { InstallControl } from '../../device/pwa/InstallControl'
import { formatBlock, formatDateTime, formatLocalDate, jornadaStateLabel } from '../../shared/format'

const localTime = formatDateTime
const stateLabel = jornadaStateLabel
const actionLabel: Record<MarkAction, string> = {
  INGRESO: 'Registrar ingreso', EGRESO: 'Registrar egreso', SALIDA_DESAYUNO: 'Salir a desayuno', VUELTA_DESAYUNO: 'Volver de desayuno',
  SALIDA_ALMUERZO: 'Salir a almuerzo', VUELTA_ALMUERZO: 'Volver de almuerzo'
}
const STALE_MARK_CODES = new Set(['INVALID_MARK_TRANSITION', 'INVALID_MARK_ORDER', 'INVALID_MARK_HISTORY'])

function markFailureMessage(reason: unknown): string {
  if (reason instanceof Error && reason.name === 'TimeoutError') {
    return 'El servidor no respondió a tiempo. La marca puede no haberse registrado: tocá Actualizar para ver el estado o reintentá la misma acción.'
  }
  if (reason instanceof Error && reason.name === 'NetworkError') return `${reason.message} La marca no fue confirmada; podés reintentar.`
  if (reason instanceof ApiError && reason.code === 'RETRYABLE_TRANSACTION_CONFLICT') return 'La marca no se registró porque el servidor estaba ocupado. Reintentá la misma acción.'
  if (reason instanceof ApiError && reason.code && STALE_MARK_CODES.has(reason.code)) return 'La jornada cambió y esa marca ya no corresponde. Te mostramos el estado actual del servidor.'
  return reason instanceof Error ? reason.message : 'La marca no fue confirmada. Reintentá la misma acción.'
}

export function EmployeeApp() {
  const { session, signOut, activateCompany } = useSession()
  const active = session?.memberships.find((membership) => membership.companyId === session.activeCompanyId)
  const [date, setDate] = useState('')
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [siteDates, setSiteDates] = useState<Map<string, string>>(new Map())
  const [selectedId, setSelectedId] = useState('')
  const [deviations, setDeviations] = useState<Deviation[]>([])
  const [pendingMotives, setPendingMotives] = useState<Deviation[]>([])
  const [pendingTruncated, setPendingTruncated] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [pendingRetrying, setPendingRetrying] = useState(false)
  const [editingMotives, setEditingMotives] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<MarkReceipt | null>(null)
  const [pendingAttempt, setPendingAttempt] = useState<MarkAttempt | null>(null)
  const [motiveValues, setMotiveValues] = useState<Record<string, { category: string; text: string }>>({})
  const [savingMotive, setSavingMotive] = useState('')
  const [markFailed, setMarkFailed] = useState(false)
  const [feedbackFocus, setFeedbackFocus] = useState(0)
  const loadSequence = useRef(0)
  const pendingSequence = useRef(0)
  const markSequence = useRef(0)
  const markInFlight = useRef(false)
  const feedbackRef = useRef<HTMLDivElement>(null)
  // Buttons are disabled while a mark is in flight, so focus moves to the outcome once it is known.
  useEffect(() => { if (feedbackFocus) feedbackRef.current?.focus() }, [feedbackFocus])

  async function load() {
    const requestId = ++loadSequence.current
    setLoading(true); setLoadFailed(false); setError(''); setReceipt(null); setMarkFailed(false)
    try {
      const availableSites = await api.get<Site[]>('/sites')
      const dayData = await loadEmployeeDayData(api, availableSites, date)
      if (requestId !== loadSequence.current) return
      setSites(availableSites); setSiteDates(dayData.siteDates); setJornadas(dayData.jornadas)
      // A cancelled jornada stays listed, but the first one that still accepts marks is selected by default.
      setSelectedId((current) => dayData.jornadas.some((jornada) => jornada.id === current) ? current
        : (dayData.jornadas.find((jornada) => jornada.state !== 'CANCELADA') ?? dayData.jornadas[0])?.id ?? '')
      setDeviations(dayData.deviations); setEditingMotives([])
      applyPendingMotives(dayData.pendingMotives, dayData.pendingMotivesTruncated, dayData.pendingMotivesError)
    } catch (reason) {
      if (requestId === loadSequence.current) {
        setLoadFailed(true)
        setError(reason instanceof Error ? reason.message : 'No se pudieron cargar tus registros.')
      }
    }
    finally { if (requestId === loadSequence.current) setLoading(false) }
  }
  /** Applies a pending-motives result; any retry still in flight becomes stale. */
  function applyPendingMotives(items: Deviation[], truncated: boolean, failure: string) {
    pendingSequence.current += 1
    setPendingMotives(items); setPendingTruncated(truncated); setPendingError(failure); setPendingRetrying(false)
  }
  /** Retries only the pending list: the day view already loaded. */
  async function retryPendingMotives() {
    const requestId = ++pendingSequence.current
    setPendingRetrying(true); setPendingError('')
    try {
      const pending = await loadPendingMotives(api)
      if (requestId === pendingSequence.current) applyPendingMotives(pending.items, pending.truncated, '')
    } catch (reason) {
      if (requestId === pendingSequence.current) {
        setPendingRetrying(false)
        setPendingError(reason instanceof Error ? reason.message : 'No se pudieron consultar los motivos pendientes.')
      }
    }
  }
  useEffect(() => {
    if (!session?.activeCompanyId) return
    void load()
  }, [date, session?.activeCompanyId])
  const selected = jornadas.find((jornada) => jornada.id === selectedId)
  const selectedSite = sites.find((site) => site.id === selected?.siteId)
  const actions = useMemo(() => selected ? allowedActions(selected) : [], [selected])
  if (!session || !active) return null

  async function mark(action: MarkAction) {
    if (markInFlight.current) return
    markInFlight.current = true
    const jornadaId = selectedId
    const markRequest = ++markSequence.current
    setBusy(true); setError(''); setReceipt(null); setMarkFailed(false)
    const attempt = pendingAttempt?.jornadaId === jornadaId && pendingAttempt.action === action ? pendingAttempt : createMarkAttempt(jornadaId, action)
    setPendingAttempt(attempt)
    try {
      const serverReceipt = await submitMark(api, attempt)
      setReceipt(serverReceipt); setPendingAttempt(null)
      try {
        const refreshed = await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`)
        setJornadas((current) => current.map((item) => item.id === refreshed.id ? refreshed : item))
      } catch { /* El recibo confirmado sigue siendo válido aunque falle la actualización de pantalla. */ }
      try {
        const refreshedDay = await loadEmployeeDayData(api, sites, date)
        setSiteDates(refreshedDay.siteDates); setDeviations(refreshedDay.deviations)
        // A failed background refresh keeps the pending list already on screen.
        if (!refreshedDay.pendingMotivesError) applyPendingMotives(refreshedDay.pendingMotives, refreshedDay.pendingMotivesTruncated, '')
      } catch { /* La marca no depende de actualizar la bandeja. */ }
    } catch (reason) {
      setError(markFailureMessage(reason)); setMarkFailed(true)
      // That key is bound to other content on the server; the next try needs a new one.
      if (reason instanceof ApiError && reason.code === 'IDEMPOTENCY_CONFLICT') setPendingAttempt(null)
      void refreshAfterFailedMark(jornadaId, markRequest)
    }
    finally { markInFlight.current = false; setBusy(false); setFeedbackFocus((count) => count + 1) }
  }

  /** Not awaited: buttons are released right away and the next action follows the server state when it arrives. */
  async function refreshAfterFailedMark(jornadaId: string, markRequest: number) {
    const loadRequest = loadSequence.current
    try {
      const refreshed = await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`)
      if (markRequest !== markSequence.current || loadRequest !== loadSequence.current) return
      setJornadas((current) => current.map((item) => item.id === refreshed.id ? refreshed : item))
    } catch { /* "Actualizar" queda disponible para reintentar la consulta. */ }
  }

  function updateMotive(id: string, patch: Partial<{ category: string; text: string }>) {
    setMotiveValues((current) => ({ ...current, [id]: { category: current[id]?.category ?? 'OTRA', text: current[id]?.text ?? '', ...patch } }))
  }
  async function saveMotive(event: FormEvent, item: Deviation) {
    event.preventDefault(); setSavingMotive(item.id); setError('')
    const values = motiveValues[item.id] ?? { category: 'OTRA', text: '' }
    try {
      const updated = await api.put<Deviation>(`/deviations/${encodeURIComponent(item.id)}/motive`, { category: values.category, text: values.text.trim() })
      setDeviations((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setPendingMotives((current) => current.filter((entry) => entry.id !== item.id))
      setEditingMotives((current) => current.filter((id) => id !== item.id))
      setMotiveValues((current) => { const next = { ...current }; delete next[item.id]; return next })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el motivo.') }
    finally { setSavingMotive('') }
  }
  /** D-20261027-02: a motive can be corrected until the ADMIN classifies; a deviation classified without motive accepts its first one. */
  function startMotiveEdit(item: Deviation) {
    setMotiveValues((current) => ({ ...current, [item.id]: { category: item.category ?? 'OTRA', text: item.motiveText ?? '' } }))
    setEditingMotives((current) => current.includes(item.id) ? current : [...current, item.id])
  }
  function cancelMotiveEdit(id: string) {
    setEditingMotives((current) => current.filter((entry) => entry !== id))
    setMotiveValues((current) => { const next = { ...current }; delete next[id]; return next })
  }
  const motiveForms = [...pendingMotives, ...deviations.filter((item) => editingMotives.includes(item.id) && !pendingMotives.some((pending) => pending.id === item.id))]
  const canAddFirstMotive = (item: Deviation) => (item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO') && !item.category

  return <div className="app-frame employee-frame">
    <AppHeader companyName={active.companyName} name={session.displayName?.trim() || (session.dni ? `DNI ${session.dni}` : 'Empleado')} onSignOut={() => void signOut()}>
      <InstallControl />
      <CompanySwitcher memberships={session.memberships} activeCompanyId={active.companyId} onSelect={activateCompany} disabled={busy} />
    </AppHeader>
    <main className="employee-main">
      <div className="page-title-row employee-title"><div><p className="eyebrow">MI JORNADA</p><h1>Hola, {session.displayName?.trim() || (session.dni ? `DNI ${session.dni}` : 'bienvenido')}</h1><p className="muted">Tus marcas se registran con hora oficial del servidor.</p></div>
        <FormField label="Fecha de consulta" hint="Sin elegir fecha se consulta hoy según cada sede. Si elegís una fecha, se usa ese mismo día local en todas las sedes."><input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} /></FormField>
      </div>
      {!loading && !loadFailed && sites.length > 0 && <p className="muted small-copy date-semantics">{date ? `Fecha seleccionada: ${formatLocalDate(date)} en todas tus sedes.` : `Hoy según la sede: ${sites.map((site) => `${site.name}, ${siteDates.get(site.id) ? formatLocalDate(siteDates.get(site.id)!) : '…'}`).join(' · ')}.`}</p>}
      <div className="mark-feedback" ref={feedbackRef} tabIndex={-1}>
        {error && <PageMessage kind="error">{error}</PageMessage>}
        {markFailed && !loading && <button type="button" className="button button-quiet button-small" onClick={() => void load()}>Actualizar</button>}
        {receipt && <PageMessage kind="success">Marca confirmada por el servidor (<strong>{localTime(receipt.acceptedAt, selectedSite?.timeZone)}</strong>). Guardá el comprobante si lo necesitás.</PageMessage>}
      </div>
      {loading ? <Loading label="Consultando tu jornada…" /> : loadFailed ? <Panel title="No se pudo consultar tu jornada"><Empty>Revisá el error y volvé a intentar.</Empty><button className="button button-quiet" onClick={() => void load()}>Reintentar</button></Panel> : jornadas.length === 0 ? <Panel title="Sin jornada declarada"><Empty>{date ? `El administrador todavía no declaró una jornada para el ${formatLocalDate(date)}. No hay una marca que completar.` : 'El administrador todavía no declaró una jornada para el día local actual de tus sedes. No hay una marca que completar.'}</Empty></Panel> : <>
        {jornadas.length > 1 && <Panel title="Elegí una jornada"><div className="journey-picker" role="group" aria-label="Jornadas disponibles">{jornadas.map((jornada) => <button key={jornada.id} aria-pressed={selectedId === jornada.id} disabled={busy} onClick={() => { setSelectedId(jornada.id); setPendingAttempt(null); setReceipt(null) }} className={`journey-option ${selectedId === jornada.id ? 'journey-option-active' : ''}`}><strong>{jornada.scheduleSnapshot.name}</strong><small>{formatLocalDate(jornada.localDate)} · {sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'} · {stateLabel(jornada.state)}</small></button>)}</div></Panel>}
        {selected && <>
          <Panel title="Horario de la jornada" action={<span className={`status-chip status-${selected.state.toLowerCase()}`}>{stateLabel(selected.state)}</span>}>
            <div className="schedule-summary"><div className="schedule-icon" aria-hidden="true">◷</div><div><strong>{selected.scheduleSnapshot.name}</strong><p>{selected.scheduleSnapshot.blocks.map((block, index) => <span className="schedule-block" key={`${block.start}-${index}`}>{formatBlock(block)}</span>)}</p><small>Jornada del {formatLocalDate(selected.localDate)} · {selectedSite ? `${selectedSite.name} · ` : ''}Tolerancia individual: {selected.toleranceMinutes} minutos</small></div></div>
            <div className="mark-timeline"><div className="timeline-title">Marcas de la jornada</div>{selected.marks.length ? selected.marks.map((mark) => <div className={`mark-row ${mark.voided ? 'mark-row-voided' : ''}`} key={mark.id}><span className="timeline-point" /><strong>{mark.voided ? <s>{actionLabel[mark.action]}</s> : actionLabel[mark.action]}</strong><time>{localTime(mark.acceptedAt, selectedSite?.timeZone)}</time>{mark.voided && <span className="status-chip">Anulada</span>}</div>) : <p className="muted">Todavía no hay marcas en esta jornada.</p>}</div>
          </Panel>
          <Panel title="Registrar una marca"><p className="muted small-copy">La marca se envía ahora. Necesitás conexión; no se guarda para enviar más tarde. La ubicación, si está disponible, se adjunta aparte.</p>
            <div className="mark-actions" aria-busy={busy}>{actions.map((action) => <button key={action} className={`mark-action ${action === 'INGRESO' || action === 'EGRESO' ? 'mark-action-primary' : ''}`} disabled={busy} onClick={() => void mark(action)}><span aria-hidden="true">{action === 'INGRESO' ? '→' : action === 'EGRESO' ? '←' : '◷'}</span><strong>{actionLabel[action]}</strong><small>{busy && pendingAttempt?.action === action ? 'Enviando al servidor…' : 'Enviar marca'}</small></button>)}</div>
            {busy && pendingAttempt && !receipt && <p role="status" aria-live="polite" aria-atomic="true">Enviando {actionLabel[pendingAttempt.action]} al servidor. La marca todavía no está confirmada.</p>}
            {selected.state === 'EGRESADA' && <PageMessage>Esta jornada ya fue cerrada.</PageMessage>}
            {selected.state === 'CANCELADA' && <PageMessage>El administrador canceló esta jornada; no hay marcas para registrar.</PageMessage>}
          </Panel>
        </>}
      </>}
      <Panel title="Motivos pendientes"><p className="muted small-copy">Completá el motivo del desvío, de cualquier fecha. Podés corregirlo hasta que el administrador lo revise. El texto solo aparece para vos y el administrador de tu empresa.</p>
        {!loading && !loadFailed && pendingError && <><PageMessage kind="error">No se pudieron consultar tus motivos pendientes. {pendingError}</PageMessage><button type="button" className="button button-quiet button-small" onClick={() => void retryPendingMotives()}>Reintentar motivos</button></>}
        {!loading && !loadFailed && !pendingRetrying && pendingTruncated && <p className="muted small-copy">Mostramos los {PENDING_MOTIVES_LIMIT} motivos pendientes más recientes. Completalos para ver los anteriores.</p>}
        {loading || pendingRetrying ? <Loading label="Consultando motivos…" /> : loadFailed ? <Empty>No se pudieron consultar los motivos.</Empty> : motiveForms.length === 0 ? (pendingError ? null : <Empty>No tenés motivos pendientes.</Empty>) : <div className="motive-list">{motiveForms.map((item) => {
          const values = motiveValues[item.id] ?? { category: 'OTRA', text: '' }
          const editing = editingMotives.includes(item.id)
          return <Fragment key={item.id}><form className="motive-card" aria-busy={savingMotive === item.id} onSubmit={(event) => void saveMotive(event, item)}><div><strong>{deviationName(item.type)}</strong><span className="status-chip">{localTime(item.occurredAt ?? item.createdAt, item.siteId ? sites.find((site) => site.id === item.siteId)?.timeZone : undefined)}</span></div>
            {deviationMarkName(item) && <p className="muted small-copy">Marca: {deviationMarkName(item)}</p>}
            <div className="form-grid"><FormField label="Categoría"><select required value={values.category} onChange={(e) => updateMotive(item.id, { category: e.target.value })}><option value="SALUD">Salud</option><option value="TRANSPORTE">Transporte</option><option value="EMERGENCIA">Emergencia</option><option value="OTRA">Otra</option></select></FormField><FormField label="Motivo"><textarea required maxLength={4000} rows={3} value={values.text} onChange={(e) => updateMotive(item.id, { text: e.target.value })} placeholder="Contanos qué pasó…" /></FormField></div>
            <button className="button button-primary button-small" disabled={savingMotive === item.id || !values.text.trim()}>{savingMotive === item.id ? 'Guardando…' : item.status === 'PENDIENTE_REVISION' ? 'Guardar corrección' : 'Enviar motivo'}</button>
            {editing && <button type="button" className="button button-quiet button-small" disabled={savingMotive === item.id} onClick={() => cancelMotiveEdit(item.id)}>Cancelar</button>}
          </form>{savingMotive === item.id && <p role="status" aria-live="polite">Enviando el motivo al servidor…</p>}</Fragment>
        })}</div>}
      </Panel>
      <Panel title="Desvíos de esta fecha">{loading ? <Loading label="Consultando desvíos…" /> : loadFailed ? <Empty>No se pudieron consultar los desvíos.</Empty> : deviations.length ? <div className="deviation-list">{deviations.map((item) => <article className="deviation-card" key={item.id}><div className="deviation-symbol">!</div><div className="deviation-main"><div className="deviation-title"><strong>{deviationName(item.type)}</strong><span className="status-chip">{statusName(item.status)}</span></div>{deviationMarkName(item) && <p className="muted small-copy">Marca: {deviationMarkName(item)}</p>}{item.category && <p className="reason-line"><b>Motivo:</b> {categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
        {!editingMotives.includes(item.id) && item.status === 'PENDIENTE_REVISION' && <button type="button" className="button button-quiet button-small" onClick={() => startMotiveEdit(item)}>Corregir motivo</button>}
        {!editingMotives.includes(item.id) && canAddFirstMotive(item) && <button type="button" className="button button-quiet button-small" onClick={() => startMotiveEdit(item)}>Agregar motivo</button>}</div></article>)}</div> : <Empty>No hay desvíos para esta fecha.</Empty>}</Panel>
    </main>
  </div>
}

function allowedActions(jornada: Jornada): MarkAction[] {
  if (jornada.state === 'EGRESADA' || jornada.state === 'CANCELADA') return []
  if (jornada.state === 'NO_INGRESO') return ['INGRESO']
  // A voided mark stays visible but no longer counts (D-20261027-08), exactly as the server derives the state.
  const marks = jornada.marks.filter((mark) => !mark.voided)
  if (jornada.state === 'PAUSA_ABIERTA') {
    const last = [...marks].sort((a, b) => b.sequence - a.sequence)[0]
    if (last?.action === 'SALIDA_DESAYUNO') return ['VUELTA_DESAYUNO']
    if (last?.action === 'SALIDA_ALMUERZO') return ['VUELTA_ALMUERZO']
    return []
  }
  const actions: MarkAction[] = ['EGRESO']
  const marked = new Set(marks.map((mark) => mark.action))
  if (!marked.has('SALIDA_DESAYUNO')) actions.unshift('SALIDA_DESAYUNO')
  if (!marked.has('SALIDA_ALMUERZO')) actions.unshift('SALIDA_ALMUERZO')
  return actions
}
function deviationName(type: Deviation['type']) { return ({ SIN_INGRESO: 'Sin ingreso', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Egreso temprano', EGRESO_TARDIO: 'Egreso tardío', MARCA_FALTANTE: 'Egreso sin marcar', EXCESO_DESAYUNO: 'Exceso de desayuno', EXCESO_ALMUERZO: 'Exceso de almuerzo', FUERA_DE_SEDE: 'Fuera de sede' } as const)[type] }
function deviationMarkName(item: Deviation) {
  const action = item.sourceMarkAction ? actionLabel[item.sourceMarkAction] : null
  if (!action) return ''
  return `${action}${item.sourceMarkSequence ? ` · secuencia ${item.sourceMarkSequence}` : ''}`
}
function statusName(status: Deviation['status']) { return ({ MOTIVO_PENDIENTE: 'Falta motivo', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado' } as const)[status] }
function categoryName(category: NonNullable<Deviation['category']>) { return ({ SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' } as const)[category] }
