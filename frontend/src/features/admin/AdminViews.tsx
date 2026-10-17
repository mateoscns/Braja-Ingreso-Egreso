import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Empty, FormField, Loading, PageMessage, Panel } from '../../app/ui'
import { api, queryString } from '../../shared/api/client'
import type { Deviation, Employee, Jornada, Mark, MarkAction, Site, Template, TemplateBlock, TemplateInput } from '../../shared/api/types'

const dateInBrowserZone = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
const dateTime = (value: string, timeZone?: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(value))
const errText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.'
const MARK_ACTIONS: MarkAction[] = ['INGRESO', 'EGRESO', 'SALIDA_DESAYUNO', 'VUELTA_DESAYUNO', 'SALIDA_ALMUERZO', 'VUELTA_ALMUERZO']

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
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`
  } catch { return '' }
}

export function AdminInbox() {
  const [items, setItems] = useState<Deviation[]>([])
  const [timeZones, setTimeZones] = useState<Map<string, string>>(new Map())
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [correction, setCorrection] = useState<{ deviationId: string; classification: DeviationClassification } | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [targetDeviation] = useState(() => new URLSearchParams(window.location.search).get('deviation') ?? '')
  const reload = async () => {
    setLoading(true); setError('')
    try {
      const [page, availableSites] = await Promise.all([
        api.get<{ items: Deviation[]; nextCursor?: string | null }>('/inbox?limit=50'),
        api.get<Site[]>('/sites').catch(() => [])
      ])
      setItems(page.items); setNextCursor(page.nextCursor ?? null); setTimeZones(new Map(availableSites.map((site) => [site.id, site.timeZone])))
    }
    catch (reason) { setError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])
  useEffect(() => {
    if (!loading && targetDeviation) document.getElementById(`deviation-${targetDeviation}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [loading, items, targetDeviation])
  async function classify(item: Deviation, classification: DeviationClassification, reason?: string) {
    setBusy(item.id); setError('')
    try {
      const updated = await api.put<Deviation>(`/admin/deviations/${encodeURIComponent(item.id)}/classification`, {
        classification, ...(reason?.trim() ? { correctionReason: reason.trim() } : {})
      })
      setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
      setCorrection(null); setCorrectionReason('')
    } catch (reason) { setError(errText(reason)) } finally { setBusy('') }
  }
  function requestClassification(item: Deviation, classification: DeviationClassification) {
    if (item.status === 'JUSTIFICADO' || item.status === 'NO_JUSTIFICADO') {
      setCorrection({ deviationId: item.id, classification }); setCorrectionReason('')
    } else void classify(item, classification)
  }
  async function loadMore() {
    if (!nextCursor) return
    setBusy('page'); setError('')
    try {
      const page = await api.get<{ items: Deviation[]; nextCursor?: string | null }>(`/inbox${queryString({ limit: 50, cursor: nextCursor })}`)
      setItems((current) => [...current, ...page.items]); setNextCursor(page.nextCursor ?? null)
    } catch (reason) { setError(errText(reason)) } finally { setBusy('') }
  }
  return <>
    <div className="page-title-row"><div><p className="eyebrow">CENTRO DE CONTROL</p><h1>Bandeja de desvíos</h1><p className="muted">Revisá motivos y resolvé cada caso. Las notificaciones no incluyen datos privados.</p></div><button className="button button-quiet" onClick={() => void reload()}>Actualizar</button></div>
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {targetDeviation && items.some((item) => item.id === targetDeviation) && <PageMessage kind="success">Abriste el desvío indicado por la notificación.</PageMessage>}
    <Panel title="Casos recientes"><DeviationList items={items} loading={loading} busy={busy} onClassify={requestClassification} targetId={targetDeviation} timeZones={timeZones}
      correction={correction} correctionReason={correctionReason} onCorrectionReasonChange={setCorrectionReason}
      onSubmitCorrection={(item) => void classify(item, correction!.classification, correctionReason)}
      onCancelCorrection={() => { setCorrection(null); setCorrectionReason('') }} />
      {nextCursor && <div className="load-more"><button className="button button-quiet" disabled={busy === 'page'} onClick={() => void loadMore()}>{busy === 'page' ? 'Cargando…' : 'Cargar anteriores'}</button></div>}
    </Panel>
  </>
}

