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
    } else if (path.startsWith('docs/') || /^(README|AGENTS|CHANGELOG)\.md$/.test(path)) continue
    else return { scope: 'all', browser: true }
  }
  if (selected.size === 1) return { scope: 'all', browser: true }
  return {
    scope: [...selected]
      .sort((a, b) => (a === 'supply-chain' ? 1 : b === 'supply-chain' ? -1 : 0))
      .join(','),
    browser: selected.has('browser'),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const base = process.env.CI_BASE_SHA
  const head = process.env.CI_HEAD_SHA
  const valid = (sha) => /^[a-f0-9]{40}$/.test(sha ?? '') && !/^0+$/.test(sha)
  let result = { scope: 'all', browser: true }
  if (process.env.CI_EVENT !== 'workflow_dispatch' && valid(base) && valid(head)) {
    const paths = execFileSync('git', ['diff', '--name-only', '-z', base, head], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
    result = affectedScopes(paths)
  }
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(process.env.GITHUB_OUTPUT, `scope=${result.scope}\nbrowser=${result.browser}\n`)
}
