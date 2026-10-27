/**
 * Advisories that `npm audit --omit=dev` may report without failing CI. Each exception is single, dated, says why it
 * is safe and when it stops applying (CLAUDE.md §3). Only an owner decision adds one (docs/DECISIONES.md).
 */
export const ALLOWED_ADVISORIES = [
  {
    id: 'GHSA-gcqx-w48m-w2h4',
    packageName: 'deepmerge',
    decision: 'D-20261027-10',
    added: '2026-10-27',
    expires: '2027-01-31',
    reason: 'Low severity and no patched version. deepmerge only runs at build time (vite-plugin-pwa -> workbox-build -> ' +
      '@rollup/plugin-node-resolve) and merges our own build configuration; it never ships to the browser or the server.'
  }
]

function advisoryId(via) {
  const match = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(via.url ?? '')
  return match ? match[0] : String(via.source ?? via.title ?? 'unknown')
}

/**
 * Evaluates an `npm audit --json` report (lockfile v2+ format) on a given day (YYYY-MM-DD).
 * Returns the advisories that must fail the build, the ones allowed, and allowances no longer reported.
 */
export function evaluateAudit(report, today, allowed = ALLOWED_ADVISORIES) {
  const found = new Map()
  for (const [name, vulnerability] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || via === null) continue
      const id = advisoryId(via)
      if (!found.has(id)) found.set(id, { id, packageName: via.name ?? name, severity: via.severity ?? vulnerability.severity, title: via.title ?? '' })
    }
  }
  const failures = []
  const allowedHits = []
  for (const advisory of found.values()) {
    const allowance = allowed.find((entry) => entry.id === advisory.id && entry.packageName === advisory.packageName)
    if (!allowance) failures.push({ ...advisory, why: 'not allowed' })
    else if (today > allowance.expires) failures.push({ ...advisory, why: `allowance expired on ${allowance.expires}` })
    else allowedHits.push({ ...advisory, expires: allowance.expires })
  }
  const unused = allowed.filter((entry) => !found.has(entry.id)).map((entry) => entry.id)
  return { failures, allowedHits, unused }
}
