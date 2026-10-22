import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Route moves must not leave old generated validators in either build or dev type caches.
for (const path of ['../.next/types/', '../.next/dev/types/'])
  rmSync(new URL(path, import.meta.url), { recursive: true, force: true })
const require = createRequire(import.meta.url)
const cwd = fileURLToPath(new URL('..', import.meta.url))
for (const [entry, args] of [
  ['next/dist/bin/next', ['typegen']],
  ['typescript/bin/tsc', ['--noEmit']],
]) {
  const result = spawnSync(process.execPath, [require.resolve(entry), ...args], {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0 || result.error) {
    process.exitCode = result.status || 1
    break
  }
}
