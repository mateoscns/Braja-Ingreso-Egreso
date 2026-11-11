import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Membership } from '../shared/api/types'
import { Icon, type IconName } from './icons'

export type MessageKind = 'info' | 'success' | 'warning' | 'error'

/** The kind of a message is told by its bar and its icon, not by colour alone; the words still carry it for screen readers. */
const MESSAGE_ICONS = { info: 'info', success: 'check', warning: 'alert', error: 'error' } satisfies Record<MessageKind, IconName>

/**
 * A message in a live region. An error is an `alert`, which screen readers announce as soon as it appears.
 * A `status` is only announced reliably when the text changes inside a region that already exists, so an info, success or
 * warning message mounts its region empty and writes the icon and the text right after; later changes update the same region.
 */
export function PageMessage({ children, kind = 'info' }: { children: ReactNode; kind?: MessageKind }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const alert = kind === 'error'
  return <div className={`message message-${kind}`} role={alert ? 'alert' : 'status'} aria-atomic="true">
    {alert || mounted ? <><Icon name={MESSAGE_ICONS[kind]} /><div className="message-body">{children}</div></> : null}
  </div>
}

/** A failed load: the error and the way to try again, in place of what could not be shown. */
export function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="form-stack"><PageMessage kind="error">{message}</PageMessage><button type="button" className="button button-quiet" onClick={onRetry}>Reintentar</button></div>
}

/** The title of a page with the line above it and its lead; an optional action sits on the right and wraps under it on phones. */
export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{subtitle}</p></div>{action}</div>
}

/**
 * The tone of a state, not its API value: neutral (the state of a day), wait (it waits for someone else), todo (it waits for the
 * person looking), ok (confirmed or decided in favour), bad (an error or decided against).
 */
export type StatusTone = 'neutral' | 'wait' | 'todo' | 'ok' | 'bad'

/** The state of a thing in a word, with its icon: shape and word first, colour last. Plain text, never a button. */
export function StatusTag({ tone, icon, children }: { tone: StatusTone; icon: IconName; children: ReactNode }) {
  return <span className={`status-chip status-${tone}`}><Icon name={icon} />{children}</span>
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
 * phone's keyboard does not cover it; the error sits under the control, after a triangle (hidden from screen readers) so it is not
 * told by its colour alone. Both are read with the control, and the error also marks
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
    {error && <span className="field-error" id={errorId}><Icon name="alert" />{error}</span>}</div>
}
