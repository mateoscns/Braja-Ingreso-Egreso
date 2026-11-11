// The «Hoy» container (section 'jornadas'): the list of a date and the detail of a day with its mark changes, with its time
// helpers, and where the focus goes when a part of the day opens or closes. Loading days is «Días de trabajo» (WorkDaysView).
// The search of earlier days keeps its own state (AdminHistory); it gets the people and locals read here and opens a day
// found through openDetail, so that day has the same actions as one of the list.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, queryString } from '../../shared/api/client'
import type { Employee, Jornada, JornadaAudit, Mark, MarkAction, Site } from '../../shared/api/types'
import { useWideTable } from '../../app/useBreakpoint'
import { CANCEL_BUTTON_ID, CANCEL_FORM_ID, DETAIL_HEADING_ID, DETAIL_ID, FORGOTTEN_FORM_ID, JourneysViewRender, markButtonId, markFormId, markMessageKey, type JourneyRow } from './JourneysViewRender'
import { errText } from './adminShared'
import { AdminHistory } from './AdminHistory'

/** What takes the focus once the screen shows it: the day just opened (its title), a form just opened (its first field), or
    the button that opened a form that closed. */
type Reveal = { kind: 'detail' } | { kind: 'form'; id: string } | { kind: 'trigger'; id: string }

/** Brings an opened part into view and moves the focus into it. Kept to this screen: slice F1 makes one for the whole app. */
function revealAndFocus(part: HTMLElement, focusTarget: HTMLElement, block: ScrollLogicalPosition = 'nearest') {
  const reduced = typeof window.matchMedia === 'function' && Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
  if (typeof part.scrollIntoView === 'function') part.scrollIntoView({ block, behavior: reduced ? 'auto' : 'smooth' })
  // The scroll above already placed the part; letting focus scroll too would cut a smooth scroll short.
  focusTarget.focus({ preventScroll: true })
}

const dateInBrowserZone = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
// The server reuses the employee mark-order codes on ADMIN forms; there they mean the typed time or action breaks the jornada order.
const MARK_ORDER_CODES = new Set(['INVALID_MARK_ORDER', 'INVALID_MARK_HISTORY', 'INVALID_MARK_TRANSITION'])
const markFormErrText = (error: unknown) => MARK_ORDER_CODES.has((error as { code?: string } | null)?.code ?? '')
  ? 'La hora o la acción no encajan con las demás marcas del día. Revisá el orden.'
  : errText(error)
function dateTimeParts(value: string, timeZone: string) {
  const entries = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value))
  return Object.fromEntries(entries.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function instantForSiteTime(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const desired = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0) }
  const target = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second)
  if (new Date(target).getUTCFullYear() !== desired.year || new Date(target).getUTCMonth() + 1 !== desired.month || new Date(target).getUTCDate() !== desired.day) return null
  try {
    const candidates = new Set<number>()
    for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
      const sample = target + hours * 60 * 60 * 1000
      const parts = dateTimeParts(new Date(sample).toISOString(), timeZone)
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
      const candidate = target - (asUtc - sample)
      const final = dateTimeParts(new Date(candidate).toISOString(), timeZone)
      if (final.year === desired.year && final.month === desired.month && final.day === desired.day && final.hour === desired.hour && final.minute === desired.minute && final.second === desired.second) candidates.add(candidate)
    }
    if (candidates.size !== 1) return null
    return new Date([...candidates][0]).toISOString()
  } catch { return null }
}

function siteTimeInput(value: string, timeZone: string): string {
  try {
    const parts = dateTimeParts(value, timeZone)
    // Minutes only: the time inputs have no seconds, and a value with seconds would fail the browser's step check.
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  } catch { return '' }
}

/** A jornada to open on arrival (from a deviation in Bandeja); forgottenAction preselects the mark that is missing. */
export type OpenJornadaRequest = { jornadaId: string; forgottenAction?: MarkAction }

