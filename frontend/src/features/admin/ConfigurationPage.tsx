import { Icon } from '../../app/icons'
import { PageHeading } from '../../app/ui'
import { AdminPushControlRender, type AdminPushControlRenderProps } from '../../device/push/AdminPushControl'
import { CONFIGURATION_PARTS, SETUP_PART, followLink, type NavItem } from './AdminNav'
import type { AdminSection } from './setupStatus'
import { SECTION_ADDRESSES } from './useAdminSection'

/** One line per part that says what it is for (design system 5.2). */
const ABOUT: Partial<Record<AdminSection, string>> = {
  setup: 'Lo que falta para que tu equipo pueda marcar.',
  sedes: 'Dónde trabaja tu equipo y dónde queda cada local.',
  plantillas: 'A qué hora se entra, se sale y cuánto duran las pausas.',
  empleados: 'Las personas que marcan, con su DNI, su local y su horario.'
}

/**
 * The «Configuración» page (D-20261111-02, design system 5.2): a way to each of its parts, with «Primeros pasos» first while a
 * step is missing; then the avisos of this device, whose state comes from the hook AdminApp keeps on every screen; then whether
 * the connection is protected. On a phone this page is the only way to the parts; on a computer the rail lists them too.
 * Render only: everything it shows comes by props (rule 36).
 */
export function ConfigurationPage({ setupMissing, secure, onNavigate, push }: {
  setupMissing: boolean
  /** `window.isSecureContext`, read by the container. */
  secure: boolean
  onNavigate: (section: AdminSection) => void
  push: AdminPushControlRenderProps
}) {
  const parts: readonly NavItem[] = setupMissing ? [SETUP_PART, ...CONFIGURATION_PARTS] : CONFIGURATION_PARTS
  return <>
    <PageHeading title="Configuración" subtitle="Tus locales, sus horarios, tu equipo y los avisos en este dispositivo." />
    {/* A list of records (design system 5.2) whose row is the link itself: the whole row is the target and carries the hairline. */}
    <ul className="record-list" aria-label="Partes de la configuración">{parts.map((part) => <li key={part.section}>
      <a className="config-link" href={SECTION_ADDRESSES[part.section]} onClick={(event) => followLink(event, part.section, onNavigate)}>
        <Icon name={part.icon} />
        <span className="config-link-copy"><strong>{part.label}</strong><small>{ABOUT[part.section]}</small></span>
        <Icon name="right" />
      </a>
    </li>)}</ul>
    <AdminPushControlRender {...push} />
    {secure && <p className="connection-note"><Icon name="check" />Conexión protegida</p>}
  </>
}
