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
export type CurrentPushSubscription = { subscribed: boolean; id?: Id }
export type Site = { id: Id; name: string; timeZone: string }
export type Employee = {
  id: Id; displayName: string; dni?: string; siteIds: Id[]; toleranceMinutes: number; active: boolean; mustChangePassword?: boolean
}
/** Returned once by POST /employees/{id}/password-reset; keep it only in component memory. */
export type PasswordReset = { temporaryPassword: string }
export type TemplateBlock = { startDayOffset: 0 | 1; start: string; end: string; endDayOffset: 0 | 1 }
export type TemplateInput = {
  siteId: Id; name: string; blocks: TemplateBlock[]; breakfastLimitMinutes: number; lunchLimitMinutes: number
}
export type Template = TemplateInput & { id: Id; active: boolean }
/** D-20261015-02: a template per employee and site from validFrom on; rows are never edited, newest validFrom first. */
export type TemplateAssignment = { id: Id; employeeId: Id; siteId: Id; templateId: Id; templateName: string; validFrom: string; createdAt: string }
export type BulkSkipReason = 'JORNADA_EXISTS' | 'TEMPLATE_REQUIRED' | 'TEMPLATE_INVALID'
/** POST /jornadas/bulk (D-20261027-11): jornadas created once, and the dates skipped with their reason. */
export type BulkDeclarationResult = {
  created: { id: Id; employeeId: Id; siteId: Id; localDate: string; state: JornadaStatus }[]
  skipped: { employeeId: Id; localDate: string; reason: BulkSkipReason }[]
}
export type MarkAction = 'INGRESO' | 'EGRESO' | 'SALIDA_DESAYUNO' | 'VUELTA_DESAYUNO' | 'SALIDA_ALMUERZO' | 'VUELTA_ALMUERZO'
export type Mark = {
  id: Id; jornadaId: Id; action: MarkAction; sequence: number; acceptedAt: string; occurredAt?: string | null;
  recordedAt?: string | null; locationStatus: 'PENDIENTE' | 'RECIBIDA' | 'SIN_UBICACION' | 'PURGADA' | 'NO_APLICA';
  latitude?: number | null; longitude?: number | null; deviations?: Deviation[];
  /** D-20261027-08: a voided mark stays listed and stops counting; voidedAt and voidReason reach only the ADMIN. */
  voided?: boolean; voidedAt?: string | null; voidReason?: string | null
}
export type JornadaState = 'NO_INGRESO' | 'EN_CURSO' | 'PAUSA_ABIERTA' | 'EGRESADA'
/** JornadaState plus CANCELADA (D-20261027-07): a cancelled jornada has no valid marks (voided ones may remain) and accepts none. */
export type JornadaStatus = JornadaState | 'CANCELADA'
export type Jornada = {
  id: Id; employeeId: Id; siteId: Id; localDate: string; state: JornadaStatus; scheduleSnapshot: TemplateInput;
  toleranceMinutes: number; sequence: number; marks: Mark[];
  /** Set only for CANCELADA; cancelReason reaches only the ADMIN. */
  cancelledAt?: string | null; cancelReason?: string | null
}
/** GET /jornadas; marks and deviations only with includeDetail=true. */
export type JornadaSummary = {
  id: Id; employeeId: Id; siteId: Id; localDate: string; state: JornadaStatus; employeeDisplayName?: string;
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
/** GET /admin/jornadas/{id}/audit (issue #60): fields that do not apply to an entry's kind are omitted. */
export type JornadaAuditKind = 'JORNADA_CANCELLATION' | 'FORGOTTEN_MARK' | 'MARK_CORRECTION' | 'MARK_VOID' | 'DEVIATION'
export type DeviationAuditChange = 'CREATED' | 'TYPE_REPLACED' | 'CLASSIFICATION_CHANGED' | 'RETRACTED' | 'MOTIVE_SUBMITTED' | 'MOTIVE_CORRECTED' | 'CLASSIFICATION_RESET'
export type JornadaAuditEntry = {
  kind: JornadaAuditKind; changedAt: string
  /** Omitted for a change made by the system. */
  actorAccountId?: Id | null; actorDisplayName?: string | null
  /** Reason written by the ADMIN; never the employee's motive text (motive changes carry only their categories). */
  reason?: string | null
  markId?: Id | null; markSequence?: number | null; beforeAction?: MarkAction | null; afterAction?: MarkAction | null
  beforeOccurredAt?: string | null; afterOccurredAt?: string | null
  deviationId?: Id | null; deviationType?: Deviation['type'] | null; changeType?: DeviationAuditChange | null
  beforeType?: Deviation['type'] | null; afterType?: Deviation['type'] | null
  beforeClassification?: 'JUSTIFICADO' | 'NO_JUSTIFICADO' | null; afterClassification?: 'JUSTIFICADO' | 'NO_JUSTIFICADO' | null
  beforeMotiveCategory?: NonNullable<Deviation['category']> | null; afterMotiveCategory?: NonNullable<Deviation['category']> | null
}
export type JornadaAudit = { jornadaId: Id; timeZone: string; entries: JornadaAuditEntry[]; truncated: boolean }
