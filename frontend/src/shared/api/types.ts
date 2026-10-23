export type Id = string
export type Role = 'ADMIN' | 'EMPLOYEE'
export type Membership = { companyId: Id; companyName: string; role: Role }
export type Session = {
  accountId: Id
  dni?: string
  /** Name of the person in the active company; omitted for an ADMIN with no employee row. */
  displayName?: string
  memberships: Membership[]
  activeCompanyId: Id | null
  mustChangePassword: boolean
}
export type PublicConfig = { pushEnabled: boolean; vapidPublicKey: string | null }
export type Site = { id: Id; name: string; timeZone: string }
export type Employee = {
  id: Id; displayName: string; dni?: string; siteIds: Id[]; toleranceMinutes: number; active: boolean; mustChangePassword?: boolean
}
export type TemplateBlock = { startDayOffset: 0 | 1; start: string; end: string; endDayOffset: 0 | 1 }
export type TemplateInput = {
  siteId: Id; name: string; blocks: TemplateBlock[]; breakfastLimitMinutes: number; lunchLimitMinutes: number
}
export type Template = TemplateInput & { id: Id; active: boolean }
export type MarkAction = 'INGRESO' | 'EGRESO' | 'SALIDA_DESAYUNO' | 'VUELTA_DESAYUNO' | 'SALIDA_ALMUERZO' | 'VUELTA_ALMUERZO'
export type Mark = {
  id: Id; jornadaId: Id; action: MarkAction; sequence: number; acceptedAt: string; occurredAt?: string | null;
  recordedAt?: string | null; locationStatus: 'PENDIENTE' | 'RECIBIDA' | 'SIN_UBICACION' | 'PURGADA' | 'NO_APLICA';
  latitude?: number | null; longitude?: number | null; deviations?: Deviation[]
}
export type JornadaState = 'NO_INGRESO' | 'EN_CURSO' | 'PAUSA_ABIERTA' | 'EGRESADA'
export type Jornada = {
  id: Id; employeeId: Id; siteId: Id; localDate: string; state: JornadaState; scheduleSnapshot: TemplateInput;
  toleranceMinutes: number; sequence: number; marks: Mark[]
}
/** GET /jornadas; marks and deviations only with includeDetail=true. */
export type JornadaSummary = {
  id: Id; employeeId: Id; siteId: Id; localDate: string; state: JornadaState; employeeDisplayName?: string;
  marks?: Mark[]; deviations?: Deviation[]
}
export type Deviation = {
  id: Id; jornadaId: Id; siteId?: Id; employeeId?: Id; employeeDisplayName?: string;
  type: 'SIN_INGRESO' | 'LLEGADA_TARDE' | 'EGRESO_TEMPRANO' | 'EGRESO_TARDIO' | 'MARCA_FALTANTE' | 'EXCESO_DESAYUNO' | 'EXCESO_ALMUERZO';
  status: 'MOTIVO_PENDIENTE' | 'PENDIENTE_REVISION' | 'JUSTIFICADO' | 'NO_JUSTIFICADO';
  category?: 'SALUD' | 'TRANSPORTE' | 'EMERGENCIA' | 'OTRA' | null; motiveText?: string | null;
  /** Time of the fact (source mark; due time for SIN_INGRESO / MARCA_FALTANTE). createdAt is the detection time. */
  occurredAt?: string; createdAt: string; updatedAt?: string; pushEligible: boolean
}
export type Inbox = { items: Deviation[]; nextCursor?: string | null }
