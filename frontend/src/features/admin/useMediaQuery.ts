import { useEffect, useState } from 'react'

/** The same breakpoint as styles.css for phones: lists become cards at 520 px or less. */
export const PHONE_QUERY = '(max-width: 520px)'

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

/** Whether a CSS media query matches now; follows changes such as rotating the phone. Without matchMedia it is false. */
export function useMediaQuery(query: string): boolean {
  const [current, setCurrent] = useState(() => matches(query))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setCurrent(list.matches)
    update()
    list.addEventListener?.('change', update)
    return () => list.removeEventListener?.('change', update)
  }, [query])
  return current
}
