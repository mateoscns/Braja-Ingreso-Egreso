// Helpers shared by the ADMIN render files of each section: the label of a jornada state, the date-time format and the link to
// another section.
import type { ReactNode } from 'react'
import { formatDateTime, jornadaStateLabel } from '../../shared/format'
import { followLink } from './AdminNav'
import type { AdminSection } from './setupStatus'
import { SECTION_ADDRESSES } from './useAdminSection'

export const stateLabel = jornadaStateLabel
export const dateTime = formatDateTime

/**
 * A link to another section at its address: a plain link that also works without `onNavigate` (the address change shows the
 * section), and through it when given, as the menu does (AdminNav.followLink). `inline`: a link inside a sentence, without the
 * box of a link button.
 */
export function SectionLink({ section, onNavigate, inline = false, children }: { section: AdminSection; onNavigate?: (section: AdminSection) => void; inline?: boolean; children: ReactNode }) {
  return <a className={inline ? undefined : 'button button-link'} href={SECTION_ADDRESSES[section]} onClick={onNavigate ? (event) => followLink(event, section, onNavigate) : undefined}>{children}</a>
}
