import assert from 'node:assert/strict'
import { spawnSync as spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  ciPlan,
  scopeNames,
  testCounts,
  validateResults,
} from '../scripts/ci-plan.mjs'
import { workflowText } from '../scripts/ci-workflow.mjs'
import { auditResult, safeFindings } from '../scripts/security-policy.mjs'
import {
  baseChecks,
  inspectRepository,
  workspacePlan,
} from '../scripts/check-repository.mjs'

// Nested CLI runs must not inherit the parent test runner's IPC context.
const childEnv = { ...process.env }
delete childEnv.NODE_TEST_CONTEXT
const spawnSync = (command, args, options = {}) =>
  spawn(command, args, { ...options, env: childEnv })

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sportzone-ci-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (file, data) => {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(
      join(root, file),
      typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`,
    )
  }
  assert.equal(spawnSync('git', ['init', '--quiet', root]).status, 0)
  put('package.json', {
    private: true,
    workspaces: ['storefront', 'admin', 'backend'],
    scripts: Object.fromEntries(
      ['workspaces:check', 'lint', 'test:unit', 'test:ui', 'test:security'].map(
        (c) => [c, 'node --version'],
      ),
    ),
  })
  const config = {}
  for (const name of ['storefront', 'admin', 'backend']) {
    put(`${name}/package.json`, { name, private: true })
    config[name] = {
      state: 'manifest-only',
      ownerTask: 'P02-001',
      checks: baseChecks,
    }
  }
  const scopes = {
    ...config,
    repository: {
      ownerTask: 'P01-016',
      needs: [],
      checks: ['workspaces:check', 'lint', 'test:unit'],
    },
    browser: {
      ownerTask: 'P01-016',
      needs: ['storefront', 'admin'],
      checks: ['test:ui'],
    },
    'supply-chain': {
      ownerTask: 'P01-016',
      needs: ['repository'],
      checks: ['test:security'],
    },
  }
  for (const name of ['storefront', 'admin', 'backend'])
    scopes[name].needs = ['repository']
  const putFile = (file, data) =>
    put(
      file,
      file === 'ci-workspaces.json' ? { version: 2, scopes: data } : data,
    )
  putFile('ci-workspaces.json', scopes)
  assert.equal(
    spawnSync('git', [
      '-C',
      root,
      '-c',
      'user.name=CI fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '--quiet',
      '-m',
      'fixture',
    ]).status,
    0,
  )
  return { root, put: putFile, config: scopes }
}
test('CI-01: manifest-only workspaces are explicitly Not Configured', (t) => {
  const { root } = fixture(t)
  assert.deepEqual(
    workspacePlan(root).map((w) => w.state),
    Array(3).fill('Not Configured'),
  )
})
test('CI-02: source cannot bypass workspace activation', (t) => {
  const { root, put } = fixture(t)
  put('storefront/src/page.tsx', 'export default 1;\n')
  assert.throws(() => workspacePlan(root), /requires active/)
})
test('CI-03: dependency/script addition cannot remain manifest-only', (t) => {
  const { root, put } = fixture(t)
  put('admin/package.json', {
    name: 'admin',
    private: true,
    devDependencies: { example: '1.0.0' },
  })
  assert.throws(() => workspacePlan(root), /requires active/)
})
test('CI-04: active workspace must supply every core check', (t) => {
  const { root, put, config } = fixture(t)
  config.backend.state = 'active'
  put('ci-workspaces.json', config)
  put('backend/package.json', {
    name: 'backend',
    private: true,
    scripts: { lint: 'node --version' },
  })
  assert.throws(() => workspacePlan(root), /missing\/unsafe script typecheck/)
})
test('CI-05: core checks cannot be removed from active inventory', (t) => {
  const { root, put, config } = fixture(t)
  config.admin.state = 'active'
  config.admin.checks = ['lint']
  put('ci-workspaces.json', config)
  assert.throws(() => workspacePlan(root), /missing required/)
})
test('CI-06: every configured extra suite is mandatory, never if-present', (t) => {
  const { root, put, config } = fixture(t)
  config.backend.state = 'active'
  config.backend.checks = [...baseChecks, 'test:integration']
  put('ci-workspaces.json', config)
  const scripts = Object.fromEntries(
    baseChecks.map((c) => [c, 'node --version']),
  )
  put('backend/package.json', { name: 'backend', private: true, scripts })
  assert.throws(() => workspacePlan(root), /test:integration/)
  scripts['test:integration'] = 'npm run missing --if-present'
  put('backend/package.json', { name: 'backend', private: true, scripts })
  assert.throws(() => workspacePlan(root), /missing\/unsafe/)
})
test('CI-07: broken link or anchor fails repository lint', (t) => {
  const { root, put } = fixture(t)
  put('README.md', '# Hello\n\n[missing](missing.md)\n[anchor](#absent)\n')
  assert.equal(
    inspectRepository(root).errors.filter((e) => e.includes('broken local'))
      .length,
    2,
  )
})
test('CI-08: valid duplicate heading anchors pass', (t) => {
  const { root, put } = fixture(t)
  put('README.md', '# Hello\n\n## Hello\n\n[one](#hello) [two](#hello-1)\n')
  assert.deepEqual(inspectRepository(root).errors, [])
})
test('CI-09: syntax, whitespace and malformed JSON are failures', (t) => {
  const { root, put } = fixture(t)
  put('bad.mjs', 'const = ;\n')
  put('bad.json', '{oops}\n')
  put('README.md', '# Bad  \n')
  const errors = inspectRepository(root).errors
  for (const message of ['syntax', 'invalid JSON', 'trailing whitespace'])
    assert.ok(errors.some((e) => e.includes(message)))
})
test('CI-10: tracked environment files and credential patterns are rejected without values', (t) => {
  const { root, put } = fixture(t)
  put('.env', 'EXAMPLE=\n')
  const fake = ['ghp', '_', 'a'.repeat(36)].join('')
  put('sample.txt.json', `${JSON.stringify({ fake })}\n`)
  const result = inspectRepository(root)
  assert.ok(result.errors.some((e) => e.includes('environment file')))
  assert.ok(result.errors.some((e) => e.includes('credential material')))
  assert.ok(!JSON.stringify(result).includes(fake))
})
test('CI-11: configured failing command propagates to pipeline exit and report; later step does not run', (t) => {
  const { root, put } = fixture(t)
  cpSync(resolve('scripts'), join(root, 'scripts'), { recursive: true })
  put('package-lock.json', { lockfileVersion: 3 })
  put('package.json', {
    private: true,
    workspaces: ['storefront', 'admin', 'backend'],
    scripts: {
      'workspaces:check': 'node --version',
      lint: 'node -e "process.exit(7)"',
      'test:unit':
        "node -e \"require('node:fs').writeFileSync('should-not-exist','bad')\"",
      'test:ui': 'node --version',
      'test:security': 'node --version',
    },
  })
  const child = spawnSync(process.execPath, ['scripts/ci.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(child.status, 1)
  assert.equal(
    child.stderr.includes('Cannot identify source revision'),
    false,
    child.stderr,
  )
  const report = JSON.parse(
    readFileSync(join(root, 'test-results/ci.json'), 'utf8'),
  )
  assert.equal(report.result, 'Failed')
  assert.ok(
    report.checks.length > 0,
    JSON.stringify({ stderr: child.stderr, stdout: child.stdout, report }),
  )
  assert.equal(report.checks.at(-1).result, 'Failed')
  assert.equal(existsSync(join(root, 'should-not-exist')), false)
})
test('CI-12: a failing workspace build propagates to pipeline failure', (t) => {
  const { root, put, config } = fixture(t)
  config.storefront.state = 'active'
  put('ci-workspaces.json', config)
  cpSync(resolve('scripts'), join(root, 'scripts'), { recursive: true })
  put('package-lock.json', { lockfileVersion: 3 })
  put('package.json', {
    private: true,
    workspaces: ['storefront', 'admin', 'backend'],
    scripts: Object.fromEntries(
      ['workspaces:check', 'lint', 'test:unit', 'test:ui', 'test:security'].map(
        (c) => [c, 'node --version'],
      ),
    ),
  })
  put('storefront/package.json', {
    name: 'storefront',
    private: true,
    scripts: Object.fromEntries(
      baseChecks.map((c) => [
        c,
        c === 'build' ? 'node -e "process.exit(9)"' : 'node --version',
      ]),
    ),
  })
  const child = spawnSync(process.execPath, ['scripts/ci.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(child.status, 1)
  const report = JSON.parse(
    readFileSync(join(root, 'test-results/ci.json'), 'utf8'),
  )
  assert.equal(
    report.checks.at(-1).command,
    'npm run build --workspace=storefront',
  )
  assert.equal(report.checks.at(-1).result, 'Failed')
})

function activeFixture(t) {
  const f = fixture(t)
  for (const name of ['storefront', 'admin', 'backend']) {
    f.config[name].state = 'active'
    f.put(`${name}/package.json`, {
      name,
      private: true,
      scripts: Object.fromEntries(baseChecks.map((c) => [c, 'node --version'])),
    })
  }
  f.put('ci-workspaces.json', f.config)
  return f
}
function successReports(plan) {
  const identity = {
    commit: 'fixture',
    lockSha256: 'lock',
    inventorySha256: 'inventory',
    node: 'node',
    npm: 'npm',
    runId: 'run',
    runAttempt: '1',
  }
  const needs = Object.fromEntries(
    plan.map((s) => [s.name, { result: 'success' }]),
  )
  const reports = Object.fromEntries(
    plan.map((s) => [
      s.name,
      {
        ...identity,
        version: 2,
        scope: s.name,
        result: 'Passed',
        finishedAt: 'time',
        workingTreeDirty: false,
        checks: s.checks.map((args) => ({
          command: `npm ${args.join(' ')}`,
          result: 'Passed',
          exitCode: 0,
          signal: null,
        })),
      },
    ]),
  )
  return { needs, reports, identity }
}
test('CI-13: all six scopes share one plan, browser builds are explicit, every change keeps all checks', (t) => {
  const { root } = activeFixture(t)
  const plan = ciPlan(root)
  assert.deepEqual(
    plan.map((s) => s.name),
    scopeNames,
  )
  assert.deepEqual(plan.find((s) => s.name === 'browser').needs, [
    'storefront',
    'admin',
  ])
  assert.equal(plan.flatMap((s) => s.checks).length, 17)
})
test('CI-14: mandatory browser/security checks and dependency edges cannot disappear', (t) => {
  const { root, put, config } = activeFixture(t)
  config.browser.checks = ['lint']
  put('ci-workspaces.json', config)
  assert.throws(() => ciPlan(root), /Missing required browser/)
  config.browser.checks = ['test:ui']
  config.browser.needs = []
  put('ci-workspaces.json', config)
  assert.throws(() => ciPlan(root), /Invalid CI scope/)
})
test('CI-15: aggregate accepts complete same-run reports and success results', (t) => {
  const plan = ciPlan(activeFixture(t).root)
  const { needs, reports, identity } = successReports(plan)
  assert.doesNotThrow(() => validateResults(needs, reports, plan, identity))
})
for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
  test(`CI-16: aggregate rejects ${result ?? 'missing'} required job`, (t) => {
    const plan = ciPlan(activeFixture(t).root)
    const { needs, reports, identity } = successReports(plan)
    if (result) needs.backend.result = result
    else delete needs.backend
    assert.throws(() => validateResults(needs, reports, plan, identity))
  })
}
for (const field of [
  'commit',
  'lockSha256',
  'inventorySha256',
  'runId',
  'runAttempt',
  'node',
  'npm',
]) {
  test(`CI-17: aggregate rejects stale/mismatched ${field}`, (t) => {
    const plan = ciPlan(activeFixture(t).root)
    const { needs, reports, identity } = successReports(plan)
    reports.browser[field] = 'other'
    assert.throws(
      () => validateResults(needs, reports, plan, identity),
      /stale/,
    )
  })
}
test('CI-18: missing, partial, failed or dirty reports cannot pass aggregation', (t) => {
  const plan = ciPlan(activeFixture(t).root)
  for (const mutate of [
    (r) => delete r.admin,
    (r) => r.admin.checks.pop(),
    (r) => (r.admin.checks[0].exitCode = 8),
    (r) => (r.admin.workingTreeDirty = true),
    (r) => (r.admin.result = 'Failed'),
  ]) {
    const { needs, reports, identity } = successReports(plan)
    mutate(reports)
    assert.throws(() => validateResults(needs, reports, plan, identity))
  }
  const fixtureReports = successReports(plan)
  assert.throws(
    () =>
      validateResults(fixtureReports.needs, fixtureReports.reports, plan, {
        ...fixtureReports.identity,
        workingTreeDirty: true,
      }),
    /dirty/,
  )
})
test('CI-19: browser scope prepares both builds before its audit; other workspace tests are not duplicated', (t) => {
  const { root, put } = activeFixture(t)
  cpSync(resolve('scripts'), join(root, 'scripts'), { recursive: true })
  put('package-lock.json', { lockfileVersion: 3 })
  const child = spawnSync(
    process.execPath,
    ['scripts/ci.mjs', '--scope=browser', '--prepare'],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(child.status, 0, child.stderr)
  const report = JSON.parse(
    readFileSync(join(root, 'test-results/ci/browser.json'), 'utf8'),
  )
  assert.deepEqual(
    report.preparation.map((c) => c.command),
    ['npm run build --workspace=storefront', 'npm run build --workspace=admin'],
  )
  assert.deepEqual(
    report.checks.map((c) => c.command),
    ['npm run test:ui'],
  )
})
test('CI-20: unknown scope fails and preserves a failure report', (t) => {
  const { root, put } = activeFixture(t)
  cpSync(resolve('scripts'), join(root, 'scripts'), { recursive: true })
  put('package-lock.json', { lockfileVersion: 3 })
  const child = spawnSync(
    process.execPath,
    ['scripts/ci.mjs', '--scope=missing'],
    { cwd: root, encoding: 'utf8' },
  )
  assert.equal(child.status, 1)
  assert.equal(
    JSON.parse(readFileSync(join(root, 'test-results/ci.json'), 'utf8')).result,
    'Failed',
  )
})
test('CI-21: committed workflow topology matches inventory and required-result always evaluates all jobs', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
  assert.equal(workflow, workflowText(ciPlan(process.cwd())))
  assert.ok(workflow.includes('if: ${{ always() }}'))
  assert.ok(!workflow.includes('paths:'))
  const reusable = readFileSync('.github/workflows/ci-scope.yml', 'utf8')
  assert.ok(reusable.includes('--prepare'))
  assert.ok(reusable.includes('fetch-depth: 0'))
  assert.ok(reusable.includes('github.run_attempt'))
  for (const file of [
    '.github/workflows/ci.yml',
    '.github/workflows/ci-scope.yml',
    '.github/actions/ci-setup/action.yml',
  ]) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(/uses: (?!\.\/)(\S+)/g))
      assert.match(match[1], /@[a-f0-9]{40}$/)
    assert.ok(!content.includes('pull_request_target'))
    assert.ok(!content.includes('continue-on-error'))
  }
})
test('CI-22: security reports exclude secret/match/author/provider payload fields', () => {
  const findings = safeFindings([
    {
      RuleID: 'rule',
      File: 'file',
      StartLine: 1,
      Fingerprint: 'id',
      Secret: 'sensitive',
      Match: 'sensitive',
      Author: 'private',
    },
  ])
  assert.deepEqual(findings, [
    { rule: 'rule', file: 'file', line: 1, fingerprint: 'id' },
  ])
  assert.ok(!JSON.stringify(findings).includes('sensitive'))
  assert.throws(() => safeFindings({}), /invalid/)
})
const auditFixture = () => ({
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 2,
      critical: 0,
      total: 2,
    },
  },
  vulnerabilities: {
    direct: { severity: 'high', via: [{ source: 100 }] },
    indirect: { severity: 'high', via: ['direct'] },
  },
})
test('CI-23: high/critical direct and transitive advisories block without approved exceptions', () => {
  assert.equal(auditResult(auditFixture(), []).blocked.length, 2)
  assert.throws(() => auditResult({ error: {} }, []), /incomplete/)
  const audit = auditFixture()
  delete audit.vulnerabilities.direct
  assert.throws(() => auditResult(audit, []), /inconsistent|lineage/)
  assert.throws(
    () => auditResult({ ...auditFixture(), vulnerabilities: {} }, []),
    /inconsistent/,
  )
})
test('CI-24: dependency exceptions are specific, reviewed and expiring', () => {
  const exception = {
    package: 'direct',
    advisory: 100,
    reviewer: 'reviewer',
    reason: 'documented non-applicability',
    expires: '2030-01-01',
  }
  const now = new Date('2026-10-20T00:00:00Z')
  assert.equal(auditResult(auditFixture(), [exception], now).blocked.length, 0)
  assert.throws(
    () =>
      auditResult(
        auditFixture(),
        [{ ...exception, expires: '2020-01-01' }],
        now,
      ),
    /expired/,
  )
  assert.throws(
    () => auditResult(auditFixture(), [exception, exception], now),
    /Duplicate/,
  )
})

test('CI-25: machine summaries preserve discovered/passed/failed counts from real runner formats', () => {
  assert.deepEqual(
    testCounts('ℹ tests 33\nℹ pass 32\nℹ fail 1\nℹ skipped 0\nℹ cancelled 0\n'),
    { discovered: 33, pass: 32, fail: 1, skipped: 0, cancelled: 0 },
  )
  assert.deepEqual(testCounts('      Tests  1 failed | 313 passed (314)\n'), {
    discovered: 314,
    pass: 313,
    fail: 1,
    skipped: 0,
  })
  assert.deepEqual(testCounts('  30 passed (14.5s)\n'), {
    discovered: 30,
    pass: 30,
    fail: 0,
    skipped: 0,
    cancelled: 0,
  })
  assert.deepEqual(
    testCounts('  2 failed\n  1 skipped\n  27 passed (14.5s)\n'),
    { discovered: 30, pass: 27, fail: 2, skipped: 1, cancelled: 0 },
  )
  assert.equal(testCounts('node v24'), undefined)
})
