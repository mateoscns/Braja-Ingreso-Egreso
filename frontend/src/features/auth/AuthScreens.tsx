import { useState, type FormEvent } from 'react'
import { PageMessage, FormField } from '../../app/ui'
import type { Session } from '../../shared/api/types'
import {
  OWN_PASSWORD_RULE, OWN_PASSWORD_TOO_LONG_MESSAGE, OWN_PASSWORD_TOO_SHORT_MESSAGE, PASSWORD_MAX_CHARACTERS, PASSWORD_MIN_CHARACTERS, passwordTooLong
} from '../../shared/password'
import { clearMarkInterrupted, INTERRUPTED_MARK_MESSAGE, markWasInterrupted } from './interruptedMark'

function PasswordToggle({ shown, label, onToggle }: { shown: boolean; label: string; onToggle: () => void }) {
  return <button type="button" className="button button-quiet button-small password-toggle" aria-pressed={shown} onClick={onToggle}>{label}</button>
}

export function LoginScreen({ onSignIn, error }: { onSignIn: (dni: string, password: string) => Promise<void>; error?: string }) {
  const [dni, setDni] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  // A mark cut by an expired session was not saved: say it instead of the generic session notice.
  const [markInterrupted, setMarkInterrupted] = useState(markWasInterrupted)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFormError('')
    clearMarkInterrupted(); setMarkInterrupted(false)
    try { await onSignIn(dni.trim(), password) } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.') }
    finally { setBusy(false) }
  }
  const shownError = formError || (markInterrupted ? INTERRUPTED_MARK_MESSAGE : error)
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark">B</span><span>Fichaje<span className="brand-light">Braja</span></span></div>
    <section className="auth-card"><p className="eyebrow">INGRESO AL SISTEMA</p><h1>Bienvenido</h1><p className="muted">Ingresá con tu DNI y contraseña.</p>
      {shownError && <PageMessage kind="error">{shownError}</PageMessage>}
      {busy && <p role="status" aria-live="polite" aria-atomic="true">Entrando, esperá un momento…</p>}
      <form onSubmit={submit} className="form-stack" aria-busy={busy}>
        <FormField label="DNI"><input autoComplete="username" inputMode="numeric" minLength={7} maxLength={12} required value={dni} onChange={(e) => setDni(e.target.value)} /></FormField>
        <FormField label="Contraseña"><input type={shown ? 'text' : 'password'} autoComplete="current-password" maxLength={256} required value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
        <PasswordToggle shown={shown} label="Mostrar contraseña" onToggle={() => setShown((value) => !value)} />
        <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      <p className="muted small-copy auth-hint">¿Te olvidaste la contraseña? Pedile al encargado una nueva.</p>
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
      {busyId && <p role="status" aria-live="polite" aria-atomic="true">Esperando la activación de {session.memberships.find((membership) => membership.companyId === busyId)?.companyName ?? 'la empresa'}…</p>}
      <div className="company-list" aria-busy={Boolean(busyId)}>{session.memberships.map((membership) => <button key={membership.companyId} className="company-choice" disabled={Boolean(busyId)} onClick={() => void select(membership.companyId)}>
        <span className="choice-icon" aria-hidden="true">{membership.companyName.slice(0, 1).toUpperCase()}</span><span><strong>{membership.companyName}</strong><small>{membership.role === 'ADMIN' ? 'Administración' : 'Empleado'}</small></span><span className="choice-arrow" aria-hidden="true">{busyId === membership.companyId ? '…' : '→'}</span>
      </button>)}</div>
      {session.memberships.length === 0 && <PageMessage kind="error">Tu cuenta todavía no tiene empresas asignadas. Consultá con un administrador.</PageMessage>}
      <button className="button button-quiet button-wide" onClick={onSignOut}>Cerrar sesión</button>
    </section></main>
}

function lengthCounter(value: string): string {
  return value.length < PASSWORD_MIN_CHARACTERS ? `Llevás ${value.length} de ${PASSWORD_MIN_CHARACTERS}.` : `Llevás ${value.length}: alcanza.`
}

export function PasswordChangeScreen({ onChange, onSignOut }: { onChange: (currentPassword: string, newPassword: string) => Promise<void>; onSignOut: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!current) { setError('Escribí la contraseña actual, la que te dieron para entrar.'); return }
    if (next.length < PASSWORD_MIN_CHARACTERS) { setError(OWN_PASSWORD_TOO_SHORT_MESSAGE); return }
    if (passwordTooLong(next)) { setError(OWN_PASSWORD_TOO_LONG_MESSAGE); return }
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden.'); return }
    setBusy(true)
    try { await onChange(current, next) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cambiar la contraseña.') }
    finally { setBusy(false) }
  }
  const type = shown ? 'text' : 'password'
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark">B</span><span>Fichaje<span className="brand-light">Braja</span></span></div>
    <section className="auth-card"><p className="eyebrow">PRIMER INGRESO</p><h1>Cambiá tu contraseña</h1><p className="muted">Cambiá la contraseña que te dieron por una tuya. <strong>{OWN_PASSWORD_RULE}</strong></p>
      {error && <PageMessage kind="error">{error}</PageMessage>}
      {busy && <p role="status" aria-live="polite" aria-atomic="true">Guardando tu contraseña…</p>}
      <form onSubmit={submit} className="form-stack" aria-busy={busy} noValidate>
        <FormField label="Contraseña que te dieron"><input type={type} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></FormField>
        <FormField label="Nueva contraseña" hint={lengthCounter(next)}><input type={type} autoComplete="new-password" minLength={PASSWORD_MIN_CHARACTERS} maxLength={PASSWORD_MAX_CHARACTERS} required value={next} onChange={(e) => setNext(e.target.value)} /></FormField>
        <FormField label="Repetí la nueva contraseña"><input type={type} autoComplete="new-password" minLength={PASSWORD_MIN_CHARACTERS} maxLength={PASSWORD_MAX_CHARACTERS} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></FormField>
        <PasswordToggle shown={shown} label="Mostrar contraseñas" onToggle={() => setShown((value) => !value)} />
        <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
        <button type="button" className="button button-quiet button-wide" onClick={onSignOut}>Cerrar sesión</button>
      </form>
    </section></main>
}
