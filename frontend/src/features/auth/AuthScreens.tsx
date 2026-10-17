import { useState, type FormEvent } from 'react'
import { PageMessage, FormField } from '../../app/ui'
import type { Session } from '../../shared/api/types'

export function LoginScreen({ onSignIn, error }: { onSignIn: (dni: string, password: string) => Promise<void>; error?: string }) {
  const [dni, setDni] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFormError('')
    try { await onSignIn(dni.trim(), password) } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.') }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark">B</span><span>Fichaje<span className="brand-light">Braja</span></span></div>
    <section className="auth-card"><p className="eyebrow">INGRESO AL SISTEMA</p><h1>Bienvenido</h1><p className="muted">Ingresá con tu DNI y contraseña.</p>
      {(formError || error) && <PageMessage kind="error">{formError || error}</PageMessage>}
      <form onSubmit={submit} className="form-stack">
        <FormField label="DNI"><input autoComplete="username" inputMode="numeric" minLength={7} maxLength={12} required value={dni} onChange={(e) => setDni(e.target.value)} /></FormField>
        <FormField label="Contraseña"><input type="password" autoComplete="current-password" maxLength={256} required value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
        <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </section><p className="auth-footnote">Sistema interno de registro de Braja</p></main>
}

export function CompanyScreen({ session, onSelect, onSignOut }: { session: Session; onSelect: (id: string) => Promise<void>; onSignOut: () => void }) {
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  async function select(id: string) {
    setBusyId(id); setError('')
    try { await onSelect(id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo seleccionar la empresa.') }
    finally { setBusyId('') }
  }
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark">B</span><span>Fichaje<span className="brand-light">Braja</span></span></div>
    <section className="auth-card"><p className="eyebrow">CUENTA COMPARTIDA</p><h1>Elegí una empresa</h1><p className="muted">Solo aparecen las empresas donde tenés acceso.</p>
      {error && <PageMessage kind="error">{error}</PageMessage>}
      <div className="company-list">{session.memberships.map((membership) => <button key={membership.companyId} className="company-choice" disabled={Boolean(busyId)} onClick={() => void select(membership.companyId)}>
        <span className="choice-icon">{membership.companyName.slice(0, 1).toUpperCase()}</span><span><strong>{membership.companyName}</strong><small>{membership.role === 'ADMIN' ? 'Administración' : 'Empleado'}</small></span><span className="choice-arrow">{busyId === membership.companyId ? '…' : '→'}</span>
      </button>)}</div>
      {session.memberships.length === 0 && <PageMessage kind="error">Tu cuenta todavía no tiene empresas asignadas. Consultá con un administrador.</PageMessage>}
      <button className="button button-quiet button-wide" onClick={onSignOut}>Cerrar sesión</button>
    </section></main>
}

export function PasswordChangeScreen({ onChange, onSignOut }: { onChange: (currentPassword: string, newPassword: string) => Promise<void>; onSignOut: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (next.length < 12) { setError('La contraseña nueva debe tener al menos 12 caracteres.'); return }
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden.'); return }
    setBusy(true)
    try { await onChange(current, next) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cambiar la contraseña.') }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark">B</span><span>Fichaje<span className="brand-light">Braja</span></span></div>
    <section className="auth-card"><p className="eyebrow">PRIMER INGRESO</p><h1>Cambiá tu contraseña</h1><p className="muted">Tu contraseña provisoria ya cumplió su función. Elegí una de al menos 12 caracteres.</p>
      {error && <PageMessage kind="error">{error}</PageMessage>}
      <form onSubmit={submit} className="form-stack">
        <FormField label="Contraseña actual"><input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></FormField>
        <FormField label="Nueva contraseña"><input type="password" autoComplete="new-password" minLength={12} required value={next} onChange={(e) => setNext(e.target.value)} /></FormField>
        <FormField label="Repetí la nueva contraseña"><input type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></FormField>
        <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
        <button type="button" className="button button-quiet button-wide" onClick={onSignOut}>Cerrar sesión</button>
      </form>
    </section></main>
}
