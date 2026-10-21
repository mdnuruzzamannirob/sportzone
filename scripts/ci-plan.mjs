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

const required = {
  repository: { checks: ['workspaces:check', 'lint', 'test:unit'] },
  browser: { checks: ['test:ui'] },
  'supply-chain': { checks: ['test:security'] },
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
