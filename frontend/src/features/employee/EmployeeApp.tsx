import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AppHeader, CompanySwitcher, Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import { useSession } from '../../app/session'
import { api } from '../../shared/api/client'
import type { Deviation, Jornada, Site } from '../../shared/api/types'
import { createMarkAttempt, submitMark, type MarkAction, type MarkAttempt, type MarkReceipt } from './markFlow'
import { loadEmployeeDayData } from './dayData'
import { InstallControl } from '../../device/pwa/InstallControl'
import { formatBlock, formatDateTime, formatLocalDate, jornadaStateLabel } from '../../shared/format'

const localTime = formatDateTime
const actionLabel: Record<MarkAction, string> = {
  INGRESO: 'Registrar ingreso', EGRESO: 'Registrar egreso', SALIDA_DESAYUNO: 'Salir a desayuno', VUELTA_DESAYUNO: 'Volver de desayuno',
  SALIDA_ALMUERZO: 'Salir a almuerzo', VUELTA_ALMUERZO: 'Volver de almuerzo'
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
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<MarkReceipt | null>(null)
  const [pendingAttempt, setPendingAttempt] = useState<MarkAttempt | null>(null)
  const [motiveValues, setMotiveValues] = useState<Record<string, { category: string; text: string }>>({})
  const [savingMotive, setSavingMotive] = useState('')
  const loadSequence = useRef(0)
  const markInFlight = useRef(false)

  async function load() {
    const requestId = ++loadSequence.current
    setLoading(true); setLoadFailed(false); setError(''); setReceipt(null)
    try {
      const availableSites = await api.get<Site[]>('/sites')
      const dayData = await loadEmployeeDayData(api, availableSites, date)
      if (requestId !== loadSequence.current) return
      setSites(availableSites); setSiteDates(dayData.siteDates); setJornadas(dayData.jornadas)
      setSelectedId((current) => dayData.jornadas.some((jornada) => jornada.id === current) ? current : dayData.jornadas[0]?.id ?? '')
      setDeviations(dayData.deviations)
    } catch (reason) {
      if (requestId === loadSequence.current) {
        setLoadFailed(true)
        setError(reason instanceof Error ? reason.message : 'No se pudieron cargar tus registros.')
      }
    }
    finally { if (requestId === loadSequence.current) setLoading(false) }
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
    setBusy(true); setError(''); setReceipt(null)
    const attempt = pendingAttempt?.jornadaId === selectedId && pendingAttempt.action === action ? pendingAttempt : createMarkAttempt(selectedId, action)
    setPendingAttempt(attempt)
    try {
      const serverReceipt = await submitMark(api, attempt)
      setReceipt(serverReceipt); setPendingAttempt(null)
      try {
        const refreshed = await api.get<Jornada>(`/jornadas/${encodeURIComponent(selectedId)}`)
        setJornadas((current) => current.map((item) => item.id === refreshed.id ? refreshed : item))
      } catch { /* El recibo confirmado sigue siendo válido aunque falle la actualización de pantalla. */ }
      try {
        const refreshedDay = await loadEmployeeDayData(api, sites, date)
        setSiteDates(refreshedDay.siteDates); setDeviations(refreshedDay.deviations)
      } catch { /* La marca no depende de actualizar la bandeja. */ }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'NetworkError') setError(`${reason.message} La marca no fue confirmada; podés reintentar.`)
      else setError(reason instanceof Error ? reason.message : 'La marca no fue confirmada. Reintentá la misma acción.')
    }
    finally { markInFlight.current = false; setBusy(false) }
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
      setMotiveValues((current) => { const next = { ...current }; delete next[item.id]; return next })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el motivo.') }
    finally { setSavingMotive('') }
  }

  return <div className="app-frame employee-frame">
    <AppHeader companyName={active.companyName} name={session.dni ? `DNI ${session.dni}` : 'Empleado'} onSignOut={() => void signOut()}>
      <InstallControl />
      <CompanySwitcher memberships={session.memberships} activeCompanyId={active.companyId} onSelect={activateCompany} />
    </AppHeader>
    <main className="employee-main">
      <div className="page-title-row employee-title"><div><p className="eyebrow">MI JORNADA</p><h1>Hola, {session.dni ? `DNI ${session.dni}` : 'bienvenido'}</h1><p className="muted">Tus marcas se registran con hora oficial del servidor.</p></div>
        <FormField label="Fecha de consulta" hint="Sin elegir fecha se consulta hoy según cada sede. Si elegís una fecha, se usa ese mismo día local en todas las sedes."><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
      </div>
      {!loading && !loadFailed && sites.length > 0 && <p className="muted small-copy date-semantics">{date ? `Fecha seleccionada: ${formatLocalDate(date)} en todas tus sedes.` : `Hoy según la sede: ${sites.map((site) => `${site.name}, ${siteDates.get(site.id) ? formatLocalDate(siteDates.get(site.id)!) : '…'}`).join(' · ')}.`}</p>}
      {error && <PageMessage kind="error">{error}</PageMessage>}
      {receipt && <PageMessage kind="success">Marca confirmada por el servidor (<strong>{localTime(receipt.acceptedAt, selectedSite?.timeZone)}</strong>). Guardá el comprobante si lo necesitás.</PageMessage>}
      {loading ? <Loading label="Consultando tu jornada…" /> : loadFailed ? <Panel title="No se pudo consultar tu jornada"><Empty>Revisá el error y volvé a intentar.</Empty><button className="button button-quiet" onClick={() => void load()}>Reintentar</button></Panel> : jornadas.length === 0 ? <Panel title="Sin jornada declarada"><Empty>{date ? `El administrador todavía no declaró una jornada para el ${formatLocalDate(date)}. No hay una marca que completar.` : 'El administrador todavía no declaró una jornada para el día local actual de tus sedes. No hay una marca que completar.'}</Empty></Panel> : <>
        {jornadas.length > 1 && <Panel title="Elegí una jornada"><div className="journey-picker" role="group" aria-label="Jornadas disponibles">{jornadas.map((jornada) => <button key={jornada.id} aria-pressed={selectedId === jornada.id} onClick={() => { setSelectedId(jornada.id); setPendingAttempt(null); setReceipt(null) }} className={`journey-option ${selectedId === jornada.id ? 'journey-option-active' : ''}`}><strong>{jornada.scheduleSnapshot.name}</strong><small>{formatLocalDate(jornada.localDate)} · {sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'} · {jornadaStateLabel(jornada.state)}</small></button>)}</div></Panel>}
        {selected && <>
          <Panel title="Horario de la jornada" action={<span className={`status-chip status-${selected.state.toLowerCase()}`}>{jornadaStateLabel(selected.state)}</span>}>
            <div className="schedule-summary"><div className="schedule-icon">◷</div><div><strong>{selected.scheduleSnapshot.name}</strong><p>{selected.scheduleSnapshot.blocks.map((block, index) => <span className="schedule-block" key={`${block.start}-${index}`}>{formatBlock(block)}</span>)}</p><small>Jornada del {formatLocalDate(selected.localDate)} · {selectedSite ? `${selectedSite.name} · ` : ''}Tolerancia individual: {selected.toleranceMinutes} minutos</small></div></div>
            <div className="mark-timeline"><div className="timeline-title">Marcas de la jornada</div>{selected.marks.length ? selected.marks.map((mark) => <div className="mark-row" key={mark.id}><span className="timeline-point" /><strong>{actionLabel[mark.action]}</strong><time>{localTime(mark.acceptedAt, selectedSite?.timeZone)}</time></div>) : <p className="muted">Todavía no hay marcas en esta jornada.</p>}</div>
          </Panel>
          <Panel title="Registrar una marca"><p className="muted small-copy">La marca se envía ahora. Necesitás conexión; no se guarda para enviar más tarde. La ubicación, si está disponible, se adjunta aparte.</p>
            <div className="mark-actions" aria-busy={busy}>{actions.map((action) => <button key={action} className={`mark-action ${action === 'INGRESO' || action === 'EGRESO' ? 'mark-action-primary' : ''}`} disabled={busy} onClick={() => void mark(action)}><span>{action === 'INGRESO' ? '→' : action === 'EGRESO' ? '←' : '◷'}</span><strong>{actionLabel[action]}</strong><small>{busy && pendingAttempt?.action === action ? 'Enviando al servidor…' : 'Enviar marca'}</small></button>)}</div>
            {busy && pendingAttempt && !receipt && <p role="status" aria-live="polite" aria-atomic="true">Enviando {actionLabel[pendingAttempt.action]} al servidor. La marca todavía no está confirmada.</p>}
            {selected.state === 'EGRESADA' && <PageMessage>Esta jornada ya fue cerrada.</PageMessage>}
          </Panel>
        </>}
      </>}
      <Panel title="Motivos pendientes"><p className="muted small-copy">Completá el motivo del desvío. El texto solo aparece para vos y el administrador de tu empresa.</p>
        {loading ? <Loading label="Consultando motivos…" /> : loadFailed ? <Empty>No se pudieron consultar los motivos.</Empty> : deviations.filter((item) => item.status === 'MOTIVO_PENDIENTE').length === 0 ? <Empty>No tenés motivos pendientes para esta fecha.</Empty> : <div className="motive-list">{deviations.filter((item) => item.status === 'MOTIVO_PENDIENTE').map((item) => {
          const values = motiveValues[item.id] ?? { category: 'OTRA', text: '' }
          return <Fragment key={item.id}><form className="motive-card" aria-busy={savingMotive === item.id} onSubmit={(event) => void saveMotive(event, item)}><div><strong>{deviationName(item.type)}</strong><span className="status-chip">{localTime(item.createdAt, item.siteId ? sites.find((site) => site.id === item.siteId)?.timeZone : undefined)}</span></div>
            <div className="form-grid"><FormField label="Categoría"><select required value={values.category} onChange={(e) => updateMotive(item.id, { category: e.target.value })}><option value="SALUD">Salud</option><option value="TRANSPORTE">Transporte</option><option value="EMERGENCIA">Emergencia</option><option value="OTRA">Otra</option></select></FormField><FormField label="Motivo"><textarea required maxLength={4000} rows={3} value={values.text} onChange={(e) => updateMotive(item.id, { text: e.target.value })} placeholder="Contanos qué pasó…" /></FormField></div>
            <button className="button button-primary button-small" disabled={savingMotive === item.id || !values.text.trim()}>{savingMotive === item.id ? 'Guardando…' : 'Enviar motivo'}</button>
          </form>{savingMotive === item.id && <p role="status" aria-live="polite">Enviando el motivo al servidor…</p>}</Fragment>
        })}</div>}
      </Panel>
      <Panel title="Desvíos de esta fecha">{loading ? <Loading label="Consultando desvíos…" /> : loadFailed ? <Empty>No se pudieron consultar los desvíos.</Empty> : deviations.length ? <div className="deviation-list">{deviations.map((item) => <article className="deviation-card" key={item.id}><div className="deviation-symbol">!</div><div className="deviation-main"><div className="deviation-title"><strong>{deviationName(item.type)}</strong><span className="status-chip">{statusName(item.status)}</span></div>{item.category && <p className="reason-line"><b>Motivo:</b> {categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}</div></article>)}</div> : <Empty>No hay desvíos para esta fecha.</Empty>}</Panel>
    </main>
  </div>
}

function allowedActions(jornada: Jornada): MarkAction[] {
  if (jornada.state === 'EGRESADA') return []
  if (jornada.state === 'NO_INGRESO') return ['INGRESO']
  if (jornada.state === 'PAUSA_ABIERTA') {
    const last = [...jornada.marks].sort((a, b) => b.sequence - a.sequence)[0]
    if (last?.action === 'SALIDA_DESAYUNO') return ['VUELTA_DESAYUNO']
    if (last?.action === 'SALIDA_ALMUERZO') return ['VUELTA_ALMUERZO']
    return []
  }
  const actions: MarkAction[] = ['EGRESO']
  const marked = new Set(jornada.marks.map((mark) => mark.action))
  if (!marked.has('SALIDA_DESAYUNO')) actions.unshift('SALIDA_DESAYUNO')
  if (!marked.has('SALIDA_ALMUERZO')) actions.unshift('SALIDA_ALMUERZO')
  return actions
}
function deviationName(type: Deviation['type']) { return ({ SIN_INGRESO: 'Sin ingreso', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Egreso temprano', EGRESO_TARDIO: 'Egreso tardío', MARCA_FALTANTE: 'Egreso sin marcar', EXCESO_DESAYUNO: 'Exceso de desayuno', EXCESO_ALMUERZO: 'Exceso de almuerzo' } as const)[type] }
function statusName(status: Deviation['status']) { return ({ MOTIVO_PENDIENTE: 'Falta motivo', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado' } as const)[status] }
function categoryName(category: NonNullable<Deviation['category']>) { return ({ SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' } as const)[category] }
