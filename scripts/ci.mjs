import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ciPlan, testCounts, validateResults } from './ci-plan.mjs'

const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const git = (args) => {
  const child = spawnSync('git', args, { encoding: 'utf8' })
  if (child.status !== 0 || child.error)
    throw new Error('Cannot identify source revision')
  return child.stdout.trim()
}
function identity() {
  return {
    commit: git(['rev-parse', 'HEAD']),
    lockSha256: hash('package-lock.json'),
    inventorySha256: hash('ci-workspaces.json'),
    node: process.version,
    npm:
      process.env.npm_config_user_agent?.match(/^npm\/(\S+)/)?.[1] ?? 'unknown',
    workingTreeDirty: Boolean(git(['status', '--porcelain'])),
    runId: process.env.GITHUB_RUN_ID ?? 'local',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? 'local',
  }
}
function run(args, checks) {
  console.log(`Running: npm ${args.join(' ')}`)
  const started = Date.now()
  const child = spawnSync('npm', args, {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 16777216,
  })
  if (child.stdout) process.stdout.write(child.stdout)
  checks.push({
    command: `npm ${args.join(' ')}`,
    result: child.status === 0 && !child.error ? 'Passed' : 'Failed',
    exitCode: child.status,
    signal: child.signal,
    durationMs: Date.now() - started,
    testCounts: testCounts(child.stdout ?? ''),
  })
  if (child.status !== 0 || child.error)
    throw new Error('Configured CI command failed')
}
mkdirSync('test-results/ci', { recursive: true })
const argv = process.argv.slice(2)
const selection = argv.find((a) => a.startsWith('--scope='))?.slice(8) ?? 'all'
const aggregate = argv.includes('--aggregate')
const report = {
  version: 2,
  startedAt: new Date().toISOString(),
  scope: selection,
  checks: [],
  result: 'Failed',
}
let filename = 'test-results/ci.json'
try {
  if (
    argv.some(
      (a) =>
        !['--prepare', '--aggregate'].includes(a) && !a.startsWith('--scope='),
    ) ||
    argv.filter((a) => a.startsWith('--scope=')).length > 1
  )
    throw new Error('Invalid CI arguments')
  const plan = ciPlan(process.cwd())
  if (selection !== 'all' && !plan.some((s) => s.name === selection))
    throw new Error('Unknown CI scope')
  if (selection !== 'all') filename = `test-results/ci/${selection}.json`
  Object.assign(report, identity())
  report.workspaces = plan.filter((s) =>
    ['storefront', 'admin', 'backend'].includes(s.name),
  )
  if (aggregate) {
    if (selection !== 'all' || argv.includes('--prepare'))
      throw new Error('Invalid aggregate arguments')
    const reports = Object.fromEntries(
      plan.map((s) => [
        s.name,
        JSON.parse(readFileSync(`test-results/ci/${s.name}.json`, 'utf8')),
      ]),
    )
    validateResults(
      JSON.parse(process.env.CI_NEEDS ?? 'null'),
      reports,
      plan,
      report,
    )
    report.checks = plan.flatMap((s) => reports[s.name].checks)
  } else {
    if (argv.includes('--prepare')) {
      if (selection !== 'browser')
        throw new Error('Only browser scope supports preparation')
      report.preparation = []
      for (const name of plan.find((s) => s.name === 'browser').needs) {
        const build = plan
          .find((s) => s.name === name)
          .checks.find((args) => args[1] === 'build')
        if (!build) throw new Error('Browser dependency has no build')
        run(build, report.preparation)
      }
    }
    for (const scope of plan.filter(
      (s) => selection === 'all' || s.name === selection,
    )) {
      if (scope.state !== 'Configured')
        throw new Error(`CI scope is not configured: ${scope.name}`)
      for (const args of scope.checks) run(args, report.checks)
    }
  }
  report.result = 'Passed'
} catch (error) {
  report.error =
    error instanceof SyntaxError
      ? 'Invalid CI JSON input/report'
      : error.message
  console.error(report.error)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  writeFileSync(filename, `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `CI ${selection}: ${report.result}\n\nReport: ${filename}\n`,
    )
}
