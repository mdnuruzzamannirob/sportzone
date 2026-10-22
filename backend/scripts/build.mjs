import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// A moved source file must not survive as an executable module in the deployable artifact.
const workspace = fileURLToPath(new URL('..', import.meta.url))
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true })
const compiler = createRequire(import.meta.url).resolve('typescript/bin/tsc')
const result = spawnSync(process.execPath, [compiler, '--project', 'tsconfig.json'], {
  cwd: workspace,
  stdio: 'inherit',
})
process.exitCode = result.status ?? 1
