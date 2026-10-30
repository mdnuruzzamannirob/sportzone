import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { checkBoundaries } from '../../scripts/ci/check-boundaries.mjs'

function fixture(t, cleanup = true) {
  const root = mkdtempSync(join(tmpdir(), 'sportzone-tooling-'))
  if (cleanup) t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (file, value) => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), value)
  }
  for (const name of ['', 'storefront', 'admin', 'backend'])
    put(
      join(name, 'package.json'),
      JSON.stringify({ private: true, dependencies: { react: '19.3.1', next: '16.4.2' } }),
    )
  return { root, put }
}
test('TOOL-01: pure shared utilities and declared packages remain allowed', (t) => {
  const { root, put } = fixture(t)
  put('shared/value.ts', 'export const value = 1')
  put(
    'storefront/src/app/page.tsx',
    'import {value} from "../../../shared/value"; import React from "react";',
  )
  put('backend/src/main.ts', 'import {randomUUID} from "node:crypto";')
  assert.deepEqual(checkBoundaries(root).errors, [])
})
test('TOOL-02: imports, re-exports, dynamic imports and require cannot cross frontend/backend boundaries', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/secret.ts', 'export const value = 1')
  put(
    'admin/src/main.ts',
    'import "../../backend/src/secret"; export * from "../../backend/src/secret"; import("../../backend/src/secret"); require("../../backend/src/secret");',
  )
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('escapes owned')))
})
test('TOOL-03: client imports are checked transitively, including alias imports', (t) => {
  const { root, put } = fixture(t)
  put('storefront/src/client.tsx', '"use client"; import "@/helper"')
  put('storefront/src/helper.ts', 'export * from "./private.server"')
  put('storefront/src/private.server.ts', 'import "node:fs"')
  const result = checkBoundaries(root)
  assert.equal(result.errors.filter((e) => e.includes('browser graph')).length, 2)
})
test('TOOL-04: undeclared dependencies and impure shared imports fail; comments do not count', (t) => {
  const { root, put } = fixture(t)
  put('admin/src/main.ts', '// import "fake-comment"\nimport "mongoose";')
  put('shared/value.ts', 'import "node:fs";')
  const result = checkBoundaries(root)
  assert.ok(result.errors.some((e) => e.includes('undeclared dependency mongoose')))
  assert.ok(result.errors.some((e) => e.includes('shared code must remain pure')))
  assert.ok(!result.errors.some((e) => e.includes('fake-comment')))
})
test('TOOL-05: cross-module private persistence fails while service imports remain allowed', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/users/user.model.ts', 'export const model = 1')
  put('backend/src/modules/users/user.service.ts', 'export const service = 1')
  put('backend/src/modules/auth/service.ts', 'import "../users/user.model.js"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('private persistence')))
  put('backend/src/modules/users/user.persistence.ts', 'export const persistence = 1')
  put('backend/src/modules/auth/service.ts', 'import "../users/user.persistence.js"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('private persistence')))
  put('backend/src/modules/auth/service.ts', 'import "../users/user.service.js"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('UI-BOUNDARY-01: only app-owned UI modules may import native HeroUI', (t) => {
  const { root, put } = fixture(t)
  put(
    'admin/package.json',
    JSON.stringify({ private: true, dependencies: { '@heroui/react': '3.2.6' } }),
  )
  put('admin/src/components/ui/primitives.tsx', 'export {Button} from "@heroui/react"')
  assert.deepEqual(checkBoundaries(root).errors, [])
  put('admin/src/features/catalog.tsx', 'import {Button} from "@heroui/react"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('app-owned components/ui')))
})

const waitFor = async (condition, timeout = 5000) => {
  const end = Date.now() + timeout
  while (!condition()) {
    assert.ok(Date.now() < end, 'Timed out waiting for owned process state')
    await new Promise((done) => setTimeout(done, 20))
  }
}
function running(pid) {
  try {
    process.kill(pid, 0)
    if (process.platform === 'linux')
      return !readFileSync(`/proc/${pid}/stat`, 'utf8').match(/^.*\) Z /)
    return true
  } catch (error) {
    if (error.code === 'ESRCH' || error.code === 'ENOENT') return false
    throw error
  }
}
async function launch(t, { buildCode = 0, failure = false, stubborn = false } = {}) {
  const { root, put } = fixture(t, false)
  put(
    'worker.mjs',
    `
import {appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
appendFileSync('pids', process.pid+'\\n');
if (process.argv[2] === 'tree') spawn(process.execPath, ['worker.mjs', 'leaf'], {stdio:'inherit'});
if (${stubborn}) process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`,
  )
  const build = [process.execPath, '-e', `process.exit(${buildCode})`]
  const commands = [[process.execPath, 'worker.mjs', 'tree']]
  if (failure) commands.push([process.execPath, '-e', 'setTimeout(()=>process.exit(7),300)'])
  put(
    'supervisor.mjs',
    `import {runDev} from ${JSON.stringify(pathToFileURL(resolve('scripts/dev/start.mjs')).href)};
process.exitCode = await runDev(${JSON.stringify({ cwd: root, build, commands, graceMs: 300 })});`,
  )
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const child = spawn(process.execPath, ['supervisor.mjs'], { cwd: root, env, stdio: 'ignore' })
  const exit = new Promise((done, reject) => {
    child.once('exit', done)
    child.once('error', reject)
  })
  const pids = () =>
    existsSync(join(root, 'pids'))
      ? readFileSync(join(root, 'pids'), 'utf8').trim().split('\n').map(Number)
      : []
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM')
    await exit
    for (const pid of pids()) if (running(pid)) process.kill(pid, 'SIGKILL')
    rmSync(root, { recursive: true, force: true })
  })
  return { child, exit, pids }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`TOOL-06: ${signal} stops the supervisor and owned descendant processes`, async (t) => {
    const { child, exit, pids } = await launch(t)
    await waitFor(() => pids().length === 2)
    child.kill(signal)
    assert.equal(await exit, signal === 'SIGINT' ? 130 : 143)
    await waitFor(() => pids().every((pid) => !running(pid)))
  })
}
test('TOOL-07: child failure stops siblings and retains nonzero result', async (t) => {
  const { exit, pids } = await launch(t, { failure: true })
  assert.equal(await exit, 7)
  assert.equal(pids().length, 2)
  await waitFor(() => pids().every((pid) => !running(pid)))
})
test('TOOL-08: initial build failure never starts watchers or servers', async (t) => {
  const { exit, pids } = await launch(t, { buildCode: 9 })
  assert.equal(await exit, 9)
  assert.deepEqual(pids(), [])
})
test('TOOL-09: ignored termination is bounded and kills the owned process tree', async (t) => {
  const { child, exit, pids } = await launch(t, { stubborn: true })
  await waitFor(() => pids().length === 2)
  child.kill('SIGTERM')
  assert.equal(await exit, 143)
  await waitFor(() => pids().every((pid) => !running(pid)))
})

