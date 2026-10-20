import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { checkBoundaries } from '../scripts/check-boundaries.mjs'

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
    `import {runDev} from ${JSON.stringify(pathToFileURL(resolve('scripts/dev.mjs')).href)};
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
    `import {runDev} from ${JSON.stringify(pathToFileURL(resolve('scripts/dev.mjs')).href)};
process.exitCode = await runDev(${JSON.stringify({ cwd: root, build: [process.execPath, '-e', 'process.exit(0)'], commands: [[process.execPath, resolve('scripts/dev-backend.mjs')]], graceMs: 500 })});`,
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
