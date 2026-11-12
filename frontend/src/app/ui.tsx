import { cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Membership, Session } from '../shared/api/types'
import { BrandMark, Icon, type IconName } from './icons'
import { revealAndFocus } from './revealAndFocus'

export type MessageKind = 'info' | 'success' | 'warning' | 'error'

/** The kind of a message is told by its bar and its icon, not by colour alone; the words still carry it for screen readers. */
const MESSAGE_ICONS = { info: 'info', success: 'check', warning: 'alert', error: 'error' } satisfies Record<MessageKind, IconName>

/** False on the first render, true right after: a `status` region mounts empty so the text it gets next is announced. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return mounted
}

/**
 * A message in a live region. An error is an `alert`, which screen readers announce as soon as it appears.
 * A `status` is only announced reliably when the text changes inside a region that already exists, so an info, success or
 * warning message mounts its region empty and writes the icon and the text right after; later changes update the same region.
 */
export function PageMessage({ children, kind = 'info' }: { children: ReactNode; kind?: MessageKind }) {
  const mounted = useMounted()
  const alert = kind === 'error'
  return <div className={`message message-${kind}`} role={alert ? 'alert' : 'status'} aria-atomic="true">
    {alert || mounted ? <><Icon name={MESSAGE_ICONS[kind]} /><div className="message-body">{children}</div></> : null}
  </div>
}

/**
 * A line that comes and goes while something runs («Entrando…», «Enviando tu marca…»): a `status` region that mounts empty and
 * writes its content right after, like PageMessage, so screen readers announce it (WCAG 4.1.3). `as` and `className` keep the
 * element and the look the line already had.
 */
export function Status({ children, className, as: Tag = 'p' }: { children: ReactNode; className?: string; as?: 'p' | 'div' | 'span' }) {
  const mounted = useMounted()
  return <Tag className={className} role="status" aria-atomic="true">{mounted ? children : null}</Tag>
}

/**
 * A failed load: the error and the way to try again, in place of what could not be shown. `retryLabel` keeps a button that
 * names what it reloads; `disabled` turns it off while the load runs again; `primary` fills the button when retrying is the
 * only thing left to do on the screen.
 */
export function LoadFailure({ message, onRetry, retryLabel = 'Reintentar', disabled = false, primary = false }: {
  message: string; onRetry: () => void; retryLabel?: string; disabled?: boolean; primary?: boolean
}) {
  return <div className="form-stack"><PageMessage kind="error">{message}</PageMessage><button type="button" className={`button ${primary ? 'button-primary' : 'button-quiet'}`} disabled={disabled} onClick={onRetry}>{retryLabel}</button></div>
}

/**
 * The title of a page with its lead; an optional action sits on the right and wraps under it on phones. The line in capitals above
 * the title is optional: a new page («Configuración») has none, since the system writes no capitals (design system 7.1), and the
 * old pages keep theirs until the owner decides on them. tabIndex -1: after a change of section the title takes the focus by
 * script (AdminApp), so it is read first; Tab does not stop on it.
 */
export function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><h1 tabIndex={-1}>{title}</h1><p className="muted">{subtitle}</p></div>{action}</div>
}

const PRODUCT_NAME = 'Fichaje Braja'

/** The title of the browser tab (WCAG 2.4.2): what is shown first, so tabs read apart, then the product («Hoy · Fichaje Braja»). */
export function pageTitle(name?: string): string {
  return name ? `${name} · ${PRODUCT_NAME}` : PRODUCT_NAME
}

/** Names the browser tab after the screen shown. null leaves it to a screen further in: the ADMIN's sections name themselves. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => { if (title !== null) document.title = title }, [title])
}

/** The screens App.tsx chooses between, before the app of a role takes over. */
export type EntryScreen = 'boot' | 'login' | 'password' | 'company' | 'admin' | 'employee'