test('TOOL-10: TypeScript watch rebuilds restart the API; runtime failure stops the coordinator', async (t) => {
  const { root, put } = fixture(t, false)
  put(
    'backend/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        rootDir: 'src',
        outDir: 'dist',
        noEmitOnError: true,
        types: [],
      },
      include: ['src/**/*.ts'],
    }),
  )
  const source = (name) =>
    `declare const process: {pid:number}; console.log('${name}:'+process.pid); setInterval(()=>{},1000);`
  put('backend/src/server.ts', source('first'))
  put(
    'supervisor.mjs',
    `import {runDev} from ${JSON.stringify(pathToFileURL(resolve('scripts/dev/start.mjs')).href)};
process.exitCode = await runDev(${JSON.stringify({ cwd: root, build: [process.execPath, '-e', 'process.exit(0)'], commands: [[process.execPath, resolve('scripts/dev/backend.mjs')]], graceMs: 500 })});`,
  )
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const child = spawn(process.execPath, ['supervisor.mjs'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  const exit = new Promise((done, reject) => {
    child.once('exit', done)
    child.once('error', reject)
  })
  const pids = () => [...output.matchAll(/(?:first|second):(\d+)/g)].map((m) => Number(m[1]))
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM')
    await exit
    for (const pid of pids()) if (running(pid)) process.kill(pid, 'SIGKILL')
    rmSync(root, { recursive: true, force: true })
  })
  try {
    await waitFor(() => output.includes('first:'), 15000)
  } catch {
    assert.fail(`Synthetic compiler/API fixture did not start:\n${output}`)
  }
  assert.equal(pids().length, 1)
  put('backend/src/server.ts', source('second'))
  await waitFor(() => output.includes('second:'), 15000)
  assert.equal(pids().length, 2)
  assert.equal(running(pids()[0]), false)
  put('backend/src/server.ts', "const broken: number = 'invalid';")
  await waitFor(() => output.includes('TS2322'), 15000)
  assert.equal(running(pids()[1]), true)
  assert.equal(pids().length, 2)
  put('backend/src/server.ts', 'declare const process: {exit(code:number):never}; process.exit(5);')
  await waitFor(() => child.exitCode !== null, 15000)
  assert.equal(await exit, 5)
  assert.ok(pids().every((pid) => !running(pid)))
})