/** searchOpen: the old address of «Historial» was followed, so the search of earlier days opens. */
export function JourneysView({ openJornada, searchOpen = false }: { openJornada?: OpenJornadaRequest; searchOpen?: boolean } = {}) {
  const [employees, setEmployees] = useState<Employee[]>([]); const [sites, setSites] = useState<Site[]>([])
  const [jornadas, setJornadas] = useState<JourneyRow[]>([]); const [loading, setLoading] = useState(true); const [journeysLoading, setJourneysLoading] = useState(false); const [journeysDate, setJourneysDate] = useState(''); const [journeysError, setJourneysError] = useState(''); const [dependencyError, setDependencyError] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [detail, setDetail] = useState<Jornada | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [markBusy, setMarkBusy] = useState('')
  // detailFor: the day asked for, whose row holds the detail. messageAt: the form whose result or error is shown (see markMessageKey).
  const [detailFor, setDetailFor] = useState(''); const [messageAt, setMessageAt] = useState('')
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [date, setDate] = useState(dateInBrowserZone); const [dateError, setDateError] = useState('')
  const narrow = !useWideTable()
  const journeyRequest = useRef(0)
  const detailRequest = useRef(0)
  const [forgotAction, setForgotAction] = useState<MarkAction>('INGRESO'); const [forgotOccurredAt, setForgotOccurredAt] = useState(''); const [forgotReason, setForgotReason] = useState('')
  const [editingMarkId, setEditingMarkId] = useState(''); const [correctedAction, setCorrectedAction] = useState<MarkAction>('INGRESO'); const [correctedOccurredAt, setCorrectedOccurredAt] = useState(''); const [correctionReason, setCorrectionReason] = useState('')
  // Cancelling a jornada (D-20261027-07) and voiding a mark (D-20261027-08) both ask for a reason in a second, confirming step.
  const [cancelOpen, setCancelOpen] = useState(false); const [cancelReason, setCancelReason] = useState('')
  const [voidingMarkId, setVoidingMarkId] = useState(''); const [voidReason, setVoidReason] = useState('')
  // Change history (issue #60): collapsed by default and loaded only when the ADMIN opens it; auditFor is the open jornada.
  const [auditFor, setAuditFor] = useState(''); const [audit, setAudit] = useState<JornadaAudit | null>(null); const [auditLoading, setAuditLoading] = useState(false); const [auditError, setAuditError] = useState('')
  const auditRequest = useRef(0)
  async function loadAudit(jornadaId: string) {
    const requestId = ++auditRequest.current
    setAudit(null); setAuditError(''); setAuditLoading(true)
    try {
      const result = await api.get<JornadaAudit>(`/admin/jornadas/${encodeURIComponent(jornadaId)}/audit`)
      if (requestId === auditRequest.current) setAudit(result)
    } catch (reason) {
      if (requestId === auditRequest.current) setAuditError(errText(reason))
    } finally { if (requestId === auditRequest.current) setAuditLoading(false) }
  }
  function closeAudit() { auditRequest.current += 1; setAuditFor(''); setAudit(null); setAuditError(''); setAuditLoading(false) }
  function toggleAudit() {
    if (!detail) return
    if (auditFor === detail.id) { closeAudit(); return }
    setAuditFor(detail.id); void loadAudit(detail.id)
  }
  async function loadJourneys(requestedDate = date, preserveNotice = false) {
    const requestId = ++journeyRequest.current
    detailRequest.current += 1
    setJourneysLoading(true); setJourneysError(''); setError(''); if (!preserveNotice) setNotice(''); setDetail(null); setDetailFor(''); setDetailLoading(false)
    try {
      const rows = await api.get<JourneyRow[]>(`/jornadas${queryString({ from: requestedDate, to: requestedDate })}`)
      if (requestId !== journeyRequest.current) return
      setJornadas(rows); setJourneysDate(requestedDate)
    } catch (reason) {
      if (requestId !== journeyRequest.current) return
      setJornadas([]); setJourneysDate(requestedDate); setJourneysError(errText(reason))
    } finally { if (requestId === journeyRequest.current) setJourneysLoading(false) }
  }
  async function loadDependencies(requestedDate: string) {
    setLoading(true); setDependencyError(''); setError('')
    try {
      // Schedules are not read here: only the loading of days («Días de trabajo») chooses one.
      const [people, availableSites] = await Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites')])
      setEmployees(people); setSites(availableSites)
    } catch (reason) { setDependencyError(errText(reason)) }
    finally { setLoading(false) }
    await loadJourneys(requestedDate)
  }
  /** From a deviation: the list opens on the jornada's own date with its detail, and the missing mark preselected. */
  async function openRequested(request: OpenJornadaRequest) {
    let target = date
    try {
      target = (await api.get<Jornada>(`/jornadas/${encodeURIComponent(request.jornadaId)}`)).localDate
      setDate(target)
    } catch { /* The list stays on today; showDetail below reports the failure. */ }
    await loadDependencies(target)
    if (request.forgottenAction) setForgotAction(request.forgottenAction)
    await openDetail(request.jornadaId)
  }
  useEffect(() => { if (openJornada) void openRequested(openJornada); else void loadDependencies(date) }, [])
  // Runs once what was asked for is on screen: the day read, no request running (a busy button cannot take the focus).
  useEffect(() => {
    if (!reveal || !detail || detailLoading || markBusy !== '') return
    setReveal(null)
    const heading = document.getElementById(DETAIL_HEADING_ID)
    if (reveal.kind === 'detail') {
      const section = document.getElementById(DETAIL_ID)
      if (section && heading) revealAndFocus(section, heading, 'start')
      return
    }
    const target = document.getElementById(reveal.id)
    if (reveal.kind === 'form') {
      const field = target?.querySelector<HTMLElement>('select, input, textarea')
      if (target && field) revealAndFocus(target, field)
      return
    }
    // A button can leave with what it changed (a voided mark, a cancelled day): the day's title takes the focus then, where
    // it is, so the result next to the mark stays in view.
    if (target instanceof HTMLButtonElement && !target.disabled) revealAndFocus(target, target)
    else heading?.focus({ preventScroll: true })
  }, [reveal, detail, detailLoading, markBusy])
  /** refreshAudit: after a change made from the detail, an open history is reloaded; opening a jornada starts it collapsed. */
  async function showDetail(jornadaId: string, refreshAudit = false) {
    const requestId = ++detailRequest.current
    if (refreshAudit && auditFor === jornadaId) void loadAudit(jornadaId)
    else closeAudit()
    setDetail(null); setDetailFor(jornadaId); setCancelOpen(false); setCancelReason(''); setVoidingMarkId(''); setVoidReason('')
    setDetailLoading(true); setError('')
    try {
      const jornada = await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`)
      if (requestId === detailRequest.current) setDetail(jornada)
    } catch (reason) {
      if (requestId === detailRequest.current) { setMessageAt('detail'); setError(errText(reason)) }
    } finally { if (requestId === detailRequest.current) setDetailLoading(false) }
  }
  /** «Ver marcas», or a day opened from Bandeja: the day opens in its row, comes into view and its title takes the focus. */
  async function openDetail(jornadaId: string) {
    setReveal({ kind: 'detail' })
    await showDetail(jornadaId)
  }
  const detailSite = detail ? sites.find((site) => site.id === detail.siteId) : undefined
  // Without the site's zone a typed time cannot be converted safely; the device zone would silently shift it.
  const detailTimeZone = detailSite?.timeZone
  async function addForgottenMark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || !detailTimeZone) return
    const occurredAt = instantForSiteTime(forgotOccurredAt, detailTimeZone)
    setMessageAt('forgotten')
    if (!occurredAt) { setError('Esa hora no existe en la zona horaria del local. Revisá la fecha y la hora.'); return }
    if (!forgotReason.trim()) { setError('Escribí por qué agregás la marca.'); return }
    setMarkBusy('forgotten'); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/jornadas/${encodeURIComponent(detail.id)}/forgotten-marks`, { action: forgotAction, occurredAt, auditReason: forgotReason.trim() })
      // The day is read again and its button reads «Guardando…» meanwhile: the focus goes back into the form afterwards.
      setForgotOccurredAt(''); setForgotReason(''); setNotice('Marca agregada.'); setReveal({ kind: 'form', id: FORGOTTEN_FORM_ID }); await showDetail(detail.id, true)
    } catch (reason) { setError(markFormErrText(reason)) } finally { setMarkBusy('') }
  }
  function beginMarkCorrection(mark: Mark) {
    if (!detailTimeZone) return
    setVoidingMarkId(''); setEditingMarkId(mark.id); setCorrectedAction(mark.action); setCorrectedOccurredAt(siteTimeInput(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)); setCorrectionReason('')
    setReveal({ kind: 'form', id: markFormId('correct', mark.id) })
  }
  async function correctMark(event: FormEvent<HTMLFormElement>, mark: Mark) {
    event.preventDefault()
    if (!detail || !detailTimeZone) return
    const correctedAt = instantForSiteTime(correctedOccurredAt, detailTimeZone)
    setMessageAt(markMessageKey('correct', mark.id))
    if (!correctedAt) { setError('Esa hora no existe en la zona horaria del local. Revisá la fecha y la hora.'); return }
    if (!correctionReason.trim()) { setError('Escribí el motivo de corrección.'); return }
    setMarkBusy(mark.id); setError(''); setNotice('')
    try {
      await api.post<Mark>(`/admin/marks/${encodeURIComponent(mark.id)}/correction`, { correctedAction, correctedOccurredAt: correctedAt, auditReason: correctionReason.trim() })
      setEditingMarkId(''); setCorrectionReason(''); setNotice('Marca corregida.'); setReveal({ kind: 'trigger', id: markButtonId('correct', mark.id) }); await showDetail(detail.id, true)
    } catch (reason) { setError(markFormErrText(reason)) } finally { setMarkBusy('') }
  }
  function cancelMarkCorrection() { setReveal({ kind: 'trigger', id: markButtonId('correct', editingMarkId) }); setEditingMarkId('') }
  function beginVoid(mark: Mark) { setEditingMarkId(''); setVoidingMarkId(mark.id); setVoidReason(''); setReveal({ kind: 'form', id: markFormId('void', mark.id) }) }
  function abortVoid() { setReveal({ kind: 'trigger', id: markButtonId('void', voidingMarkId) }); setVoidingMarkId(''); setVoidReason('') }
  async function voidMark(event: FormEvent<HTMLFormElement>, mark: Mark) {
    event.preventDefault()
    if (!detail) return
    setMessageAt(markMessageKey('void', mark.id))
    if (!voidReason.trim()) { setError('Escribí el motivo de anulación.'); return }
    setMarkBusy(mark.id); setError(''); setNotice('')
    // On success the mark is voided and loses its buttons: the focus falls back to the day's title.
    const back: Reveal = { kind: 'trigger', id: markButtonId('void', mark.id) }
    try {
      await api.post<Mark>(`/admin/marks/${encodeURIComponent(mark.id)}/void`, { reason: voidReason.trim() })
      setVoidingMarkId(''); setVoidReason(''); setNotice('Marca anulada.'); setReveal(back); await showDetail(detail.id, true)
    } catch (reason) {
      // A retry whose first attempt committed (response lost) answers MARK_VOIDED: the void is done, show it as done.
      if ((reason as { code?: string } | null)?.code === 'MARK_VOIDED') {
        setVoidingMarkId(''); setVoidReason(''); setNotice('La marca ya estaba anulada.'); setReveal(back); await showDetail(detail.id, true)
        return
      }
      // The server reuses INVALID_MARK_HISTORY; for a void it means the marks left would not form a valid jornada.
      setError((reason as { code?: string } | null)?.code === 'INVALID_MARK_HISTORY'
        ? 'No se puede anular esa marca: las marcas que quedan no forman un día válido (por ejemplo, una entrada con marcas posteriores). Anulá o corregí antes las posteriores.'
        : errText(reason))
    } finally { setMarkBusy('') }
  }
  async function cancelJornada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    setMessageAt('cancel')
    if (!cancelReason.trim()) { setError('Escribí el motivo de cancelación.'); return }
    const jornadaId = detail.id
    setMarkBusy('cancel'); setError(''); setNotice('')
    // A cancelled day has no «Cancelar jornada» button: the focus falls back to the day's title.
    const back: Reveal = { kind: 'trigger', id: CANCEL_BUTTON_ID }
    try {
      await api.post(`/admin/jornadas/${encodeURIComponent(jornadaId)}/cancellation`, { reason: cancelReason.trim() })
      setCancelOpen(false); setCancelReason(''); setNotice('Día cancelado.'); setReveal(back)
      await loadJourneys(date, true); await showDetail(jornadaId, true)
    } catch (reason) {
      // A retry whose first attempt committed answers JORNADA_CANCELLED: the cancellation is done, show it as done.
      if ((reason as { code?: string } | null)?.code === 'JORNADA_CANCELLED') {
        setCancelOpen(false); setCancelReason(''); setNotice('El día ya estaba cancelado.'); setReveal(back)
        await loadJourneys(date, true); await showDetail(jornadaId, true)
      } else setError(errText(reason))
    } finally { setMarkBusy('') }
  }
  function changeDate(value: string) {
    setDate(value)
    if (!value) {
      journeyRequest.current += 1; detailRequest.current += 1
      setDateError('Elegí una fecha para ver los días cargados.'); setJornadas([]); setJourneysError(''); setJourneysLoading(false); setDetail(null); setDetailFor(''); setDetailLoading(false)
      return
    }
    setDateError('')
    void loadJourneys(value)
  }
  const peopleById = useMemo(() => new Map(employees.map((person) => [person.id, person.displayName])), [employees])
  const daySearch = <AdminHistory employees={employees} sites={sites} loadingOptions={loading} opening={detailLoading} openOnArrival={searchOpen} onOpenDay={(id) => void openDetail(id)} />
  return <JourneysViewRender daySearch={daySearch} narrow={narrow} sites={sites} jornadas={jornadas} loading={loading} journeysLoading={journeysLoading} journeysDate={journeysDate} journeysError={journeysError} dependencyError={dependencyError} error={error} notice={notice} messageAt={messageAt} detail={detail} detailFor={detailFor} detailLoading={detailLoading} markBusy={markBusy} date={date} peopleById={peopleById} dateError={dateError} detailSite={detailSite} detailTimeZone={detailTimeZone} forgotAction={forgotAction} forgotOccurredAt={forgotOccurredAt} forgotReason={forgotReason} editingMarkId={editingMarkId} correctedAction={correctedAction} correctedOccurredAt={correctedOccurredAt} correctionReason={correctionReason}
    cancelOpen={cancelOpen} cancelReason={cancelReason} voidingMarkId={voidingMarkId} voidReason={voidReason}
    auditOpen={Boolean(detail) && auditFor === detail?.id} audit={audit} auditLoading={auditLoading} auditError={auditError} onToggleAudit={toggleAudit} onRetryAudit={() => { if (auditFor) void loadAudit(auditFor) }}
    onBeginCancel={() => { setCancelOpen(true); setCancelReason(''); setReveal({ kind: 'form', id: CANCEL_FORM_ID }) }} onCancelReasonChange={setCancelReason} onConfirmCancel={(event) => void cancelJornada(event)} onAbortCancel={() => { setCancelOpen(false); setCancelReason(''); setReveal({ kind: 'trigger', id: CANCEL_BUTTON_ID }) }}
    onBeginVoid={beginVoid} onVoidReasonChange={setVoidReason} onConfirmVoid={(event, mark) => void voidMark(event, mark)} onAbortVoid={abortVoid}
    onDateChange={changeDate} onRetryDependencies={() => void loadDependencies(date)} onReloadJourneys={() => void loadJourneys(date)} onShowDetail={(id) => void openDetail(id)}
    onForgotActionChange={setForgotAction} onForgotOccurredAtChange={setForgotOccurredAt} onForgotReasonChange={setForgotReason} onAddForgottenMark={(event) => void addForgottenMark(event)} onBeginMarkCorrection={beginMarkCorrection} onCorrectedActionChange={setCorrectedAction} onCorrectedOccurredAtChange={setCorrectedOccurredAt} onCorrectionReasonChange={setCorrectionReason} onCorrectMark={(event, mark) => void correctMark(event, mark)} onCancelMarkCorrection={cancelMarkCorrection} />
}
