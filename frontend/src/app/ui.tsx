import { useState, type ReactNode } from 'react'
import type { Membership } from '../shared/api/types'

export function PageMessage({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' | 'success' }) {
  return <div className={`message message-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" />{label}</div>
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>
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
  if (memberships.length < 2) return null
  async function change(companyId: string) {
    setError('')
    try { await onSelect(companyId) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cambiar de empresa.') }
  }
  return <div className="company-switch-wrap">
    <select className="company-switch" aria-label="Empresa activa" value={activeCompanyId} onChange={(event) => void change(event.target.value)}>
      {memberships.map((membership) => <option key={membership.companyId} value={membership.companyId}>{membership.companyName}</option>)}
    </select>
    {error && <span className="company-switch-error" role="alert">{error}</span>}
  </div>
}

export function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>
}
