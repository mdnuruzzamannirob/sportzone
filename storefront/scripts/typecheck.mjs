import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Route moves must not leave old generated validators in either build or dev type caches.
for (const path of ['../.next/types/', '../.next/dev/types/'])
  rmSync(new URL(path, import.meta.url), { recursive: true, force: true })
const require = createRequire(import.meta.url)
const cwd = fileURLToPath(new URL('..', import.meta.url))
const manifest = require.resolve('typescript/package.json')
const compiler = resolve(dirname(manifest), JSON.parse(readFileSync(manifest, 'utf8')).bin.tsc)
for (const [entry, args] of [
  [require.resolve('next/dist/bin/next'), ['typegen']],
  [compiler, ['--noEmit']],
]) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0 || result.error) {
    process.exitCode = result.status || 1
    break
  }
}
