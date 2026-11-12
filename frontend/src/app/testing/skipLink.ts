import { fireEvent, screen } from '@testing-library/react'
import { expect } from 'vitest'

/** What Tab reaches first: the first element of the document the keyboard can focus. */
export const FIRST_FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Slice G1 (WCAG 2.4.1): the screen rendered starts with «Ir al contenido», which leads to its one main. The first stop of Tab is
 * the link; the main is #contenido and takes the focus by script (tabindex -1); following the link gives it the focus. Returns
 * the link and the main for what a screen checks besides.
 */
export function expectSkipLinkToMain() {
  const focusable = document.querySelector<HTMLElement>(FIRST_FOCUSABLE)
  const main = document.querySelector('main')

  expect(focusable).toBe(screen.getByRole('link', { name: 'Ir al contenido' }))
  expect(focusable).toHaveAttribute('href', '#contenido')
  expect(document.querySelectorAll('main')).toHaveLength(1)
  expect(main).toHaveAttribute('id', 'contenido')
  expect(main).toHaveAttribute('tabindex', '-1')
  fireEvent.click(focusable!)
  expect(main).toHaveFocus()
  return { link: focusable!, main: main! }
}
