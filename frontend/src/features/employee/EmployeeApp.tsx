import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AppHeader, CompanySwitcher, LoadFailure, Loading, Panel } from '../../app/ui'
import { useSession } from '../../app/session'
import { ApiError, api } from '../../shared/api/client'
import type { Deviation, Jornada, Mark, Site } from '../../shared/api/types'
import { createMarkAttempt, submitMark, type LocationResult, type MarkAction, type MarkAttempt } from './markFlow'
import { loadEmployeeDayData, loadPendingMotives, PENDING_MOTIVES_LIMIT } from './dayData'
import { InstallControl } from '../../device/pwa/InstallControl'
import { formatLocalDate } from '../../shared/format'
import { daySentence, exitConfirmation, markOptions, type LocationOutcome } from './employeeDay'
import { loadFailureMessage, markFailureMessage, motiveFailureMessage } from './employeeMessages'
import { LOCATION_NOTICE, locationNoticeSeen, rememberLocationNotice, skipNoticeIfLocationGranted } from './locationNotice'
import { noteMarkInterrupted } from '../auth/interruptedMark'
import {
  DayHeading, DayMarksPanel, JourneyPicker, MarkFeedback, MotivePanel, NowBlock, OtherDayPanel,
  type MarkConfirmation, type MarkStep, type MotiveErrors, type MotiveValues
} from './EmployeeViews'

/** A failed mark whose result is unknown: if a new mark of that action shows up on refresh, it did arrive. */
type FailedMark = { attempt: MarkAttempt; knownMarkIds: string[] }

const CLOCK_TICK_MS = 30_000

function outcomeOf(status: Mark['locationStatus']): LocationOutcome | null {
  if (status === 'RECIBIDA') return 'SENT'
  if (status === 'PENDIENTE') return 'PENDING'
  if (status === 'SIN_UBICACION') return 'MISSING'
  return null
}

