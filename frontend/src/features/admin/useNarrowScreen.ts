import { useEffect, useState } from 'react'

/** The phone breakpoint of styles.css; there a table of marks becomes a list of cards. */
const NARROW_QUERY = '(max-width: 520px)'

function matches(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && Boolean(window.matchMedia(NARROW_QUERY)?.matches)
}

/** True on a phone-width screen; false where matchMedia is missing (the wide layout is the safe default). */
export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(NARROW_QUERY)
    if (!query || typeof query.addEventListener !== 'function') return
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}
