import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { workspacePlan } from './check-repository.mjs'

mkdirSync('test-results', { recursive: true })
const report = {
  startedAt: new Date().toISOString(),
  node: process.version,
  npm: process.env.npm_config_user_agent?.match(/^npm\/(\S+)/)?.[1] ?? 'Not recorded; invoke npm run ci',
  workingTreeDirty: Boolean(spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim()),
  commit: spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).stdout.trim(),
  lockSha256: createHash('sha256')
    .update(readFileSync('package-lock.json'))
    .digest('hex'),
  workspaces: [],
  checks: [],
  result: 'Failed',
}
function run(args) {
  console.log(`Running: npm ${args.join(' ')}`)
  const child = spawnSync('npm', args, { stdio: 'inherit' })
  report.checks.push({
    command: `npm ${args.join(' ')}`,
    result: child.status === 0 ? 'Passed' : 'Failed',
  })
  if (child.status !== 0) throw new Error('Configured CI command failed')
}
try {
  report.workspaces = workspacePlan(process.cwd())
  for (const workspace of report.workspaces) {
    if (workspace.state === 'Not Configured')
      console.log(
        `${workspace.name}: Not Configured; owned by ${workspace.ownerTask}`,
      )
  }
  run(['run', 'workspaces:check'])
  run(['run', 'lint'])
  run(['run', 'test:unit'])
  for (const workspace of report.workspaces) {
    for (const check of workspace.checks)
      run(['run', check, `--workspace=${workspace.name}`])
  }
  report.result = 'Passed'
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  writeFileSync('test-results/ci.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `CI baseline: ${report.result}\n\n` +
        report.workspaces
          .map((w) => `- ${w.name}: ${w.state} (${w.ownerTask})`)
          .join('\n') +
        '\n',
    )
  }
}
