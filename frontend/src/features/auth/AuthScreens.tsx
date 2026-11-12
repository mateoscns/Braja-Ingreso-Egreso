import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Brand, CONTENT_ID, PageMessage, FormField, SkipLink, Status } from '../../app/ui'
import { Icon } from '../../app/icons'
import { useFieldErrors } from '../../app/useFieldErrors'
import type { Session } from '../../shared/api/types'
import {
  OWN_PASSWORD_RULE, OWN_PASSWORD_TOO_LONG_MESSAGE, OWN_PASSWORD_TOO_SHORT_MESSAGE, PASSWORD_MAX_CHARACTERS, PASSWORD_MIN_CHARACTERS, passwordTooLong
} from '../../shared/password'
import { clearMarkInterrupted, INTERRUPTED_MARK_MESSAGE, markWasInterrupted } from './interruptedMark'

/**
 * The frame of the three screens before the app: the top bar of the app with the brand only (as text: there is nowhere to go
 * yet), then one column on the white page with the title, its lead and the rest. No card (design system, principle 1). «Ir al
 * contenido» comes first, as on the screens of the app.
 */
function AuthFrame({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return <div className="app-frame">
    <SkipLink />
    <header className="topbar"><Brand /></header>
    <main id={CONTENT_ID} tabIndex={-1} className="auth-page"><h1>{title}</h1><p className="auth-lead">{lead}</p>{children}</main>
  </div>
}

/** A link button with a constant name; while the passwords are shown it carries a check, so its state is not told by colour alone. */
function PasswordToggle({ shown, label, onToggle }: { shown: boolean; label: string; onToggle: () => void }) {
  return <button type="button" className="button button-link" aria-pressed={shown} onClick={onToggle}>{shown && <Icon name="check" />}{label}</button>
}

const DNI_MIN_CHARACTERS = 7

export function LoginScreen({ onSignIn, error }: { onSignIn: (dni: string, password: string) => Promise<void>; error?: string }) {
  const [dni, setDni] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  // The form's id: a failed check moves the focus to its first invalid field (app/useFieldErrors).
  const formId = useId()
  const fields = useFieldErrors<'dni' | 'password'>()
  // A mark cut by an expired session was not saved: say it instead of the generic session notice.
  const [markInterrupted, setMarkInterrupted] = useState(markWasInterrupted)
  async function submit(event: FormEvent) {
    event.preventDefault(); setFormError('')
    // The checks the browser made before (required, minLength 7): only in our words and tied to the field.
    const valid = fields.check(formId, {
      dni: !dni.trim() ? 'Escribí tu DNI.' : dni.length < DNI_MIN_CHARACTERS ? 'El DNI tiene que tener de 7 a 12 números.' : undefined,
      password: password ? undefined : 'Escribí tu contraseña.'
    })
    // A failed check keeps the notice of the interrupted mark: nothing was sent yet.
    if (!valid) return
    setBusy(true); clearMarkInterrupted(); setMarkInterrupted(false)
    try { await onSignIn(dni.trim(), password) } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.') }
    finally { setBusy(false) }
  }
  // The notice the screen opens with stays above the form; the answer to a submit goes inside it, above its button (4.7). The
  // login error is one neutral message for the form (rule 26): it marks no field.
  const notice = formError ? '' : markInterrupted ? INTERRUPTED_MARK_MESSAGE : error
  return <AuthFrame title="Bienvenido" lead="Ingresá con tu DNI y contraseña.">
    {notice && <PageMessage kind="error">{notice}</PageMessage>}
    {busy && <Status>Entrando, esperá un momento…</Status>}
    <form id={formId} onSubmit={submit} className="form-stack" aria-busy={busy} noValidate>
      <FormField label="DNI" error={fields.errors.dni}><input autoComplete="username" inputMode="numeric" minLength={DNI_MIN_CHARACTERS} maxLength={12} required value={dni}
        onChange={(e) => { setDni(e.target.value); fields.clear('dni') }} /></FormField>
      <FormField label="Contraseña" error={fields.errors.password}><input type={shown ? 'text' : 'password'} autoComplete="current-password" maxLength={256} required value={password}
        onChange={(e) => { setPassword(e.target.value); fields.clear('password') }} /></FormField>
      <PasswordToggle shown={shown} label="Mostrar contraseña" onToggle={() => setShown((value) => !value)} />
      {formError && <PageMessage kind="error">{formError}</PageMessage>}
      <button className="button button-primary button-block" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
    <p className="auth-hint">¿Te olvidaste la contraseña? Pedile al encargado una nueva.</p>
    <p className="auth-footnote">Sistema interno de registro de Braja</p>
  </AuthFrame>
}

export function CompanyScreen({ session, onSelect, onSignOut }: { session: Session; onSelect: (id: string) => Promise<void>; onSignOut: () => void }) {
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  async function select(id: string) {
    setBusyId(id); setError('')
    try { await onSelect(id) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo seleccionar la empresa.') }
    finally { setBusyId('') }
  }
  // Each company is an option tile that enters at once: its name over its role, and an arrow that says it goes on; the one being
  // activated turns its arrow into the spinner while the status line under the lead names it.
  return <AuthFrame title="Elegí una empresa" lead="Solo aparecen las empresas donde tenés acceso.">
    {error && <PageMessage kind="error">{error}</PageMessage>}
    {busyId && <Status>Esperando la activación de {session.memberships.find((membership) => membership.companyId === busyId)?.companyName ?? 'la empresa'}…</Status>}
    {session.memberships.length > 0 && <ul className="company-list" aria-busy={Boolean(busyId)}>{session.memberships.map((membership) => <li key={membership.companyId}>
      <button type="button" className="choice" disabled={Boolean(busyId)} onClick={() => void select(membership.companyId)}>
        <span className="choice-text"><strong>{membership.companyName}</strong><small>{membership.role === 'ADMIN' ? 'Administración' : 'Empleado'}</small></span>
        {busyId === membership.companyId ? <span className="spinner" aria-hidden="true" /> : <Icon name="right" />}
      </button>
    </li>)}</ul>}
    {session.memberships.length === 0 && <PageMessage kind="error">Tu cuenta todavía no tiene empresas asignadas. Consultá con un administrador.</PageMessage>}
    <button type="button" className="button button-link" onClick={onSignOut}>Cerrar sesión</button>
  </AuthFrame>
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
  const formId = useId()
  const fields = useFieldErrors<'current' | 'next' | 'confirm'>()
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    // The same checks as before, each under its own field and all at once.
    const valid = fields.check(formId, {
      current: current ? undefined : 'Escribí la contraseña actual, la que te dieron para entrar.',
      next: next.length < PASSWORD_MIN_CHARACTERS ? OWN_PASSWORD_TOO_SHORT_MESSAGE : passwordTooLong(next) ? OWN_PASSWORD_TOO_LONG_MESSAGE : undefined,
      confirm: next !== confirm ? 'Las contraseñas nuevas no coinciden.' : undefined
    })
    if (!valid) return
    setBusy(true)
    try { await onChange(current, next) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cambiar la contraseña.') }
    finally { setBusy(false) }
  }
  const type = shown ? 'text' : 'password'
  return <AuthFrame title="Cambiá tu contraseña" lead={<>Cambiá la contraseña que te dieron por una tuya. <strong>{OWN_PASSWORD_RULE}</strong></>}>
    {busy && <Status>Guardando tu contraseña…</Status>}
    <form id={formId} onSubmit={submit} className="form-stack" aria-busy={busy} noValidate>
      <FormField label="Contraseña que te dieron" error={fields.errors.current}><input type={type} autoComplete="current-password" required value={current}
        onChange={(e) => { setCurrent(e.target.value); fields.clear('current') }} /></FormField>
      <FormField label="Nueva contraseña" hint={lengthCounter(next)} error={fields.errors.next}><input type={type} autoComplete="new-password" minLength={PASSWORD_MIN_CHARACTERS} maxLength={PASSWORD_MAX_CHARACTERS} required value={next}
        onChange={(e) => { setNext(e.target.value); fields.clear('next') }} /></FormField>
      <FormField label="Repetí la nueva contraseña" error={fields.errors.confirm}><input type={type} autoComplete="new-password" minLength={PASSWORD_MIN_CHARACTERS} maxLength={PASSWORD_MAX_CHARACTERS} required value={confirm}
        onChange={(e) => { setConfirm(e.target.value); fields.clear('confirm') }} /></FormField>
      <PasswordToggle shown={shown} label="Mostrar contraseñas" onToggle={() => setShown((value) => !value)} />
      {/* What the server answered goes inside the form, above its button (design system 4.7). */}
      {error && <PageMessage kind="error">{error}</PageMessage>}
      <button className="button button-primary button-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      <button type="button" className="button button-link" onClick={onSignOut}>Cerrar sesión</button>
    </form>
  </AuthFrame>
}
