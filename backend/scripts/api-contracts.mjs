import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  console.error('Invalid API generation arguments')
  process.exitCode = 1
} else {
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  // A deleted/renamed tooling entry must not survive as executable stale output.
  rmSync(new URL('../.cache/contracts/', import.meta.url), { recursive: true, force: true })
  const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc')
  const compiled = spawnSync(process.execPath, [compiler, '--project', 'tsconfig.contracts.json'], {
    cwd,
    stdio: 'inherit',
  })
  if (compiled.error || compiled.status !== 0) process.exitCode = compiled.status || 1
  else {
    const generated = spawnSync(
      process.execPath,
      ['.cache/contracts/contracts/generate.js', ...args],
      { cwd, stdio: 'inherit' },
    )
    process.exitCode = generated.error ? 1 : (generated.status ?? 1)
  }
}
