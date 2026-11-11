import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminSection } from './setupStatus'

/**
 * The address of each ADMIN section (D-20261111-02, step 1): reload and Back keep the place.
 * These are already the names of the four-destination menu, so they change only once: step 2 adds
 * '#/dias-de-trabajo' (slice N3a) and '#/configuracion', and '#/historial' shows «Hoy» (slice N3b, RETIRED_ADDRESSES).
 *
 *   inbox      #/para-revisar                  (Bandeja)
 *   jornadas   #/hoy                           (Hoy: the days of a date, their detail and the search of earlier days)
 *   workdays   #/dias-de-trabajo               (Días de trabajo: the monthly load and the single day)
 *   sedes      #/configuracion/locales
 *   plantillas #/configuracion/horarios
 *   empleados  #/configuracion/equipo
 *   setup      #/configuracion/primeros-pasos
 *
 * A Record over AdminSection makes the compiler ask for an address for every section, so this list cannot drift from it.
 */
export const SECTION_ADDRESSES: Readonly<Record<AdminSection, string>> = {
  inbox: '#/para-revisar',
  jornadas: '#/hoy',
  workdays: '#/dias-de-trabajo',
  sedes: '#/configuracion/locales',
  plantillas: '#/configuracion/horarios',
  empleados: '#/configuracion/equipo',
  setup: '#/configuracion/primeros-pasos'
}

/** The address of the «Historial» section, gone in step 2: its search is a fold of «Hoy», which this address opens. */
export const HISTORY_ADDRESS = '#/historial'

/**
 * Addresses of sections that no longer exist, with the section that took their place. A bookmark, a reload or an old
 * history entry keeps working: it shows that section, and the address is replaced by the section's own in the same
 * history entry, so each section still has one address.
 */
const RETIRED_ADDRESSES: ReadonlyMap<string, AdminSection> = new Map<string, AdminSection>([[HISTORY_ADDRESS, 'jornadas']])

const SECTIONS = Object.keys(SECTION_ADDRESSES) as AdminSection[]

/** Exact match only: anything else, malformed or unknown, names no section and shows the start section. */
export function sectionFromHash(hash: string): AdminSection | null {
  return SECTIONS.find((section) => SECTION_ADDRESSES[section] === hash) ?? RETIRED_ADDRESSES.get(hash) ?? null
}

/** Addresses start with '#/'; any other fragment (the brand's '#inicio', a skip link) is an anchor inside the page. */
const isAnchor = (hash: string) => hash !== '' && !hash.startsWith('#/')

/** Changes the address of the current history entry, so no Back step is added. */
function replaceHash(hash: string) {
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`)
}

export type AdminSectionState = {
  /** The section to show: the one the address names, else the start section; null on the first render and while neither is known. */
  section: AdminSection | null
  /** Shows a section and writes its address as a new history entry, so Back returns to the previous one. */
  go: (next: AdminSection) => void
  /** The retired address the shown section was reached by (HISTORY_ADDRESS opens the search of «Hoy»); null once the
      owner moves on. */
  retiredAddress: string | null
}

/**
 * Keeps the ADMIN section in the address (`location.hash`), with no routing library: a hash never reaches the
 * server, so the service worker, Caddy and the API do not change, and nothing is stored in the browser (rule 27).
 * `start` is the section to open when the address names none; it is null until the setup status decides it.
 * Only AdminApp uses this hook: the employee app and the sign-in screens never read or write the hash.
 */
export function useAdminSection(start: AdminSection | null): AdminSectionState {
  const [addressed, setAddressed] = useState<AdminSection | null>(null)
  const [retiredAddress, setRetiredAddress] = useState<string | null>(null)
  // The address is read in the first effect, not during render: when the company changes, App.tsx mounts a new
  // AdminApp whose render runs before the old one's cleanup has cleared its address.
  const [ready, setReady] = useState(false)
  const read = useRef(false)
  const section = ready ? addressed ?? start : null

  useEffect(() => {
    // A retired address shows the section that took its place and gets that section's address at once, in the same
    // history entry; the section effect below would leave it, since it names a section.
    const take = (hash: string) => {
      const named = sectionFromHash(hash)
      const retired = named !== null && hash !== SECTION_ADDRESSES[named]
      if (retired) replaceHash(SECTION_ADDRESSES[named])
      setRetiredAddress(retired ? hash : null)
      setAddressed(named)
    }
    // In StrictMode the effect runs twice on mount; the second run must not read the address the first cleanup cleared.
    if (!read.current) {
      read.current = true
      take(window.location.hash)
      setReady(true)
    }
    const follow = () => {
      const hash = window.location.hash
      if (!isAnchor(hash)) take(hash)
    }
    window.addEventListener('hashchange', follow)
    return () => {
      window.removeEventListener('hashchange', follow)
      // Signing out, switching company or switching to the employee view leaves no place for the next person.
      replaceHash('')
    }
  }, [])

  useEffect(() => {
    if (section === null) return
    // The start section, once shown, becomes the place: a later change of the start never moves the owner away.
    // Both steps read the live state: a hashchange may land between this render and this effect, and it wins.
    setAddressed((current) => current ?? section)
    // The start section and an unknown address get the address of what is shown, in the same history entry. An anchor
    // followed later does not run this again (the section stays), so its jump is not undone.
    if (sectionFromHash(window.location.hash) === null) replaceHash(SECTION_ADDRESSES[section])
  }, [section, addressed])

  const go = useCallback((next: AdminSection) => {
    setAddressed(next); setRetiredAddress(null)
    // Assigning the hash adds a history entry and fires hashchange, which lands on the same section.
    if (window.location.hash !== SECTION_ADDRESSES[next]) window.location.hash = SECTION_ADDRESSES[next]
  }, [])

  return { section, go, retiredAddress }
}
