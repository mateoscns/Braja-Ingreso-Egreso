import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Membership } from '../shared/api/types'

/**
 * A message in a live region. An error is an `alert`, which screen readers announce as soon as it appears.
 * A `status` is only announced reliably when the text changes inside a region that already exists, so an info or
 * success message mounts its region empty and writes the text right after; later changes update the same region.
 */
export function PageMessage({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' | 'success' }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const alert = kind === 'error'
  return <div className={`message message-${kind}`} role={alert ? 'alert' : 'status'} aria-atomic="true">{alert || mounted ? children : null}</div>
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
      <button className="button button-quiet button-small" onClick={onSignOut}>Cerrar sesión</button></div>
  </header>
}

export function CompanySwitcher({ memberships, activeCompanyId, onSelect, disabled = false }: {
  memberships: Membership[]; activeCompanyId: string; onSelect: (companyId: string) => Promise<void>; disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingCompanyId, setPendingCompanyId] = useState('')
  const requestPending = useRef(false)
  if (memberships.length < 2) return null
  async function change(companyId: string) {
    if (disabled || requestPending.current || companyId === activeCompanyId) return
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
    <select className="company-switch" aria-label="Empresa activa" aria-busy={busy} disabled={busy || disabled} value={activeCompanyId} onChange={(event) => void change(event.target.value)}>
      {memberships.map((membership) => <option key={membership.companyId} value={membership.companyId}>{membership.companyName}</option>)}
    </select>
    {busy && <span className="company-switch-status" role="status" aria-atomic="true">Esperando la activación de {pendingCompanyName}…</span>}
    {error && <span className="company-switch-error" role="alert">{error}</span>}
  </div>
}

/**
 * A labelled control: label, hint, control and error, in that order. The hint comes first so it is read before typing and a
 * phone's keyboard does not cover it; the error sits under the control. Both are read with the control, and the error also marks
 * it `aria-invalid` (without an error the control keeps its own value) and the whole field `field-invalid`.
 */
export function FormField({ label, children, hint, error }: { label: string; children: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const controlId = useId()
  const hintId = useId()
  const errorId = useId()
  const controlElement = isValidElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' }>(children) ? children : null
  const describedBy = controlElement
    ? [controlElement.props['aria-describedby'], hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
    : undefined
  const control = controlElement
    ? cloneElement(controlElement, {
      id: controlElement.props.id ?? controlId, 'aria-describedby': describedBy,
      'aria-invalid': error ? true : controlElement.props['aria-invalid']
    })
    : children
  return <div className={error ? 'field field-invalid' : 'field'}><label className="field-label" htmlFor={controlElement ? (controlElement.props.id ?? controlId) : undefined}>{label}</label>
    {hint && <span className="field-hint" id={hintId}>{hint}</span>}
    {control}
    {error && <span className="field-error" id={errorId}>{error}</span>}</div>
}
