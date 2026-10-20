import { cloneElement, isValidElement, useId, useRef, useState, type ReactNode } from 'react'
import type { Membership } from '../shared/api/types'

export function PageMessage({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' | 'success' }) {
  return <div className={`message message-${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-atomic="true">{children}</div>
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</div>
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const headingId = useId()
  return <section className="panel" aria-labelledby={headingId}><div className="panel-heading"><h2 id={headingId}>{title}</h2>{action}</div>{children}</section>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>
}

export function AppHeader({ companyName, name, onSignOut, children }: {
  companyName: string; name: string; onSignOut: () => void; children?: ReactNode
}) {
  return <header className="topbar">
    <a className="brand" href="#inicio" aria-label="Fichaje Braja, inicio"><span className="brand-mark">B</span><span>Fichaje<span className="brand-light">Braja</span></span></a>
    <div className="topbar-actions">{children}<span className="company-pill">{companyName}</span><span className="user-label">{name}</span>
      <button className="button button-quiet button-small" onClick={onSignOut}>Salir</button></div>
  </header>
}

export function CompanySwitcher({ memberships, activeCompanyId, onSelect }: {
  memberships: Membership[]; activeCompanyId: string; onSelect: (companyId: string) => Promise<void>
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingCompanyId, setPendingCompanyId] = useState('')
  const requestPending = useRef(false)
  if (memberships.length < 2) return null
  async function change(companyId: string) {
    if (requestPending.current || companyId === activeCompanyId) return
    requestPending.current = true
    setError('')
    setPendingCompanyId(companyId)
    setBusy(true)
    try { await onSelect(companyId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cambiar de empresa.') }
    finally {
      requestPending.current = false
      setPendingCompanyId('')
      setBusy(false)
    }
  }
  const pendingCompanyName = memberships.find((membership) => membership.companyId === pendingCompanyId)?.companyName ?? 'la empresa'
  return <div className="company-switch-wrap">
    <select className="company-switch" aria-label="Empresa activa" aria-busy={busy} disabled={busy} value={activeCompanyId} onChange={(event) => void change(event.target.value)}>
      {memberships.map((membership) => <option key={membership.companyId} value={membership.companyId}>{membership.companyName}</option>)}
    </select>
    {busy && <span className="company-switch-status" role="status" aria-atomic="true">Esperando la activación de {pendingCompanyName}…</span>}
    {error && <span className="company-switch-error" role="alert">{error}</span>}
  </div>
}

export function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  const controlId = useId()
  const hintId = useId()
  const controlElement = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children) ? children : null
  const describedBy = controlElement && hint
    ? [controlElement.props['aria-describedby'], hintId].filter(Boolean).join(' ')
    : controlElement?.props['aria-describedby']
  const control = controlElement
    ? cloneElement(controlElement, { id: controlElement.props.id ?? controlId, 'aria-describedby': describedBy })
    : children
  return <div className="field"><label className="field-label" htmlFor={controlElement ? (controlElement.props.id ?? controlId) : undefined}>{label}</label>{control}{hint && <span className="field-hint" id={hintId}>{hint}</span>}</div>
}
