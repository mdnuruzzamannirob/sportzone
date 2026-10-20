import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { workspacePlan } from './check-repository.mjs'

export const scopeNames = [
  'repository',
  'storefront',
  'admin',
  'backend',
  'browser',
  'supply-chain',
]

export function testCounts(output) {
  const text = output.replace(/\u001b\[[0-9;]*m/g, '')
  const node = text.match(/^[#ℹ] tests (\d+)$/m)
  if (node)
    return Object.fromEntries(
      ['tests', 'pass', 'fail', 'skipped', 'cancelled'].map((key) => [
        key === 'tests' ? 'discovered' : key,
        Number(text.match(new RegExp(`^[#ℹ] ${key} (\\d+)$`, 'm'))?.[1] ?? 0),
      ]),
    )
  const vitest = text.match(/^\s*Tests\s+(.+)\((\d+)\)\s*$/m)
  if (vitest)
    return {
      discovered: Number(vitest[2]),
      pass: Number(vitest[1].match(/(\d+) passed/)?.[1] ?? 0),
      fail: Number(vitest[1].match(/(\d+) failed/)?.[1] ?? 0),
      skipped: Number(vitest[1].match(/(\d+) skipped/)?.[1] ?? 0),
    }
  const browser = [...text.matchAll(/^\s*(\d+) passed \([^\n]+\)\s*$/gm)].at(-1)
  if (browser) {
    const fail = Number(text.match(/^\s*(\d+) failed\s*$/m)?.[1] ?? 0)
    const skipped = Number(text.match(/^\s*(\d+) skipped\s*$/m)?.[1] ?? 0)
    const cancelled = Number(text.match(/^\s*(\d+) interrupted\s*$/m)?.[1] ?? 0)
    return {
      discovered: Number(browser[1]) + fail + skipped + cancelled,
      pass: Number(browser[1]),
      fail,
      skipped,
      cancelled,
    }
  }
  return undefined
}
const required = {
  repository: { needs: [], checks: ['workspaces:check', 'lint', 'test:unit'] },
  storefront: { needs: ['repository'] },
  admin: { needs: ['repository'] },
  backend: { needs: ['repository'] },
  browser: { needs: ['storefront', 'admin'], checks: ['test:ui'] },
  'supply-chain': { needs: ['repository'], checks: ['test:security'] },
}
export function ciPlan(root) {
  const workspaces = workspacePlan(root)
  const inventory = JSON.parse(
    readFileSync(resolve(root, 'ci-workspaces.json'), 'utf8'),
  )
  const rootPackage = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf8'),
  )
  return scopeNames.map((name) => {
    const entry = inventory.scopes[name]
    const workspace = workspaces.find((w) => w.name === name)
    if (
      JSON.stringify(entry.needs) !== JSON.stringify(required[name].needs) ||
      !/^P\d{2}-\d{3}$/.test(entry.ownerTask) ||
      !Array.isArray(entry.checks) ||
      !entry.checks.length ||
      new Set(entry.checks).size !== entry.checks.length
    )
      throw new Error(`Invalid CI scope: ${name}`)
    if (!workspace) {
      for (const check of required[name].checks)
        if (!entry.checks.includes(check))
          throw new Error(`Missing required ${name} check: ${check}`)
      for (const check of entry.checks) {
        if (
          !/^[a-z][a-z0-9:-]*$/.test(check) ||
          !rootPackage.scripts?.[check]?.trim() ||
          rootPackage.scripts[check].includes('--if-present')
        )
          throw new Error(`Missing/unsafe root check: ${check}`)
      }
    }
    return {
      name,
      needs: entry.needs,
      ownerTask: entry.ownerTask,
      state: workspace?.state ?? 'Configured',
      checks: entry.checks.map((check) => [
        'run',
        check,
        ...(workspace ? [`--workspace=${name}`] : []),
      ]),
    }
  })
}
export function validateReport(report, scope, identity) {
  if (
    !report ||
    report.version !== 2 ||
    report.scope !== scope.name ||
    report.result !== 'Passed' ||
    !report.finishedAt ||
    report.commit !== identity.commit ||
    report.lockSha256 !== identity.lockSha256 ||
    report.inventorySha256 !== identity.inventorySha256 ||
    report.runId !== identity.runId ||
    report.runAttempt !== identity.runAttempt ||
    report.node !== identity.node ||
    report.npm !== identity.npm ||
    report.workingTreeDirty ||
    !Array.isArray(report.checks) ||
    report.checks.length !== scope.checks.length
  )
    throw new Error(`Missing, stale or failed report: ${scope.name}`)
  scope.checks.forEach((args, i) => {
    const actual = report.checks[i]
    if (
      actual?.command !== `npm ${args.join(' ')}` ||
      actual.result !== 'Passed' ||
      actual.exitCode !== 0 ||
      actual.signal
    )
      throw new Error(`Incomplete report checks: ${scope.name}`)
  })
}
export function validateResults(needs, reports, plan, identity) {
  if (identity.workingTreeDirty) throw new Error('Aggregate checkout is dirty')
  if (
    !needs ||
    JSON.stringify(Object.keys(needs).sort()) !==
      JSON.stringify(scopeNames.toSorted())
  )
    throw new Error('Required job results are missing or unexpected')
  for (const scope of plan) {
    if (needs[scope.name]?.result !== 'success')
      throw new Error(`Required job did not succeed: ${scope.name}`)
    validateReport(reports[scope.name], scope, identity)
  }
}
