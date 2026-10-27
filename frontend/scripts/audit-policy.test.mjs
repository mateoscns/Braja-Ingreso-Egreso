import { describe, expect, it } from 'vitest'
import { evaluateAudit } from './audit-policy.mjs'

const allowed = [{ id: 'GHSA-gcqx-w48m-w2h4', packageName: 'deepmerge', expires: '2027-01-31' }]

function report(...advisories) {
  const vulnerabilities = {}
  for (const advisory of advisories) {
    vulnerabilities[advisory.name] = {
      severity: advisory.severity,
      via: [{ name: advisory.name, severity: advisory.severity, title: advisory.title, url: `https://github.com/advisories/${advisory.id}` }]
    }
  }
  // A dependent package lists the vulnerable one by name only; it must not count as a second advisory.
  vulnerabilities['workbox-build'] = { severity: 'low', via: ['@rollup/plugin-node-resolve'] }
  return { vulnerabilities }
}

describe('evaluateAudit', () => {
  it('passes when only the allowed advisory is reported before it expires', () => {
    const result = evaluateAudit(report({ id: 'GHSA-gcqx-w48m-w2h4', name: 'deepmerge', severity: 'low', title: 'prototype poisoning' }), '2026-10-27', allowed)
    expect(result.failures).toEqual([])
    expect(result.allowedHits.map((hit) => hit.id)).toEqual(['GHSA-gcqx-w48m-w2h4'])
  })

  it('fails on any other advisory, even a low one', () => {
    const result = evaluateAudit(report(
      { id: 'GHSA-gcqx-w48m-w2h4', name: 'deepmerge', severity: 'low', title: 'prototype poisoning' },
      { id: 'GHSA-aaaa-bbbb-cccc', name: 'fast-uri', severity: 'low', title: 'other' }
    ), '2026-10-27', allowed)
    expect(result.failures.map((failure) => failure.id)).toEqual(['GHSA-aaaa-bbbb-cccc'])
  })

  it('fails when the same advisory id comes from another package', () => {
    const result = evaluateAudit(report({ id: 'GHSA-gcqx-w48m-w2h4', name: 'other-merge', severity: 'low', title: 'copy' }), '2026-10-27', allowed)
    expect(result.failures).toHaveLength(1)
  })

  it('fails once the allowance has expired', () => {
    const result = evaluateAudit(report({ id: 'GHSA-gcqx-w48m-w2h4', name: 'deepmerge', severity: 'low', title: 'prototype poisoning' }), '2027-02-01', allowed)
    expect(result.failures[0].why).toBe('allowance expired on 2027-01-31')
  })

  it('passes a clean report and lists the allowance as no longer needed', () => {
    const result = evaluateAudit({ vulnerabilities: {} }, '2026-10-27', allowed)
    expect(result.failures).toEqual([])
    expect(result.unused).toEqual(['GHSA-gcqx-w48m-w2h4'])
  })
})
