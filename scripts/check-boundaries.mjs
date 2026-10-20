import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const workspaces = ['storefront', 'admin', 'backend']
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))
function sourceFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : []
  })
}
function imports(source) {
  const results = []
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      results.push(node.moduleSpecifier)
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    )
      results.push(node.moduleReference.expression)
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(source) === 'require')
    )
      results.push(node.arguments[0])
    ts.forEachChild(node, visit)
  }
  visit(source)
  return results.filter((node) => node && ts.isStringLiteralLike(node)).map((node) => node.text)
}
export function checkBoundaries(root = process.cwd()) {
  root = resolve(root)
  const errors = []
  const files = [
    ...workspaces.flatMap((name) => sourceFiles(join(root, name, 'src'))),
    ...sourceFiles(join(root, 'shared')),
  ]
  const sources = new Map(
    files.map((file) => [
      file,
      ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true),
    ]),
  )
  const edges = new Map()
  const isWithin = (path, dir) => path === dir || path.startsWith(`${dir}/`)
  for (const [file, source] of sources) {
    const owner = workspaces.find((name) => isWithin(file, join(root, name)))
    const manifest = JSON.parse(readFileSync(join(root, owner ?? '', 'package.json'), 'utf8'))
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    }
    const targets = []
    for (const specifier of imports(source)) {
      const label = relative(root, file)
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
        const packageName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : specifier.split('/')[0]
        const builtin = builtins.has(specifier.replace(/^node:/, ''))
        if (
          (owner === 'admin' || owner === 'storefront') &&
          packageName.startsWith('@heroui/') &&
          !isWithin(file, join(root, owner, 'src/components/ui'))
        )
          errors.push(`${label}: import HeroUI through the app-owned components/ui boundary`)
        if (!builtin && !dependencies[packageName])
          errors.push(`${label}: undeclared dependency ${packageName}`)
        if (!owner) errors.push(`${label}: shared code must remain pure`)
        if (
          (owner === 'admin' || owner === 'storefront') &&
          (packageName === 'mongoose' || workspaces.includes(packageName))
        )
          errors.push(`${label}: frontend cannot import another application or persistence`)
        targets.push({ specifier, builtin })
        continue
      }
      const path = specifier.startsWith('@/')
        ? join(root, owner ?? '', 'src', specifier.slice(2))
        : resolve(dirname(file), specifier)
      const base = path.replace(/\.[cm]?js$/, '')
      const target = [
        path,
        ...['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'].map((suffix) => base + suffix),
      ].find((candidate) => sources.has(candidate))
      const ownSource = owner && isWithin(path, join(root, owner, 'src'))
      const shared = isWithin(path, join(root, 'shared'))
      if (!ownSource && !shared)
        errors.push(`${label}: import escapes owned source/shared boundary`)
      const sourceModule = relative(join(root, 'backend/src/modules'), file).split('/')[0]
      const targetModule = relative(join(root, 'backend/src/modules'), path).split('/')[0]
      if (
        owner === 'backend' &&
        sourceModule !== targetModule &&
        isWithin(path, join(root, 'backend/src/modules')) &&
        /(?:\.model|\/models|\/persistence)(?:\.[cm]?[jt]s)?$/.test(path)
      )
        errors.push(`${label}: use the owning module's service instead of its private persistence`)
      if (extname(path).match(/^\.[cm]?[jt]sx?$/) && !target)
        errors.push(`${label}: unresolved source import ${specifier}`)
      targets.push({ specifier, target })
    }
    edges.set(file, targets)
  }
  const browserRoots = files.filter(
    (file) =>
      isWithin(file, join(root, 'admin', 'src')) ||
      (isWithin(file, join(root, 'storefront', 'src')) &&
        sources
          .get(file)
          .statements.some(
            (s) =>
              ts.isExpressionStatement(s) &&
              ts.isStringLiteral(s.expression) &&
              s.expression.text === 'use client',
          )),
  )
  const visited = new Set()
  const visitClient = (file) => {
    if (visited.has(file)) return
    visited.add(file)
    for (const edge of edges.get(file) ?? []) {
      if (
        edge.builtin ||
        edge.specifier === 'server-only' ||
        edge.target?.match(/\.server\.[cm]?[jt]sx?$/)
      )
        errors.push(`${relative(root, file)}: browser graph imports server-only code`)
      if (edge.target) visitClient(edge.target)
    }
  }
  for (const file of browserRoots) visitClient(file)
  return { files: files.length, errors: [...new Set(errors)] }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkBoundaries()
  for (const error of result.errors) console.error(error)
  console.log(`Source boundaries: ${result.files} files, ${result.errors.length} errors`)
  process.exitCode = result.errors.length ? 1 : 0
}
