import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function affectedScopes(paths, forceAll = false) {
  if (forceAll || !paths.length) return { scope: 'all', browser: true }
  const selected = new Set(['supply-chain'])
  for (const path of paths) {
    if (path.startsWith('backend/')) selected.add('backend')
    else if (path.startsWith('storefront/') || path.startsWith('admin/')) {
      // Browser audit consumes both builds and the real API fixture.
      for (const name of ['repository', 'storefront', 'admin', 'backend', 'browser'])
        selected.add(name)
    } else if (path.startsWith('docs/') || /^(README|AGENTS|CHANGELOG)\.md$/.test(path)) {
      selected.add('repository')
      // API.md is executable input for generated contracts, not prose-only documentation.
      if (path === 'docs/API.md') selected.add('backend')
    } else return { scope: 'all', browser: true }
  }
  if (selected.size === 1) return { scope: 'all', browser: true }
  return {
    scope: [...selected]
      .sort((a, b) => (a === 'supply-chain' ? 1 : b === 'supply-chain' ? -1 : a.localeCompare(b)))
      .join(','),
    browser: selected.has('browser'),
  }
}

export function containerInputsChanged(paths) {
  const inputs = new Set([
    'backend/package.json',
    'backend/tsconfig.json',
    'package.json',
    'package-lock.json',
    '.nvmrc',
    'backend/scripts/build.mjs',
    'backend/scripts/container-health.mjs',
    'backend/scripts/staging-inventory.mjs',
    'backend/scripts/staging-catalog.mjs',
    'backend/scripts/notification-worker.mjs',
    'backend/scripts/expire-reservations.mjs',
  ])
  return (
    !paths.length || paths.some((path) => path.startsWith('backend/Dockerfile') || inputs.has(path))
  )
}

export function changedPaths(base, head, event, cwd = process.cwd()) {
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? '') && !/^0+$/.test(sha)))
    throw new Error('Validated revisions required')
  // A PR owns changes since its merge base. Disable rename detection so both owners are checked.
  const revisions = event === 'pull_request' ? [`${base}...${head}`] : [base, head]
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', ...revisions], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    maxBuffer: 16777216,
  })
    .split('\0')
    .filter(Boolean)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const base = process.env.CI_BASE_SHA
  const head = process.env.CI_HEAD_SHA
  const valid = (sha) => /^[a-f0-9]{40}$/.test(sha ?? '') && !/^0+$/.test(sha)
  let result = { scope: 'all', browser: true }
  let container = true
  if (
    process.env.CI_EVENT !== 'workflow_dispatch' &&
    process.env.CI_FORCE_ALL !== 'true' &&
    valid(base) &&
    valid(head)
  ) {
    try {
      const paths = changedPaths(base, head, process.env.CI_EVENT)
      result = affectedScopes(paths)
      container = result.scope === 'all' || containerInputsChanged(paths)
    } catch {
      // Force pushes can leave the before SHA unavailable even after a complete fetch.
      // Full verification is conservative; never turn lookup failure into skipped checks.
      console.log('::warning::Changed-path lookup unavailable; running the full CI inventory.')
    }
  }
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `scope=${result.scope}\nbrowser=${result.browser}\ncontainer=${container}\n`,
  )
}
