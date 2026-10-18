import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const invalid = spawnSync(process.execPath, ['dist/server.js'], {
  env: { ...process.env, PORT: 'invalid-synthetic-port' },
  encoding: 'utf8',
  timeout: 5000,
})
assert.equal(invalid.status, 1)
assert.match(invalid.stderr, /invalid PORT/)
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
const child = spawn(process.execPath, ['dist/server.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
})
const exited = once(child, 'exit')
try {
  let response
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null)
      throw new Error('Compiled backend stopped before serving')
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
  child.kill('SIGTERM')
  const termination = await Promise.race([exited, delay(3000, null, { ref: false })])
  assert.ok(termination, 'Compiled backend did not shut down')
  assert.equal(termination[0], 0)
  console.log(
    'BACKEND-SMOKE Passed: invalid PORT redacted, compiled listener/404 envelope and graceful shutdown',
  )
} finally {
  if (child.exitCode === null) child.kill('SIGKILL')
}
