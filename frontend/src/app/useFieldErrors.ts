// One way for a form to show what is wrong (design system 4.3 and 4.7; slices F2a and F2b): it is checked on submit, each
// error is tied to its field, and the focus goes to the first field to fix. A form that the server refused takes the focus to
// its message instead, since the button that was pressed is disabled while it waits and the focus would be lost.
import { useEffect, useState } from 'react'
import { validateDateRange } from '../shared/dateRange'
import { firstControl, revealAndFocus } from './revealAndFocus'

/** The errors of a form's fields, by field; a field without one is valid. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

/** A control that Tab reaches now: not disabled and not inside a closed fold. */
function usable(control: HTMLElement): boolean {
  return !(control as HTMLInputElement).disabled && !control.closest('details:not([open])')
}

/**
 * What takes the focus in a part that failed: its first invalid field; in a group of fields (a fieldset), the control marked
 * invalid inside it or else its first control. Without an invalid field, the part's error message, which gets tabIndex -1 so
 * it can hold the focus. Null when there is neither.
 */
export function firstProblem(part: HTMLElement): HTMLElement | null {
  const invalid = part.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (invalid) {
    if (!(invalid instanceof HTMLFieldSetElement)) return invalid
    const marked = [...invalid.querySelectorAll<HTMLElement>('[aria-invalid="true"]')].find(usable)
    return marked ?? firstControl(invalid)
  }
  const message = part.querySelector<HTMLElement>('[role="alert"]')
  if (message && !message.hasAttribute('tabindex')) message.tabIndex = -1
  return message
}

/**
 * Moves the focus to the first problem of the part with `id` (firstProblem), after the render that shows the errors: they
 * are not in the page yet when the submit fails. Each call is a new request, so failing twice in a row moves it again.
 */
export function useProblemFocus(): (id: string) => void {
  const [request, setRequest] = useState<{ id: string } | null>(null)
  useEffect(() => {
    if (!request) return
    setRequest(null)
    const part = document.getElementById(request.id)
    const target = part && firstProblem(part)
    // The field around the control comes into view too, so its label is read with it.
    if (target) revealAndFocus(target.closest<HTMLElement>('.field') ?? target, target)
  }, [request])
  return (id) => setRequest({ id })
}

/**
 * The errors of a form checked on submit: `check` shows the ones found and moves the focus to the first invalid field of the
 * part with `partId`; editing a field removes only its own error (`clear`); `reset` drops them all when the form closes or
 * starts again. `count` is how many fields are invalid, for the summary of a long form.
 */
export function useFieldErrors<Field extends string>() {
  const [errors, setErrors] = useState<FieldErrors<Field>>({})
  const focusProblem = useProblemFocus()
  /** Shows the errors found; true when there are none, so the caller sends the form. */
  function check(partId: string, found: FieldErrors<Field>): boolean {
    const shown = Object.fromEntries(Object.entries(found).filter(([, message]) => message)) as FieldErrors<Field>
    setErrors(shown)
    if (Object.keys(shown).length === 0) return true
    focusProblem(partId)
    return false
  }
  function clear(...fields: Field[]) {
    setErrors((current) => {
      if (!fields.some((field) => current[field])) return current
      const next = { ...current }
      for (const field of fields) delete next[field]
      return next
    })
  }
  function reset() { setErrors((current) => Object.keys(current).length ? {} : current) }
  return { errors, count: Object.keys(errors).length, check, clear, reset, focusProblem }
}

/**
 * The problem of a date range (the words validateDateRange or its caller chose) on the date it is about: an empty date, else
 * one that cannot be read or is out of the years, else the end of the range (the order and the length are measured to it).
 */
export function dateRangeErrors(from: string, to: string, message: string): { from?: string; to?: string } {
  if (!message) return {}
  if (!from) return { from: message }
  if (!to) return { to: message }
  if (validateDateRange(from, from)) return { from: message }
  return { to: message }
}