test('BACKEND-BOUNDARY-01: nested foreign models and persistence barrels cannot bypass ownership', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/catalog/products/product.model.ts', 'export const model = 1')
  put('backend/src/modules/catalog/products/product.service.ts', 'export const service = 1')
  put('backend/src/modules/catalog/products/persistence/read.ts', 'export const read = 1')
  put('backend/src/modules/catalog/products/internal.ts', 'export * from "./product.model.js"')
  for (const path of ['product.model', 'persistence/read', 'internal']) {
    put('backend/src/modules/inventory/stock.service.ts', `import "../catalog/products/${path}.js"`)
    assert.ok(
      checkBoundaries(root).errors.some((e) => e.includes('private persistence')),
      path,
    )
  }
  put(
    'backend/src/modules/inventory/stock.service.ts',
    'import "../catalog/products/product.service.js"',
  )
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('BACKEND-BOUNDARY-02: controllers and routes access models only through domain services', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/orders/order.model.ts', 'export const model = 1')
  put('backend/src/modules/orders/helper.ts', 'export * from "./order.model.js"')
  for (const suffix of ['controller', 'routes']) {
    put(`backend/src/modules/orders/order.${suffix}.ts`, 'import "./helper.js"')
    assert.ok(
      checkBoundaries(root).errors.some((e) => e.includes('controllers/routes/jobs must delegate')),
    )
    put(`backend/src/modules/orders/order.${suffix}.ts`, 'import "./order.service.js"')
  }
  put('backend/src/modules/orders/order.service.ts', 'import "./order.model.js"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('BACKEND-BOUNDARY-03: shared technical helpers cannot import domain/configuration via barrels', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/orders/order.service.ts', 'export const service = 1')
  put('backend/src/config/env.ts', 'export const env = 1')
  for (const target of ['../modules/orders/order.service.js', '../config/env.js']) {
    put('backend/src/shared/helper.ts', `export * from "${target}"`)
    assert.ok(checkBoundaries(root).errors.some((e) => e.includes('shared technical code')))
  }
  put('backend/src/shared/helper.ts', 'export const helper = 1')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('BACKEND-BOUNDARY-04: provider runtime cannot execute business code but public type-only contracts are allowed', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/media/media.types.ts', 'export interface MediaProvider {}')
  put('backend/src/modules/media/media.service.ts', 'export const service = 1')
  put('backend/src/providers/helper.ts', 'export * from "../modules/media/media.service.js"')
  put('backend/src/providers/cloudinary/cloudinary.client.ts', 'import "../helper.js"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('provider transport')))
  put('backend/src/providers/helper.ts', 'export const helper = 1')
  for (const declaration of [
    'import type {MediaProvider} from "../../modules/media/media.types.js"',
    'import {type MediaProvider} from "../../modules/media/media.types.js"',
    'export type {MediaProvider} from "../../modules/media/media.types.js"',
    'export {type MediaProvider} from "../../modules/media/media.types.js"',
  ]) {
    put('backend/src/providers/cloudinary/cloudinary.client.ts', declaration)
    assert.deepEqual(checkBoundaries(root).errors, [], declaration)
  }
  put(
    'backend/src/providers/cloudinary/cloudinary.client.ts',
    'import {type MediaProvider, service} from "../../modules/media/media.service.js"',
  )
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('provider transport')))
})

