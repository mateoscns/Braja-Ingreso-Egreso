// One way to bring a part of the screen into view and move the keyboard focus to it (slice F1; WCAG 2.4.3 and 2.4.11).
// Every screen that opens or closes something in place uses it, so the motion and the focus behave the same everywhere.
import { useEffect, useState } from 'react'

/** The person asked the system for less motion: the scroll then jumps instead of gliding. */
function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
}

/**
 * Brings a part of the screen into view, gliding unless the system asks for less motion. `nearest` scrolls only when the part is
 * not already in view. The page's scroll padding keeps it clear of the fixed bar of the ADMIN (styles.css). A browser without
 * `scrollIntoView` (jsdom) is left where it is.
 */
export function reveal(part: HTMLElement, block: ScrollLogicalPosition = 'nearest') {
  if (typeof part.scrollIntoView === 'function') part.scrollIntoView({ block, behavior: reducedMotion() ? 'auto' : 'smooth' })
}

/**
 * Brings `part` into view and moves the focus to `focusTarget` (the part itself by default). The focus does not scroll again:
 * the scroll above already placed the part, and a second one would cut a smooth scroll short.
 */
export function revealAndFocus(part: HTMLElement, focusTarget: HTMLElement = part, block: ScrollLogicalPosition = 'nearest') {
  reveal(part, block)
  focusTarget.focus({ preventScroll: true })
}

const CONTROLS = 'input:not([type="hidden"]), select, textarea, button'

/**
 * The first control of a form or a part that can be used now, where Tab would land: disabled ones and those inside a closed
 * fold are skipped, and in a group of radios it is the chosen one. Null when the part has none.
 */
export function firstControl(container: HTMLElement): HTMLElement | null {
  for (const control of container.querySelectorAll<HTMLElement>(CONTROLS)) {
    // :disabled also covers a control inside a disabled fieldset, whose own disabled property stays false.
    if (control.matches(':disabled')) continue
    const fold = control.closest('details')
    if (fold && !fold.open) continue
    if (control instanceof HTMLInputElement && control.type === 'radio' && control.name && !control.checked) {
      const chosen = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((radio) => radio.name === control.name && radio.checked && !radio.disabled)
      if (chosen) return chosen
    }
    return control
  }
  return null
}

/** Where the focus goes once the screen shows it: the element with `id` itself, or (`into`) its first control. */
export type FocusRequest = { id: string; into?: boolean; block?: ScrollLogicalPosition }

/**
 * Moves the focus after the render that draws its target: a form opened in place (`into` its first control), or the button that
 * opened a form that closed, which often comes back in that same render. `ready` holds the request while the target cannot take
 * the focus yet (its buttons are disabled while a request runs). A request whose target is gone does nothing.
 */
export function useFocusRequest(ready = true): (request: FocusRequest) => void {
  const [request, setRequest] = useState<FocusRequest | null>(null)
  useEffect(() => {
    if (!request || !ready) return
    setRequest(null)
    const part = document.getElementById(request.id)
    const target = part && (request.into ? firstControl(part) : part)
    if (part && target) revealAndFocus(part, target, request.block)
  }, [request, ready])
  return setRequest
}
