import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { workspacePlan } from './check-repository.mjs'

export const scopeNames = [
  'repository',
  'supply-chain',
  'storefront',
  'admin',
  'backend',
  'browser',
]

const required = {
  repository: {
    checks: ['workspaces:check', 'lint', 'test:unit', 'lint:boundaries', 'format:check'],
  },
  storefront: { checks: ['test:smoke'] },
  admin: { checks: ['test:smoke'] },
  backend: { checks: ['test:smoke', 'test:integration', 'test:contract'] },
  browser: { checks: ['test:ui'] },
  'supply-chain': { checks: ['test:security'] },
}
export function ciPlan(root, selected = scopeNames) {
  if (!selected.length || selected.some((name) => !scopeNames.includes(name)))
    throw new Error('Unknown CI scope')
  const workspaces = workspacePlan(root, selected)
  const inventory = JSON.parse(readFileSync(resolve(root, 'ci-workspaces.json'), 'utf8'))
  const rootPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  return scopeNames
    .filter((name) => selected.includes(name))
    .map((name) => {
      const entry = inventory.scopes[name]
      const workspace = workspaces.find((w) => w.name === name)
      if (
        !/^P\d{2}-\d{3}$/.test(entry.ownerTask) ||
        !Array.isArray(entry.checks) ||
        !entry.checks.length ||
        new Set(entry.checks).size !== entry.checks.length
      )
        throw new Error(`Invalid CI scope: ${name}`)
      if (!workspace || workspace.state === 'Configured') {
        for (const check of required[name].checks)
          if (!entry.checks.includes(check))
            throw new Error(`Missing required ${name} check: ${check}`)
      }
      if (!workspace) {
        for (const check of entry.checks) {
          if (
            !/^[a-z][a-z0-9:-]*$/.test(check) ||
            !rootPackage.scripts?.[check]?.trim() ||
            rootPackage.scripts[check].includes('--if-present')
          )
            throw new Error(`Missing/unsafe root check: ${check}`)
        }
      }
      const rootChecks =
        name === 'backend' && !selected.includes('repository') ? entry.rootChecks : []
      if (
        !Array.isArray(rootChecks) ||
        (name === 'backend' &&
          !selected.includes('repository') &&
          !['test:unit', 'lint:boundaries', 'format:backend'].every((check) =>
            rootChecks.includes(check),
          ))
      )
        throw new Error('Missing backend root checks')
      for (const check of rootChecks)
        if (
          !/^[a-z][a-z0-9:-]*$/.test(check) ||
          !rootPackage.scripts?.[check]?.trim() ||
          rootPackage.scripts[check].includes('--if-present')
        )
          throw new Error(`Missing/unsafe root check: ${check}`)
      return {
        name,
        ownerTask: entry.ownerTask,
        state: workspace?.state ?? 'Configured',
        checks: [
          ...rootChecks.map((check) => ['run', check]),
          ...entry.checks.map((check) => [
            'run',
            check,
            ...(workspace ? [`--workspace=${name}`] : []),
          ]),
        ],
      }
    })
}