export function EmployeeApp() {
  const { session, signOut, activateCompany } = useSession()
  const active = session?.memberships.find((membership) => membership.companyId === session.activeCompanyId)
  const [date, setDate] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [deviations, setDeviations] = useState<Deviation[]>([])
  const [pendingMotives, setPendingMotives] = useState<Deviation[]>([])
  const [pendingTruncated, setPendingTruncated] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [pendingRetrying, setPendingRetrying] = useState(false)
  const [editingMotives, setEditingMotives] = useState<string[]>([])
  /**
   * «Para explicar» goes above the marks while something waits for a motive (the owner, 2026-11-11). Once there it stays until
   * the day is loaded again: sending the last motive does not move the section, its confirmation and the focus away.
   */
  const [motivesFirst, setMotivesFirst] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [markError, setMarkError] = useState('')
  const [confirmation, setConfirmation] = useState<MarkConfirmation | null>(null)
  const [pendingAttempt, setPendingAttempt] = useState<MarkAttempt | null>(null)
  const [failedMark, setFailedMark] = useState<FailedMark | null>(null)
  const [step, setStep] = useState<MarkStep | null>(null)
  const [motiveValues, setMotiveValues] = useState<Record<string, MotiveValues>>({})
  const [motiveErrors, setMotiveErrors] = useState<Record<string, MotiveErrors>>({})
  const [motiveNotice, setMotiveNotice] = useState('')
  const [savingMotive, setSavingMotive] = useState('')
  const [markFailed, setMarkFailed] = useState(false)
  const [feedbackFocus, setFeedbackFocus] = useState(0)
  const [stepFocus, setStepFocus] = useState(0)
  const loadSequence = useRef(0)
  const pendingSequence = useRef(0)
  const markSequence = useRef(0)
  const markInFlight = useRef(false)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef<HTMLDivElement>(null)
  /** Location results known on this device before the server list shows them (it still says PENDIENTE for a moment). */
  const knownLocations = useRef(new Map<string, Mark['locationStatus']>())
  // Buttons are disabled while a mark is in flight, so focus moves to the outcome once it is known.
  useEffect(() => { if (feedbackFocus) feedbackRef.current?.focus() }, [feedbackFocus])
  useEffect(() => { if (stepFocus) stepRef.current?.focus() }, [stepFocus])
  useEffect(() => { skipNoticeIfLocationGranted() }, [])
  // A 401 while a mark is being sent means it was not saved; the login screen says so (the session listener unmounts this view).
  useEffect(() => api.onSessionExpired(() => { if (markInFlight.current) noteMarkInterrupted() }), [])
  // The suggested mark and the pause limit depend on the time of day.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  function withKnownLocations(jornada: Jornada): Jornada {
    if (!jornada.marks.some((mark) => mark.locationStatus === 'PENDIENTE' && knownLocations.current.has(mark.id))) return jornada
    return { ...jornada, marks: jornada.marks.map((mark) => mark.locationStatus === 'PENDIENTE' && knownLocations.current.has(mark.id) ? { ...mark, locationStatus: knownLocations.current.get(mark.id)! } : mark) }
  }

  async function load(): Promise<Jornada[] | null> {
    const requestId = ++loadSequence.current
    setLoading(true); setLoadFailed(false); setLoadError(''); setMarkError(''); setConfirmation(null); setMarkFailed(false); setStep(null)
    setMotiveNotice(''); setMotiveErrors({}); setNow(new Date())
    try {
      const availableSites = await api.get<Site[]>('/sites')
      const dayData = await loadEmployeeDayData(api, availableSites, date)
      if (requestId !== loadSequence.current) return null
      const loaded = dayData.jornadas.map(withKnownLocations)
      setSites(availableSites); setJornadas(loaded)
      // A cancelled jornada stays listed, but the first one that still accepts marks is selected by default.
      setSelectedId((current) => loaded.some((jornada) => jornada.id === current) ? current
        : (loaded.find((jornada) => jornada.state !== 'CANCELADA') ?? loaded[0])?.id ?? '')
      setDeviations(dayData.deviations); setEditingMotives([])
      applyPendingMotives(dayData.pendingMotives, dayData.pendingMotivesTruncated, dayData.pendingMotivesError)
      setMotivesFirst(dayData.pendingMotives.length > 0)
      return loaded
    } catch (reason) {
      if (requestId === loadSequence.current) { setLoadFailed(true); setLoadError(loadFailureMessage(reason)) }
      return null
    }
    finally { if (requestId === loadSequence.current) setLoading(false) }
  }
  /** Applies a pending-motives result; any retry still in flight becomes stale. */
  function applyPendingMotives(items: Deviation[], truncated: boolean, failure: string) {
    pendingSequence.current += 1
    setPendingMotives(items); setPendingTruncated(truncated); setPendingError(failure); setPendingRetrying(false)
    if (items.length) setMotivesFirst(true)
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
        setPendingError(loadFailureMessage(reason, 'Probá otra vez en un rato.'))
      }
    }
  }
  useEffect(() => {
    if (!session?.activeCompanyId) return
    void load()
  }, [date, session?.activeCompanyId])
  const selected = jornadas.find((jornada) => jornada.id === selectedId)
  const selectedSite = sites.find((site) => site.id === selected?.siteId)
  if (!session || !active) return null
  const zone = selectedSite?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const options = selected ? markOptions(selected, zone, now) : null

  function openStep(next: MarkStep) { setStep(next); setStepFocus((count) => count + 1) }

  /** Early exit asks first; the first mark of the session explains the location; then the mark is sent. */
  function startMark(action: MarkAction, exitConfirmed = false) {
    if (markInFlight.current) return
    const retrying = pendingAttempt?.jornadaId === selectedId && pendingAttempt.action === action
    if (action === 'EGRESO' && !exitConfirmed && !retrying && selected) {
      const question = exitConfirmation(selected, zone, new Date())
      if (question) { openStep({ kind: 'exit', action, text: question }); return }
    }
    if (!locationNoticeSeen()) { openStep({ kind: 'location', action, text: LOCATION_NOTICE }); return }
    setStep(null)
    void mark(action)
  }
  function confirmStep() {
    if (!step) return
    if (step.kind === 'exit') { startMark(step.action, true); return }
    rememberLocationNotice(); setStep(null)
    void mark(step.action)
  }

  function applyLocation(markId: string, result: LocationResult) {
    knownLocations.current.set(markId, result === 'SENT' ? 'RECIBIDA' : 'SIN_UBICACION')
    setConfirmation((current) => current && current.markId === markId && current.location !== 'SENT' ? { ...current, location: result === 'SENT' ? 'SENT' : 'MISSING' } : current)
    setJornadas((current) => current.map(withKnownLocations))
  }

  async function mark(action: MarkAction) {
    if (markInFlight.current) return
    markInFlight.current = true
    const jornadaId = selectedId
    const knownMarkIds = (jornadas.find((jornada) => jornada.id === jornadaId)?.marks ?? []).map((item) => item.id)
    const markRequest = ++markSequence.current
    setBusy(true); setMarkError(''); setConfirmation(null); setMarkFailed(false); setFailedMark(null); setStep(null)
    const attempt = pendingAttempt?.jornadaId === jornadaId && pendingAttempt.action === action ? pendingAttempt : createMarkAttempt(jornadaId, action)
    setPendingAttempt(attempt)
    // The location may settle before submitMark returns; it is applied once the mark id is known.
    const located: { markId: string; early: LocationResult | null } = { markId: '', early: null }
    const onLocation = (result: LocationResult) => { if (located.markId) applyLocation(located.markId, result); else located.early = result }
    try {
      const receipt = await submitMark(api, attempt, undefined, onLocation)
      located.markId = receipt.id
      setConfirmation({ markId: receipt.id, action, acceptedAt: receipt.acceptedAt, location: receipt.locationStatus === 'RECIBIDA' ? 'SENT' : 'PENDING' })
      if (located.early) applyLocation(receipt.id, located.early)
      setPendingAttempt(null)
      try {
        const refreshed = withKnownLocations(await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`))
        setJornadas((current) => current.map((item) => item.id === refreshed.id ? refreshed : item))
      } catch { /* La marca confirmada sigue valiendo aunque falle la actualización de pantalla. */ }
      try {
        const refreshedDay = await loadEmployeeDayData(api, sites, date)
        setDeviations(refreshedDay.deviations)
        // A failed background refresh keeps the pending list already on screen.
        if (!refreshedDay.pendingMotivesError) applyPendingMotives(refreshedDay.pendingMotives, refreshedDay.pendingMotivesTruncated, '')
      } catch { /* La marca no depende de actualizar la bandeja. */ }
    } catch (reason) {
      setMarkError(markFailureMessage(reason)); setMarkFailed(true)
      // That key is bound to other content on the server; the next try needs a new one.
      const conflict = reason instanceof ApiError && reason.code === 'IDEMPOTENCY_CONFLICT'
      if (conflict) setPendingAttempt(null)
      const failed = conflict ? null : { attempt, knownMarkIds }
      setFailedMark(failed)
      void refreshAfterFailedMark(jornadaId, markRequest, failed)
    }
    finally { markInFlight.current = false; setBusy(false); setFeedbackFocus((count) => count + 1) }
  }

  /** When the failed mark shows up in the refreshed day, it did arrive: the error becomes its confirmation. */
  function showArrivedMark(jornada: Jornada, failed: FailedMark): void {
    const arrived = jornada.marks.find((item) => !item.voided && item.action === failed.attempt.action && !failed.knownMarkIds.includes(item.id))
    if (!arrived) return
    setConfirmation({ markId: arrived.id, action: arrived.action, acceptedAt: arrived.acceptedAt, location: outcomeOf(arrived.locationStatus) })
    setMarkError(''); setMarkFailed(false); setPendingAttempt(null); setFailedMark(null)
  }

  /** Not awaited: buttons are released right away and the next action follows the server state when it arrives. */
  async function refreshAfterFailedMark(jornadaId: string, markRequest: number, failed: FailedMark | null) {
    const loadRequest = loadSequence.current
    try {
      const refreshed = withKnownLocations(await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`))
      if (markRequest !== markSequence.current || loadRequest !== loadSequence.current) return
      setJornadas((current) => current.map((item) => item.id === refreshed.id ? refreshed : item))
      if (failed) showArrivedMark(refreshed, failed)
    } catch { /* "Actualizar" queda disponible para reintentar la consulta. */ }
  }

  async function refreshAfterUnknown() {
    const failed = failedMark
    const loaded = await load()
    const jornada = failed && loaded?.find((item) => item.id === failed.attempt.jornadaId)
    if (failed && jornada) showArrivedMark(jornada, failed)
  }

  /** Removes the given errors of one motive form (all of them by default); the form's entry goes once it has none left. */
  function clearMotiveError(id: string, fields: (keyof MotiveErrors)[] = ['category', 'text', 'form']) {
    setMotiveErrors((current) => {
      const entry = current[id]
      if (!entry || !fields.some((field) => entry[field])) return current
      const rest = { ...entry }
      for (const field of fields) delete rest[field]
      const next = { ...current }
      if (rest.category || rest.text || rest.form) next[id] = rest; else delete next[id]
      return next
    })
  }
  function updateMotive(id: string, patch: Partial<MotiveValues>) {
    setMotiveValues((current) => ({ ...current, [id]: { category: current[id]?.category ?? '', text: current[id]?.text ?? '', ...patch } }))
    // Editing a field removes its own error and the server's answer; the other field keeps its error until the next submit.
    clearMotiveError(id, [...(Object.keys(patch) as (keyof MotiveValues)[]), 'form'])
  }
  async function saveMotive(event: FormEvent, item: Deviation) {
    event.preventDefault()
    const values = motiveValues[item.id] ?? { category: '', text: '' }
    // Every field is checked at once, so both errors show together (design system 4.7).
    const found: MotiveErrors = {}
    if (!values.category) found.category = 'Elegí una de las opciones.'
    if (!values.text.trim()) found.text = 'Contá en pocas palabras qué pasó.'
    if (found.category || found.text) { setMotiveErrors((current) => ({ ...current, [item.id]: found })); return }
    setSavingMotive(item.id); setMotiveNotice(''); clearMotiveError(item.id)
    try {
      const updated = await api.put<Deviation>(`/deviations/${encodeURIComponent(item.id)}/motive`, { category: values.category, text: values.text.trim() })
      setDeviations((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setPendingMotives((current) => current.filter((entry) => entry.id !== item.id))
      setEditingMotives((current) => current.filter((id) => id !== item.id))
      setMotiveValues((current) => { const next = { ...current }; delete next[item.id]; return next })
      setMotiveNotice('Lo enviamos. Tu encargado lo va a revisar.')
    } catch (reason) {
      // What the employee typed stays in the card.
      setMotiveErrors((current) => ({ ...current, [item.id]: { form: motiveFailureMessage(reason) } }))
    }
    finally { setSavingMotive('') }
  }
  /** D-20261027-02: a motive can be corrected until the ADMIN classifies; a deviation classified without motive accepts its first one. */
  function startMotiveEdit(item: Deviation) {
    setMotiveValues((current) => ({ ...current, [item.id]: { category: item.category ?? '', text: item.motiveText ?? '' } }))
    setEditingMotives((current) => current.includes(item.id) ? current : [...current, item.id])
    setMotiveNotice('')
  }
  function cancelMotiveEdit(id: string) {
    setEditingMotives((current) => current.filter((entry) => entry !== id))
    setMotiveValues((current) => { const next = { ...current }; delete next[id]; return next })
    clearMotiveError(id)
  }
  const name = session.displayName?.trim() || (session.dni ? `DNI ${session.dni}` : 'bienvenido')
  const sentence = loading || loadFailed ? ''
    : date ? `Estás viendo el ${formatLocalDate(date)}.${jornadas.length ? '' : ' Ese día no tenés un día de trabajo cargado.'}`
    : daySentence(selected, zone, now)
  const motivePanel = <MotivePanel key="motives" loading={loading} loadFailed={loadFailed} pendingError={pendingError} retrying={pendingRetrying} truncated={pendingTruncated}
    limit={PENDING_MOTIVES_LIMIT} items={pendingMotives} deviations={deviations} notice={motiveNotice} jornadas={jornadas} sites={sites} values={motiveValues}
    errors={motiveErrors} savingId={savingMotive} editingIds={editingMotives} onChange={updateMotive} onSubmit={(event, item) => void saveMotive(event, item)}
    onCancel={cancelMotiveEdit} onRetry={() => void retryPendingMotives()} onEdit={startMotiveEdit} />
  const marksPanel = selected && <DayMarksPanel key="marks" title={date ? `Tus marcas del ${formatLocalDate(date)}` : 'Tus marcas de hoy'} jornada={selected} site={selectedSite} />
  // One keyed list, so «Para explicar» changes place without being mounted again (what is typed and the focus stay).
  const sections = loading ? [<Loading key="loading" label="Cargando tu día…" />, motivePanel]
    : loadFailed ? [<Panel key="failed" title="No pudimos cargar tu día"><LoadFailure message={loadError} primary onRetry={() => void load()} /></Panel>, motivePanel]
    : [<NowBlock key="now" sentence={sentence} jornada={selected} site={selectedSite} options={options} busy={busy} step={step} stepRef={stepRef}
      onMark={(action) => startMark(action)} onConfirmStep={confirmStep} onCancelStep={() => setStep(null)} />,
    ...(motivesFirst ? [motivePanel, marksPanel] : [marksPanel, motivePanel])]

  return <div className="app-frame employee-frame">
    <AppHeader companyName={active.companyName} name={session.displayName?.trim() || (session.dni ? `DNI ${session.dni}` : 'Empleado')} onSignOut={() => void signOut()}>
      <InstallControl audience="employee" />
      <CompanySwitcher memberships={session.memberships} activeCompanyId={active.companyId} onSelect={activateCompany} disabled={busy} />
    </AppHeader>
    <main className="employee-main">
      <DayHeading name={name} />
      {!loading && !loadFailed && jornadas.length > 1 && <JourneyPicker jornadas={jornadas} sites={sites} selectedId={selectedId} disabled={busy}
        onSelect={(id) => { setSelectedId(id); setPendingAttempt(null); setConfirmation(null); setStep(null) }} />}
      <MarkFeedback feedbackRef={feedbackRef} sending={busy} error={markError} showRefresh={markFailed && !loading} onRefresh={() => void refreshAfterUnknown()} confirmation={confirmation} timeZone={zone} />
      {sections}
      <OtherDayPanel date={date} disabled={busy} onDate={setDate} onToday={() => setDate('')} />
    </main>
  </div>
}
