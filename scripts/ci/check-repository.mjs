import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const names = ['storefront', 'admin', 'backend']
export const baseChecks = ['lint', 'typecheck', 'test:unit', 'build']
const text = (root, file) => readFileSync(resolve(root, file), 'utf8')
const json = (root, file) => JSON.parse(text(root, file))
const prose = (s) => s.replace(/^```[^\n]*\n.*?^```\s*$/gms, '')
function anchors(s) {
  const counts = new Map()
  return new Set(
    [...prose(s).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((m) => {
      const slug = m[1]
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .replaceAll(' ', '-')
      const n = counts.get(slug) ?? 0
      counts.set(slug, n + 1)
      return slug + (n ? `-${n}` : '')
    }),
  )
}
export function workspacePlan(root) {
  const manifest = json(root, 'package.json')
  const inventory = json(root, 'ci-workspaces.json')
  const config = inventory.scopes
  if (JSON.stringify(manifest.workspaces) !== JSON.stringify(names) || !manifest.private) {
    throw new Error('Root must declare exactly three private workspaces')
  }
  if (
    inventory.version !== 2 ||
    !config ||
    JSON.stringify(Object.keys(config).sort()) !==
      JSON.stringify([...names, 'repository', 'browser', 'supply-chain'].sort())
  ) {
    throw new Error('CI inventory must declare version 2 and exactly six required scopes')
  }
  return names.map((name) => {
    const pkg = json(root, `${name}/package.json`)
    const entry = config[name]
    if (pkg.name !== name || !pkg.private)
      throw new Error(`${name}: invalid package identity/privacy`)
    if (
      !['manifest-only', 'active'].includes(entry.state) ||
      !/^P\d{2}-\d{3}$/.test(entry.ownerTask)
    ) {
      throw new Error(`${name}: invalid CI state or ownerTask`)
    }
    const extraFiles = readdirSync(resolve(root, name)).filter(
      (f) => !['package.json', 'node_modules'].includes(f),
    )
    const hasImplementation =
      extraFiles.length ||
      Object.keys(pkg.scripts ?? {}).length ||
      ['dependencies', 'devDependencies', 'optionalDependencies'].some(
        (k) => Object.keys(pkg[k] ?? {}).length,
      )
    if (entry.state === 'manifest-only') {
      if (hasImplementation) throw new Error(`${name}: implementation requires active CI checks`)
      return {
        name,
        state: 'Not Configured',
        ownerTask: entry.ownerTask,
        checks: [],
      }
    }
    if (
      !Array.isArray(entry.checks) ||
      !baseChecks.every((c) => entry.checks.includes(c)) ||
      new Set(entry.checks).size !== entry.checks.length
    )
      throw new Error(`${name}: missing required CI checks`)
    for (const check of entry.checks) {
      if (
        !/^[a-z][a-z0-9:-]*$/.test(check) ||
        !pkg.scripts?.[check]?.trim() ||
        pkg.scripts[check].includes('--if-present')
      )
        throw new Error(`${name}: missing/unsafe script ${check}`)
    }
    return {
      name,
      state: 'Configured',
      ownerTask: entry.ownerTask,
      checks: entry.checks,
    }
  })
}
export function inspectRepository(root) {
  const errors = []
  const listing = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  )
  if (listing.status !== 0) throw new Error('Cannot inventory repository files')
  const files = [...new Set(listing.stdout.split('\0').filter(Boolean))]
  let links = 0
  for (const file of files) {
    const path = resolve(root, file)
    if (!existsSync(path)) continue
    if (lstatSync(path).isSymbolicLink()) {
      errors.push(`${file}: source symlink requires explicit review`)
      continue
    }
    if (/(^|\/)\.env(?:\.|$)/.test(file) && !/\.example$/.test(file)) {
      errors.push(`${file}: local environment file must not be tracked`)
      continue
    }
    if (/\.(pem|key|p12|pfx)$/.test(file) || /(^|\/)\.aws\//.test(file)) {
      errors.push(`${file}: credential file must not be tracked`)
      continue
    }
    if (
      !/\.(md|json|mjs|js|ts|tsx|jsx|yml|yaml)$/.test(file) &&
      !/(^|\/)\.env(?:\..*)?\.example$/.test(file) &&
      !['.env.example', '.gitignore', '.npmrc', '.nvmrc'].includes(file)
    )
      continue
    const data = text(root, file)
    if (/[\t ]+$/m.test(data) || !data.endsWith('\n'))
      errors.push(`${file}: trailing whitespace or missing final newline`)
    // Targeted baseline guard, not a comprehensive secret scanner. Never print matched values.
    const credential = new RegExp(
      '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE' +
        ' KEY-----|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk_live_[A-Za-z0-9]{20,}|mongodb(?:\\+srv)?://[^\\s]+:[^\\s]+@',
    )
    if (credential.test(data)) errors.push(`${file}: possible credential material`)
    if (file.endsWith('.json')) {
      try {
        JSON.parse(data)
      } catch {
        errors.push(`${file}: invalid JSON`)
      }
    }
    if (/\.(mjs|js)$/.test(file)) {
      const check = spawnSync(process.execPath, ['--check', path], {
        encoding: 'utf8',
      })
      if (check.status !== 0) errors.push(`${file}: JavaScript syntax check failed`)
    }
    if (!file.endsWith('.md')) continue
    if ((data.match(/^```/gm)?.length ?? 0) % 2) errors.push(`${file}: unclosed code fence`)
    let columns
    for (const line of prose(data).split('\n')) {
      if (!line.startsWith('|')) {
        columns = undefined
        continue
      }
      const count = line.split(/(?<!\\)\|/).length
      if (columns !== undefined && count !== columns)
        errors.push(`${file}: inconsistent table columns`)
      columns = count
    }
    for (const m of prose(data).matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(m[1])) continue
      const [relative, fragment] = m[1].split('#')
      // Evidence may reference generated local reports. They are intentionally
      // untracked and therefore absent from a clean CI checkout.
      if (relative?.split('/').includes('test-results')) continue
      try {
        const target = relative ? resolve(dirname(path), decodeURIComponent(relative)) : path
        if (!existsSync(target)) throw new Error()
        if (
          fragment &&
          extname(target) === '.md' &&
          !anchors(readFileSync(target, 'utf8')).has(decodeURIComponent(fragment))
        )
          throw new Error()
        links++
      } catch {
        errors.push(`${file}: broken local link or anchor`)
      }
    }
  }
  try {
    workspacePlan(root)
  } catch (error) {
    errors.push(error.message)
  }
  return { files: files.length, links, errors }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = inspectRepository(process.cwd())
  for (const error of result.errors) console.error(error)
  console.log(
    `Repository checks: ${result.files} files, ${result.links} local links, ${result.errors.length} errors`,
  )
  process.exitCode = result.errors.length ? 1 : 0
}