type DeviationClassification = 'JUSTIFICADO' | 'NO_JUSTIFICADO'

function DeviationList({ items, loading, busy, onClassify, targetId, timeZones, correction, correctionReason, onCorrectionReasonChange, onSubmitCorrection, onCancelCorrection }: {
  items: Deviation[]; loading: boolean; busy?: string; onClassify?: (item: Deviation, classification: DeviationClassification) => void;
  targetId?: string; timeZones?: Map<string, string>;
  correction?: { deviationId: string; classification: DeviationClassification } | null; correctionReason?: string;
  onCorrectionReasonChange?: (reason: string) => void; onSubmitCorrection?: (item: Deviation) => void; onCancelCorrection?: () => void
}) {
  if (loading) return <Loading label="Cargando desvíos…" />
  if (!items.length) return <Empty>No hay desvíos para mostrar.</Empty>
  return <div className="deviation-list">{items.map((item) => <article className={`deviation-card ${targetId === item.id ? 'deviation-target' : ''}`} key={item.id} id={`deviation-${item.id}`}>
    <div className="deviation-symbol">{item.type === 'SIN_INGRESO' ? '!' : '↗'}</div>
    <div className="deviation-main"><div className="deviation-title"><strong>{deviationName(item.type)}</strong><span className={`status-chip status-${item.status.toLowerCase()}`}>{statusName(item.status)}</span></div>
      <p>{item.employeeDisplayName?.trim() || 'Registro de jornada'} · {dateTime(item.createdAt, item.siteId ? timeZones?.get(item.siteId) : undefined)}</p>
      {item.category && <p className="reason-line"><b>Motivo:</b> {categoryName(item.category)}{item.motiveText ? ` · ${item.motiveText}` : ''}</p>}
    </div>
    {onClassify && <div className="deviation-actions">
      {item.status === 'JUSTIFICADO' ? <button className="button button-small button-danger-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'NO_JUSTIFICADO')}>Corregir a no justificado</button> :
        item.status === 'NO_JUSTIFICADO' ? <button className="button button-small button-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'JUSTIFICADO')}>Corregir a justificado</button> : <>
          <button className="button button-small button-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'JUSTIFICADO')}>Justificado</button>
          <button className="button button-small button-danger-outline" disabled={busy === item.id} onClick={() => onClassify(item, 'NO_JUSTIFICADO')}>No justificado</button>
        </>}
      {correction?.deviationId === item.id && <form className="form-stack correction-form" onSubmit={(event) => { event.preventDefault(); onSubmitCorrection?.(item) }}>
        <FormField label="Motivo de corrección"><textarea required maxLength={2000} value={correctionReason ?? ''} onChange={(event) => onCorrectionReasonChange?.(event.target.value)} /></FormField>
        <div className="button-row"><button className="button button-small button-primary" disabled={busy === item.id || !correctionReason?.trim()}>Guardar corrección</button><button type="button" className="button button-small button-quiet" onClick={onCancelCorrection}>Cancelar</button></div>
      </form>}
    </div>}
  </article>)}</div>
}

export function SitesView() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState('America/Argentina/Buenos_Aires')
  const [busy, setBusy] = useState(false)
  async function reload() {
    setLoading(true)
    try { setSites(await api.get<Site[]>('/sites')) } catch (reason) { setError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date()) }
    catch { setError('Usá una zona horaria IANA válida, por ejemplo America/Argentina/Buenos_Aires.'); setBusy(false); return }
    try { const created = await api.post<Site>('/sites', { name: name.trim(), timeZone }); setSites((current) => [...current, created]); setName('') }
    catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  return <>
    <PageHeading eyebrow="ORGANIZACIÓN" title="Sedes" subtitle="Cada sede define su zona horaria y sus plantillas." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    <div className="content-grid"><Panel title="Sedes registradas">{loading ? <Loading /> : sites.length ? <div className="simple-list">{sites.map((site) => <div key={site.id} className="simple-row"><span className="row-avatar">⌖</span><span><strong>{site.name}</strong><small>{site.timeZone}</small></span></div>)}</div> : <Empty>Todavía no hay sedes.</Empty>}</Panel>
      <Panel title="Agregar sede"><form className="form-stack" onSubmit={submit}><FormField label="Nombre de la sede"><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Local Centro" /></FormField><FormField label="Zona horaria" hint="Usá un identificador IANA, como America/Argentina/Buenos_Aires."><input required maxLength={120} value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="America/Argentina/Buenos_Aires" /></FormField><button className="button button-primary" disabled={busy}>{busy ? 'Guardando…' : 'Crear sede'}</button></form></Panel>
    </div>
  </>
}

