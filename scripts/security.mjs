import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditResult, safeFindings } from './security-policy.mjs'

const version = '8.30.1'
const checksum =
  '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
const output = {
  version: 1,
  scanner: `gitleaks ${version}`,
  startedAt: new Date().toISOString(),
  result: 'Failed',
}
mkdirSync('test-results', { recursive: true })
const temporary = mkdtempSync(join(tmpdir(), 'sportzone-security-'))
try {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error(
      'Security scanner requires Linux x64; use the CI runner on other hosts',
    )
  mkdirSync('.cache/tools', { recursive: true })
  const archive = `.cache/tools/gitleaks-${version}-linux-x64.tar.gz`
  if (!existsSync(archive)) {
    const response = await fetch(
      `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz`,
      { signal: AbortSignal.timeout(60000) },
    )
    if (!response.ok) throw new Error('Secret scanner download failed')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== checksum)
      throw new Error('Secret scanner checksum mismatch')
    writeFileSync(archive, bytes)
  }
  if (
    createHash('sha256').update(readFileSync(archive)).digest('hex') !==
    checksum
  )
    throw new Error('Secret scanner checksum mismatch')
  if (
    spawnSync('tar', ['-xzf', archive, '-C', temporary, 'gitleaks'], {
      stdio: 'ignore',
    }).status !== 0
  )
    throw new Error('Cannot extract verified secret scanner')
  const findings = []
  for (const mode of ['git', 'dir']) {
    const path = join(temporary, `${mode}.json`)
    const child = spawnSync(
      join(temporary, 'gitleaks'),
      [
        mode,
        '.',
        '--config=.gitleaks.toml',
        '--redact=100',
        '--no-banner',
        '--report-format=json',
        `--report-path=${path}`,
        ...(mode === 'git' ? ['--log-opts=--all'] : []),
      ],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 1048576 },
    )
    if (child.error || ![0, 1].includes(child.status) || !existsSync(path))
      throw new Error('Secret scan unavailable or incomplete')
    const found = safeFindings(JSON.parse(readFileSync(path, 'utf8')))
    if (child.status === 1 && !found.length)
      throw new Error('Secret scanner failed without findings')
    findings.push(...found)
  }
  output.findings = findings
  const audit = spawnSync(
    'npm',
    ['audit', '--json', '--ignore-scripts', '--no-fund'],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 16777216 },
  )
  if (audit.error || ![0, 1].includes(audit.status))
    throw new Error('Dependency advisory check unavailable')
  output.audit = auditResult(
    JSON.parse(audit.stdout),
    JSON.parse(readFileSync('ci-security-exceptions.json', 'utf8')),
  )
  if (findings.length || output.audit.blocked.length)
    throw new Error('Security findings require review; see sanitized report')
  output.result = 'Passed'
} catch (error) {
  // Provider/scanner output may contain matches or registry credentials. Publish static diagnostics only.
  output.error =
    error instanceof SyntaxError
      ? 'Invalid scanner/advisory JSON'
      : error instanceof TypeError
        ? 'Security service unavailable'
        : error.message
  console.error(output.error)
  process.exitCode = 1
} finally {
  output.finishedAt = new Date().toISOString()
  writeFileSync(
    'test-results/security.json',
    `${JSON.stringify(output, null, 2)}\n`,
  )
  rmSync(temporary, { recursive: true, force: true })
}
