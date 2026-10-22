import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const invalid = spawnSync(process.execPath, ['dist/server.js'], {
  env: { ...process.env, PORT: 'invalid-synthetic-port' },
  encoding: 'utf8',
  timeout: 5000,
})
assert.equal(invalid.status, 1)
assert.equal(JSON.parse(invalid.stderr.trim()).errorCode, 'CONFIGURATION_INVALID')
assert.ok(JSON.parse(invalid.stderr.trim()).configurationFields.includes('PORT'))
assert.ok(!invalid.stderr.includes('invalid-synthetic-port'))

const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const address = reservation.address()
assert.ok(address && typeof address !== 'string')
const port = address.port
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
)
const replica = await MongoMemoryReplSet.create({
  binary: { version: '8.0.16' },
  replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
})
const monitorToken = randomBytes(32).toString('hex')
const sessionSecret = randomBytes(32).toString('hex')
const child = spawn(process.execPath, ['dist/server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    APP_ENV: 'test',
    RELEASE_ID: 'compiled-smoke',
    PORT: String(port),
    API_BIND_HOST: '127.0.0.1',
    MONGODB_URI: replica.getUri(),
    MONGODB_DB_NAME: 'sportzone_test_smoke',
    SESSION_SECRET: sessionSecret,
    HEALTH_MONITOR_TOKEN: monitorToken,
    API_PUBLIC_ORIGIN: 'http://127.0.0.1:4000',
    STOREFRONT_ORIGIN: 'http://localhost:3000',
    ADMIN_ORIGIN: 'http://localhost:5173',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  },
  stdio: 'ignore',
})
const exited = once(child, 'exit')
try {
  let response
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('Compiled backend stopped before serving')
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/v1/unimplemented`, {
        signal: AbortSignal.timeout(1000),
      })
      break
    } catch {
      await delay(50)
    }
  }
  assert.ok(response, 'Compiled backend did not become reachable')
  assert.equal(response.status, 404)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.error.code, 'NOT_FOUND')
  assert.equal(body.meta.requestId, response.headers.get('x-request-id'))
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/health/live`)).status, 200)
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`)).status, 401)
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`, {
        headers: { Authorization: `Bearer ${monitorToken}` },
      })
    ).status,
    200,
  )
  child.kill('SIGTERM')
  const termination = await Promise.race([exited, delay(8000, null, { ref: false })])
  assert.ok(termination, 'Compiled backend did not shut down')
  assert.equal(termination[0], 0)
  console.log(
    'BACKEND-SMOKE Passed: invalid configuration redacted, real DB startup, liveness/restricted readiness and graceful shutdown',
  )
} finally {
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
  await replica.stop()
}
