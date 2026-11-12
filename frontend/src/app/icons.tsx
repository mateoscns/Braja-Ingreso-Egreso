import type { ReactNode } from 'react'

/**
 * The icon set of the interface: inline SVG, no dependency. Every drawing sits on a 24 x 24 grid and takes its stroke
 * (2 wide, round ends, the colour of the text) from the `.icon` rule of styles.css, so the set reads as one family
 * and no shape carries a colour or a width of its own. A dot is a very short stroke: the round ends turn it into a
 * circle as wide as every other line.
 */
const DRAWINGS = {
  // States
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  bubble: <><path d="M4 5.5h16v10.5H10l-4.5 4v-4H4z" /><path d="M8.5 10.8h.2M12 10.8h.2M15.5 10.8h.2" /></>,
  waiting: <circle cx="12" cy="12" r="8" strokeDasharray="2.2 4.083" />,
  pause: <path d="M9 6v12M15 6v12" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  // Messages
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.4v.2" /></>,
  error: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  // Marks and the day
  enter: <><path d="M13 4h6v16h-6" /><path d="M4 12h10M10.5 8.5L14 12l-3.5 3.5" /></>,
  exit: <><path d="M11 4H5v16h6" /><path d="M10 12h10M16.5 8.5L20 12l-3.5 3.5" /></>,
  coffee: <><path d="M5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5z" /><path d="M16 10.5h1.5a2.5 2.5 0 010 5H16M8.5 3.5v2.5M12.5 3.5v2.5" /></>,
  lunch: <path d="M8 3.5v17M5.5 3.5v4a2.5 2.5 0 005 0v-4M18 3.5c-2 1.5-3 4-3 7h3zM18 10.5v10" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  pinoff: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><path d="M4 4l16 16" /></>,
  // Navigation
  inbox: <><path d="M4 13l2.5-8h11L20 13v6H4z" /><path d="M4 13h5l1 2.5h4l1-2.5h5" /></>,
  today: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /><path d="M11.25 14.25h1.5v1.5h-1.5z" /></>,
  month: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 13.5h.2M12 13.5h.2M16 13.5h.2M8 16.8h.2M12 16.8h.2" /></>,
  config: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  steps: <path d="M4 7l1.8 1.8L9 5.5M4 16l1.8 1.8L9 14.5M13 7h7M13 16h7" />,
  store: <path d="M4 10l1.5-5h13L20 10M5 10v9.5h14V10M4 10h16M10 19.5v-5h4v5" />,
  schedule: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 14h6M9 17h3" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c.6-3.4 3-5 6-5s5.4 1.6 6 5" /><path d="M16 5.6a3.2 3.2 0 010 5.8M17.5 14.8c1.9.6 3.1 2.2 3.5 4.7" /></>,
  bell: <><path d="M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 2h-14z" /><path d="M10 20.5a2.2 2.2 0 004 0" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  // Actions
  refresh: <><path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  filter: <path d="M4 6h16l-6 7.5v5l-4 1.5v-6.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  right: <path d="M9 5l7 7-7 7" />,
  external: <path d="M13 5h6v6M19 5l-8.5 8.5M10 7H5v12h12v-5" />
} satisfies Record<string, ReactNode>

/** A closed union: a name outside the set fails the type check. */
export type IconName = keyof typeof DRAWINGS

export const ICON_NAMES = Object.keys(DRAWINGS) as readonly IconName[]

/**
 * Decoration for the visible text next to it: hidden from screen readers and never the name of a control.
 * Its size follows the text (`.icon` is 1.25em wide); a container may set another one.
 */
export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{DRAWINGS[name]}</svg>
}

/**
 * The clock of the app icon (public/icon.svg), in the colour of the text around it. It is drawn with a fill, so it
 * does not take the `.icon` class, and the view box is cut to the ring, so the box of the mark is the mark.
 * It has no name of its own: the link that holds it carries the name.
 */
export function BrandMark() {
  return <svg className="brand-mark" viewBox="86 86 340 340" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M256 86a170 170 0 1 0 170 170A170 170 0 0 0 256 86Zm0 40a130 130 0 1 1-130 130 130 130 0 0 1 130-130Zm-15 34v109l88 52 20-33-68-40V160Z" />
  </svg>
}
