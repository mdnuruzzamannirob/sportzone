import assert from 'node:assert/strict'
import { spawnSync as spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { baseChecks, inspectRepository, workspacePlan } from '../../scripts/ci/check-repository.mjs'
import { ciPlan, scopeNames } from '../../scripts/ci/plan.mjs'
import { affectedScopes } from '../../scripts/ci/affected.mjs'
import { auditResult, safeFindings } from '../../scripts/ci/security-policy.mjs'
import { snapshotWorkingTree } from '../../scripts/ci/security-snapshot.mjs'

// Nested CLI runs must not inherit the parent test runner's IPC context.
const childEnv = { ...process.env }
delete childEnv.NODE_TEST_CONTEXT
const spawnSync = (command, args, options = {}) =>
  spawn(command, args, { ...options, env: { ...childEnv, ...options.env } })

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
      [
        'workspaces:check',
        'lint',
        'test:unit',
        'lint:boundaries',
        'format:check',
        'format:backend',
        'test:ui',
        'test:security',
      ].map((c) => [c, 'node --version']),
    ),
  })
  const config = {}
  for (const name of ['storefront', 'admin', 'backend']) {
    put(`${name}/package.json`, { name, private: true })
    config[name] = {
      ...(name === 'backend' ? { rootChecks: ['test:unit', 'format:backend'] } : {}),
      state: 'manifest-only',
      ownerTask: 'P02-001',
      checks: baseChecks,
    }
  }
  const scopes = {
    ...config,
    repository: {
      ownerTask: 'P01-016',
      checks: ['workspaces:check', 'lint', 'test:unit', 'lint:boundaries', 'format:check'],
    },
    browser: {
      ownerTask: 'P01-016',
      checks: ['test:ui'],
    },
    'supply-chain': {
      ownerTask: 'P01-016',
      checks: ['test:security'],
    },
  }
  const putFile = (file, data) =>
    put(file, file === 'ci-workspaces.json' ? { version: 2, scopes: data } : data)
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
  const scripts = Object.fromEntries(baseChecks.map((c) => [c, 'node --version']))
  put('backend/package.json', { name: 'backend', private: true, scripts })
  assert.throws(() => workspacePlan(root), /test:integration/)
  scripts['test:integration'] = 'npm run missing --if-present'
  put('backend/package.json', { name: 'backend', private: true, scripts })
  assert.throws(() => workspacePlan(root), /missing\/unsafe/)
})
test('CI-07: broken link or anchor fails repository lint', (t) => {
  const { root, put } = fixture(t)
  put('README.md', '# Hello\n\n[missing](missing.md)\n[anchor](#absent)\n')
  assert.equal(inspectRepository(root).errors.filter((e) => e.includes('broken local')).length, 2)
})
test('CI-08: valid duplicate heading anchors pass', (t) => {
  const { root, put } = fixture(t)
  put('README.md', '# Hello\n\n## Hello\n\n[one](#hello) [two](#hello-1)\n')
  assert.deepEqual(inspectRepository(root).errors, [])
})
test('CI-08a: generated local evidence artifacts do not fail a clean checkout', (t) => {
  const { root, put } = fixture(t)
  put('README.md', '# Evidence\n\n[local report](test-results/example/report.json)\n')
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
      'test:unit': "node -e \"require('node:fs').writeFileSync('should-not-exist','bad')\"",
      'test:ui': 'node --version',
      'test:security': 'node --version',
      'lint:boundaries': 'node --version',
      'format:check': 'node --version',
    },
  })
  const child = spawnSync(process.execPath, ['scripts/ci/run.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...childEnv, GITHUB_ACTIONS: 'true' },
  })
  assert.equal(child.status, 1)
  assert.ok(
    child.stdout.includes('::error title=CI command failed::npm run lint'),
    JSON.stringify({ stdout: child.stdout, stderr: child.stderr }),
  )
  assert.equal(child.stderr.includes('Cannot identify source revision'), false, child.stderr)
  const report = JSON.parse(readFileSync(join(root, 'test-results/ci.json'), 'utf8'))
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
  config.storefront.checks = [...baseChecks, 'test:smoke']
  put('ci-workspaces.json', config)
  cpSync(resolve('scripts'), join(root, 'scripts'), { recursive: true })
  put('package-lock.json', { lockfileVersion: 3 })
  put('package.json', {
    private: true,
    workspaces: ['storefront', 'admin', 'backend'],
    scripts: Object.fromEntries(
      [
        'workspaces:check',
        'lint',
        'test:unit',
        'lint:boundaries',
        'format:check',
        'test:ui',
        'test:security',
      ].map((c) => [c, 'node --version']),
    ),
  })
  put('storefront/package.json', {
    name: 'storefront',
    private: true,
    scripts: Object.fromEntries(
      [...baseChecks, 'test:smoke'].map((c) => [
        c,
        c === 'build' ? 'node -e "process.exit(9)"' : 'node --version',
      ]),
    ),
  })
  const child = spawnSync(process.execPath, ['scripts/ci/run.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(child.status, 1)
  const report = JSON.parse(readFileSync(join(root, 'test-results/ci.json'), 'utf8'))
  assert.equal(report.checks.at(-1).command, 'npm run build --workspace=storefront')
  assert.equal(report.checks.at(-1).result, 'Failed')
})