test('BACKEND-BOUNDARY-05: domain receives provider capabilities rather than importing transport indirectly', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/providers/cloudinary/cloudinary.client.ts', 'export const client = 1')
  put('backend/src/providers/cloudinary/cloudinary.schema.ts', 'export const schema = 1')
  put('backend/src/config/media.ts', 'export * from "../providers/cloudinary/cloudinary.client.js"')
  put('backend/src/modules/media/media.service.ts', 'import "../../config/media.js"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('receive provider capabilities')))
  put('backend/src/config/media.ts', 'export * from "../providers/cloudinary/cloudinary.schema.js"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('FRONTEND-BOUNDARY-01: transport/query libraries cannot depend on feature views or app wiring', (t) => {
  const { root, put } = fixture(t)
  put('storefront/src/features/auth/authentication.tsx', 'export const view = 1')
  put('storefront/src/lib/helper.ts', 'export * from "../features/auth/authentication"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('frontend lib cannot depend')))
  put('storefront/src/lib/helper.ts', 'export const helper = 1')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('FRONTEND-BOUNDARY-02: reusable component compositions do not import business features', (t) => {
  const { root, put } = fixture(t)
  put('admin/src/features/orders/order.api.ts', 'export const orders = 1')
  put('admin/src/components/ui/field.tsx', 'import "../../features/orders/order.api"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('reusable components receive')))
  put('admin/src/components/ui/field.tsx', 'export const Field = 1')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('FRONTEND-BOUNDARY-03: feature views cannot import app providers or foreign private components', (t) => {
  const { root, put } = fixture(t)
  put('admin/src/app/providers.tsx', 'export const Providers = 1')
  put('admin/src/features/orders/components/private.tsx', 'export const Private = 1')
  put(
    'admin/src/features/customers/customer.tsx',
    'import "../../app/providers"; import "../orders/components/private"',
  )
  const result = checkBoundaries(root)
  assert.ok(result.errors.some((e) => e.includes('features cannot import app')))
  assert.ok(result.errors.some((e) => e.includes('public interface')))
  put('admin/src/features/orders/order.api.ts', 'export const orders = 1')
  put('admin/src/features/customers/customer.tsx', 'import "../orders/order.api"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('FRONTEND-BOUNDARY-04: browser graphs cannot consume api-server.ts via aliases or helpers', (t) => {
  const { root, put } = fixture(t)
  put('storefront/src/lib/api-server.ts', 'export const read = 1')
  put('storefront/src/lib/helper.ts', 'export * from "./api-server"')
  put('storefront/src/features/catalog/catalog.tsx', '"use client"; import "@/lib/helper"')
  assert.ok(
    checkBoundaries(root).errors.some((e) => e.includes('browser graph imports server-only')),
  )
  put('storefront/src/lib/helper.ts', 'export const helper = 1')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('FRONTEND-BOUNDARY-05: route composition consumes feature views instead of browser transport', (t) => {
  const { root, put } = fixture(t)
  put('storefront/src/lib/api-client.ts', 'export const request = 1')
  put('storefront/src/app/(shop)/page.tsx', 'import "../../lib/api-client"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('routes compose feature views')))
  put('storefront/src/features/home/home-page.tsx', 'export const Home = 1')
  put('storefront/src/app/(shop)/page.tsx', 'import "../../features/home/home-page"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('STRUCTURE-01: source filenames use kebab-case while framework entry names remain valid', (t) => {
  const { root, put } = fixture(t)
  put('admin/src/lib/ApiClient.ts', 'export const value = 1')
  put('storefront/src/app/(account)/account/[orderId]/page.tsx', 'export default 1')
  assert.deepEqual(
    checkBoundaries(root).errors.map((e) => e.split(': ')[1]),
    ['source filenames must use kebab-case'],
  )
})
test('STRUCTURE-02: configuration and domain contracts cannot import jobs through helpers', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/jobs/send.job.ts', 'export type Policy = {}; export const run = 1')
  put('backend/src/config/helper.ts', 'export * from "../jobs/send.job.js"')
  put('backend/src/config/email.ts', 'import "./helper.js"')
  put(
    'backend/src/modules/email/email.types.ts',
    'import type {Policy} from "../../jobs/send.job.js"',
  )
  assert.equal(checkBoundaries(root).errors.filter((e) => e.includes('depend on job')).length, 3)
})
test('STRUCTURE-03: domain service/context/types do not depend on composition, including type-only imports', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/media/media.composition.ts', 'export type Dependencies = {}')
  for (const suffix of ['service', 'context', 'types'])
    put(
      `backend/src/modules/media/media.${suffix}.ts`,
      'import type {Dependencies} from "./media.composition.js"',
    )
  assert.equal(
    checkBoundaries(root).errors.filter((e) => e.includes('depend on composition')).length,
    3,
  )
})
test('STRUCTURE-04: jobs delegate persistence to domain services rather than importing models through helpers', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/email/email.model.ts', 'export const model = 1')
  put('backend/src/jobs/helper.ts', 'export * from "../modules/email/email.model.js"')
  put('backend/src/jobs/send.job.ts', 'import "./helper.js"')
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('jobs must delegate persistence')))
  put('backend/src/modules/email/email.service.ts', 'import "./email.model.js"')
  put('backend/src/jobs/helper.ts', 'export * from "../modules/email/email.service.js"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('STRUCTURE-05: Mongoose schema definitions belong in model files, including aliased imports', (t) => {
  const { root, put } = fixture(t)
  put(
    'backend/package.json',
    JSON.stringify({ private: true, dependencies: { mongoose: '9.11.2' } }),
  )
  put(
    'backend/src/modules/email/email.service.ts',
    'import {Schema as MongoSchema} from "mongoose"; const schema = new MongoSchema({});',
  )
  assert.ok(
    checkBoundaries(root).errors.some((e) => e.includes('schemas belong in the owning .model.ts')),
  )
  put('backend/src/modules/email/email.service.ts', 'import "./email.model.js"')
  put(
    'backend/src/modules/email/email.model.ts',
    'import {Schema} from "mongoose"; const schema = new Schema({});',
  )
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('STRUCTURE-06: job/composition factories must add assembly or orchestration rather than forward arguments', (t) => {
  const { root, put } = fixture(t)
  put(
    'backend/src/modules/email/email.service.ts',
    'export function createDelivery(...args: unknown[]) { return {} }',
  )
  put(
    'backend/src/jobs/send.job.ts',
    'import {createDelivery} from "../modules/email/email.service.js"; export function createWorker(...args: unknown[]) { return createDelivery(...args) }',
  )
  assert.ok(checkBoundaries(root).errors.some((e) => e.includes('forwarding factory')))
  put(
    'backend/src/jobs/send.job.ts',
    'import {createDelivery} from "../modules/email/email.service.js"; export function runScheduledBatch() { return createDelivery().runBatch() }',
  )
  assert.deepEqual(checkBoundaries(root).errors, [])
  put(
    'backend/src/modules/email/email.composition.ts',
    'import {createDelivery} from "./email.service.js"; export function composeEmail(options: unknown) { return createDelivery({options, verify: true}) }',
  )
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('INVENTORY-BOUNDARY-01: inventory consumes stock capabilities instead of catalog private models', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/catalog/variants/variant.model.ts', 'export const model = 1')
  put(
    'backend/src/modules/inventory/inventory.service.ts',
    'import "../catalog/variants/variant.model.js"',
  )
  assert.ok(checkBoundaries(root).errors.some((error) => error.includes('private persistence')))
  put(
    'backend/src/modules/catalog/variants/variant.service.ts',
    'import "./variant.model.js"; export const stock = 1',
  )
  put(
    'backend/src/modules/inventory/inventory.service.ts',
    'import "../catalog/variants/variant.service.js"',
  )
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('INVENTORY-BOUNDARY-02: checkout and jobs cannot bypass inventory through the catalog stock capability', (t) => {
  const { root, put } = fixture(t)
  put('backend/src/modules/catalog/variants/variant.service.ts', 'export const stock = 1')
  put(
    'backend/src/modules/inventory/allocation.service.ts',
    'import "../catalog/variants/variant.service.js"; export const allocate = 1',
  )
  put(
    'backend/src/modules/checkout/helper.ts',
    'export * from "../catalog/variants/variant.service.js"',
  )
  put('backend/src/modules/checkout/checkout.service.ts', 'import "./helper.js"')
  put('backend/src/jobs/expire.job.ts', 'import "../modules/catalog/variants/variant.service.js"')
  assert.equal(
    checkBoundaries(root).errors.filter((error) => error.includes('stock counter capability'))
      .length,
    3,
  )
  put(
    'backend/src/modules/checkout/helper.ts',
    'export * from "../inventory/allocation.service.js"',
  )
  put('backend/src/jobs/expire.job.ts', 'import "../modules/inventory/allocation.service.js"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('CATALOG-SERVER-01: public browser barrels cannot import catalog server transport', (t) => {
  const { root, put } = fixture(t)
  put('storefront/src/features/catalog/catalog.server.ts', 'export const catalog = 1')
  put('storefront/src/features/catalog/index.ts', 'export * from "./catalog.server"')
  put('storefront/src/app/page.tsx', '"use client"; import "../features/catalog"')
  assert.ok(checkBoundaries(root).errors.some((error) => error.includes('server-only')))
  put('storefront/src/app/page.tsx', 'import "../features/catalog"')
  assert.deepEqual(checkBoundaries(root).errors, [])
})

test('DEPLOY-01: Render scaffold keeps hosted features disabled and requires private runtime inputs', () => {
  const config = JSON.parse(readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8'))
  assert.equal(config.services.length, 1)
  const service = config.services[0]
  assert.equal(service.runtime, 'docker')
  assert.equal(service.plan, 'free')
  assert.equal(service.dockerContext, '.')
  assert.equal(service.dockerfilePath, './backend/Dockerfile')
  assert.equal(service.autoDeployTrigger, 'off')
  assert.equal(service.healthCheckPath, '/api/v1/health/live')
  const env = new Map(service.envVars.map((entry) => [entry.key, entry]))
  assert.equal(env.size, service.envVars.length)
  assert.equal(env.get('APP_ENV').value, 'staging')
  assert.equal(env.get('NODE_ENV').value, 'production')
  assert.equal(env.get('API_BIND_HOST').value, '0.0.0.0')
  for (const [key, entry] of env) {
    if (key.endsWith('_ENABLED')) assert.equal(entry.value, 'false', key)
    if (/SECRET|TOKEN|MONGODB_URI/.test(key)) {
      assert.equal(entry.sync, false, key)
      assert.equal(Object.hasOwn(entry, 'value'), false, key)
    }
  }
  for (const key of [
    'API_PUBLIC_ORIGIN',
    'STOREFRONT_ORIGIN',
    'ADMIN_ORIGIN',
    'CORS_ALLOWED_ORIGINS',
  ])
    assert.equal(env.get(key).sync, false, key)
})

test('DEPLOY-02: Vercel separates app builds, uses the locked workspace and exposes no backend secrets', () => {
  for (const [app, framework] of [
    ['admin', 'vite'],
    ['storefront', 'nextjs'],
  ]) {
    const source = readFileSync(new URL(`../../${app}/vercel.json`, import.meta.url), 'utf8')
    const config = JSON.parse(source)
    assert.equal(config.framework, framework)
    assert.equal(config.buildCommand, 'npm run build')
    assert.match(config.installCommand, /^cd \.\. && npx --yes npm@11\.19\.0 ci /)
    assert.match(config.installCommand, /--include=dev/)
    assert.match(config.installCommand, /--ignore-scripts/)
    assert.equal(Object.hasOwn(config, 'env'), false)
    assert.equal(Object.hasOwn(config, 'build'), false)
    assert.doesNotMatch(source, /MONGODB|SECRET|TOKEN|RESEND|SSLCOMMERZ|CLOUDINARY/)
    if (app === 'admin') {
      assert.equal(config.outputDirectory, 'dist')
      assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }])
    } else {
      assert.equal(Object.hasOwn(config, 'rewrites'), false)
      assert.equal(Object.hasOwn(config, 'outputDirectory'), false)
    }
  }
})
