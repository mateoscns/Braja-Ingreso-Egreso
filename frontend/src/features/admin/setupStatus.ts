import type { Employee, Site, Template, TemplateAssignment } from '../../shared/api/types'
import type { JourneyRow } from './AdminViewsRender'
import { addDays, calendarToday, dayText } from './workDays'

/** The ADMIN sections; AdminApp keeps the current one in local state and passes navigation callbacks down. */
export type AdminSection = 'setup' | 'inbox' | 'jornadas' | 'historial' | 'sedes' | 'plantillas' | 'empleados'

/** One GET per employee is acceptable for a small team; beyond this many, step 4 sends the owner to Empleados instead. */
export const ASSIGNMENT_CHECK_LIMIT = 30
/** Days loaded are read from tomorrow on, for a month: step 5 looks at tomorrow and the next 7 days, the notice at the whole window. */
const COVERAGE_WINDOW_DAYS = 31
const READY_WINDOW_DAYS = 8

export type SetupData = {
  sites: Site[]; templates: Template[]; employees: Employee[]
  /** Template assignments of the employees that were checked (the first ASSIGNMENT_CHECK_LIMIT active ones). */
  assignments: Map<string, TemplateAssignment[]>
  checkedAll: boolean
  /** Tomorrow in each site's calendar, and that site's jornadas from tomorrow to the end of the window. */
  tomorrow: Map<string, string>
  jornadas: Map<string, JourneyRow[]>
}

type Getter = (path: string) => Promise<unknown>

/** Reads only existing GET endpoints; GET /jornadas without detail has no row cap, one query per site with people. */
export async function loadSetupData(get: Getter, now: Date = new Date()): Promise<SetupData> {
  const [sites, templates, employees] = await Promise.all([get('/sites'), get('/templates'), get('/employees')]) as [Site[], Template[], Employee[]]
  const active = employees.filter((person) => person.active)
  const checked = active.slice(0, ASSIGNMENT_CHECK_LIMIT)
  const tomorrow = new Map(sites.map((site) => [site.id, addDays(calendarToday(site.timeZone, now), 1)]))
  const staffed = sites.filter((site) => active.some((person) => person.siteIds.includes(site.id)))
  const [assignmentLists, jornadaLists] = await Promise.all([
    Promise.all(checked.map((person) => get(`/employees/${encodeURIComponent(person.id)}/template-assignments`))),
    Promise.all(staffed.map((site) => {
      const from = tomorrow.get(site.id)!
      return get(`/jornadas?from=${from}&to=${addDays(from, COVERAGE_WINDOW_DAYS - 1)}&siteId=${encodeURIComponent(site.id)}`)
    }))
  ])
  return {
    sites, templates, employees,
    assignments: new Map(checked.map((person, index) => [person.id, assignmentLists[index] as TemplateAssignment[]])),
    checkedAll: checked.length === active.length,
    tomorrow,
    jornadas: new Map(staffed.map((site, index) => [site.id, jornadaLists[index] as JourneyRow[]]))
  }
}

export type SetupStep = {
  title: string; explanation: string; done: boolean | 'unknown'; detail?: string
  section: AdminSection; sectionLabel: string
}

function joinNames(names: string[], limit = 5): string {
  const shown = names.slice(0, limit)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} y ${rest} más`
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}`
}

/** The assignment in force tomorrow for that site, if its schedule is active (D-20261015-02: the newest validFrom wins). */
function hasScheduleAt(data: SetupData, person: Employee, siteId: string): boolean | 'unknown' {
  const history = data.assignments.get(person.id)
  if (!history) return 'unknown'
  const tomorrow = data.tomorrow.get(siteId) ?? ''
  const current = history.filter((item) => item.siteId === siteId && item.validFrom <= tomorrow)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.createdAt.localeCompare(a.createdAt))[0]
  return Boolean(current && data.templates.some((template) => template.id === current.templateId && template.active))
}

/** Active people of the site who can get days loaded; an unchecked person counts when the site has an active schedule. */
function peopleWithSchedule(data: SetupData, siteId: string): Employee[] {
  const siteHasSchedule = data.templates.some((template) => template.siteId === siteId && template.active)
  return data.employees.filter((person) => {
    if (!person.active || !person.siteIds.includes(siteId)) return false
    const known = hasScheduleAt(data, person, siteId)
    return known === 'unknown' ? siteHasSchedule : known
  })
}

const loaded = (rows: JourneyRow[] | undefined) => (rows ?? []).filter((row) => row.state !== 'CANCELADA')