/** Which screen the session asks for. It lives here, not in App.tsx, so it can be tested: App.tsx imports a module of the build. */
export function entryScreen(loading: boolean, session: Session | null): EntryScreen {
  if (loading) return 'boot'
  if (!session) return 'login'
  if (session.mustChangePassword) return 'password'
  const active = session.memberships.find((membership) => membership.companyId === session.activeCompanyId)
  if (!active) return 'company'
  return active.role === 'ADMIN' ? 'admin' : 'employee'
}

/**
 * The tab title of each screen: the name of the screen as its heading or its button says it. The employee has one screen, named
 * after what it is for, «Marcar» (the name of its main section, design system 4.13). The ADMIN's sections name themselves.
 */
export const ENTRY_TITLES: Readonly<Record<EntryScreen, string | null>> = {
  boot: pageTitle(),
  login: pageTitle('Ingresar'),
  password: pageTitle('Cambiá tu contraseña'),
  company: pageTitle('Elegí una empresa'),
  employee: pageTitle('Marcar'),
  admin: null
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

/** A load in progress: it replaces what is coming, and is a Status so its words are announced. */
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <Status as="div" className="loading"><span className="spinner" aria-hidden="true" />{label}</Status>
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const headingId = useId()
  return <section className="panel" aria-labelledby={headingId}><div className="panel-heading"><h2 id={headingId}>{title}</h2>{action}</div>{children}</section>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>
}

/**
 * The name of the product with its mark: the one lockup of the app (top bar and sign-in screens). A real space between the two
 * words, so they are read as two. It is a link only where it leads somewhere (`home`: the ADMIN's «Para revisar»); the employee
 * has one screen, so there it is text.
 */
export function Brand({ home }: { home?: string }) {
  const lockup = <><BrandMark /><span>{'Fichaje '}<span className="brand-light">Braja</span></span></>
  return home ? <a className="brand" href={home} aria-label="Fichaje Braja, inicio">{lockup}</a> : <span className="brand">{lockup}</span>
}

/** The id of the one `main` of every screen: the target of «Ir al contenido». The main also takes tabIndex -1 to receive the focus. */
export const CONTENT_ID = 'contenido'

/**
 * «Ir al contenido» (WCAG 2.4.1; the owner's words, 2026-11-12): the first thing Tab reaches on every screen, out of sight until it
 * has the focus. It moves the focus to the main by script instead of following its link: the ADMIN keeps its section in the
 * address (#/hoy), which a jump to #contenido would replace.
 */
export function SkipLink() {
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById(CONTENT_ID)
    if (!main) return
    event.preventDefault()
    revealAndFocus(main, main, 'start')
  }
  return <a className="skip-link" href={`#${CONTENT_ID}`} onClick={skip}>Ir al contenido</a>
}

/**
 * The box of a table wider than its room: it scrolls sideways inside it, never the page (styles.css). While it does, the box is
 * a region named by the title that names the table and a stop of Tab, so the keyboard can scroll it too (WCAG 2.1.1); a table
 * that fits adds no stop. It is measured again when the box or the table changes size, and when the window does.
 */
export function TableScroll({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => setScrolls(element.scrollWidth > element.clientWidth)
    measure()
    window.addEventListener('resize', measure)
    // A day opened inside a row widens the table without a change of the window.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    if (element.firstElementChild) observer?.observe(element.firstElementChild)
    return () => { window.removeEventListener('resize', measure); observer?.disconnect() }
  }, [])
  return <div ref={box} className="table-scroll" role={scrolls ? 'region' : undefined} tabIndex={scrolls ? 0 : undefined} aria-labelledby={scrolls ? labelledBy : undefined}>{children}</div>
}

/** The area under the top bar where its controls put their messages; null outside a top bar. */
const TopbarNotices = createContext<HTMLElement | null>(null)

/**
 * A message of a top bar control (the install help, the company switch): it opens under the bar, in the flow of the page and at
 * its full width, never floating over it (design system 4.17, 4.18). Outside a top bar it stays where it is.
 */
