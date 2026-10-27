// Runs `npm audit --omit=dev` and fails on every advisory except the dated exceptions in audit-policy.mjs.
import { spawnSync } from 'node:child_process'
import { evaluateAudit } from './audit-policy.mjs'

// `npm run` sets npm_execpath, so npm runs through node without a shell (no argument concatenation).
const npmCli = process.env.npm_execpath
const args = ['audit', '--omit=dev', '--json']
const result = npmCli
  ? spawnSync(process.execPath, [npmCli, ...args], { encoding: 'utf8' })
  : spawnSync('npm', args, { encoding: 'utf8' })
let report
try {
  report = JSON.parse(result.stdout)
  if (report === null || typeof report !== 'object') throw new Error('empty report')
} catch {
  console.error('npm audit did not return JSON; failing closed.')
  console.error(result.stderr || result.stdout)
  process.exit(1)
}
if (report.error) {
  console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`)
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const { failures, allowedHits, unused } = evaluateAudit(report, today)
for (const hit of allowedHits) console.log(`allowed until ${hit.expires}: ${hit.id} (${hit.packageName}, ${hit.severity}) ${hit.title}`)
for (const id of unused) console.log(`exception no longer needed, remove it: ${id}`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure.id} (${failure.packageName}, ${failure.severity}): ${failure.title} [${failure.why}]`)
  process.exit(1)
}
console.log('npm audit --omit=dev: no advisories outside the dated exceptions.')
