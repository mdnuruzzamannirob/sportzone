import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import ts from 'typescript'

// Compile and restart in one owned process group, without Node's dependency watcher.
let api
let restarting = Promise.resolve()
const host = ts.createWatchCompilerHost(
  resolve('backend/tsconfig.json'),
  {},
  ts.sys,
  ts.createEmitAndSemanticDiagnosticsBuilderProgram,
)
const afterProgramCreate = host.afterProgramCreate
host.afterProgramCreate = (program) => {
  afterProgramCreate(program)
  if (
    ts
      .getPreEmitDiagnostics(program.getProgram())
      .some((d) => d.category === ts.DiagnosticCategory.Error)
  )
    return
  restarting = restarting
    .then(async () => {
      if (api) {
        const previous = api
        api = undefined
        const exited = once(previous, 'exit')
        previous.kill('SIGTERM')
        const deadline = setTimeout(() => previous.kill('SIGKILL'), 12_000)
        await exited
        clearTimeout(deadline)
      }
      const child = spawn(
        process.execPath,
        ['--env-file-if-exists=.env', 'backend/dist/server.js'],
        { stdio: 'inherit' },
      )
      api = child
      child.once('error', () => {
        console.error('Cannot start development API.')
        process.exit(1)
      })
      child.once('exit', (code) => {
        if (api === child) {
          console.error('Development API exited unexpectedly.')
          process.exit(code || 1)
        }
      })
    })
    .catch(() => {
      console.error('Cannot restart development API.')
      process.exit(1)
    })
}
ts.createWatchProgram(host)