export function TopbarNotice({ children }: { children: ReactNode }) {
  const area = useContext(TopbarNotices)
  return area ? createPortal(children, area) : <>{children}</>
}

/**
 * The top bar: the brand and «Cerrar sesión» on the dark row; the company, the person and this device's controls (`children`:
 * the install help, the company switch) in the context area, a strip under the row on phones. It is not sticky and has no fixed
 * height. `home` is where the brand leads; without it the brand is text.
 */
export function AppHeader({ companyName, name, onSignOut, home, children }: {
  companyName: string; name: string; onSignOut: () => void; home?: string; children?: ReactNode
}) {
  const [notices, setNotices] = useState<HTMLDivElement | null>(null)
  return <>
    <header className="topbar">
      <Brand home={home} />
      <div className="topbar-context">
        <p className="topbar-who"><span className="topbar-company">{companyName}<span aria-hidden="true"> · </span></span><span>{name}</span></p>
        <TopbarNotices.Provider value={notices}>{children}</TopbarNotices.Provider>
      </div>
      <button type="button" className="button button-link topbar-out" onClick={onSignOut}>Cerrar sesión</button>
    </header>
    <div className="topbar-notices" ref={setNotices} />
  </>
}

export function CompanySwitcher({ memberships, activeCompanyId, onSelect, disabled = false }: {
  memberships: Membership[]; activeCompanyId: string; onSelect: (companyId: string) => Promise<void>; disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingCompanyId, setPendingCompanyId] = useState('')
  const requestPending = useRef(false)
  const selectId = useId()
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
  // The label that was only read by screen readers is now visible; the wait and the error are ordinary messages under the bar.
  return <>
    <div className="company-switch-wrap">
      <label className="company-switch-label" htmlFor={selectId}>Empresa activa</label>
      <select id={selectId} className="company-switch" aria-busy={busy} disabled={busy || disabled} value={activeCompanyId} onChange={(event) => void change(event.target.value)}>
        {memberships.map((membership) => <option key={membership.companyId} value={membership.companyId}>{membership.companyName}</option>)}
      </select>
    </div>
    {busy && <TopbarNotice><PageMessage>Esperando la activación de {pendingCompanyName}…</PageMessage></TopbarNotice>}
    {error && <TopbarNotice><PageMessage kind="error">{error}</PageMessage></TopbarNotice>}
  </>
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

/**
 * A group of controls that is one field (checks, quick choices, the location of a local): a fieldset named by its legend, with
 * the hint after it and the error at its end, as FormField. Both describe the group; the error marks it `aria-invalid` and
 * `field-invalid`. `errorId` names the error for a control inside that also points to it (the dates of a period).
 */
export function Fieldset({ legend, hint, error, errorId, className, children }: {
  legend: ReactNode; hint?: ReactNode; error?: ReactNode; errorId?: string; className?: string; children: ReactNode
}) {
  const hintId = useId()
  const ownErrorId = useId()
  const shownErrorId = errorId ?? ownErrorId
  const describedBy = [hint ? hintId : '', error ? shownErrorId : ''].filter(Boolean).join(' ') || undefined
  return <fieldset className={['field', className, error ? 'field-invalid' : ''].filter(Boolean).join(' ')} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
    <legend className="field-label">{legend}</legend>
    {hint && <span className="field-hint" id={hintId}>{hint}</span>}
    {children}
    {error && <span className="field-error" id={shownErrorId}><Icon name="alert" />{error}</span>}
  </fieldset>
}

/** The sentence over the buttons of a long form when more than one of its fields is wrong (design system 4.7). */
export const FIELDS_SUMMARY = 'Revisá lo que está marcado debajo de cada campo.'

/** The summary of a long form: an alert, so it is read as it appears, shown only while two or more fields are invalid. */
export function FieldsSummary({ count }: { count: number }) {
  return count > 1 ? <PageMessage kind="error">{FIELDS_SUMMARY}</PageMessage> : null
}