export function EmployeesView() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dni, setDni] = useState(''); const [displayName, setDisplayName] = useState(''); const [siteIds, setSiteIds] = useState<string[]>([])
  const [tolerance, setTolerance] = useState('5'); const [temporaryPassword, setTemporaryPassword] = useState('')
  const [editingId, setEditingId] = useState('')
  useEffect(() => { void Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites')]).then(([people, availableSites]) => { setEmployees(people); setSites(availableSites) }).catch((reason) => setError(errText(reason))).finally(() => setLoading(false)) }, [])
  function toggleSite(id: string) { setSiteIds((current) => current.includes(id) ? current.filter((siteId) => siteId !== id) : [...current, id]) }
  async function create(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const created = await api.post<Employee>('/employees', { dni: dni.trim(), displayName: displayName.trim(), siteIds, toleranceMinutes: Number(tolerance), ...(temporaryPassword ? { temporaryPassword } : {}) })
      setEmployees((current) => [...current, created]); setDni(''); setDisplayName(''); setSiteIds([]); setTolerance('5'); setTemporaryPassword('')
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  async function saveEmployee(person: Employee) {
    setBusy(true); setError('')
    try {
      const updated = await api.patch<Employee>(`/employees/${encodeURIComponent(person.id)}`, { displayName: person.displayName, siteIds: person.siteIds, toleranceMinutes: person.toleranceMinutes, active: person.active })
      setEmployees((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); setEditingId('')
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  function updateEmployee(id: string, patch: Partial<Employee>) { setEmployees((current) => current.map((person) => person.id === id ? { ...person, ...patch } : person)) }
  return <>
    <PageHeading eyebrow="EQUIPO" title="Empleados" subtitle="Las cuentas se identifican por DNI. La tolerancia se guarda por empleado." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    <Panel title={`Empleados (${employees.length})`}>{loading ? <Loading /> : employees.length ? <div className="table-scroll"><table><thead><tr><th>Nombre</th><th>DNI</th><th>Sedes</th><th>Tolerancia</th><th>Estado</th><th /></tr></thead><tbody>{employees.map((person) => <tr key={person.id}>
      <td>{editingId === person.id ? <input aria-label="Nombre del empleado" value={person.displayName} onChange={(e) => updateEmployee(person.id, { displayName: e.target.value })} /> : <strong>{person.displayName}</strong>}</td><td>{person.dni ?? '—'}</td>
      <td>{editingId === person.id ? <div className="inline-checks">{sites.map((site) => <label key={site.id}><input type="checkbox" checked={person.siteIds.includes(site.id)} onChange={() => updateEmployee(person.id, { siteIds: person.siteIds.includes(site.id) ? person.siteIds.filter((id) => id !== site.id) : [...person.siteIds, site.id] })} />{site.name}</label>)}</div> : person.siteIds.map((id) => sites.find((site) => site.id === id)?.name ?? 'Sede').join(', ')}</td>
      <td>{editingId === person.id ? <input className="short-input" aria-label="Tolerancia en minutos" type="number" min="0" max="240" value={person.toleranceMinutes} onChange={(e) => updateEmployee(person.id, { toleranceMinutes: Number(e.target.value) })} /> : `${person.toleranceMinutes} min`}</td>
      <td>{editingId === person.id ? <label><input type="checkbox" checked={person.active} onChange={(e) => updateEmployee(person.id, { active: e.target.checked })} /> Activo</label> : person.active ? 'Activo' : 'Inactivo'}</td>
      <td>{editingId === person.id ? <button className="button button-small button-primary" disabled={busy || person.siteIds.length === 0} onClick={() => void saveEmployee(person)}>Guardar</button> : <button className="button button-small button-quiet" onClick={() => setEditingId(person.id)}>Editar</button>}</td>
    </tr>)}</tbody></table></div> : <Empty>No hay empleados cargados.</Empty>}</Panel>
    <Panel title="Dar de alta un empleado"><form className="form-grid" onSubmit={create}>
      <FormField label="Nombre y apellido"><input required maxLength={160} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></FormField>
      <FormField label="DNI"><input required minLength={7} maxLength={12} inputMode="numeric" value={dni} onChange={(e) => setDni(e.target.value)} /></FormField>
      <FormField label="Tolerancia individual (minutos)"><input type="number" min="0" max="240" required value={tolerance} onChange={(e) => setTolerance(e.target.value)} /></FormField>
      <FormField label="Contraseña provisoria" hint="Solo hace falta si el DNI todavía no tiene cuenta."><input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} /></FormField>
      <fieldset className="field field-wide"><legend className="field-label">Sedes habilitadas</legend><div className="check-grid">{sites.map((site) => <label key={site.id}><input type="checkbox" checked={siteIds.includes(site.id)} onChange={() => toggleSite(site.id)} />{site.name}</label>)}</div>{sites.length === 0 && <span className="field-hint">Primero creá una sede.</span>}</fieldset>
      <div className="field-wide"><button className="button button-primary" disabled={busy || siteIds.length === 0}>{busy ? 'Guardando…' : 'Crear empleado'}</button></div>
    </form></Panel>
  </>
}

export function TemplatesView() {
  const [sites, setSites] = useState<Site[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedSite, setSelectedSite] = useState('')
  const [editing, setEditing] = useState('')
  const [name, setName] = useState('')
  const [blocks, setBlocks] = useState<TemplateBlock[]>([{ startDayOffset: 0, start: '09:00', end: '13:00', endDayOffset: 0 }, { startDayOffset: 0, start: '14:00', end: '18:00', endDayOffset: 0 }])
  const [breakfast, setBreakfast] = useState('15'); const [lunch, setLunch] = useState('60')
  async function load() {
    setLoading(true); setError('')
    try { const [availableSites, availableTemplates] = await Promise.all([api.get<Site[]>('/sites'), api.get<Template[]>('/templates')]); setSites(availableSites); setTemplates(availableTemplates); setSelectedSite((current) => current || availableSites[0]?.id || '') }
    catch (reason) { setError(errText(reason)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const siteTemplates = useMemo(() => templates.filter((template) => template.siteId === selectedSite), [templates, selectedSite])
  function setBlock(index: number, patch: Partial<TemplateBlock>) { setBlocks((current) => current.map((block, position) => position === index ? { ...block, ...patch } : block)) }
  function beginEdit(template: Template) { setEditing(template.id); setSelectedSite(template.siteId); setName(template.name); setBlocks(template.blocks.map((block) => ({ ...block }))); setBreakfast(String(template.breakfastLimitMinutes)); setLunch(String(template.lunchLimitMinutes)) }
  function resetForm() { setEditing(''); setName(''); setBlocks([{ startDayOffset: 0, start: '09:00', end: '13:00', endDayOffset: 0 }, { startDayOffset: 0, start: '14:00', end: '18:00', endDayOffset: 0 }]); setBreakfast('15'); setLunch('60') }
  function validBlocks() {
    const mins = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
    let previousEnd = -1
    return blocks.every((block, index) => {
      const start = block.startDayOffset * 1440 + mins(block.start)
      const end = block.endDayOffset * 1440 + mins(block.end)
      const valid = (index > 0 || block.startDayOffset === 0) && end > start && start >= previousEnd
      previousEnd = end
      return valid
    })
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!validBlocks()) { setError('Revisá los bloques: deben estar en orden, no superponerse y terminar después de empezar.'); return }
    setBusy(true)
    const payload: TemplateInput = { siteId: selectedSite, name: name.trim(), blocks, breakfastLimitMinutes: Number(breakfast), lunchLimitMinutes: Number(lunch) }
    try {
      const saved = editing ? await api.patch<Template>(`/templates/${encodeURIComponent(editing)}`, payload) : await api.post<Template>('/templates', payload)
      setTemplates((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]); resetForm()
    } catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  return <>
    <PageHeading eyebrow="HORARIOS" title="Plantillas" subtitle="Configurá bloques por sede. Los horarios pueden cruzar la medianoche." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    <div className="toolbar"><FormField label="Sede"><select value={selectedSite} onChange={(e) => { setSelectedSite(e.target.value); if (editing) resetForm() }}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></FormField></div>
    <div className="content-grid"><Panel title="Plantillas de la sede">{loading ? <Loading /> : siteTemplates.length ? <div className="template-list">{siteTemplates.map((template) => <article className="template-card" key={template.id}><div><div className="template-title"><strong>{template.name}</strong><span className={`status-chip ${template.active ? 'status-justificado' : 'status-inactivo'}`}>{template.active ? 'Activa' : 'Inactiva'}</span></div><p>{template.blocks.map((block) => `${block.startDayOffset ? 'D+1 ' : ''}${block.start}–${block.endDayOffset ? 'D+1 ' : ''}${block.end}`).join(' · ')}</p><small>Pausas: desayuno {template.breakfastLimitMinutes} min · almuerzo {template.lunchLimitMinutes} min</small></div><button className="button button-small button-quiet" onClick={() => beginEdit(template)}>Editar</button></article>)}</div> : <Empty>No hay plantillas para esta sede.</Empty>}</Panel>
      <Panel title={editing ? 'Editar plantilla' : 'Crear plantilla'}><form className="form-stack" onSubmit={submit}>
        <FormField label="Nombre"><input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mañana, tarde, noche…" /></FormField>
        <div className="form-subhead"><strong>Bloques de trabajo</strong><span>{blocks.length}/4</span></div>
        {blocks.map((block, index) => <fieldset className="block-editor" key={index}><legend>Bloque {index + 1}</legend><div className="block-fields">
          <FormField label="Empieza"><input type="time" required value={block.start} onChange={(e) => setBlock(index, { start: e.target.value })} /></FormField>
          <FormField label="Día"><select value={block.startDayOffset} disabled={index === 0} onChange={(e) => setBlock(index, { startDayOffset: Number(e.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
          <FormField label="Termina"><input type="time" required value={block.end} onChange={(e) => setBlock(index, { end: e.target.value })} /></FormField>
          <FormField label="Día"><select value={block.endDayOffset} onChange={(e) => setBlock(index, { endDayOffset: Number(e.target.value) as 0 | 1 })}><option value={0}>Mismo día</option><option value={1}>Día siguiente</option></select></FormField>
          {blocks.length > 1 && <button type="button" className="button button-small button-quiet remove-block" onClick={() => setBlocks((current) => current.filter((_, position) => position !== index))}>Quitar</button>}
        </div></fieldset>)}
        <button type="button" className="button button-quiet" disabled={blocks.length >= 4} onClick={() => setBlocks((current) => [...current, { startDayOffset: 0, start: '18:00', end: '22:00', endDayOffset: 0 }])}>+ Agregar bloque</button>
        <div className="form-grid"><FormField label="Límite desayuno (min)"><input type="number" min="0" max="240" required value={breakfast} onChange={(e) => setBreakfast(e.target.value)} /></FormField><FormField label="Límite almuerzo (min)"><input type="number" min="0" max="240" required value={lunch} onChange={(e) => setLunch(e.target.value)} /></FormField></div>
        <div className="button-row"><button className="button button-primary" disabled={busy || !selectedSite}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear plantilla'}</button>{editing && <button type="button" className="button button-quiet" onClick={resetForm}>Cancelar</button>}</div>
      </form></Panel>
    </div>
  </>
}

export function JourneysView() {
  const [employees, setEmployees] = useState<Employee[]>([]); const [sites, setSites] = useState<Site[]>([]); const [templates, setTemplates] = useState<Template[]>([])
  type JourneyRow = Pick<Jornada, 'id' | 'employeeId' | 'siteId' | 'localDate' | 'state'>
  const [jornadas, setJornadas] = useState<JourneyRow[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<Jornada | null>(null); const [detailLoading, setDetailLoading] = useState(false); const [markBusy, setMarkBusy] = useState('')
  const [date, setDate] = useState(dateInBrowserZone); const [employeeId, setEmployeeId] = useState(''); const [siteId, setSiteId] = useState(''); const [templateId, setTemplateId] = useState('')
  const [forgotAction, setForgotAction] = useState<MarkAction>('INGRESO'); const [forgotOccurredAt, setForgotOccurredAt] = useState(''); const [forgotReason, setForgotReason] = useState('')
  const [editingMarkId, setEditingMarkId] = useState(''); const [correctedAction, setCorrectedAction] = useState<MarkAction>('INGRESO'); const [correctedOccurredAt, setCorrectedOccurredAt] = useState(''); const [correctionReason, setCorrectionReason] = useState('')
  useEffect(() => { void Promise.all([api.get<Employee[]>('/employees'), api.get<Site[]>('/sites'), api.get<Template[]>('/templates')]).then(([people, availableSites, availableTemplates]) => {
    setEmployees(people); setSites(availableSites); setTemplates(availableTemplates.filter((item) => item.active)); setEmployeeId(people[0]?.id ?? ''); setSiteId(availableSites[0]?.id ?? '')
  }).catch((reason) => setError(errText(reason))).finally(() => setLoading(false)) }, [])
  useEffect(() => { setTemplateId(templates.find((item) => item.siteId === siteId)?.id ?? '') }, [siteId, templates])
  async function loadJourneys() {
    setError('')
    try { const rows = await api.get<JourneyRow[]>(`/jornadas${queryString({ from: date, to: date })}`); setJornadas(rows); setDetail(null) }
    catch (reason) { setError(errText(reason)) }
  }
  useEffect(() => { if (!loading) void loadJourneys() }, [loading, date])
  const eligibleEmployees = useMemo(() => employees.filter((person) => person.active && person.siteIds.includes(siteId)), [employees, siteId])
  useEffect(() => { setEmployeeId((current) => eligibleEmployees.some((person) => person.id === current) ? current : eligibleEmployees[0]?.id ?? '') }, [eligibleEmployees])
  async function declare(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try { await api.post('/jornadas', { employeeId, siteId, localDate: date, templateId }); await loadJourneys() }
    catch (reason) { setError(errText(reason)) } finally { setBusy(false) }
  }
  async function showDetail(jornadaId: string) {
    setDetailLoading(true); setError('')
    try { setDetail(await api.get<Jornada>(`/jornadas/${encodeURIComponent(jornadaId)}`)) }
    catch (reason) { setError(errText(reason)) } finally { setDetailLoading(false) }
  }
  const detailSite = detail ? sites.find((site) => site.id === detail.siteId) : undefined
  const detailTimeZone = detailSite?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  async function addForgottenMark(event: FormEvent) {
    event.preventDefault()
    if (!detail) return
    const occurredAt = instantForSiteTime(forgotOccurredAt, detailTimeZone)
    if (!occurredAt) { setError('Esa hora no existe en la zona horaria de la sede. Revisá la fecha y la hora.'); return }
    if (!forgotReason.trim()) { setError('Escribí el motivo de incorporación.'); return }
    setMarkBusy('forgotten'); setError('')
    try {
      await api.post<Mark>(`/admin/jornadas/${encodeURIComponent(detail.id)}/forgotten-marks`, { action: forgotAction, occurredAt, auditReason: forgotReason.trim() })
      setForgotOccurredAt(''); setForgotReason(''); await showDetail(detail.id)
    } catch (reason) { setError(errText(reason)) } finally { setMarkBusy('') }
  }
  function beginMarkCorrection(mark: Mark) {
    setEditingMarkId(mark.id); setCorrectedAction(mark.action); setCorrectedOccurredAt(siteTimeInput(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)); setCorrectionReason('')
  }
  async function correctMark(event: FormEvent, mark: Mark) {
    event.preventDefault()
    if (!detail) return
    const correctedAt = instantForSiteTime(correctedOccurredAt, detailTimeZone)
    if (!correctedAt) { setError('Esa hora no existe en la zona horaria de la sede. Revisá la fecha y la hora.'); return }
    if (!correctionReason.trim()) { setError('Escribí el motivo de corrección.'); return }
    setMarkBusy(mark.id); setError('')
    try {
      await api.post<Mark>(`/admin/marks/${encodeURIComponent(mark.id)}/correction`, { correctedAction, correctedOccurredAt: correctedAt, auditReason: correctionReason.trim() })
      setEditingMarkId(''); setCorrectionReason(''); await showDetail(detail.id)
    } catch (reason) { setError(errText(reason)) } finally { setMarkBusy('') }
  }
  const peopleById = useMemo(() => new Map(employees.map((person) => [person.id, person.displayName])), [employees])
  const siteTemplates = templates.filter((template) => template.siteId === siteId)
  return <>
    <PageHeading eyebrow="PLANIFICACIÓN POR FECHA" title="Jornadas" subtitle="Declaralas para una fecha y sede. La fecha sigue el calendario local de cada sede; no hay recurrencia semanal." />
    {error && <PageMessage kind="error">{error}</PageMessage>}
    <Panel title="Declarar una jornada"><form className="form-grid" onSubmit={declare}>
      <FormField label="Fecha" hint="La fecha inicial usa el calendario local de este dispositivo; la fecha elegida se aplica como día local en cada sede."><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
      <FormField label="Empleado"><select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>{eligibleEmployees.map((person) => <option value={person.id} key={person.id}>{person.displayName}</option>)}</select>{eligibleEmployees.length === 0 && <span className="field-hint">No hay empleados activos habilitados para esta sede.</span>}</FormField>
      <FormField label="Sede"><select required value={siteId} onChange={(e) => setSiteId(e.target.value)}>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></FormField>
      <FormField label="Plantilla horaria"><select required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>{siteTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></FormField>
      <div className="field-wide"><button className="button button-primary" disabled={busy || loading || !templateId || !employeeId}>{busy ? 'Guardando…' : 'Declarar jornada'}</button></div>
    </form></Panel>
    <Panel title={`Jornadas del ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}`} action={<button className="button button-small button-quiet" onClick={() => void loadJourneys()}>Actualizar</button>}>
      {loading ? <Loading /> : jornadas.length ? <div className="table-scroll"><table><thead><tr><th>Empleado</th><th>Sede</th><th>Estado</th><th /></tr></thead><tbody>{jornadas.map((jornada) => <tr key={jornada.id}><td>{peopleById.get(jornada.employeeId) ?? 'Empleado'}</td><td>{sites.find((site) => site.id === jornada.siteId)?.name ?? 'Sede'}</td><td><span className="status-chip">{jornada.state.replaceAll('_', ' ')}</span></td><td><button className="button button-small button-quiet" onClick={() => void showDetail(jornada.id)}>Ver marcas</button></td></tr>)}</tbody></table></div> : <Empty>No hay jornadas declaradas para esta fecha.</Empty>}
    </Panel>
    {detailLoading && <Panel title="Detalle"><Loading label="Consultando marcas…" /></Panel>}
    {detail && !detailLoading && <Panel title={`Marcas de ${peopleById.get(detail.employeeId) ?? 'empleado'}`}>
      <p className="muted">Horario asignado: {detail.scheduleSnapshot.name} · tolerancia {detail.toleranceMinutes} min</p>
      {detail.marks.length ? <div className="table-scroll"><table><thead><tr><th>Marca</th><th>Hora del evento</th><th>Alta en servidor</th><th>Ubicación</th><th>Acciones</th></tr></thead><tbody>{detail.marks.map((mark) => <Fragment key={mark.id}>
        <tr><td>{actionName(mark.action)}</td><td>{dateTime(mark.occurredAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{dateTime(mark.recordedAt ?? mark.acceptedAt, detailTimeZone)}</td><td>{typeof mark.latitude === 'number' && typeof mark.longitude === 'number' ? `${mark.latitude.toFixed(5)}, ${mark.longitude.toFixed(5)}` : locationName(mark.locationStatus)}</td><td><button className="button button-small button-quiet" disabled={markBusy !== ''} onClick={() => beginMarkCorrection(mark)}>Corregir</button></td></tr>
        {editingMarkId === mark.id && <tr><td colSpan={5}><form className="form-stack correction-form" onSubmit={(event) => void correctMark(event, mark)}>
          <FormField label="Tipo de marca corregida"><select value={correctedAction} onChange={(event) => setCorrectedAction(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
          <FormField label={`Hora corregida (${detailSite?.name ?? 'zona horaria de la sede'})`}><input type="datetime-local" step="1" required value={correctedOccurredAt} onChange={(event) => setCorrectedOccurredAt(event.target.value)} /></FormField>
          <FormField label="Motivo de corrección de marca"><textarea required maxLength={2000} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></FormField>
          <div className="button-row"><button className="button button-small button-primary" disabled={markBusy === mark.id || !correctionReason.trim()}>{markBusy === mark.id ? 'Guardando…' : 'Guardar corrección de marca'}</button><button type="button" className="button button-small button-quiet" disabled={markBusy === mark.id} onClick={() => setEditingMarkId('')}>Cancelar</button></div>
        </form></td></tr>}
      </Fragment>)}</tbody></table></div> : <Empty>Esta jornada todavía no tiene marcas.</Empty>}
      <form className="form-grid forgotten-mark-form" onSubmit={(event) => void addForgottenMark(event)}>
        <div className="field-wide"><h3>Incorporar una marca olvidada</h3><p className="field-hint">La hora del evento se interpreta en la zona horaria de {detailSite?.name ?? 'la sede'}; el alta queda auditada por separado.</p></div>
        <FormField label="Tipo de marca olvidada"><select value={forgotAction} onChange={(event) => setForgotAction(event.target.value as MarkAction)}>{MARK_ACTIONS.map((action) => <option key={action} value={action}>{actionName(action)}</option>)}</select></FormField>
        <FormField label={`Hora del evento (${detailSite?.name ?? 'sede'})`}><input type="datetime-local" step="1" required value={forgotOccurredAt} onChange={(event) => setForgotOccurredAt(event.target.value)} /></FormField>
        <FormField label="Motivo de incorporación"><textarea required maxLength={2000} value={forgotReason} onChange={(event) => setForgotReason(event.target.value)} /></FormField>
        <div className="field-wide"><button className="button button-primary" disabled={markBusy !== '' || !forgotReason.trim()}>{markBusy === 'forgotten' ? 'Guardando…' : 'Registrar marca olvidada'}</button></div>
      </form>
    </Panel>}
  </>
}

function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="page-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{subtitle}</p></div></div>
}
function actionName(action: MarkAction) {
  return ({ INGRESO: 'Ingreso', EGRESO: 'Egreso', SALIDA_DESAYUNO: 'Salida desayuno', VUELTA_DESAYUNO: 'Vuelta desayuno', SALIDA_ALMUERZO: 'Salida almuerzo', VUELTA_ALMUERZO: 'Vuelta almuerzo' } as const)[action]
}
function deviationName(type: Deviation['type']) {
  return ({ SIN_INGRESO: 'Sin ingreso', LLEGADA_TARDE: 'Llegada tarde', EGRESO_TEMPRANO: 'Egreso temprano', EGRESO_TARDIO: 'Egreso tardío', EXCESO_DESAYUNO: 'Exceso de desayuno', EXCESO_ALMUERZO: 'Exceso de almuerzo' } as const)[type]
}
function statusName(status: Deviation['status']) { return ({ MOTIVO_PENDIENTE: 'Falta motivo', PENDIENTE_REVISION: 'A revisar', JUSTIFICADO: 'Justificado', NO_JUSTIFICADO: 'No justificado' } as const)[status] }
function categoryName(category: NonNullable<Deviation['category']>) { return ({ SALUD: 'Salud', TRANSPORTE: 'Transporte', EMERGENCIA: 'Emergencia', OTRA: 'Otra' } as const)[category] }
function locationName(status: string) { return ({ PENDIENTE: 'Ubicación pendiente', RECIBIDA: 'Ubicación recibida', SIN_UBICACION: 'Sin ubicación', NO_APLICA: 'No aplica' } as Record<string, string>)[status] ?? '—' }