function activeFixture(t) {
  const f = fixture(t)
  for (const name of ['storefront', 'admin', 'backend']) {
    f.config[name].state = 'active'
    const checks = [
      ...baseChecks,
      'test:smoke',
      ...(name === 'backend' ? ['test:integration'] : []),
    ]
    f.config[name].checks = checks
    f.put(`${name}/package.json`, {
      name,
      private: true,
      scripts: Object.fromEntries(checks.map((c) => [c, 'node --version'])),
    })
  }
  f.put('ci-workspaces.json', f.config)
  return f
}
test('CI-13: one ordered inventory runs every configured check', (t) => {
  const { root } = activeFixture(t)
  const plan = ciPlan(root)
  assert.deepEqual(
    plan.map((s) => s.name),
    scopeNames,
  )
  assert.equal(plan.flatMap((s) => s.checks).length, 23)
})
test('CI-14: mandatory browser checks cannot disappear', (t) => {
  const { root, put, config } = activeFixture(t)
  config.browser.checks = ['lint']
  put('ci-workspaces.json', config)
  assert.throws(() => ciPlan(root), /Missing required browser/)
})
test('CI-19: browser scope runs only its audit and reuses existing builds', (t) => {
  const { root, put } = activeFixture(t)
  cpSync(resolve('scripts'), join(root, 'scripts'), { recursive: true })
  put('package-lock.json', { lockfileVersion: 3 })
  const child = spawnSync(process.execPath, ['scripts/ci/run.mjs', '--scope=browser'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(child.status, 0, child.stderr)
  const report = JSON.parse(readFileSync(join(root, 'test-results/ci/browser.json'), 'utf8'))
  assert.equal(report.preparation, undefined)
  assert.deepEqual(
    report.checks.map((c) => c.command),
    ['npm run test:ui'],
  )
})
test('CI-20: unknown scope fails and preserves a failure report', (t) => {
  const { root, put } = activeFixture(t)
  cpSync(resolve('scripts'), join(root, 'scripts'), { recursive: true })
  put('package-lock.json', { lockfileVersion: 3 })
  const child = spawnSync(process.execPath, ['scripts/ci/run.mjs', '--scope=missing'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(child.status, 1)
  assert.equal(
    JSON.parse(readFileSync(join(root, 'test-results/ci.json'), 'utf8')).result,
    'Failed',
  )
})
test('affected checks isolate backend, including accompanying documentation', () => {
  assert.deepEqual(affectedScopes(['backend/src/server.ts', 'docs/API.md']), {
    scope: 'backend,supply-chain',
    browser: false,
  })
  for (const paths of [
    ['shared/money.ts'],
    ['package-lock.json'],
    ['.github/workflows/ci.yml'],
    ['unknown/file'],
  ])
    assert.deepEqual(affectedScopes(paths), { scope: 'all', browser: true })
  assert.equal(affectedScopes(['admin/src/main.tsx']).browser, true)
  assert.equal(affectedScopes(['backend/src/server.ts'], true).scope, 'all')
  assert.equal(affectedScopes([]).scope, 'all')
})
test('scoped inventory ignores unrelated invalid frontend manifests', (t) => {
  const { root, put } = fixture(t)
  put('admin/package.json', '{invalid')
  assert.equal(ciPlan(root, ['backend']).length, 1)
  assert.throws(() => ciPlan(root))
  assert.throws(() => ciPlan(root, ['unknown']), /Unknown CI scope/)
})
test('CI-21: hosted checks use one install and one inventory invocation with pinned actions', () => {
  const content = readFileSync('.github/workflows/ci.yml', 'utf8')
  assert.equal((content.match(/run: npm ci /g) ?? []).length, 1)
  assert.equal((content.match(/run: npm run ci -- --scope=/gm) ?? []).length, 1)
  assert.ok(content.includes('name: CI required result'))
  assert.ok(content.includes('fetch-depth: 0'))
  assert.ok(content.includes("if: steps.affected.outputs.browser == 'true'"))
  assert.ok(content.includes('CI_SCOPE: ${{ steps.affected.outputs.scope }}'))
  assert.ok(content.includes('if: ${{ always() }}'))
  for (const match of content.matchAll(/uses: (\S+)/g)) assert.match(match[1], /@[a-f0-9]{40}$/)
  for (const unsafe of [
    'paths:',
    'pull_request_target',
    'continue-on-error',
    '--prepare',
    '--aggregate',
  ])
    assert.ok(!content.includes(unsafe))
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
  assert.deepEqual(findings, [{ rule: 'rule', file: 'file', line: 1, fingerprint: 'id' }])
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
  assert.throws(() => auditResult({ ...auditFixture(), vulnerabilities: {} }, []), /inconsistent/)
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
    () => auditResult(auditFixture(), [{ ...exception, expires: '2020-01-01' }], now),
    /expired/,
  )
  assert.throws(() => auditResult(auditFixture(), [exception, exception], now), /Duplicate/)
})

test('CI-25: working-tree scan excludes ignored local secrets but includes tracked ignored and new source', () => {
  const root = mkdtempSync(join(tmpdir(), 'sportzone-scan-fixture-'))
  const output = mkdtempSync(join(tmpdir(), 'sportzone-scan-output-'))
  try {
    assert.equal(spawn('git', ['init', '--quiet', root]).status, 0)
    writeFileSync(join(root, '.gitignore'), '.env*\n')
    writeFileSync(join(root, '.env'), 'synthetic local configuration')
    writeFileSync(join(root, '.env.tracked'), 'synthetic tracked configuration')
    assert.equal(spawn('git', ['add', '-f', '.env.tracked'], { cwd: root }).status, 0)
    writeFileSync(join(root, '.env.tracked'), 'synthetic current working copy')
    writeFileSync(join(root, 'new-source.ts'), 'export const synthetic = true')
    snapshotWorkingTree(root, output)
    assert.equal(existsSync(join(output, '.env')), false)
    assert.equal(
      readFileSync(join(output, '.env.tracked'), 'utf8'),
      'synthetic current working copy',
    )
    assert.equal(existsSync(join(output, 'new-source.ts')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(output, { recursive: true, force: true })
  }
})
test('CI-26: working-tree scan never follows symlink secrets and fails closed without Git inventory', () => {
  const root = mkdtempSync(join(tmpdir(), 'sportzone-scan-fixture-'))
  const output = mkdtempSync(join(tmpdir(), 'sportzone-scan-output-'))
  try {
    assert.throws(() => snapshotWorkingTree(root, output), /inventory unavailable/)
    assert.equal(spawn('git', ['init', '--quiet', root]).status, 0)
    const outside = join(output, 'synthetic-private')
    writeFileSync(outside, 'synthetic private material')
    symlinkSync(outside, join(root, 'source-link'))
    snapshotWorkingTree(root, output)
    assert.equal(existsSync(join(output, 'source-link')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(output, { recursive: true, force: true })
  }
})

test('CI-27: required boundary and formatting checks cannot be removed from the inventory', (t) => {
  const { root, put, config } = activeFixture(t)
  for (const name of ['lint:boundaries', 'format:check']) {
    config.repository.checks = [
      'workspaces:check',
      'lint',
      'test:unit',
      'lint:boundaries',
      'format:check',
    ].filter((check) => check !== name)
    put('ci-workspaces.json', config)
    assert.throws(() => ciPlan(root), /Missing required repository/)
  }
})

test('CI-28: smoke and backend integration checks cannot disappear from active inventory', (t) => {
  const { root, put, config } = activeFixture(t)
  for (const [name, check] of [
    ['storefront', 'test:smoke'],
    ['admin', 'test:smoke'],
    ['backend', 'test:smoke'],
    ['backend', 'test:integration'],
  ]) {
    const previous = config[name].checks
    config[name].checks = previous.filter((entry) => entry !== check)
    put('ci-workspaces.json', config)
    assert.throws(() => ciPlan(root), new RegExp(`Missing required ${name} check: ${check}`))
    config[name].checks = previous
  }
})
