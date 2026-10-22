import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
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
  const add = (node, typeOnly = false) => {
    if (node && ts.isStringLiteralLike(node)) results.push({ specifier: node.text, typeOnly })
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      const namedTypes =
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((item) => item.isTypeOnly)
      add(node.moduleSpecifier, Boolean(clause?.isTypeOnly || (!clause?.name && namedTypes)))
    }
    if (ts.isExportDeclaration(node)) {
      const namedTypes =
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((item) => item.isTypeOnly)
      add(node.moduleSpecifier, Boolean(node.isTypeOnly || namedTypes))
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      add(node.moduleReference.expression, node.isTypeOnly)
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(source) === 'require')
    )
      add(node.arguments[0])
    ts.forEachChild(node, visit)
  }
  visit(source)
  return results
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
  const backendSource = join(root, 'backend/src')
  const moduleRoot = join(backendSource, 'modules')
  const isPrivatePersistence = (path) =>
    /\.(?:model|persistence)(?:\.[cm]?[jt]s)?$/.test(path) ||
    /\/(?:models|persistence)(?:\/|\.)/.test(path)
  const moduleOwner = (path) =>
    isWithin(path, moduleRoot) ? relative(moduleRoot, path).split('/')[0] : undefined
  for (const [file, source] of sources) {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*\.[cm]?[jt]sx?$/.test(
        basename(file),
      )
    )
      errors.push(`${relative(root, file)}: source filenames must use kebab-case`)
    if (
      isWithin(file, backendSource) &&
      (file.endsWith('.composition.ts') || file.endsWith('.job.ts'))
    ) {
      for (const statement of source.statements) {
        if (
          !ts.isFunctionDeclaration(statement) ||
          !/^(?:create|compose)/.test(statement.name?.text ?? '') ||
          statement.body?.statements.length !== 1
        )
          continue
        const result = statement.body.statements[0]
        if (
          !ts.isReturnStatement(result) ||
          !result.expression ||
          !ts.isCallExpression(result.expression)
        )
          continue
        const call = result.expression
        if (
          ts.isIdentifier(call.expression) &&
          statement.parameters.length === call.arguments.length &&
          statement.parameters.every((parameter, index) => {
            const argument = call.arguments[index]
            return (
              ts.isIdentifier(parameter.name) &&
              ((ts.isIdentifier(argument) && argument.text === parameter.name.text) ||
                (parameter.dotDotDotToken &&
                  ts.isSpreadElement(argument) &&
                  ts.isIdentifier(argument.expression) &&
                  argument.expression.text === parameter.name.text))
            )
          })
        )
          errors.push(
            `${relative(root, file)}: call the owning service directly instead of adding a forwarding factory`,
          )
      }
    }
    if (isWithin(file, moduleRoot) && !file.endsWith('.model.ts')) {
      const constructors = new Set()
      for (const statement of source.statements) {
        if (
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text === 'mongoose' &&
          statement.importClause?.namedBindings &&
          ts.isNamedImports(statement.importClause.namedBindings)
        )
          for (const binding of statement.importClause.namedBindings.elements)
            if ((binding.propertyName ?? binding.name).text === 'Schema')
              constructors.add(binding.name.text)
      }
      const inspect = (node) => {
        if (ts.isNewExpression(node) && constructors.has(node.expression.getText(source)))
          errors.push(
            `${relative(root, file)}: Mongoose schemas belong in the owning .model.ts file`,
          )
        ts.forEachChild(node, inspect)
      }
      inspect(source)
    }
    const owner = workspaces.find((name) => isWithin(file, join(root, name)))
    const manifest = JSON.parse(readFileSync(join(root, owner ?? '', 'package.json'), 'utf8'))
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    }
    const targets = []
    for (const { specifier, typeOnly } of imports(source)) {
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
        targets.push({ specifier, builtin, typeOnly })
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
        isPrivatePersistence(path)
      )
        errors.push(`${label}: use the owning module's service instead of its private persistence`)
      if (extname(path).match(/^\.[cm]?[jt]sx?$/) && !target)
        errors.push(`${label}: unresolved source import ${specifier}`)
      targets.push({ specifier, target, typeOnly })
    }
    edges.set(file, targets)
  }
  // Check transitive imports too: a barrel/helper must not bypass a boundary.
  const walk = (start, examine, stop = () => false) => {
    const seen = new Set()
    const visit = (file) => {
      if (seen.has(file)) return
      seen.add(file)
      for (const edge of edges.get(file) ?? []) {
        if (!edge.target) continue
        examine(edge.target, edge)
        if (!stop(edge.target, edge)) visit(edge.target)
      }
    }
    visit(start)
  }
  for (const file of files.filter((path) => isWithin(path, backendSource))) {
    const label = relative(root, file)
    if (
      moduleOwner(file) !== 'inventory' &&
      (moduleOwner(file) || isWithin(file, join(backendSource, 'jobs')))
    ) {
      walk(
        file,
        (target, edge) => {
          if (
            !edge.typeOnly &&
            target === join(backendSource, 'modules/catalog/variants/variant.service.ts')
          )
            errors.push(
              `${label}: stock counter capability is private to inventory; use inventory services`,
            )
        },
        (target, edge) =>
          edge.typeOnly || (moduleOwner(target) === 'inventory' && target.endsWith('.service.ts')),
      )
    }
    if (isWithin(file, join(backendSource, 'shared'))) {
      walk(file, (target) => {
        if (isWithin(target, backendSource) && !isWithin(target, join(backendSource, 'shared')))
          errors.push(
            `${label}: shared technical code cannot depend on backend business/configuration`,
          )
      })
    }
    if (isWithin(file, join(backendSource, 'providers'))) {
      walk(
        file,
        (target, edge) => {
          if (
            !edge.typeOnly &&
            (moduleOwner(target) ||
              isWithin(target, join(backendSource, 'jobs')) ||
              /\/(?:setup|routes|app|server)\.ts$/.test(target))
          )
            errors.push(`${label}: provider transport cannot execute domain or application code`)
        },
        (_target, edge) => edge.typeOnly,
      )
    }
    if (moduleOwner(file) || isWithin(file, join(backendSource, 'config'))) {
      walk(file, (target) => {
        if (isWithin(target, join(backendSource, 'jobs')))
          errors.push(`${label}: domain/configuration cannot depend on job entry points`)
      })
    }
    if (moduleOwner(file) && !file.endsWith('.composition.ts')) {
      walk(file, (target) => {
        if (target.endsWith('.composition.ts'))
          errors.push(`${label}: domain implementation and contracts cannot depend on composition`)
      })
    }
    if (moduleOwner(file)) {
      walk(
        file,
        (target, edge) => {
          if (
            !edge.typeOnly &&
            isWithin(target, join(backendSource, 'providers')) &&
            target.endsWith('.client.ts')
          )
            errors.push(`${label}: domain services must receive provider capabilities from setup`)
        },
        (_target, edge) => edge.typeOnly,
      )
    }
    if (/\.(?:controller|routes|job)\.ts$/.test(file)) {
      walk(
        file,
        (target) => {
          if (isPrivatePersistence(target))
            errors.push(`${label}: controllers/routes/jobs must delegate persistence to services`)
        },
        (target) => /\.service\.ts$/.test(target),
      )
    }
    if (moduleOwner(file)) {
      walk(
        file,
        (target) => {
          if (
            moduleOwner(target) &&
            moduleOwner(target) !== moduleOwner(file) &&
            isPrivatePersistence(target)
          )
            errors.push(
              `${label}: use the owning module's service instead of its private persistence`,
            )
        },
        (target) => moduleOwner(target) !== moduleOwner(file) && /\.service\.ts$/.test(target),
      )
    }
  }
  for (const owner of ['storefront', 'admin']) {
    const sourceRoot = join(root, owner, 'src')
    const featureRoot = join(sourceRoot, 'features')
    const featureOwner = (path) =>
      isWithin(path, featureRoot) ? relative(featureRoot, path).split('/')[0] : undefined
    for (const file of files.filter((path) => isWithin(path, sourceRoot))) {
      const label = relative(root, file)
      if (isWithin(file, join(sourceRoot, 'lib'))) {
        walk(file, (target) => {
          if (isWithin(target, sourceRoot) && !isWithin(target, join(sourceRoot, 'lib')))
            errors.push(
              `${label}: frontend lib cannot depend on features, components or app wiring`,
            )
        })
      }
      if (isWithin(file, join(sourceRoot, 'components'))) {
        walk(file, (target) => {
          if (isWithin(target, featureRoot) || isWithin(target, join(sourceRoot, 'app')))
            errors.push(
              `${label}: reusable components receive data/actions rather than importing features or app wiring`,
            )
        })
      }
      for (const edge of edges.get(file) ?? []) {
        if (!edge.target) continue
        if (featureOwner(file) && isWithin(edge.target, join(sourceRoot, 'app')))
          errors.push(`${label}: features cannot import app routing/provider wiring`)
        if (
          featureOwner(file) &&
          featureOwner(edge.target) &&
          featureOwner(file) !== featureOwner(edge.target) &&
          /\/(?:api|hooks|schemas|components|internal)\//.test(relative(featureRoot, edge.target))
        )
          errors.push(`${label}: consume another feature through its public interface`)
        if (
          isWithin(file, join(sourceRoot, 'app')) &&
          /\/(?:page|layout|router)\.tsx$/.test(file) &&
          edge.target === join(sourceRoot, 'lib/api-client.ts')
        )
          errors.push(
            `${label}: routes compose feature views rather than importing browser transport`,
          )
      }
    }
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
      if (edge.typeOnly) continue
      if (
        edge.builtin ||
        edge.specifier === 'server-only' ||
        edge.target?.match(/(?:\.server\.|\/api-server\.)[cm]?[jt]sx?$/)
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