export function setupSteps(data: SetupData): SetupStep[] {
  const active = data.employees.filter((person) => person.active)
  const sitesWithoutSchedule = data.sites.filter((site) => !data.templates.some((template) => template.siteId === site.id && template.active))
  const withoutSchedule = active.filter((person) => person.siteIds.some((siteId) => hasScheduleAt(data, person, siteId) === false))
  const staffed = data.sites.filter((site) => peopleWithSchedule(data, site.id).length > 0)
  const sitesWithoutDays = staffed.filter((site) => {
    const from = data.tomorrow.get(site.id) ?? ''
    const to = addDays(from, READY_WINDOW_DAYS - 1)
    return !loaded(data.jornadas.get(site.id)).some((row) => row.localDate >= from && row.localDate <= to)
  })
  const scheduleDone: boolean | 'unknown' = active.length === 0 || withoutSchedule.length > 0 ? false : data.checkedAll ? true : 'unknown'
  return [
    {
      title: 'Tu local', explanation: 'Cargá el local donde trabaja tu equipo y dónde queda, para saber si marcan desde ahí.',
      done: data.sites.length > 0, section: 'sedes', sectionLabel: 'Sedes'
    },
    {
      title: 'Tus horarios', explanation: 'Armá los horarios de cada local: a qué hora se entra, se sale y cuánto duran las pausas.',
      done: data.sites.length > 0 && sitesWithoutSchedule.length === 0,
      detail: data.sites.length > 0 && sitesWithoutSchedule.length > 0 ? `Falta en: ${joinNames(sitesWithoutSchedule.map((site) => site.name))}.` : undefined,
      section: 'plantillas', sectionLabel: 'Horarios'
    },
    {
      title: 'Tu equipo', explanation: 'Dá de alta a las personas que van a marcar, con su DNI y su local.',
      done: active.length > 0, section: 'empleados', sectionLabel: 'Empleados'
    },
    {
      title: 'Cada uno con su horario', explanation: 'Elegí qué horario tiene cada persona, desde Empleados.',
      done: scheduleDone,
      detail: withoutSchedule.length > 0 ? `Falta para: ${joinNames(withoutSchedule.map((person) => person.displayName))}.`
        : scheduleDone === 'unknown' ? 'Revisá Empleados: son muchas personas para revisarlas desde acá.' : undefined,
      section: 'empleados', sectionLabel: 'Empleados'
    },
    {
      title: 'Días de trabajo cargados', explanation: 'Cargá los días que trabaja cada persona. Se hace una vez por mes.',
      done: staffed.length > 0 && sitesWithoutDays.length === 0,
      detail: sitesWithoutDays.length > 0 ? `Falta en: ${joinNames(sitesWithoutDays.map((site) => site.name))}.` : undefined,
      section: 'jornadas', sectionLabel: 'Jornadas'
    }
  ]
}

/** A step that could not be checked (too many people) does not keep the guide open. */
export function setupComplete(steps: SetupStep[]): boolean {
  return steps.every((step) => step.done !== false)
}

/** People with a day loaded tomorrow, in any site. */
export function readyTomorrow(data: SetupData): number {
  const people = new Set<string>()
  for (const [siteId, rows] of data.jornadas) {
    const tomorrow = data.tomorrow.get(siteId)
    loaded(rows).filter((row) => row.localDate === tomorrow).forEach((row) => people.add(row.employeeId))
  }
  return people.size
}

export type CoverageNotice = { kind: 'info' | 'error'; text: string; siteNames: string[] }

/** Error when a site with people on a schedule has nobody loaded tomorrow; otherwise until when days are loaded. */
export function coverageNotice(data: SetupData): CoverageNotice | null {
  const staffed = data.sites.filter((site) => peopleWithSchedule(data, site.id).length > 0)
  if (staffed.length === 0) return null
  const missing = staffed.filter((site) => !loaded(data.jornadas.get(site.id)).some((row) => row.localDate === data.tomorrow.get(site.id)))
  if (missing.length > 0) {
    const names = missing.map((site) => site.name)
    return { kind: 'error', siteNames: names, text: `Mañana nadie tiene día cargado en ${joinNames(names)}: cargalos para que puedan marcar.` }
  }
  // The soonest site to run out is the one that matters.
  const lastDays = staffed.map((site) => loaded(data.jornadas.get(site.id)).reduce((last, row) => row.localDate > last ? row.localDate : last, ''))
  const until = lastDays.reduce((soonest, day) => day < soonest ? day : soonest)
  return { kind: 'info', siteNames: [], text: `Hay días cargados hasta el ${dayText(until)}.` }
}
