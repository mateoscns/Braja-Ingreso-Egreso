import type { MouseEvent } from 'react'
import { Icon, type IconName } from '../../app/icons'
import type { AdminSection } from './setupStatus'
import { SECTION_ADDRESSES } from './useAdminSection'

export type NavItem = { section: AdminSection; label: string; icon: IconName }

/** The four destinations of D-20261111-02, in the decided order. Their order never changes and none is hidden. */
export const DESTINATIONS: readonly NavItem[] = [
  { section: 'inbox', label: 'Para revisar', icon: 'inbox' },
  { section: 'jornadas', label: 'Hoy', icon: 'today' },
  { section: 'workdays', label: 'Días de trabajo', icon: 'month' },
  { section: 'config', label: 'Configuración', icon: 'config' }
]

/** The parts of «Configuración» that are pages, in the order of the design system (5.1); «Primeros pasos» only while a step is missing. */
export const SETUP_PART: NavItem = { section: 'setup', label: 'Primeros pasos', icon: 'steps' }
export const CONFIGURATION_PARTS: readonly NavItem[] = [
  { section: 'sedes', label: 'Locales', icon: 'store' },
  { section: 'plantillas', label: 'Horarios', icon: 'schedule' },
  { section: 'empleados', label: 'Equipo', icon: 'people' }
]

const CONFIGURATION_SECTIONS = new Set<AdminSection>([SETUP_PART.section, ...CONFIGURATION_PARTS.map((part) => part.section)])

/** True for a part of «Configuración» (not the page itself): «Configuración» stays the current destination while one is shown. */
export const isConfigurationPart = (section: AdminSection | null) => section !== null && CONFIGURATION_SECTIONS.has(section)

/**
 * A link that the app follows itself, so leaving a section does what choosing it always did (AdminApp's `navigate`). A click
 * with a modifier or another button is the browser's: it opens the address in another tab or window.
 */
export function followLink(event: MouseEvent<HTMLAnchorElement>, section: AdminSection, onNavigate: (section: AdminSection) => void) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  onNavigate(section)
}

/**
 * The ADMIN's navigation (design system 5.2): one `nav` with the four destinations as links to their address. The same markup is
 * a bar fixed at the bottom on phones and tablets and a rail on the left from 1024 px (styles.css). The parts of «Configuración»
 * are a list inside its item: the rail shows them (the owner, 2026-11-11), the bar hides them and the «Configuración» page lists
 * them. Render only: AdminApp owns the section and whether a setup step is missing.
 */
export function AdminNav({ section, setupMissing, onNavigate }: {
  section: AdminSection | null
  /** Lists «Primeros pasos» first among the parts. It also stays while it is the place shown, so the rail never loses it. */
  setupMissing: boolean
  onNavigate: (section: AdminSection) => void
}) {
  const parts = setupMissing || section === SETUP_PART.section ? [SETUP_PART, ...CONFIGURATION_PARTS] : CONFIGURATION_PARTS
  const link = (item: NavItem, current: 'page' | 'true' | undefined) => <a className="nav-link" href={SECTION_ADDRESSES[item.section]}
    aria-current={current} onClick={(event) => followLink(event, item.section, onNavigate)}>
    <Icon name={item.icon} /><span>{item.label}</span>
  </a>
  return <nav className="nav" aria-label="Navegación principal">
    <ul className="nav-list">{DESTINATIONS.map((item) => <li key={item.section}>
      {link(item, section === item.section ? 'page' : item.section === 'config' && isConfigurationPart(section) ? 'true' : undefined)}
      {item.section === 'config' && <ul className="nav-sub">{parts.map((part) => <li key={part.section}>
        {link(part, section === part.section ? 'page' : undefined)}
      </li>)}</ul>}
    </li>)}</ul>
  </nav>
}
