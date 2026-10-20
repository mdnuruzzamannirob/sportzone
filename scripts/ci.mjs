import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ciPlan } from './ci-plan.mjs'

const argv = process.argv.slice(2)
const selection = argv[0]?.slice(8) ?? 'all'
const report = {
  version: 3,
  startedAt: new Date().toISOString(),
  scope: selection,
  checks: [],
  result: 'Failed',
}
let filename = 'test-results/ci.json'
mkdirSync('test-results/ci', { recursive: true })
try {
  if (argv.length > 1 || (argv.length && !/^--scope=[a-z-]+$/.test(argv[0])))
    throw new Error('Invalid CI arguments')
  const plan = ciPlan(process.cwd())
  if (selection !== 'all' && !plan.some((s) => s.name === selection))
    throw new Error('Unknown CI scope')
  if (selection !== 'all') filename = `test-results/ci/${selection}.json`
  for (const scope of plan.filter(
    (s) => selection === 'all' || s.name === selection,
  )) {
    if (scope.state !== 'Configured')
      throw new Error(`CI scope is not configured: ${scope.name}`)
    for (const args of scope.checks) {
      const command = `npm ${args.join(' ')}`
      console.log(`Running: ${command}`)
      const started = Date.now()
      const child = spawnSync('npm', args, { stdio: 'inherit' })
      const passed = child.status === 0 && !child.error
      report.checks.push({
        command,
        result: passed ? 'Passed' : 'Failed',
        exitCode: child.status,
        signal: child.signal,
        durationMs: Date.now() - started,
      })
      if (!passed) {
        if (process.env.GITHUB_ACTIONS === 'true')
          console.log(`::error title=CI command failed::${command}`)
        throw new Error(`Configured CI command failed: ${command}`)
      }
    }
  }
  report.result = 'Passed'
} catch (error) {
  report.error = error.message
  console.error(report.error)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`)
}
