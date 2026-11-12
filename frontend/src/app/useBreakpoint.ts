import { useEffect, useState } from 'react'

/** The one render switch of the layout (design system 2.4): lists of records become tables from 768 px, where a table gets
    at least 720 px. Every other breakpoint is CSS only. */
export const WIDE_TABLE_QUERY = '(min-width: 768px)'

function matches(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && Boolean(window.matchMedia(WIDE_TABLE_QUERY)?.matches)
}

/** True from 768 px: show records as a table. False under it and where matchMedia is missing: the list, which reads at any
    width, is the safe default. Follows the width while mounted (a tablet turned, a window resized). */
export function useWideTable(): boolean {
  const [wide, setWide] = useState(matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(WIDE_TABLE_QUERY)
    if (!list) return
    const update = () => setWide(list.matches)
    // The width may have changed between the first render and this effect.
    update()
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', update)
      return () => list.removeEventListener('change', update)
    }
    // Safari before 14 only has the old listener methods.
    list.addListener?.(update)
    return () => list.removeListener?.(update)
  }, [])
  return wide
}
