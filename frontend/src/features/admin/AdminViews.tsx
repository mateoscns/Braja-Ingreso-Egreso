// The ADMIN containers live in one file per section since slice M2; re-exported here so that no importer changes.
export { AdminInbox } from './AdminInbox'
export { AdminHistory } from './AdminHistory'
export { SitesView } from './SitesView'
export { EmployeesView } from './EmployeesView'

/** Horarios (the UI name of schedule templates, issue #103) live in SchedulesView. */
export { SchedulesView as TemplatesView } from './SchedulesView'

export { JourneysView } from './JourneysView'
export type { OpenJornadaRequest } from './JourneysView'
export { WorkDaysView } from './WorkDaysView'
