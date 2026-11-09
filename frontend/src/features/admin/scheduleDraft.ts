import type { Template, TemplateBlock, TemplateInput } from '../../shared/api/types'
import {
  draftBlocks, MAX_TRAMOS, nextTramo, offsetsAreComputed, SCHEDULE_TYPES, tramosFromBlocks,
  type DayOffsets, type ScheduleTypeId, type Tramo, type TramoComputation
} from './scheduleTramos'

/** What the owner is typing in the Horarios form; manualOffsets keeps the hand-typed days of an old horario. */
export type ScheduleDraft = {
  name: string; type: ScheduleTypeId | null; tramos: Tramo[]; breakfast: string; lunch: string
  manualOffsets: DayOffsets[] | null
  /** Errors are shown once the owner tried to save, then live. */
  showErrors: boolean
}

export type ScheduleCheck = {
  computation: TramoComputation; nameError: string; breakfastError: string; lunchError: string
  breakfastMinutes: number | null; lunchMinutes: number | null; valid: boolean
}

const corrido = SCHEDULE_TYPES[0]

export function emptyScheduleDraft(): ScheduleDraft {
  return { name: '', type: corrido.id, tramos: corrido.tramos.map((tramo) => ({ ...tramo })), breakfast: '15', lunch: '60', manualOffsets: null, showErrors: false }
}

export function scheduleDraftFromTemplate(template: Template): ScheduleDraft {
  return {
    name: template.name, type: null, tramos: tramosFromBlocks(template.blocks),
    breakfast: String(template.breakfastLimitMinutes), lunch: String(template.lunchLimitMinutes),
    manualOffsets: offsetsAreComputed(template.blocks) ? null : template.blocks.map(({ startDayOffset, endDayOffset }) => ({ startDayOffset, endDayOffset })),
    showErrors: false
  }
}

/** Picking a type fills its tramos; the name follows the type while the owner has not written one. */
export function pickScheduleType(draft: ScheduleDraft, id: ScheduleTypeId): ScheduleDraft {
  const type = SCHEDULE_TYPES.find((entry) => entry.id === id) ?? corrido
  const nameFollowsType = !draft.name.trim() || SCHEDULE_TYPES.some((entry) => entry.title === draft.name.trim())
  return { ...draft, type: type.id, tramos: type.tramos.map((tramo) => ({ ...tramo })), manualOffsets: null, name: nameFollowsType ? type.title : draft.name }
}

export function addScheduleTramo(draft: ScheduleDraft): ScheduleDraft {
  if (draft.tramos.length >= MAX_TRAMOS) return draft
  const last = draft.manualOffsets?.[draft.manualOffsets.length - 1]
  return {
    ...draft, type: null, tramos: [...draft.tramos, nextTramo(draft.tramos[draft.tramos.length - 1])],
    manualOffsets: draft.manualOffsets && [...draft.manualOffsets, { startDayOffset: last?.endDayOffset ?? 0, endDayOffset: last?.endDayOffset ?? 0 }]
  }
}

export function removeScheduleTramo(draft: ScheduleDraft, index: number): ScheduleDraft {
  if (draft.tramos.length <= 1) return draft
  return {
    ...draft, type: null, tramos: draft.tramos.filter((_, position) => position !== index),
    manualOffsets: draft.manualOffsets && draft.manualOffsets.filter((_, position) => position !== index)
  }
}

export function changeScheduleTramo(draft: ScheduleDraft, index: number, patch: Partial<Tramo>): ScheduleDraft {
  return { ...draft, type: null, tramos: draft.tramos.map((tramo, position) => position === index ? { ...tramo, ...patch } : tramo) }
}

export function changeManualOffsets(draft: ScheduleDraft, index: number, patch: Partial<DayOffsets>): ScheduleDraft {
  if (!draft.manualOffsets) return draft
  return { ...draft, manualOffsets: draft.manualOffsets.map((offsets, position) => position === index ? { ...offsets, ...patch } : offsets) }
}

function pauseMinutes(value: string): number | null {
  if (!/^\d{1,3}$/.test(value.trim())) return null
  const minutes = Number(value)
  return minutes <= 240 ? minutes : null
}

export function checkScheduleDraft(draft: ScheduleDraft): ScheduleCheck {
  const computation = draftBlocks(draft.tramos, draft.manualOffsets)
  const breakfastMinutes = pauseMinutes(draft.breakfast)
  const lunchMinutes = pauseMinutes(draft.lunch)
  const nameError = draft.name.trim() ? '' : 'Escribí un nombre para el horario.'
  const breakfastError = breakfastMinutes === null ? 'Poné un número de 0 a 240.' : ''
  const lunchError = lunchMinutes === null ? 'Poné un número de 0 a 240.' : ''
  return { computation, nameError, breakfastError, lunchError, breakfastMinutes, lunchMinutes, valid: computation.valid && !nameError && !breakfastError && !lunchError }
}

/** The request body of POST /templates and PATCH /templates/{id}, or null when the draft has mistakes. */
export function scheduleInput(draft: ScheduleDraft, siteId: string): TemplateInput | null {
  const check = checkScheduleDraft(draft)
  if (!check.valid || check.breakfastMinutes === null || check.lunchMinutes === null) return null
  const blocks: TemplateBlock[] = check.computation.blocks
  return { siteId, name: draft.name.trim(), blocks, breakfastLimitMinutes: check.breakfastMinutes, lunchLimitMinutes: check.lunchMinutes }
}
